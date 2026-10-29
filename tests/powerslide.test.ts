import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { DEG, flat, setup, setupWithCrashes } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const DT = 1 / 120
const { powerslide } = config.bike
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Works throttle and brake to hold the bike near `target` m/s. */
function cruise(bike: Bike, target: number) {
  const speed = bike.forwardSpeed
  bike.controls.throttle = clamp((target - speed) / 2, 0, 1)
  bike.controls.brake = clamp((speed - target - 1) / 2, 0, 1)
}

/** A bike rolling straight at `kmh` on a big flat, and its world's step function. */
function rolling(kmh: number, changes?: (bike: Bike) => void) {
  const world = setup(flat(600))
  changes?.(world.bike)
  world.bike.placeOnGround(0, 250, 0)
  world.run(4, () => cruise(world.bike, kmh * KMH))
  return world
}

/** How far the rear is swung out from the way the bike is going, degrees. */
const slideAngle = (bike: Bike) => Math.atan2(Math.abs(bike.slide), Math.abs(bike.forwardSpeed)) / DEG

/** Ground speed, m/s. */
const groundSpeed = (bike: Bike) => Math.hypot(bike.body.linvel().x, bike.body.linvel().z)

/** The radius of the path the bike travels over the next `seconds`, metres. */
function pathRadius(bike: Bike, run: (seconds: number, each?: () => void) => void, seconds: number, each?: () => void) {
  let turned = 0
  let distance = 0
  let before = bike.travelHeading
  run(seconds, () => {
    each?.()
    const now = bike.travelHeading
    turned += ((now - before + 540) % 360) - 180
    before = now
    distance += groundSpeed(bike) * DT
  })
  return distance / Math.abs(turned * DEG)
}

