import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { turnRadiusAt } from '../src/physics/bikeTuning'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, ground, setup, slope } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const { speed: speedSettings, turning } = config.bike
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
  if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250) bike.body.setTranslation({ x: 0, y: p.y, z: 0 }, true)
}

/** Steady turning radius right now, metres. */
const radius = (bike: Bike) => bike.forwardSpeed / Math.max(Math.abs(bike.body.angvel().y), 1e-9)

/** The radius the turning settings ask for at a speed. */
const expectedRadius = (v: number) => turnRadiusAt(turning, speedSettings, v)

describe('speed', () => {
  it('reaches 60 km/h in about secondsTo60 from a standstill', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    run(1)
    bike.controls.throttle = 1
    let time = 0
    run(10, () => {
      keepOnMap(bike)
      if (bike.forwardSpeed < 60 * KMH) time += 1 / 120
    })
    expect(time).toBeGreaterThan(speedSettings.secondsTo60 * 0.9)
    expect(time).toBeLessThan(speedSettings.secondsTo60 * 1.1)
  })

  it('levels off at topSpeed', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    bike.controls.throttle = 1
    run(30, () => keepOnMap(bike))
    expect(bike.forwardSpeed / KMH).toBeGreaterThan(speedSettings.topSpeed * 0.97)
    expect(bike.forwardSpeed / KMH).toBeLessThan(speedSettings.topSpeed * 1.01)
  })

  it('stops from 60 km/h in about secondsToStopFrom60, diving the front without lifting the rear', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(1)
    const restFront = bike.wheels[0].compressionRatio
    bike.controls.throttle = 1
    for (let t = 0; t < 6 && bike.forwardSpeed < 60 * KMH; t += 1 / 120) run(1 / 120)
    bike.controls.throttle = 0
    bike.controls.brake = 1
    let time = 0
    let frontMost = 0
    let rearLifted = false
    run(5, () => {
      if (bike.speed > 0.1) time += 1 / 120
      frontMost = Math.max(frontMost, bike.wheels[0].compressionRatio)
      if (!bike.wheels[1].onGround) rearLifted = true
    })
    expect(time).toBeGreaterThan(speedSettings.secondsToStopFrom60 * 0.85)
    expect(time).toBeLessThan(speedSettings.secondsToStopFrom60 * 1.15)
    expect(frontMost).toBeGreaterThan(restFront + 0.1) // the fork dives
    expect(rearLifted).toBe(false) // no stoppie
    expect(bike.speed).toBeLessThan(0.05) // and it stays stopped
  })

  it('never flips over the front under plain braking, however strong the brakes', () => {
    // the second tuning session: hard braking from 110 km/h flipped the bike over
    const { bike, run } = setup(flat(600))
    bike.stats.speed.secondsToStopFrom60 = 0.6
    bike.stats.weight.noseDive = 1
    bike.placeOnGround(0, 0, 0)
    bike.controls.throttle = 1
    run(15, () => keepOnMap(bike))
    bike.controls.throttle = 0
    bike.controls.brake = 1
    let rearLifted = false
    run(4, () => {
      keepOnMap(bike)
      if (!bike.wheels[1].onGround) rearLifted = true
    })
    expect(rearLifted).toBe(false)
    expect(bike.speed).toBeLessThan(0.1)
  })

  it('slows down by itself at about coastSlowdown when you let go', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    run(10, () => {
      keepOnMap(bike)
      cruise(bike, 60 * KMH)
    })
    const before = bike.forwardSpeed / KMH
    bike.controls.throttle = 0
    bike.controls.brake = 0
    run(1, () => keepOnMap(bike))
    expect(before - bike.forwardSpeed / KMH).toBeCloseTo(speedSettings.coastSlowdown, 0)
  })

  it('holds still on a slope with the brake on', () => {
    const { bike, run } = setup(slope())
    bike.placeOnGround(0, 0, 90) // facing downhill
    bike.controls.brake = 1
    run(3)
    expect(bike.speed).toBeLessThan(0.05)
  })

  it('keeps the front wheel down at full throttle, on the flat and up a steep hill', () => {
    for (const field of [flat(600), ground((x) => -x * Math.tan(15 * DEG))]) {
      const { bike, run } = setup(field)
      bike.placeOnGround(80, 0, 270) // toward -x: uphill on the hill
      run(1)
      bike.controls.throttle = 1
      let frontLifted = false
      run(4, () => {
        if (!bike.wheels[0].onGround) frontLifted = true
      })
      expect(frontLifted).toBe(false)
    }
  })
})

