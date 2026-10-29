import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { rotate } from '../src/physics/vec'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, setup } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const { rider } = config.bike
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Works throttle and brake to hold the bike near `target` m/s. */
function cruise(bike: Bike, target: number) {
  const speed = bike.forwardSpeed
  bike.controls.throttle = clamp((target - speed) / 2, 0, 1)
  bike.controls.brake = clamp((speed - target - 1) / 2, 0, 1)
}

/** How fast the bike spins nose up (positive) or down, degrees per second. */
function noseUpRate(bike: Bike) {
  const right = rotate(bike.body.rotation(), { x: 1, y: 0, z: 0 })
  const w = bike.body.angvel()
  return (w.x * right.x + w.y * right.y + w.z * right.z) / DEG
}

describe('leaning in the air', () => {
  it('leaning back spins the nose up and leaning forward spins it down, at about airSpin', () => {
    for (const lean of [-1, 1]) {
      const { bike, run } = setup(flat())
      bike.placeOnGround(0, 0, 0, 20) // a long fall
      bike.controls.lean = lean
      run(0.5)
      expect(noseUpRate(bike) * -lean).toBeGreaterThan(rider.airSpin * 0.85)
      expect(noseUpRate(bike) * -lean).toBeLessThan(rider.airSpin * 1.15)
    }
  })

  it('keeps spinning as it is when you stop leaning', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0, 20)
    bike.controls.lean = -1
    run(0.5)
    const spinning = noseUpRate(bike)
    bike.controls.lean = 0
    run(0.3)
    expect(noseUpRate(bike)).toBeCloseTo(spinning, 0)
  })
})

describe('leaning on the ground', () => {
  /** A bike rolling at `kmh` on flat ground. */
  const rolling = (kmh: number) => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(5, () => cruise(bike, kmh * KMH))
    return { bike, run }
  }

  it('leaning back with the throttle open pulls a wheelie up to wheelieAngle and holds it', () => {
    const { bike, run } = rolling(20)
    bike.controls.lean = -1
    bike.controls.throttle = 1
    bike.controls.brake = 0
    let highest = 0
    run(1.5, () => {
      highest = Math.max(highest, bike.pitch / DEG)
    })
    expect(bike.wheels[0].onGround).toBe(false) // front wheel up
    expect(bike.wheels[1].onGround).toBe(true) // on the back wheel
    expect(bike.pitch / DEG).toBeGreaterThan(rider.wheelieAngle - 5)
    expect(highest).toBeLessThan(rider.wheelieAngle + 5) // held there, not looped over
  })

  it('puts the front wheel back down when you stop leaning back', () => {
    const { bike, run } = rolling(20)
    bike.controls.lean = -1
    bike.controls.throttle = 1
    bike.controls.brake = 0
    run(1.5)
    bike.controls.lean = 0
    run(1.5)
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
    expect(Math.abs(bike.pitch / DEG)).toBeLessThan(3)
  })

  it('leaning back without throttle does not wheelie', () => {
    const { bike, run } = rolling(20)
    bike.controls.lean = -1
    bike.controls.throttle = 0
    bike.controls.brake = 0
    let frontLifted = false
    run(1.5, () => {
      if (!bike.wheels[0].onGround) frontLifted = true
    })
    expect(frontLifted).toBe(false)
  })

  it('leaning forward without the brake only dips the nose a little', () => {
    const { bike, run } = rolling(40)
    bike.controls.lean = 1
    let rearLifted = false
    let deepest = 0
    run(1.5, () => {
      cruise(bike, 40 * KMH)
      if (!bike.wheels[1].onGround) rearLifted = true
      deepest = Math.min(deepest, bike.pitch / DEG)
    })
    expect(rearLifted).toBe(false)
    expect(deepest).toBeGreaterThan(-2) // a stoppie needs the brake too
  })

  it('leaning forward with the brake on lifts the rear into a stoppie, no further than stoppieAngle', () => {
    const { bike, run } = rolling(40)
    bike.controls.lean = 1
    bike.controls.throttle = 0
    bike.controls.brake = 1
    let rearLifted = false
    let deepest = 0
    run(1.5, () => {
      if (!bike.wheels[1].onGround) rearLifted = true
      deepest = Math.min(deepest, bike.pitch / DEG)
    })
    expect(rearLifted).toBe(true)
    expect(deepest).toBeGreaterThan(-(rider.stoppieAngle + 5))
    expect(bike.speed).toBeLessThan(0.5) // and it still stops
  })

  it('steers less with the front wheel up in a wheelie', () => {
    const turnRate = (wheelie: boolean) => {
      const { bike, run } = rolling(20)
      bike.controls.lean = wheelie ? -1 : 0
      run(1.2, () => cruise(bike, 20 * KMH))
      if (wheelie) bike.controls.throttle = 1 // keep it up
      bike.controls.steer = 1
      run(0.5, () => {
        if (wheelie) bike.controls.throttle = 1
      })
      return Math.abs(bike.body.angvel().y)
    }
    expect(turnRate(true)).toBeLessThan(turnRate(false) * (rider.wheelieSteering + 0.2))
  })

  it('leaning shifts weight between the suspensions without lifting a wheel', () => {
    const { bike, run } = rolling(20)
    const level = bike.wheels[0].compressionRatio - bike.wheels[1].compressionRatio
    bike.controls.lean = 1
    run(1, () => cruise(bike, 20 * KMH))
    const forward = bike.wheels[0].compressionRatio - bike.wheels[1].compressionRatio
    expect(forward).toBeGreaterThan(level + 0.02) // front squashed more
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
  })
})
