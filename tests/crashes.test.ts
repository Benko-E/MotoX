import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, ground, setupWithCrashes } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Nose up (positive) or down by `degrees`, keeping the heading 0 (toward -z). */
function pitchTo(bike: Bike, degrees: number) {
  const half = (degrees * DEG) / 2
  bike.body.setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }, true)
}

/** Drops the bike from `height` metres, pitched by `pitch` degrees, moving at `velocity`. */
function drop(pitch: number, velocity = { x: 0, z: 0 }, height = 2) {
  const world = setupWithCrashes(flat(600))
  world.bike.placeOnGround(0, 0, 0, height)
  pitchTo(world.bike, pitch)
  world.bike.body.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true)
  return world
}

describe('what counts as a crash', () => {
  it('a clean landing is not a crash', () => {
    const { crashes, run } = drop(0, { x: 0, z: -15 }, 3)
    run(2)
    expect(crashes.count).toBe(0)
  })

  it('landing nose-first further off the slope than worstLandingAngle is a crash; less is not', () => {
    const bad = drop(-55)
    bad.crashes.settings.worstLandingAngle = 45
    bad.run(1.5)
    expect(bad.crashes.count).toBe(1)
    expect(bad.crashes.reason).toMatch(/nose/)

    const ok = drop(-30)
    ok.crashes.settings.worstLandingAngle = 45
    ok.run(1.5)
    expect(ok.crashes.count).toBe(0)
  })

  it('landing tail-first too far off the slope is a crash', () => {
    const { crashes, run } = drop(55)
    crashes.settings.worstLandingAngle = 45
    run(1.5)
    expect(crashes.count).toBe(1)
    expect(crashes.reason).toMatch(/tail/)
  })

  it('a sideways landing slides when slow, but flings you over when fast', () => {
    // pointing toward -z, travelling toward +x: fully side-on
    const slow = drop(0, { x: 30 * KMH, z: 0 })
    slow.run(2)
    expect(slow.crashes.count).toBe(0)

    const fast = drop(0, { x: 90 * KMH, z: 0 })
    fast.run(1.5)
    expect(fast.crashes.count).toBe(1)
    expect(fast.crashes.reason).toMatch(/sideways/)
  })

  it('the bike lying on its side on the ground is a crash', () => {
    const { bike, crashes, run } = setupWithCrashes(flat())
    bike.placeOnGround(0, 0, 0)
    const half = (-80 * DEG) / 2 // right side down
    bike.body.setRotation({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) }, true)
    run(1)
    expect(crashes.count).toBe(1)
  })

  it('the head hitting the ground is a crash', () => {
    // upside down, a little off the ground
    const { bike, crashes, run } = setupWithCrashes(flat())
    bike.placeOnGround(0, 0, 0, 1.5)
    pitchTo(bike, 180)
    run(1.5)
    expect(crashes.count).toBe(1)
    expect(crashes.reason).toMatch(/head|fell/)
  })

  it('the head touching the ground is a crash on its own, even with every other rule switched off', () => {
    const { bike, crashes, run } = setupWithCrashes(flat())
    crashes.safety.sideTip = 180
    crashes.settings.worstLandingAngle = 180
    crashes.settings.worstSidewaysLanding = 10_000
    bike.placeOnGround(0, 0, 0, 1.5)
    pitchTo(bike, 180)
    run(1.5)
    expect(crashes.count).toBe(1)
    expect(crashes.reason).toMatch(/head/)
  })

  it('riding hard, jumping, wheelies and stoppies are never a crash', () => {
    // two humps near the start, then a long flat run for the wheelie and stoppie
    const hump = (z: number, at: number) => 1.5 * Math.exp(-(((z - at) / 6) ** 2))
    const { bike, crashes, run } = setupWithCrashes(ground((_x, z) => hump(z, 200) + hump(z, 140), 600))
    bike.placeOnGround(0, 270, 0)
    const cruise = (target: number) => {
      const speed = bike.forwardSpeed
      bike.controls.throttle = clamp((target - speed) / 2, 0, 1)
      bike.controls.brake = clamp((speed - target - 1) / 2, 0, 1)
    }
    run(8, () => cruise(20)) // over the two humps at 72 km/h, onto the flat
    // however quick the bike's set to be, well past the humps before the wheelie
    for (let t = 0; t < 20 && bike.body.translation().z > 100; t += 0.5) run(0.5, () => cruise(20))
    bike.controls.lean = -1
    run(1.5, () => (bike.controls.throttle = 1)) // a wheelie
    bike.controls.lean = 0
    run(1, () => cruise(15)) // back on both wheels
    bike.controls.lean = 1
    bike.controls.throttle = 0
    bike.controls.brake = 1
    run(1.5) // a stoppie to a halt
    expect(crashes.count).toBe(0)
  })

  it('tipping forward or back never counts as falling over, however low the side tip limit', () => {
    // the fourth tuning session: "tipped over" fired riding up ramps and leaning back after jumps
    const { bike, crashes, run } = setupWithCrashes(flat(600))
    crashes.safety.sideTip = 30
    bike.placeOnGround(0, 250, 0)
    const rolling = () => {
      const speed = bike.forwardSpeed
      bike.controls.throttle = clamp((40 * KMH - speed) / 2, 0, 1)
    }
    run(4, rolling)
    bike.controls.lean = -1
    run(2, () => (bike.controls.throttle = 1)) // a 40 degree wheelie: more than 30, but backward
    expect(bike.pitch / DEG).toBeGreaterThan(30)
    expect(crashes.count).toBe(0)
  })

  it('riding up a steep slope is never a crash', () => {
    const { bike, crashes, run } = setupWithCrashes(ground((x) => Math.max(0, -x - 20) * Math.tan(32 * DEG), 600))
    bike.placeOnGround(0, 0, 270) // rides toward -x, onto a 32 degree climb at x = -20
    run(4, () => (bike.controls.throttle = 1))
    expect(bike.body.translation().y).toBeGreaterThan(5) // it really climbed
    expect(crashes.count).toBe(0)
  })

  it('crashes can be turned off', () => {
    const { crashes, run } = drop(-80)
    crashes.settings.enabled = false
    run(1.5)
    expect(crashes.count).toBe(0)
  })
})

