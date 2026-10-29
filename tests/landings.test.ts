import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, ground, setup, setupWithCrashes } from './physicsSetup'
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

/** Drops the bike from `height` metres onto flat ground, rolling at `kmh`, until 0.2 s after it lands. */
const landFlat = (height: number, kmh: number) => landOn(flat(600), height, { x: 0, z: -kmh * KMH })

describe('landings', () => {
  it('a soft landing is clean and keeps all its speed', () => {
    const { crashes, bike, run } = readyToDrop(flat(600))
    bike.placeOnGround(0, 250, 0, 1)
    bike.body.setLinvel({ x: 0, y: 0, z: -20 }, true)
    run(0.8) // falls about 1 m (about 16 km/h into the ground), then rolls
    expect(crashes.landings).toBe(1)
    expect(crashes.lastLanding!.sloppiness).toBe(0)
    expect(groundSpeed(bike) / KMH).toBeGreaterThan(72 - 2) // only coasting
  })

  it('landing flat from high up is sloppy and costs speed: the harder, the more, up to speedLoss', () => {
    for (const height of [6, 25]) {
      const { crashes, bike } = landFlat(height, 72)
      const impact = Math.sqrt(2 * 9.81 * height) / KMH // km/h straight into the ground
      const sloppiness = Math.min((impact - landing.cleanImpact) / (landing.worstImpact - landing.cleanImpact), 1)
      expect(crashes.lastLanding!.sloppiness).toBeGreaterThan(sloppiness - 0.08)
      expect(crashes.lastLanding!.sloppiness).toBeLessThan(sloppiness + 0.08)
      const kept = 72 * (1 - (landing.speedLoss / 100) * sloppiness)
      expect(groundSpeed(bike) / KMH).toBeGreaterThan(kept - 4)
      expect(groundSpeed(bike) / KMH).toBeLessThan(kept + 2)
      expect(crashes.count).toBe(0) // landing hard on its own never crashes you
    }
  })

  it('falling fast onto a downslope that matches is clean, where the same fall onto flat ground is sloppy', () => {
    // 25 m/s at 35 degrees down: 52 km/h of it straight down
    const angle = 35 * DEG
    const velocity = { x: 25 * Math.cos(angle), y: -25 * Math.sin(angle), z: 0 }
    const downslope = ground((x) => (x > 0 ? -x * Math.tan(angle) : 0), 600)
    const matching = landOn(downslope, 1.2, velocity, { x: 40, heading: 90, pitch: -35 })
    expect(matching.crashes.landings).toBeGreaterThan(0)
    expect(matching.crashes.lastLanding!.sloppiness).toBe(0)

    // from 4 m up, thrown down so it hits the ground just as fast (shorter than 0.15 s in the air isn't a jump)
    const fromHigher = { ...velocity, y: -Math.sqrt(velocity.y ** 2 - 2 * 9.81 * 4) }
    const onFlat = landOn(flat(600), 4, fromHigher, { x: 0, heading: 90, pitch: 0 })
    expect(onFlat.crashes.lastLanding!.sloppiness).toBeGreaterThan(0.5)
  })

  it('a little sideways is clean, more sideways is sloppy', () => {
    const sideways = (kmh: number) => landOn(flat(600), 0.8, { x: kmh * KMH, z: -10 }).crashes.lastLanding!.sloppiness
    expect(sideways(10)).toBe(0)
    const expected = (50 - landing.cleanSideways) / (config.crashes.worstSidewaysLanding - landing.cleanSideways)
    expect(sideways(50)).toBeGreaterThan(expected - 0.1)
    expect(sideways(50)).toBeLessThan(expected + 0.1)
  })

  it('landings are still judged with crashes turned off', () => {
    const { crashes } = landOn(flat(600), 25, { x: 0, z: 0 }, undefined, (world) => (world.crashes.settings.enabled = false))
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
