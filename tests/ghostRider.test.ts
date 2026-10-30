import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { initPhysics } from '../src/physics/world'
import { GhostRider } from '../src/world/ghostRider'
import { findJumps, type JumpSpot } from '../src/world/jumpFinder'
import { DEG, flat, ground, kicker } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

/** The smallest difference between two compass headings, degrees. */
const turnBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const settings = () => structuredClone(config)

/** The kicker's jump riding up it (toward +x), as the finder sees it. */
function kickerJump(): JumpSpot {
  return findJumps(ground(kicker(), 300)).find((jump) => turnBetween(jump.heading, 90) < 15)!
}

describe('the ghost bike', () => {
  it('rides a jump the way the finder says: takes off at the lip, flies and lands', () => {
    const jump = kickerJump()
    const ride = new GhostRider(ground(kicker(), 300), settings()).ride(jump)
    expect(ride.landed, ride.reason).toBe(true)
    expect(Math.abs(ride.flight[0].x - jump.lip.x)).toBeLessThan(6) // lifts off at the lip
    expect(ride.airtime).toBeGreaterThan(0.7)
    expect(ride.flight.at(-1)!.x).toBeGreaterThan(jump.lip.x + 10) // and lands well beyond it
    expect(Math.abs(ride.speed - jump.speed)).toBeLessThan(jump.speed * 0.15) // at about the jump's speed
  })

  it('can ride a bit at a time between frames, flying exactly the same', () => {
    const whole = new GhostRider(ground(kicker(), 300), settings()).ride(kickerJump())
    const ride = new GhostRider(ground(kicker(), 300), settings()).rideGradually(kickerJump())
    let pauses = 0
    let step = ride.next()
    while (!step.done) {
      pauses++
      step = ride.next()
    }
    expect(pauses).toBeGreaterThan(5)
    expect(step.value).toEqual(whole)
  })

  it('records the path the bike really flew: up off the lip, over the top and down', () => {
    const ride = new GhostRider(ground(kicker(), 300), settings()).ride(kickerJump())
    const heights = ride.flight.map((p) => p.y)
    const top = heights.indexOf(Math.max(...heights))
    expect(top).toBeGreaterThan(0)
    expect(top).toBeLessThan(heights.length - 1)
    for (let i = 1; i < ride.flight.length; i++) expect(ride.flight[i].x).toBeGreaterThan(ride.flight[i - 1].x) // always onward
  })

  it('leans in the air to land a jump that throws the nose down', () => {
    // 40 degrees up to a sharp crest with a 60 degree drop behind: left alone, the bike noses in
    const steep = ground((x, z) => {
      const across = Math.max(0, 1 - Math.max(0, Math.abs(z) - 20) / 40)
      const h = x <= 0 ? 0 : x <= 10 ? x * Math.tan(40 * DEG) : Math.max(0, 10 * Math.tan(40 * DEG) - (x - 10) * Math.tan(60 * DEG))
      return h * across
    }, 400)
    const jump = findJumps(steep).find((j) => turnBetween(j.heading, 90) < 15)!
    const ride = new GhostRider(steep, settings()).ride(jump)
    expect(ride.landed, ride.reason).toBe(true)
    expect(ride.airtime).toBeGreaterThan(2)
  })

  it('turns down a jump it can\'t land, and says why', () => {
    // the same kicker, with a sheer wall where it would land
    const walled = ground((x, z) => kicker()(x, z) + (x > 40 ? Math.min((x - 40) * Math.tan(88 * DEG), 30) : 0), 300)
    const ride = new GhostRider(walled, settings()).ride(kickerJump())
    expect(ride.landed).toBe(false)
    expect(ride.reason).toBeTruthy()
  })

  it('turns down a "jump" it never takes off from', () => {
    const jump = { ...kickerJump() }
    const ride = new GhostRider(flat(300), settings()).ride(jump)
    expect(ride.landed).toBe(false)
    expect(ride.reason).toMatch(/never took off/)
  })

  it('judges crashes even when they are turned off for the player', () => {
    // with a landing rule nobody could meet (no landing is ever exactly level), the kicker is a crash
    const s = settings()
    s.crashes.enabled = false
    s.crashes.worstLandingAngle = 0
    expect(new GhostRider(ground(kicker(), 300), s).ride(kickerJump()).reason).toMatch(/crashed: landed/)
  })
})