describe('after a crash', () => {
  it('the controls do nothing while crashed', () => {
    const { bike, crashes, run } = drop(-80)
    run(0.8)
    expect(crashes.crashed).toBe(true)
    bike.controls.throttle = 1
    run(0.5)
    expect(bike.forwardSpeed).toBeLessThan(2)
  })

  it('puts the bike back upright after resetDelay, standing still, facing the way it was travelling', () => {
    // pointing toward -z but travelling toward +x when it lands side-on and crashes
    const { bike, crashes, run } = drop(0, { x: 90 * KMH, z: 0 })
    let crashedAt = -1
    let time = 0
    run(1, () => {
      if (crashedAt < 0 && crashes.crashed) crashedAt = time
      time += 1 / 120
    })
    expect(crashedAt).toBeGreaterThan(0)
    run(config.crashes.resetDelay)
    expect(crashes.crashed).toBe(false)
    expect(Math.abs(bike.roll)).toBeLessThan(2 * DEG)
    expect(bike.speed).toBeLessThan(0.5)
    expect(Math.abs(bike.heading - 90)).toBeLessThan(15) // facing +x, the way it went
    run(1)
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
    expect(crashes.count).toBe(1) // and getting back up isn't another crash
  })

  it('getting up straight away (R) ends the crash at once', () => {
    const { bike, crashes, run } = drop(-80)
    run(0.8)
    expect(crashes.crashed).toBe(true)
    crashes.recover()
    expect(crashes.crashed).toBe(false)
    expect(Math.abs(bike.pitch)).toBeLessThan(2 * DEG)
  })
})
