import { beforeAll, describe, expect, it } from 'vitest'
import { AiRider } from '../src/ai/aiRider'
import type { Behaviour } from '../src/ai/orders'
import { config } from '../src/config'
import { initPhysics, PhysicsWorld } from '../src/physics/world'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { DEG, DT, flat, ground, tilt } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

/** Gives no orders: with none left he stops. */
const idle: Behaviour = { refill: () => {} }

/** An AI rider on `field` at the origin facing `heading`, and a way to run him for a while. */
function rider(field: Heightfield, heading = 0, settings = structuredClone(config)) {
  const physics = new PhysicsWorld()
  physics.setGround(field)
  const ai = new AiRider(physics, settings, (x, z) => heightAt(field, x, z), idle)
  ai.bike.placeOnGround(0, 0, heading)
  const run = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += DT) {
      each?.()
      ai.beforeStep(DT)
      physics.step(DT, 9.81)
      ai.afterStep(DT)
    }
  }
  return { ai, run, settings }
}
const where = (ai: AiRider) => ai.bike.body.translation()

describe('an AI rider', () => {
  it('rides to a spot he is told to, then takes the next order', () => {
    const { ai, run } = rider(flat(400))
    ai.orders.add({ kind: 'rideTo', x: 80, z: 60 }) // off to the right and behind him
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    let nearest = Infinity
    run(20, () => (nearest = Math.min(nearest, Math.hypot(where(ai).x - 80, where(ai).z - 60))))
    expect(nearest).toBeLessThan(12) // got there
    expect(ai.orders.current?.kind).toBe('cruise') // and cruised on from it
  })

  it('cruises at his cruise speed', () => {
    const { ai, run, settings } = rider(flat(600), 90)
    settings.ai.cruiseSpeed = 40
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    run(6)
    expect(ai.bike.forwardSpeed * 3.6).toBeGreaterThan(36)
    expect(ai.bike.forwardSpeed * 3.6).toBeLessThan(44)
  })

  it('with nothing left to do, he stops', () => {
    const { ai, run } = rider(flat(400))
    ai.orders.add({ kind: 'cruise', seconds: 2 })
    run(8)
    expect(ai.bike.speed).toBeLessThan(0.5)
  })

  it('turns away from ground too steep to ride up instead of riding into it', () => {
    // a 60 degree wall across his way 40 m ahead (he heads toward +x)
    const walled = ground((x) => (x > 40 ? Math.min((x - 40) * Math.tan(60 * DEG), 40) : 0), 400)
    const { ai, run } = rider(walled, 90)
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    let highest = 0
    run(12, () => (highest = Math.max(highest, where(ai).y)))
    expect(highest).toBeLessThan(3) // never up the wall
    expect(ai.bike.speed).toBeGreaterThan(5) // and still going
  })

  it('gets back up after a crash and rides on', () => {
    const { ai, run } = rider(flat(400), 90)
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    run(2)
    tilt(ai.bike, 100) // knocked over
    run(6)
    expect(ai.crashes.count).toBeGreaterThan(0)
    expect(ai.crashes.crashed).toBe(false)
    expect(ai.bike.speed).toBeGreaterThan(5)
  })

  it('asks his behaviour for more orders when he runs out', () => {
    let asked = 0
    const physics = new PhysicsWorld()
    physics.setGround(flat(200))
    const ai = new AiRider(physics, structuredClone(config), () => 0, { refill: () => asked++ })
    ai.beforeStep(DT)
    expect(asked).toBe(1)
  })
})
