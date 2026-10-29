import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, setup, setupWithCrashes } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const { turning } = config.bike
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
/** How fast the bike spins about the vertical, degrees per second (positive = to the left). */
const spin = (bike: Bike) => bike.body.angvel().y / DEG

/** A bike high in the air, spinning `degreesPerSecond` about the vertical (as if it took off turning). */
function flying(degreesPerSecond: number) {
  const world = setup(flat(600))
  world.bike.placeOnGround(0, 250, 0, 40) // a long fall
  world.bike.body.setAngvel({ x: 0, y: degreesPerSecond * DEG, z: 0 }, true)
  return world
}

/** Turns the whole way the bike turns over `seconds`, degrees. */
function turnedOver(bike: Bike, run: (seconds: number, each?: () => void) => void, seconds: number) {
  let turned = 0
  let before = bike.heading
  run(seconds, () => {
    turned += ((bike.heading - before + 540) % 360) - 180
    before = bike.heading
  })
  return Math.abs(turned)
}

describe('spinning in the air', () => {
  it('from a straight take-off, steering only turns the bike slowly: no easy 180', () => {
    const { bike, run } = flying(0)
    bike.controls.steer = -1
    const turned = turnedOver(bike, run, 2.5)
    expect(Math.abs(spin(bike))).toBeLessThan(turning.airTurn * 1.15)
    expect(turned).toBeLessThan(180)
  })

  it('a spin the bike took off with carries on when you let go of the steering', () => {
    const { bike, run } = flying(120)
    run(1)
    expect(spin(bike)).toBeCloseTo(120, -1)
  })

  it('steering the way it spins keeps the spin going, and spins it up by about airSpinUp', () => {
    const { bike, run } = flying(120)
    bike.controls.steer = -1 // left, the way it spins
    run(1)
    expect(spin(bike)).toBeGreaterThan(120 + turning.airSpinUp * 0.85)
    expect(spin(bike)).toBeLessThan(120 + turning.airSpinUp * 1.15)
  })

  it('steering against a spin stops it in about airSpinStop, then turns gently the other way', () => {
    const { bike, run } = flying(120)
    bike.controls.steer = 1 // right, against the spin
    run(turning.airSpinStop / 2)
    expect(spin(bike)).toBeGreaterThan(0) // slowing, not stopped dead
    expect(spin(bike)).toBeLessThan(120 * 0.7)
    run(turning.airSpinStop)
    expect(spin(bike)).toBeLessThan(0) // stopped, and turning the other way
    run(turning.airSpinStop * 4)
    expect(spin(bike)).toBeCloseTo(-turning.airTurn, -1)
  })

  it('turning hard as the bike leaves the ground, and holding the steering, spins it right round on a long jump', () => {
    const { bike, run } = setup(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(4, () => {
      const speed = bike.forwardSpeed
      bike.controls.throttle = clamp((60 * KMH - speed) / 2, 0, 1)
    })
    bike.controls.steer = -1
    run(1) // a hard left turn
    const p = bike.body.translation()
    bike.body.setTranslation({ x: p.x, y: p.y + 20, z: p.z }, true) // off the edge of the world: up in the air, still turning
    expect(turnedOver(bike, run, 1.8)).toBeGreaterThan(180)
  })
})

describe('taking off turning', () => {
  it('when the front wheel lifts mid-turn (as it leaves a lip first), the turn fades gently instead of stopping dead', () => {
    // the eleventh tuning session: turning at a kicker's lip left only 42 deg/s of spin
    const { bike, run } = setup(flat(600))
    const cruise = () => (bike.controls.throttle = clamp((40 * KMH - bike.forwardSpeed) / 2, 0, 1))
    bike.placeOnGround(0, 250, 0)
    run(4, cruise)
    bike.controls.steer = -1
    run(1, cruise) // turning hard left
    const turning = spin(bike)
    bike.controls.lean = -1 // up onto the back wheel
    bike.controls.throttle = 1
    let upFor = 0
    let spinAfter = NaN
    run(1.5, () => {
      if (!bike.wheels[0].onGround) upFor += 1 / 120
      if (upFor >= 0.1 && Number.isNaN(spinAfter)) spinAfter = spin(bike)
    })
    // 0.1 s on the back wheel alone: still turning most of the way
    expect(turning).toBeGreaterThan(30)
    expect(spinAfter).toBeGreaterThan(turning * 0.6)
  })
})

describe('landing a spin', () => {
  /** Drops the bike from 1 m rolling at `kmh`, pointing `facing` degrees off the way it goes. */
  function landFacing(facing: number, kmh: number) {
    const world = setupWithCrashes(flat(600))
    world.bike.placeOnGround(0, 250, 0)
    world.run(0.6) // past the moment after start-up when nothing counts
    world.bike.placeOnGround(0, 250, facing, 1)
    world.bike.body.setLinvel({ x: 0, y: 0, z: -kmh * KMH }, true) // travelling toward -z (heading 0)
    world.run(1)
    return world.crashes
  }

  it('landing backwards at speed is a crash', () => {
    const crashes = landFacing(180, 50)
    expect(crashes.count).toBe(1)
    expect(crashes.reason).toMatch(/backwards/)
  })

  it('landing backwards slower than worstBackwardsLanding just rolls backwards', () => {
    expect(landFacing(180, config.crashes.worstBackwardsLanding * 0.6).count).toBe(0)
  })

  it('landing facing the way you go after a full spin is fine', () => {
    expect(landFacing(360, 50).count).toBe(0)
  })
})
