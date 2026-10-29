import { describe, expect, it } from 'vitest'
import { freeride } from '../src/maps/freeride'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt } from '../src/terrain/heightfield'
import { findJumps } from '../src/world/jumpFinder'
import { DEG, flat, ground } from './physicsSetup'

/** A hill like a big kicker, riding along +x: up 15 degrees for 30 m to a crest 8 m up, then a 30 degree drop. Narrow across. */
const kicker = (z0 = 0) =>
  (x: number, z: number) => {
    const across = Math.max(0, 1 - Math.max(0, Math.abs(z - z0) - 10) / 10) // full 20 m wide, gone 10 m further out
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
    expect(Math.abs(up!.lip.z)).toBeLessThan(10)
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

  it('flat ground has no jumps, and a wall too steep to ride up is not one', () => {
    expect(findJumps(flat(300))).toEqual([])
    const wall = ground((x) => Math.min(Math.max(x, 0), 8) * Math.tan(45 * DEG), 300) // 45 degrees up to a plateau
    expect(findJumps(wall)).toEqual([])
  })

  it('one crest gives one jump each way, not a pile of them on top of each other', () => {
    const jumps = findJumps(ground(kicker(), 300))
    for (const a of jumps) {
      for (const b of jumps) {
        if (a === b) continue
        const apart = Math.hypot(a.lip.x - b.lip.x, a.lip.z - b.lip.z)
        expect(apart >= 20 || turnBetween(a.heading, b.heading) > 45).toBe(true)
      }
    }
  })

  it('two hills far apart are two jumps', () => {
    const two = ground((x, z) => kicker(-60)(x, z) + kicker(60)(x, z), 300)
    const up = findJumps(two).filter((jump) => turnBetween(jump.heading, 90) < 15)
    expect(up.length).toBe(2)
  })

  it('reads any map: runs on the free-ride hills in good time', () => {
    const { field } = generateTerrain(freeride)
    const started = performance.now()
    const jumps = findJumps(field)
    expect(performance.now() - started).toBeLessThan(3000)
    expect(Array.isArray(jumps)).toBe(true)
  })
})
