import { describe, expect, it } from 'vitest'
import { measureJump } from '../src/world/jumps'
import { flat, ground, kicker } from './physicsSetup'

/** The smallest difference between two compass headings, degrees. */
const turnBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('measuring a jump a feature built', () => {
  it('a kicker: you leave the ground just before its crest, fly and land well beyond', () => {
    // the kicker climbs 15 degrees along +x to a crest at x = 30, 8 m up
    const jump = measureJump(ground(kicker(), 300), { x: 30, z: 0 }, 90, 95, 'test', 'fast')
    expect(jump.lip.x).toBeGreaterThan(25)
    expect(jump.lip.x).toBeLessThanOrEqual(30)
    expect(jump.airtime).toBeGreaterThan(0.7)
    expect(jump.landing.x).toBeGreaterThan(jump.lip.x + 10)
    expect(turnBetween(jump.heading, 90)).toBe(0)
    expect(jump.source).toBe('test')
    expect(jump.kind).toBe('fast')
  })

  it('a rounded hilltop at speed: you take off before the top, where it bends away', () => {
    const hill = ground((x) => 12 * Math.exp(-((x / 25) ** 2)), 300)
    const jump = measureJump(hill, { x: 0, z: 0 }, 90, 95, 'test', 'fast')
    expect(jump.lip.x).toBeLessThan(-1)
    expect(jump.airtime).toBeGreaterThan(0.5)
  })

  it('flat ground throws nobody', () => {
    expect(measureJump(flat(300), { x: 0, z: 0 }, 90, 95, 'test', 'fast').airtime).toBe(0)
  })

  it('its run-up is the one the feature gives, up to where you take off; else 30 m straight back from there', () => {
    const field = ground(kicker(), 300)
    const straight = measureJump(field, { x: 30, z: 0 }, 90, 95, 'test', 'fast')
    expect(straight.runUp[0].x).toBeCloseTo(straight.lip.x - 30, 0)
    expect(straight.runUp.at(-1)!.x).toBeCloseTo(straight.lip.x, 6)
    // the feature's runs right up to the top, at x = 30; you leave the ground before it
    const given = [{ x: 0, z: 5 }, { x: 15, z: 2 }, { x: 29, z: 0 }, { x: 30, z: 0 }]
    const jump = measureJump(field, { x: 30, z: 0 }, 90, 95, 'test', 'fast', given)
    expect(jump.lip.x).toBeLessThan(29)
    expect(jump.runUp.map((p) => [p.x, p.z])).toEqual([[0, 5], [15, 2], [jump.lip.x, jump.lip.z]])
  })
})