describe('powerslides', () => {
  it('holding Space while turning swings the rear out to about the slide angle, outward', () => {
    for (const angle of [30, 50]) {
      const { bike, run } = rolling(60, (b) => (b.stats.powerslide.angle = angle))
      bike.controls.steer = 1 // right
      bike.controls.powerslide = true
      run(1, () => cruise(bike, 60 * KMH))
      expect(slideAngle(bike)).toBeGreaterThan(angle * 0.85)
      expect(slideAngle(bike)).toBeLessThan(angle * 1.15)
      expect(bike.slide).toBeLessThan(0) // turning right, the rear is out to the left
    }
  })

  it('turns as much tighter than the normal turn as tighterTurn says', () => {
    const normal = rolling(60)
    normal.bike.controls.steer = 1
    normal.run(1, () => cruise(normal.bike, 60 * KMH))
    const normalRadius = pathRadius(normal.bike, normal.run, 0.5, () => cruise(normal.bike, 60 * KMH))

    for (const tighterTurn of [0.6, 1]) {
      const { bike, run } = rolling(60, (b) => (b.stats.powerslide.tighterTurn = tighterTurn))
      bike.controls.steer = 1
      bike.controls.powerslide = true
      run(1, () => cruise(bike, 60 * KMH))
      const radius = pathRadius(bike, run, 0.5, () => cruise(bike, 60 * KMH))
      expect(radius / normalRadius).toBeGreaterThan(tighterTurn - 0.1)
      expect(radius / normalRadius).toBeLessThan(tighterTurn + 0.1)
    }
  })

  it('costs about scrub km/h every second, on top of coasting', () => {
    const lostIn1s = (slide: boolean) => {
      const { bike, run } = rolling(80)
      bike.controls.throttle = 0
      bike.controls.brake = 0
      bike.controls.steer = 1
      bike.controls.powerslide = slide
      const before = groundSpeed(bike)
      run(1)
      return (before - groundSpeed(bike)) / KMH
    }
    const extra = lostIn1s(true) - lostIn1s(false)
    expect(extra).toBeGreaterThan(powerslide.scrub * 0.75) // a little less: it takes kickOut to get going
    expect(extra).toBeLessThan(powerslide.scrub * 1.15)
  })

  it('letting go hooks the rear back up in about hookUp, without a snap', () => {
    const { bike, run } = rolling(60)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    // the hardest the travel bends in one step while sliding steadily, in g
    let before = bike.body.linvel()
    const bend = () => {
      const v = bike.body.linvel()
      const across = Math.abs(v.x * before.z - v.z * before.x) / Math.hypot(before.x, before.z)
      before = v
      return across / DT / 9.81
    }
    run(1, () => cruise(bike, 60 * KMH))
    let steady = 0
    run(0.5, () => {
      cruise(bike, 60 * KMH)
      steady = Math.max(steady, bend())
    })

    bike.controls.powerslide = false
    let hardest = 0
    run(powerslide.hookUp * 3, () => {
      cruise(bike, 60 * KMH)
      hardest = Math.max(hardest, bend())
    })
    expect(slideAngle(bike)).toBeLessThan(3)
    expect(hardest).toBeLessThan(steady * 1.3)
    run(0.5, () => cruise(bike, 60 * KMH))
    expect(Math.abs(bike.slide)).toBeLessThan(0.3) // back on rails
  })

  it('a quick tap kicks the rear out a bit, then it hooks back up by itself', () => {
    const { bike, run } = rolling(60)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    let most = 0
    run(0.1, () => cruise(bike, 60 * KMH))
    bike.controls.powerslide = false
    run(1.5, () => {
      cruise(bike, 60 * KMH)
      most = Math.max(most, slideAngle(bike))
    })
    expect(most).toBeGreaterThan(5)
    expect(most).toBeLessThan(powerslide.angle)
    expect(Math.abs(bike.slide)).toBeLessThan(0.3)
  })

  it('flicking the steering the other way swings the rear across', () => {
    const { bike, run } = rolling(60)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    run(1, () => cruise(bike, 60 * KMH))
    expect(bike.slide).toBeLessThan(0)
    bike.controls.steer = -1
    run(1, () => cruise(bike, 60 * KMH))
    expect(bike.slide).toBeGreaterThan(0) // turning left now, the rear is out to the right
    expect(slideAngle(bike)).toBeGreaterThan(powerslide.angle * 0.85)
  })

  it('Space without steering is a straight skid that just slows you down', () => {
    const { bike, run } = rolling(60)
    const heading = bike.heading
    const before = groundSpeed(bike)
    bike.controls.throttle = 0
    bike.controls.powerslide = true
    let most = 0
    run(1, () => (most = Math.max(most, slideAngle(bike))))
    expect(most).toBeLessThan(3)
    expect(Math.abs(bike.heading - heading)).toBeLessThan(2)
    expect((before - groundSpeed(bike)) / KMH).toBeGreaterThan(powerslide.scrub * 0.75)
  })

  it('the front wheel points the way it is really going: opposite lock', () => {
    const { bike, run } = rolling(80)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    run(1, () => cruise(bike, 80 * KMH))
    expect(bike.steerAngle).toBeLessThan(-3) // steering right, the front points left of the bike
  })

  it('does nothing slower than minSpeed', () => {
    const { bike, run } = rolling(powerslide.minSpeed - 5)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    let most = 0
    run(1.5, () => {
      cruise(bike, (powerslide.minSpeed - 5) * KMH)
      most = Math.max(most, Math.abs(bike.slide))
    })
    expect(most).toBeLessThan(0.3)
  })

  it('does nothing in the air', () => {
    const fly = (slide: boolean) => {
      const { bike, run } = setup(flat(600))
      bike.placeOnGround(0, 0, 0, 8)
      bike.body.setLinvel({ x: 0, y: 0, z: -15 }, true)
      bike.controls.steer = 1
      bike.controls.powerslide = slide
      run(0.5)
      return { heading: bike.heading, spin: bike.body.angvel().y, onGround: bike.wheels.some((w) => w.onGround) }
    }
    const held = fly(true)
    expect(held.onGround).toBe(false)
    expect(held).toEqual(fly(false))
  })

  it('no powerslide while the front wheel is up in a wheelie', () => {
    const { bike, run } = rolling(40)
    bike.stats.rider.wheelieSteering = 0.1
    bike.controls.lean = -1
    bike.controls.throttle = 1
    bike.controls.brake = 0
    run(1)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    let most = 0
    run(1, () => (most = Math.max(most, Math.abs(bike.heading - bike.travelHeading))))
    expect(bike.wheels[0].onGround).toBe(false) // still up
    expect(most).toBeLessThan(1)
  })

  it('braking (S) while turning never swings the rear out', () => {
    const { bike, run } = rolling(60)
    bike.controls.steer = 1
    bike.controls.throttle = 0
    bike.controls.brake = 1
    let most = 0
    run(1, () => (most = Math.max(most, Math.abs(bike.slide))))
    expect(most).toBeLessThan(0.5)
  })

  it('a long powerslide and hooking up again is never a crash', () => {
    const { bike, crashes, run } = setupWithCrashes(flat(600))
    bike.placeOnGround(0, 250, 0)
    run(4, () => cruise(bike, 70 * KMH))
    bike.controls.steer = 1
    bike.controls.powerslide = true
    run(3, () => cruise(bike, 70 * KMH))
    bike.controls.powerslide = false
    bike.controls.steer = 0
    run(2, () => cruise(bike, 70 * KMH))
    expect(crashes.count).toBe(0)
  })
})