describe('turning', () => {
  /** A bike in a steady full-steer turn at `kmh`, and its world's step function. */
  const steadyTurn = (kmh: number) => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    run(8, () => cruise(bike, kmh * KMH))
    bike.controls.steer = 1
    run(1.5, () => cruise(bike, kmh * KMH))
    return { bike, run }
  }

  it('turns as tight as the turning settings say, slow and fast', () => {
    for (const kmh of [15, 50, 90]) {
      const { bike } = steadyTurn(kmh)
      const want = expectedRadius(bike.forwardSpeed)
      expect(radius(bike)).toBeGreaterThan(want * 0.85)
      expect(radius(bike)).toBeLessThan(want * 1.15)
    }
  })

  it('turns at top speed as tight as tightestTurnFast says, whatever the grip', () => {
    // the first tuning session: tightestTurnFast seemed to do nothing at 110 km/h
    const { bike, run } = setup(flat(600))
    bike.stats.turning.grip = 1
    bike.stats.turning.tightestTurnFast = 12
    bike.placeOnGround(0, 0, 0)
    bike.controls.throttle = 1
    run(20, () => keepOnMap(bike))
    bike.controls.steer = 1
    run(1.5)
    expect(radius(bike)).toBeGreaterThan(12 * 0.85)
    expect(radius(bike)).toBeLessThan(12 * 1.15)
    expect(Math.abs(bike.slide)).toBeLessThan(0.3) // and still goes where it points
  })

  it('does not speed up past topSpeed while holding a full turn', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    bike.controls.throttle = 1
    run(20, () => keepOnMap(bike))
    bike.controls.steer = 1
    run(3)
    expect(bike.speed / KMH).toBeLessThan(speedSettings.topSpeed * 1.01)
  })

  it('goes where it points: the rear wheel follows the turn instead of sliding out', () => {
    for (const kmh of [15, 50, 90]) {
      expect(Math.abs(steadyTurn(kmh).bike.slide)).toBeLessThan(0.3)
    }
  })

  it('does not slide the rear out when you steer while accelerating hard from a standstill', () => {
    // the first ride: W from a standstill, then D, and the rear swung out
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    run(1)
    bike.controls.throttle = 1
    run(0.8)
    bike.controls.steer = 1
    let mostSlide = 0
    run(2, () => {
      mostSlide = Math.max(mostSlide, Math.abs(bike.slide))
    })
    expect(mostSlide).toBeLessThan(0.5)
  })

  it('steering left turns left and leans left', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 0, 0)
    run(5, () => cruise(bike, 40 * KMH))
    bike.controls.steer = -1
    run(1, () => cruise(bike, 40 * KMH))
    expect(bike.body.angvel().y).toBeGreaterThan(0.2) // turning anticlockwise seen from above: to the left
    expect(bike.lean).toBeLessThan(-5 * DEG)
  })

  it('never leans further than maxLean, and the physics bike itself stays upright', () => {
    const { bike } = steadyTurn(90)
    expect(Math.abs(bike.lean)).toBeGreaterThan(turning.maxLean * DEG * 0.9) // a full lean
    expect(Math.abs(bike.lean)).toBeLessThan(turning.maxLean * DEG + 0.01)
    expect(Math.abs(bike.roll)).toBeLessThan(2 * DEG)
  })

  it('straightens up after a fast turn and can brake hard straight out of it', () => {
    const { bike, run } = steadyTurn(90)
    bike.controls.steer = 0
    bike.controls.throttle = 0
    bike.controls.brake = 1
    let wheelLifted = false
    run(3, () => {
      if (!bike.wheels.every((wheel) => wheel.onGround)) wheelLifted = true
    })
    expect(wheelLifted).toBe(false)
    expect(Math.abs(bike.lean)).toBeLessThan(1 * DEG)
    expect(Math.abs(bike.slide)).toBeLessThan(0.1)
  })
})

