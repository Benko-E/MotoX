import { beforeAll, describe, expect, it } from 'vitest'
import { AiRider } from '../src/ai/aiRider'
import type { Behaviour } from '../src/ai/orders'
import { config } from '../src/config'
import { initPhysics, PhysicsWorld } from '../src/physics/world'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { measureJump } from '../src/world/jumps'
import { DEG, DT, flat, ground, kicker, tilt } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

/** Gives no orders: with none left he stops. */
const idle: Behaviour = { refill: () => {} }

/** An AI rider on `field` at the origin facing `heading`, and a way to run him for a while. */
function rider(field: Heightfield, heading = 0, settings = structuredClone(config)) {
  const physics = new PhysicsWorld()
  physics.setGround(field)
  const ai = new AiRider(physics, settings, settings.ai.riders[0], (x, z) => heightAt(field, x, z), idle)
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
    settings.ai.riders[0].cruiseSpeed = 40
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

  it('takes a jump he is told to: lines up on its run-up from off to the side, flies, lands and rides on', () => {
    const field = ground(kicker(), 300)
    const jump = measureJump(field, { x: 30, z: 0 }, 90, 95, 'test', 'fast') // the kicker's crest
    const { ai, run } = rider(field, 0)
    ai.bike.placeOnGround(-60, 40, 0) // behind the run-up and off to the side, facing north
    ai.orders.add({ kind: 'takeJump', jump })
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    let longest = 0
    run(25, () => (longest = Math.max(longest, ai.bike.airtime)))
    expect(longest).toBeGreaterThan(0.7)
    expect(ai.crashes.count).toBe(0)
    expect(ai.orders.current?.kind).toBe('cruise')
  })

  it('already on a jump\'s line, he rides straight on into it rather than turning back to line up', () => {
    const field = ground(kicker(), 300)
    const jump = measureJump(field, { x: 30, z: 0 }, 90, 95, 'test', 'fast')
    const { ai, run } = rider(field, 90)
    ai.bike.placeOnGround(-10, 0, 90) // on its line, short of the run-up, facing up it
    ai.orders.add({ kind: 'takeJump', jump })
    let longest = 0
    let turned = 0
    run(8, () => {
      longest = Math.max(longest, ai.bike.airtime)
      if (where(ai).x < 20) turned = Math.max(turned, Math.abs(((ai.bike.heading - 90 + 540) % 360) - 180))
    })
    expect(turned).toBeLessThan(30)
    expect(longest).toBeGreaterThan(0.5)
  })

  it('a bump on the way is not the jump: he still goes on and takes it', () => {
    // a little kicker on his way, 60 m short of the big one
    const bump = (x: number) => (x > -70 && x <= -62 ? (x + 70) * Math.tan(20 * DEG) : x > -62 && x < -59 ? 8 * Math.tan(20 * DEG) - (x + 62) * Math.tan(45 * DEG) : 0)
    const field = ground((x, z) => kicker()(x, z) + Math.max(0, bump(x)) * Math.max(0, 1 - Math.abs(z) / 20), 300)
    const jump = measureJump(field, { x: 30, z: 0 }, 90, 95, 'test', 'fast')
    const { ai, run } = rider(field, 90)
    ai.bike.placeOnGround(-110, 0, 90)
    ai.orders.add({ kind: 'takeJump', jump })
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    let bumpAir = 0
    let jumpAir = 0
    let upTheRunUp: string | undefined
    run(20, () => {
      const at = where(ai).x
      if (at < -40) bumpAir = Math.max(bumpAir, ai.bike.airtime)
      else jumpAir = Math.max(jumpAir, ai.bike.airtime)
      if (at > 10 && at < 20) upTheRunUp ??= ai.orders.current?.kind
    })
    expect(bumpAir).toBeGreaterThan(0.25) // the bump threw him
    expect(upTheRunUp).toBe('takeJump') // and he still went for the jump
    expect(jumpAir).toBeGreaterThan(0.7)
  })

  it('gives up on a jump that never throws him, rather than riding it for ever', () => {
    const jump = measureJump(ground(kicker(), 300), { x: 30, z: 0 }, 90, 95, 'test', 'fast')
    const { ai, run } = rider(flat(400), 90)
    ai.bike.placeOnGround(-40, 0, 90)
    ai.orders.add({ kind: 'takeJump', jump }) // on flat ground there's nothing there
    run(20)
    expect(ai.orders.current).toBeUndefined()
  })

  it('outside his roam area he heads back toward the middle, whatever he was doing', () => {
    const { ai, run, settings } = rider(flat(900), 90)
    settings.ai.riders[0].freeRoam.roamRadius = 200
    ai.bike.placeOnGround(250, 0, 90) // past the edge of his area, heading further out
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    run(10)
    expect(Math.hypot(where(ai).x, where(ai).z)).toBeLessThan(200)
  })

  it('far outside his roam area, he is put back on the ground halfway to the middle', () => {
    const { ai, run, settings } = rider(flat(900), 90)
    settings.ai.riders[0].freeRoam.roamRadius = 200
    ai.bike.placeOnGround(380, 0, 90)
    ai.orders.add({ kind: 'cruise', seconds: 60 })
    run(0.1)
    expect(Math.hypot(where(ai).x, where(ai).z)).toBeCloseTo(100, -1)
    expect(ai.orders.current).toBeUndefined() // starting afresh
  })

  it('gives up riding to a spot he cannot get to', () => {
    // the spot is on top of a 40 m plateau walled in at 60 degrees
    const plateau = ground((x) => (x > 40 ? Math.min((x - 40) * Math.tan(60 * DEG), 40) : 0), 400)
    const { ai, run } = rider(plateau, 90)
    ai.orders.add({ kind: 'rideTo', x: 120, z: 0 })
    run(60) // he has 20 s plus three times the 10 s it would take straight
    expect(ai.orders.current).toBeUndefined()
  })

  it('asks his behaviour for more orders when he runs out', () => {
    let asked = 0
    const physics = new PhysicsWorld()
    physics.setGround(flat(200))
    const settings = structuredClone(config)
    const ai = new AiRider(physics, settings, settings.ai.riders[0], () => 0, { refill: () => asked++ })
    ai.beforeStep(DT)
    expect(asked).toBe(1)
  })
})
