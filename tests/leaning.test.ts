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

/** Speed over the ground, m/s (forwardSpeed is along the bike, which points up in a wheelie). */
const groundSpeed = (bike: Bike) => Math.hypot(bike.body.linvel().x, bike.body.linvel().z)

/** On flat ground, moves the bike back when it nears the edge (speed and direction kept), for long runs. */
function keepOnMap(bike: Bike) {
  const p = bike.body.translation()
  if (Math.abs(p.x) > 250 || Math.abs(p.z) > 250) bike.body.setTranslation({ x: 0, y: p.y, z: 0 }, true)
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
    expect(deepest).toBeGreaterThan(-(rider.weightShiftAngle + 1.5)) // a stoppie needs the brake too
  })

  it('leaning back without throttle only tips the bike back a few degrees', () => {
    const { bike, run } = rolling(40)
    bike.controls.lean = -1
    bike.controls.throttle = 0
    bike.controls.brake = 0
    let highest = 0
    run(1.5, () => {
      highest = Math.max(highest, bike.pitch / DEG)
    })
    expect(highest).toBeLessThan(rider.weightShiftAngle + 1.5)
  })

  it('landing nose-down while still leaning forward does not tip the bike over the front', () => {
    // the second tuning session: weight shift sent the bike barrelling over the front on landing
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0, 2)
    const half = (-15 * DEG) / 2 // nose down 15 degrees
    bike.body.setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }, true)
    bike.body.setLinvel({ x: 0, y: 0, z: -15 }, true)
    // still leaning forward as it touches down (leaning forward in the air would spin it further)
    let deepest = 0
    run(3, () => {
      if (bike.wheels.some((wheel) => wheel.onGround)) bike.controls.lean = 1
      deepest = Math.min(deepest, bike.pitch / DEG)
    })
    expect(deepest).toBeGreaterThan(-35)
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
    expect(Math.abs(bike.pitch / DEG)).toBeLessThan(rider.weightShiftAngle + 2)
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

  it('steering a little in a wheelie turns the bike where it points: no crabbing sideways', () => {
    const { bike, run } = rolling(20)
    bike.stats.rider.wheelieSteering = 0.1
    bike.controls.lean = -1
    bike.controls.throttle = 1
    run(1)
    const heading = bike.heading
    bike.controls.steer = 1
    run(1.5, () => keepOnMap(bike))
    expect(bike.wheels[0].onGround).toBe(false) // still up
    expect(bike.heading - heading).toBeGreaterThan(5) // it turned right
    expect(Math.abs(bike.heading - bike.travelHeading)).toBeLessThan(1)
  })

  it('a wheelie pulls harder: 0 to 60 km/h in about wheelieSecondsTo60', () => {
    const timeTo60 = (wheelie: boolean) => {
      const { bike, run } = setup(flat(600))
      bike.placeOnGround(0, 250, 0)
      run(1)
      bike.controls.throttle = 1
      bike.controls.lean = wheelie ? -1 : 0
      let time = 0
      run(4, () => {
        if (groundSpeed(bike) < 60 * KMH) time += 1 / 120
      })
      return time
    }
    // the front takes a moment to come up, pulling only partly harder until it's up
    expect(timeTo60(true)).toBeGreaterThan(rider.wheelieSecondsTo60 - 0.05)
    expect(timeTo60(true)).toBeLessThan(rider.wheelieSecondsTo60 + 0.3)
    expect(timeTo60(false)).toBeGreaterThan(config.bike.speed.secondsTo60 * 0.9) // on both wheels as before
  })

  it('popping a wheelie at speed pulls harder than staying on both wheels, but no faster than topSpeed', () => {
    const gained = (wheelie: boolean) => {
      const { bike, run } = rolling(50)
      const before = groundSpeed(bike)
      bike.controls.lean = wheelie ? -1 : 0
      bike.controls.throttle = 1
      bike.controls.brake = 0
      run(1)
      return groundSpeed(bike) - before
    }
    expect(gained(true)).toBeGreaterThan(gained(false) * 1.2) // the front takes part of that second to come up

    const { bike, run } = rolling(50)
    bike.controls.lean = -1
    bike.controls.throttle = 1
    bike.controls.brake = 0
    run(15, () => keepOnMap(bike))
    expect(groundSpeed(bike) / KMH).toBeLessThan(config.bike.speed.topSpeed * 1.01)
  })

  it('the front wheel is drawn turned all the way in a wheelie, whatever the speed', () => {
    const { bike, run } = rolling(50)
    bike.controls.lean = -1
    bike.controls.throttle = 1
    run(1)
    bike.controls.steer = 1
    run(0.5)
    expect(bike.wheels[0].onGround).toBe(false)
    const fullLock = Math.atan(config.bike.build.wheelbase / config.bike.turning.tightestTurnSlow) / DEG
    expect(bike.steerAngle).toBeGreaterThan(fullLock - 2)
    expect(bike.steerAngle).toBeLessThan(fullLock + 2)

    // front wheel back down at speed: only as far as the turn needs again
    bike.controls.lean = 0
    run(1.5, () => cruise(bike, 50 * KMH))
    expect(bike.wheels[0].onGround).toBe(true)
    expect(bike.steerAngle).toBeLessThan(fullLock / 2)
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