describe('air and landings', () => {
  it('carries its speed over a crest and takes off instead of sticking to the ground', () => {
    const { bike, run } = setup(ground((_x, z) => 1.5 * Math.exp(-((z / 6) ** 2)))) // a 1.5 m hump at z = 0
    bike.placeOnGround(0, 90, 0) // rides toward -z, over the hump
    run(8, () => cruise(bike, 20))
    expect(bike.lastAirtime).toBeGreaterThan(0.2)
  })

  it('turns in the air at about airTurn degrees per second', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0, 20) // a long fall
    bike.controls.steer = 1
    run(0.6)
    expect(Math.abs(bike.body.angvel().y) / DEG).toBeGreaterThan(turning.airTurn * 0.85)
    expect(Math.abs(bike.body.angvel().y) / DEG).toBeLessThan(turning.airTurn * 1.15)
  })

  it('lands a jump crooked without spinning out, and rides on the way it points', () => {
    // the first ride: any jump not taken dead straight spun the bike out on landing
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 200, 0, 2) // 2 m up, pointing toward -z
    // moving at 15 m/s, but 25 degrees off to the side of where it points
    const off = 25 * DEG
    bike.body.setLinvel({ x: 15 * Math.sin(off), y: 0, z: -15 * Math.cos(off) }, true)
    const pointing = bike.heading
    let fastestSpin = 0
    run(2, () => {
      fastestSpin = Math.max(fastestSpin, Math.abs(bike.body.angvel().y))
    })
    expect(fastestSpin).toBeLessThan(30 * DEG)
    expect(Math.abs(bike.heading - pointing)).toBeLessThan(10) // still points the same way
    expect(Math.abs(bike.slide)).toBeLessThan(0.3) // and goes that way
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
  })

  it('a bike stood on its tail just topples over and lies still: no wild spinning, no bouncing up', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0)
    run(0.5)
    const half = (80 * DEG) / 2 // nose up 80 degrees, like a wheelie gone too far
    bike.body.setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }, true)
    bike.body.setTranslation({ x: 0, y: 1.5, z: 0 }, true)
    let fastestSpin = 0
    let highest = 0
    run(4, () => {
      fastestSpin = Math.max(fastestSpin, Math.abs(bike.body.angvel().y))
      highest = Math.max(highest, bike.body.translation().y)
    })
    const { x, y, z } = bike.body.angvel()
    expect(fastestSpin).toBeLessThan(300 * DEG) // the bug spun it at 667 degrees a second
    expect(Math.hypot(x, y, z)).toBeLessThan(0.3) // and it comes to rest
    expect(highest).toBeLessThan(1.55) // never thrown up higher than it started
  })

  it('a wheelie gone too far does not get twisted round by the upright helper', () => {
    // nose up 75 degrees and tipped 25 degrees sideways, sitting on the rear wheel
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0)
    run(0.5)
    const [p, r] = [(75 * DEG) / 2, (-25 * DEG) / 2]
    bike.body.setRotation(
      { x: Math.sin(p) * Math.cos(r), y: -Math.sin(p) * Math.sin(r), z: Math.cos(p) * Math.sin(r), w: Math.cos(p) * Math.cos(r) },
      true,
    )
    bike.body.setTranslation({ x: 0, y: 1.1, z: 0 }, true)
    let fastestSpin = 0
    run(0.5, () => {
      fastestSpin = Math.max(fastestSpin, Math.abs(bike.body.angvel().y))
    })
    expect(fastestSpin).toBeLessThan(90 * DEG)
  })
})
