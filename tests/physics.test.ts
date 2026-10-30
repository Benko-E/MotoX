import { beforeAll, describe, expect, it } from 'vitest'
import { initPhysics, PhysicsWorld } from '../src/physics/world'
import { config } from '../src/config'
import { Bike } from '../src/physics/bike'
import { CrashWatcher } from '../src/physics/crashes'
import { DEG, DT, flat, ground, setup, slope, tilt } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

describe('physics ground', () => {
  it('matches the terrain heights', () => {
    // different slopes along x and z, so mixing the two up would show
    const physics = new PhysicsWorld()
    physics.setGround(ground((x, z) => x * 0.1 + z * 0.3))
    expect(physics.groundHeightAt(30, -50)).toBeCloseTo(3 - 15, 2)
    expect(physics.groundHeightAt(-70, 20)).toBeCloseTo(-7 + 6, 2)
  })

  it('finds the ground even exactly on a line of the terrain grid', () => {
    // a ray exactly between two of the ground's triangles used to slip through
    const physics = new PhysicsWorld()
    physics.setGround(ground((x) => -x * Math.tan(15 * DEG)))
    expect(physics.groundHeightAt(80.74, -1e-16)).toBeCloseTo(-80.74 * Math.tan(15 * DEG), 1)
  })
})

describe('two bikes', () => {
  it('pass through each other: one dropped onto the other lands on the ground, not on it, and nobody crashes', () => {
    const physics = new PhysicsWorld()
    physics.setGround(flat())
    const settings = structuredClone(config)
    const below = new Bike(physics, settings.bike, settings.advanced.bikeBody)
    const above = new Bike(physics, settings.bike, settings.advanced.bikeBody)
    const crashes = [below, above].map((b) => new CrashWatcher(physics, b, settings.crashes, settings.advanced.fallingOver, settings.jumps.landing))
    below.placeOnGround(0, 0, 0)
    above.place(0, 3, 0, 0)
    for (let i = 0; i < 360; i++) {
      for (const b of [below, above]) b.update(DT)
      physics.step(DT, 9.81)
      for (const b of [below, above]) b.record()
      crashes.forEach((c) => c.step(DT))
    }
    expect(Math.abs(above.body.translation().y - below.body.translation().y)).toBeLessThan(0.05) // both on the ground
    expect(crashes.map((c) => c.count)).toEqual([0, 0])
  })
})

describe('bike', () => {
  it('settles on its suspension after a drop, upright and still', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0, 0.5)
    run(3)
    expect(bike.speed).toBeLessThan(0.05)
    for (const wheel of bike.wheels) {
      expect(wheel.onGround).toBe(true)
      expect(wheel.compressionRatio).toBeGreaterThan(0.2) // sag: sits into its travel...
      expect(wheel.compressionRatio).toBeLessThan(0.4) // ...without bottoming out
    }
    expect(Math.abs(bike.roll)).toBeLessThan(1 * DEG)
    expect(Math.abs(bike.pitch)).toBeLessThan(1 * DEG)
  })

  it('stops bouncing soon after landing', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0, 0.5)
    run(1.5)
    const early = bike.body.translation().y
    run(1.5)
    expect(Math.abs(bike.body.translation().y - early)).toBeLessThan(0.01)
  })

  it('lands a big drop with a thud instead of bouncing back up', () => {
    // 6 m onto flat ground uses up all the suspension travel
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0)
    run(2)
    const rest = bike.body.translation().y
    bike.placeOnGround(0, 0, 0, 6)
    let highestAfterLanding = -Infinity
    let landed = false
    for (let t = 0; t < 4; t += 0.05) {
      run(0.05)
      if (bike.wheels.some((wheel) => wheel.bottomedOut)) landed = true
      if (landed) highestAfterLanding = Math.max(highestAfterLanding, bike.body.translation().y)
    }
    expect(landed).toBe(true)
    expect(highestAfterLanding - rest).toBeLessThan(0.15)
  })

  it('reads lean as positive when the right side goes down', () => {
    const { bike } = setup(flat())
    bike.placeOnGround(0, 0, 0)
    tilt(bike, 15)
    expect(bike.roll).toBeCloseTo(15 * DEG, 3)
  })

  it('pulls itself back upright when tipped over', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0)
    tilt(bike, 15)
    run(2)
    expect(Math.abs(bike.roll)).toBeLessThan(1 * DEG)
  })

  it('rolls downhill when pointed downhill', () => {
    const { bike, run } = setup(slope())
    bike.placeOnGround(0, 0, 90) // heading 90 rides toward +x, down the slope
    run(1)
    const early = bike.forwardSpeed
    run(3)
    expect(bike.forwardSpeed).toBeGreaterThan(early + 0.5) // gravity beats the coasting slowdown
    expect(bike.body.translation().x).toBeGreaterThan(0.5)
  })

  it('holds its line across a slope instead of sliding down it', () => {
    const { bike, run } = setup(slope())
    bike.placeOnGround(0, 0, 0) // facing across the slope
    run(3)
    expect(Math.abs(bike.body.translation().x)).toBeLessThan(0.5)
  })

  it('reset puts it back upright on the spot, standing still', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(10, -5, 45)
    run(0.5)
    tilt(bike, 40)
    bike.body.setLinvel({ x: 3, y: 0, z: 0 }, true)
    run(0.2)
    const { x, z } = bike.body.translation()
    bike.resetUpright()
    expect(bike.speed).toBe(0)
    expect(Math.abs(bike.roll)).toBeLessThan(0.1 * DEG)
    expect(bike.body.translation().x).toBeCloseTo(x, 2)
    expect(bike.body.translation().z).toBeCloseTo(z, 2)
    run(2)
    expect(bike.wheels.every((wheel) => wheel.onGround)).toBe(true)
  })

  it('times how long it has been in the air', () => {
    const { bike, run } = setup(flat())
    bike.placeOnGround(0, 0, 0, 3) // a 3 m drop takes about 0.78 s
    run(0.5)
    expect(bike.airtime).toBeCloseTo(0.5, 1)
    run(1.5)
    expect(bike.airtime).toBe(0)
    expect(bike.lastAirtime).toBeGreaterThan(0.6)
    expect(bike.lastAirtime).toBeLessThan(0.9)
  })
})
