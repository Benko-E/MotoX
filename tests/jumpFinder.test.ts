import { describe, expect, it } from 'vitest'
import { freeride } from '../src/maps/freeride'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt } from '../src/terrain/heightfield'
import { findJumps, findJumpsGradually, judgeJump } from '../src/world/jumpFinder'
import { DEG, flat, ground } from './physicsSetup'

/** A hill like a big kicker, riding along +x: up 15 degrees for 30 m to a crest 8 m up, then a 30 degree drop. Its sides slope away gently. */
const kicker = (z0 = 0) =>
  (x: number, z: number) => {
    const across = Math.max(0, 1 - Math.max(0, Math.abs(z - z0) - 20) / 40) // full 40 m wide, gone 40 m further out
    let h = 0
    if (x > 0 && x <= 30) h = x * Math.tan(15 * DEG)
    else if (x > 30) h = Math.max(0, 30 * Math.tan(15 * DEG) - (x - 30) * Math.tan(30 * DEG))
    return h * across
  }

/** The smallest difference between two compass headings, degrees. */
const turnBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('finding jumps in the hills', () => {
  it('finds a kicker-shaped hill: taking off at the crest, riding up the slope', () => {
    const jumps = findJumps(ground(kicker(), 300))
    const up = jumps.find((jump) => turnBetween(jump.heading, 90) < 15)
    expect(up).toBeDefined()
    expect(Math.abs(up!.lip.x - 30)).toBeLessThan(4)
    expect(Math.abs(up!.lip.z)).toBeLessThan(20)
    expect(up!.airtime).toBeGreaterThan(0.7)
    expect(up!.landing.x).toBeGreaterThan(up!.lip.x + 5) // lands beyond the lip
  })

  it('works out a speed to hit it at, and the run-up lane leads up the slope to the lip', () => {
    const up = findJumps(ground(kicker(), 300)).find((jump) => turnBetween(jump.heading, 90) < 15)!
    expect(up.speed).toBeGreaterThanOrEqual(30)
    expect(up.speed).toBeLessThanOrEqual(110)
    const first = up.runUp[0]
    const last = up.runUp.at(-1)!
    expect(first.x).toBeLessThan(last.x - 15) // starts well back from the lip
    expect(last.y).toBeGreaterThan(first.y) // and climbs to it
    for (const point of up.runUp) expect(Math.abs(point.y - heightAt(ground(kicker(), 300), point.x, point.z))).toBeLessThan(0.01)
  })

  it('a big gently rolling hill is no jump at sensible speeds', () => {
    const rolling = ground((x) => 6 * Math.cos(x / 40), 300)
    expect(findJumps(rolling)).toEqual([])
  })

  it('flat ground has no jumps, and a wall too steep to ride up even at speed is not one', () => {
    expect(findJumps(flat(300))).toEqual([])
    const wall = ground((x) => Math.min(Math.max(x, 0), 8) * Math.tan(60 * DEG), 300) // 60 degrees up to a plateau
    expect(findJumps(wall)).toEqual([])
  })

  it('a rounded hilltop that throws you at speed is a jump: you take off before the top, where it bends away', () => {
    // the fourteenth tuning session: "wait, why not jump this thing here?" A round top looks
    // nearly flat right at the top, but at speed the bike leaves the ground well before it.
    const hill = ground((x) => 12 * Math.exp(-((x / 25) ** 2)), 300)
    const up = findJumps(hill).find((jump) => turnBetween(jump.heading, 90) < 15)
    expect(up).toBeDefined()
    expect(up!.lip.x).toBeLessThan(-1) // before the top (at x = 0)
    expect(up!.lipAngle).toBeGreaterThan(8)
  })

  it('a steep face is a jump at speed, though too steep to climb from a standstill', () => {
    // 40 degrees up for 9 m, onto a long flat top: the bike shoots up it and flies
    const face = ground((x) => (x < 0 ? 0 : Math.min(x, 9) * Math.tan(40 * DEG)) * (x < 60 ? 1 : 0), 300)
    expect(findJumps(face).some((jump) => turnBetween(jump.heading, 90) <= 20)).toBe(true)
  })

  it('which jump the finder turns down, it says why', () => {
    expect(judgeJump(flat(300), 0, 0, 90)).toMatch(/hardly climbs/)
    expect(typeof judgeJump(ground((x) => 6 * Math.cos(x / 40), 300), -40, 0, 90)).toBe('string') // a rolling hill isn't one either
  })

  it('one crest gives one jump each way, not a pile of them on top of each other', () => {
    const jumps = findJumps(ground(kicker(), 300))
    for (const a of jumps) {
      for (const b of jumps) {
        if (a === b) continue
        const apart = Math.hypot(a.lip.x - b.lip.x, a.lip.z - b.lip.z)
        expect(apart >= 20 || turnBetween(a.heading, b.heading) > 25).toBe(true)
      }
    }
  })

  it('two hills far apart give jumps on each, and none on the flat between them', () => {
    const two = ground((x, z) => kicker(-80)(x, z) + kicker(80)(x, z), 300)
    const up = findJumps(two).filter((jump) => turnBetween(jump.heading, 90) < 15)
    expect(up.some((jump) => Math.abs(jump.lip.z + 80) < 40)).toBe(true)
    expect(up.some((jump) => Math.abs(jump.lip.z - 80) < 40)).toBe(true)
    expect(up.some((jump) => Math.abs(jump.lip.z) < 15)).toBe(false)
  })

  it('can be done a bit at a time between frames, finding the same jumps', () => {
    const field = ground((x, z) => kicker(-80)(x, z) + kicker(80)(x, z), 300)
    const search = findJumpsGradually(field)
    let slices = 0
    let step = search.next()
    while (!step.done) {
      slices++
      step = search.next()
    }
    expect(slices).toBeGreaterThan(10) // it really stopped to let frames through
    expect(step.value).toEqual(findJumps(field))
  })

  it('reads any map: runs on the free-ride hills in good time', () => {
    const { field } = generateTerrain(freeride)
    const started = performance.now()
    const jumps = findJumps(field)
    expect(performance.now() - started).toBeLessThan(1500)
    expect(Array.isArray(jumps)).toBe(true)
  })
})
