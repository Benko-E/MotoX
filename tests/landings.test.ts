import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, setup, setupWithCrashes } from './physicsSetup'
import type { Heightfield } from '../src/terrain/heightfield'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const { landing } = config.jumps
const groundSpeed = (bike: Bike) => Math.hypot(bike.body.linvel().x, bike.body.linvel().z)

/** Points the bike along compass `heading` and tips it nose up by `pitch` degrees (negative = nose down). */
function pose(bike: Bike, heading: number, pitch: number) {
  const y = (-heading * DEG) / 2
  const p = (pitch * DEG) / 2
  // turning about the vertical, then tipping about the bike's own sideways axis
  bike.body.setRotation(
    { x: Math.cos(y) * Math.sin(p), y: Math.sin(y) * Math.cos(p), z: -Math.sin(y) * Math.sin(p), w: Math.cos(y) * Math.cos(p) },
    true,
  )
}

/** A world with crash watching, past the half second after start-up when nothing is judged. */
function readyToDrop(field: Heightfield) {
  const world = setupWithCrashes(field)
  world.bike.placeOnGround(0, 250, 0)
  world.run(0.6)
  return world
}

/**
 * Drops the bike from `height` metres moving at `velocity`, and rides on until
 * 0.2 s after it first lands (before any bounce lands again).
 */
function landOn(
  field: Heightfield,
  height: number,
  velocity: { x: number; y?: number; z: number },
  at = { x: 0, heading: 0, pitch: 0 },
  changes?: (world: ReturnType<typeof setupWithCrashes>) => void,
) {
  const world = readyToDrop(field)
  changes?.(world)
  world.bike.placeOnGround(at.x, 250, at.heading, height)
  pose(world.bike, at.heading, at.pitch)
  world.bike.body.setLinvel({ x: velocity.x, y: velocity.y ?? 0, z: velocity.z }, true)
  for (let t = 0; t < 5 && world.crashes.landings === 0; t += 1 / 120) world.run(1 / 120)
  world.run(0.2)
  return world
}

describe('landings', () => {
  it('landing level on flat ground is clean and keeps all its speed, however high the jump', () => {
    // the ninth tuning session: every flat landing off the kickers came out sloppy
    for (const height of [1, 6, 25]) {
      const { crashes, bike } = landOn(flat(600), height, { x: 0, z: -20 })
      expect(crashes.lastLanding!.sloppiness).toBe(0)
      expect(groundSpeed(bike) / KMH).toBeGreaterThan(72 - 2) // only coasting
      expect(crashes.count).toBe(0)
    }
  })

  it('landing a bit nose-first or tail-first is clean; far off is sloppy, more and more toward worstLandingAngle', () => {
    const at = (pitch: number) => landOn(flat(600), 1, { x: 0, z: -15 }, { x: 0, heading: 0, pitch }).crashes
    expect(at(-25).lastLanding!.sloppiness).toBe(0)
    expect(at(25).lastLanding!.sloppiness).toBe(0)
    const expected = (55 - landing.sloppyAngle) / (config.crashes.worstLandingAngle - landing.sloppyAngle)
    for (const pitch of [-55, 55]) {
      const crashes = at(pitch)
      expect(crashes.count).toBe(0)
      expect(crashes.lastLanding!.sloppiness).toBeGreaterThan(expected - 0.1)
      expect(crashes.lastLanding!.sloppiness).toBeLessThan(expected + 0.1)
      expect(crashes.lastLanding!.speedLost).toBeGreaterThan(0)
    }
  })

  it('a little sideways is clean, even quite a lot; only near the crash limit is it sloppy', () => {
    const sideways = (kmh: number) => landOn(flat(600), 0.8, { x: kmh * KMH, z: -10 }).crashes
    expect(sideways(30).lastLanding!.sloppiness).toBe(0)
    const near = sideways(65)
    const expected = (65 - landing.sloppySideways) / (config.crashes.worstSidewaysLanding - landing.sloppySideways)
    expect(near.count).toBe(0)
    expect(near.lastLanding!.sloppiness).toBeGreaterThan(expected - 0.1)
    expect(near.lastLanding!.sloppiness).toBeLessThan(expected + 0.1)
  })

  it('a sloppy landing costs its share of speedLoss of the speed along the ground', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(3, () => (bike.controls.throttle = groundSpeed(bike) < 72 * KMH ? 1 : 0))
    bike.controls.throttle = 0
    const before = groundSpeed(bike)
    const lost = bike.landSloppily(0.5, landing)
    expect(groundSpeed(bike)).toBeCloseTo(before * (1 - 0.5 * (landing.speedLoss / 100)), 5)
    expect(lost).toBeCloseTo(before * 0.5 * (landing.speedLoss / 100), 5)
  })

  it('landings are still judged with crashes turned off', () => {
    const { crashes } = landOn(flat(600), 0.8, { x: 100 * KMH, z: -10 }, undefined, (world) => (world.crashes.settings.enabled = false))
    expect(crashes.lastLanding!.sloppiness).toBe(1)
  })
})

describe('the wobble after a sloppy landing', () => {
  /** How much speed full throttle adds over `seconds`, starting `after` seconds after a sloppy landing (or none). */
  function gained(sloppy: boolean, after: number, seconds = 0.1) {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(3, () => (bike.controls.throttle = groundSpeed(bike) < 40 * KMH ? 1 : 0))
    bike.controls.throttle = 0
    // costs no speed here, so both bikes are equally fast and only the wobble differs
    if (sloppy) bike.landSloppily(1, { ...landing, speedLoss: 0 })
    run(after)
    const before = groundSpeed(bike)
    bike.controls.throttle = 1
    run(seconds)
    return groundSpeed(bike) - before
  }

  it('throttle bites less straight after a sloppy landing, and fully again after wobble seconds', () => {
    expect(gained(true, 0)).toBeLessThan(gained(false, 0) * 0.85)
    expect(gained(true, landing.wobble)).toBeCloseTo(gained(false, landing.wobble), 2)
  })

  it('steering bites less straight after a sloppy landing', () => {
    const turning = (sloppy: boolean) => {
      const { bike, run } = setup(flat(600))
      bike.placeOnGround(0, 250, 0)
      run(3, () => (bike.controls.throttle = groundSpeed(bike) < 40 * KMH ? 1 : 0))
      bike.controls.throttle = 0
      if (sloppy) bike.landSloppily(1, { ...landing, speedLoss: 0 })
      bike.controls.steer = 1
      run(0.1)
      return Math.abs(bike.body.angvel().y)
    }
    expect(turning(true)).toBeLessThan(turning(false) * 0.85)
  })
})
