import { beforeAll, describe, expect, it } from 'vitest'
import type { Bike } from '../src/physics/bike'
import { maxSteerAngle } from '../src/physics/steering'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, ground, setup, slope } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Works throttle and brake to hold the bike near `target` m/s. */
function cruise(bike: Bike, target: number) {
  const speed = bike.forwardSpeed
  bike.controls.throttle = clamp((target - speed) / 2, 0, 1)
  bike.controls.brake = clamp((speed - target - 1) / 2, 0, 1)
}

/** On flat ground, moves the bike back when it nears the edge (speed and direction kept), for long runs. */
function keepOnMap(bike: Bike) {
  const p = bike.body.translation()
  if (Math.abs(p.z) > 250) bike.body.setTranslation({ x: p.x, y: p.y, z: 0 }, true)
}

describe('steering curve', () => {
  const steering = { maxAngle: 30, halfAngleSpeed: 5, falloff: 2 }

  it('gives full steering when still, half at halfAngleSpeed, and less and less above it', () => {
    expect(maxSteerAngle(steering, 0)).toBe(30)
    expect(maxSteerAngle(steering, 5)).toBe(15)
    expect(maxSteerAngle(steering, 10)).toBeCloseTo(6, 9) // 30 / (1 + 2^2)
    expect(maxSteerAngle(steering, -10)).toBeCloseTo(6, 9) // the same rolling backward
  })
})

describe('riding', () => {
  it('pulls away with punch, then keeps building speed', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(1)
    bike.controls.throttle = 1
    run(1)
    const afterOne = bike.forwardSpeed
    run(2)
    const afterThree = bike.forwardSpeed
    expect(afterOne).toBeGreaterThan(4) // punchy
    expect(afterThree).toBeGreaterThan(afterOne + 3) // still building
    expect(afterThree).toBeLessThan(25) // but not instant
  })

  it('keeps the front wheel down at full throttle from a standstill', () => {
    // wheelies are for leaning back, not for plain throttle
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(1)
    bike.controls.throttle = 1
    let frontLifted = false
    run(4, () => {
      if (!bike.wheels[0].onGround) frontLifted = true
    })
    expect(frontLifted).toBe(false)
  })

  it('levels off at a top speed', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    bike.controls.throttle = 1
    run(30, () => keepOnMap(bike))
    const atThirty = bike.forwardSpeed
    run(10, () => keepOnMap(bike))
    expect(Math.abs(bike.forwardSpeed - atThirty)).toBeLessThan(0.5)
    expect(atThirty).toBeGreaterThan(20)
    expect(atThirty).toBeLessThan(45)
  })

  it('brakes hard, diving the front suspension, and comes to a stop', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(2)
    const restFront = bike.wheels[0].compressionRatio
    const restRear = bike.wheels[1].compressionRatio
    bike.controls.throttle = 1
    for (let t = 0; t < 6 && bike.forwardSpeed < 15; t += 0.05) run(0.05)
    expect(bike.forwardSpeed).toBeGreaterThan(14)

    bike.controls.throttle = 0
    bike.controls.brake = 1
    let time = 0
    let frontMost = 0
    let rearLeast = 1
    run(6, () => {
      if (bike.speed > 0.1) time += 1 / 120
      frontMost = Math.max(frontMost, bike.wheels[0].compressionRatio)
      rearLeast = Math.min(rearLeast, bike.wheels[1].compressionRatio)
    })
    expect(time).toBeLessThan(3) // from about 15 m/s: better than 5 m/s² on average
    expect(frontMost).toBeGreaterThan(restFront + 0.12) // the fork dives
    expect(rearLeast).toBeLessThan(restRear) // the rear lifts a little
    expect(bike.speed).toBeLessThan(0.05) // and it stays stopped
  })

  it('holds still on a slope with the brake on', () => {
    const { bike, run } = setup(slope())
    bike.placeOnGround(0, 0, 90) // facing downhill
    bike.controls.brake = 1
    run(3)
    expect(bike.speed).toBeLessThan(0.05)
  })

  it('turns tight at low speed and in wide arcs at high speed', () => {
    const radiusAt = (speed: number) => {
      const { bike, run } = setup(flat(600))
      bike.placeOnGround(0, 0, 0)
      run(6, () => cruise(bike, speed))
      bike.controls.steer = 1
      run(2, () => cruise(bike, speed))
      return bike.forwardSpeed / Math.abs(bike.body.angvel().y)
    }
    const slow = radiusAt(5)
    const fast = radiusAt(20)
    expect(slow).toBeLessThan(8)
    expect(fast / slow).toBeGreaterThan(4)
  })

  it('steering left turns left and leans the bike into the turn', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    run(5, () => cruise(bike, 10))
    bike.controls.steer = -1
    run(1, () => cruise(bike, 10))
    expect(bike.heading).toBeLessThan(-10) // swung round toward -x, the left
    expect(bike.roll).toBeLessThan(-5 * DEG) // leaning left
  })

  it('leans into a fast turn as far as it should, not further', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(6, () => cruise(bike, 22))
    bike.controls.steer = 1
    run(1.5, () => cruise(bike, 22))
    expect(bike.targetLean).toBeGreaterThan(20 * DEG) // a real lean
    expect(Math.abs(bike.roll - bike.targetLean)).toBeLessThan(3 * DEG)
  })

  it('straightens up after a fast turn without whipping over or losing a wheel', () => {
    // about 86 km/h, where this once flipped the bike
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(7, () => cruise(bike, 24))
    bike.controls.steer = 1
    run(1.5, () => cruise(bike, 24))
    bike.controls.steer = 0
    let wheelLifted = false
    let mostOtherWay = 0
    run(2, () => {
      cruise(bike, 24)
      if (bike.wheels.some((wheel) => !wheel.onGround)) wheelLifted = true
      mostOtherWay = Math.min(mostOtherWay, bike.roll)
    })
    expect(wheelLifted).toBe(false)
    expect(mostOtherWay).toBeGreaterThan(-8 * DEG) // overshoots to the left by less than 8 degrees
    expect(Math.abs(bike.roll)).toBeLessThan(2 * DEG)
  })

  it('can brake hard straight out of a fast turn without flipping', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(7, () => cruise(bike, 24))
    bike.controls.steer = 1
    run(1.5, () => cruise(bike, 24))
    bike.controls.steer = 0
    bike.controls.throttle = 0
    run(0.3)
    bike.controls.brake = 1
    let mostLean = 0
    run(3, () => {
      mostLean = Math.max(mostLean, Math.abs(bike.roll))
    })
    expect(mostLean).toBeLessThan(50 * DEG) // never past the turn's own lean
    expect(Math.abs(bike.roll)).toBeLessThan(3 * DEG) // and upright once stopped
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
  })

  it('carries its speed over a crest and takes off instead of sticking to the ground', () => {
    // a 1.5 m hump across the road at z = 0
    const { bike, run } = setup(ground((_x, z) => 1.5 * Math.exp(-((z / 6) ** 2))))
    bike.placeOnGround(0, 90, 0) // rides toward -z, over the hump
    run(8, () => cruise(bike, 20))
    expect(bike.lastAirtime).toBeGreaterThan(0.2)
  })
})
