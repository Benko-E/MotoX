import { describe, expect, it } from 'vitest'
import type { MapDef } from '../src/maps/types'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { generateTerrain } from '../src/terrain/generate'
import { flattestSpotNear } from '../src/terrain/startingSpot'
import { designedJumps, findJumps } from '../src/world/jumpFinder'
import { flat, ground } from './physicsSetup'

/** A small flat test map; each test switches on the one thing it checks. */
function testMap(overrides: Partial<MapDef> = {}): MapDef {
  return {
    size: 100,
    cellSize: 1,
    hills: { seed: 1, height: 0, wavelength: 40, octaves: 3, roughness: 0.5 },
    edge: { start: 50, rise: 0 },
    clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0 },
    channel: { show: false, way: 'clockwise', radius: 60, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 0, jumpHeight: 2.5, jumpLength: 14, jumpVary: 0, jumpSpeed: 80, landingStraight: 0 },
    spawn: { x: 0, z: 0, heading: 0 },
    ...overrides,
  }
}

const hilly = { seed: 7, height: 10, wavelength: 30, octaves: 3, roughness: 0.5 }

describe('heightAt', () => {
  it('blends smoothly between the four nearest samples', () => {
    // 2 m square, samples 1 m apart, x from -1 to 1
    const field: Heightfield = {
      size: 2,
      samples: 3,
      cellSize: 1,
      heights: new Float32Array([0, 0, 0, 0, 4, 8, 0, 8, 0]),
    }
    expect(heightAt(field, 0, 0)).toBe(4)
    expect(heightAt(field, 0.5, 0)).toBe(6)
    expect(heightAt(field, 0.5, 0.5)).toBe(5) // (4 + 8 + 8 + 0) / 4
    expect(heightAt(field, 50, 0)).toBe(8) // outside the map: the nearest edge sample
  })
})

describe('generateTerrain', () => {
  it('makes the same landscape from the same seed, and a different one from another', () => {
    const a = generateTerrain(testMap({ hills: hilly })).heights
    const b = generateTerrain(testMap({ hills: hilly })).heights
    const c = generateTerrain(testMap({ hills: { ...hilly, seed: 8 } })).heights
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('makes hills about as tall as asked', () => {
    const { heights } = generateTerrain(testMap({ hills: hilly }))
    const highest = Math.max(...heights.map(Math.abs))
    expect(highest).toBeGreaterThan(3)
    expect(highest).toBeLessThanOrEqual(10)
  })

  it('raises the map edge into a wall', () => {
    const field = generateTerrain(testMap({ edge: { start: 30, rise: 20 } }))
    expect(heightAt(field, 0, 0)).toBe(0)
    expect(heightAt(field, 29, 0)).toBe(0)
    expect(heightAt(field, 50, 0)).toBeCloseTo(20, 6)
    expect(heightAt(field, 0, -50)).toBeCloseTo(20, 6)
  })
})

describe('a clearing', () => {
  /** How much the ground goes up and down along a line through (x, z), metres from its lowest to its highest. */
  const bumpiness = (field: Heightfield, x: number, z: number, half: number) => {
    const heights = Array.from({ length: 21 }, (_, i) => heightAt(field, x - half + (i * 2 * half) / 20, z))
    return Math.max(...heights) - Math.min(...heights)
  }
  const hills = { ...hilly, height: 10 }

  it('calms the hills inside it, without making it dead flat', () => {
    const plain = generateTerrain(testMap({ hills }))
    const calmed = generateTerrain(testMap({ hills, clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0.85 } }))
    const before = bumpiness(plain, 0, 0, 8)
    const after = bumpiness(calmed, 0, 0, 8)
    expect(after).toBeLessThan(before * 0.25)
    expect(after).toBeGreaterThan(0) // still a little natural
  })

  it('fully calm, its middle is level', () => {
    const calmed = generateTerrain(testMap({ hills, clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 1 } }))
    expect(bumpiness(calmed, 0, 0, 8)).toBeLessThan(0.01)
  })

  it('blends back into the hills: well outside it the ground is untouched', () => {
    const plain = generateTerrain(testMap({ hills }))
    const calmed = generateTerrain(testMap({ hills, clearing: { x: -20, z: -20, radius: 10, blend: 8, calm: 1 } }))
    for (const [x, z] of [[30, 30], [20, -45], [-45, 25]]) expect(heightAt(calmed, x, z)).toBe(heightAt(plain, x, z))
  })

  it('calm 0 leaves the ground as it was', () => {
    const plain = generateTerrain(testMap({ hills }))
    const untouched = generateTerrain(testMap({ hills, clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0 } }))
    expect(untouched.heights).toEqual(plain.heights)
  })
})

describe('a loop channel', () => {
  const DEG = Math.PI / 180
  const hills = { seed: 3, height: 10, wavelength: 40, octaves: 3, roughness: 0.5 }
  const loop = (changes: Partial<MapDef['channel']> = {}): MapDef['channel'] => ({ show: true, way: 'clockwise', radius: 60, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 0, jumpHeight: 2.5, jumpLength: 14, jumpVary: 0, jumpSpeed: 80, landingStraight: 0, ...changes })
  const big = (changes: Partial<MapDef> = {}) => testMap({ size: 200, hills, ...changes })
  /** The steepest the ground gets riding round a circle `r` from the middle, as rise over run. */
  const steepestRound = (field: Heightfield, r: number) => {
    let steepest = 0
    for (let a = 0; a < 360; a += 1) {
      const p = (b: number) => heightAt(field, Math.sin(b * DEG) * r, -Math.cos(b * DEG) * r)
      steepest = Math.max(steepest, Math.abs(p(a + 1) - p(a)) / (r * DEG))
    }
    return steepest
  }

  it('cuts a loop round the middle: riding along it, the ground rises and falls far more gently than the hills', () => {
    const plain = generateTerrain(big())
    const carved = generateTerrain(big({ channel: loop() }))
    expect(steepestRound(carved, 60)).toBeLessThan(steepestRound(plain, 60) * 0.35)
  })

  it('is flat-ish across its width, then blends into the hills', () => {
    const plain = generateTerrain(big())
    const carved = generateTerrain(big({ channel: loop() }))
    for (const a of [0, 70, 160, 250]) {
      const at = (r: number, field: Heightfield) => heightAt(field, Math.sin(a * DEG) * r, -Math.cos(a * DEG) * r)
      expect(Math.abs(at(57, carved) - at(63, carved))).toBeLessThan(0.3) // across its floor
      expect(at(80, carved)).toBe(at(80, plain)) // past its banks: the hills
    }
  })

  it('even through rough, steep hills its floor has no short bumps to rattle over, however much of the land it keeps', () => {
    const rough = { seed: 5, height: 40, wavelength: 60, octaves: 8, roughness: 0.55 }
    const field = generateTerrain(testMap({ size: 200, hills: rough, channel: loop({ flatness: 0.6 }) }))
    // riding round its line: how far the floor strays from its own average over a bike length either side
    const floorAt = (a: number) => heightAt(field, Math.sin(a * DEG) * 60, -Math.cos(a * DEG) * 60)
    const metre = 1 / (60 * DEG) // degrees per metre round the loop
    let worst = 0
    for (let a = 0; a < 360; a += metre) {
      const around = Array.from({ length: 7 }, (_, i) => floorAt(a + (i - 3) * metre))
      worst = Math.max(worst, Math.abs(floorAt(a) - around.reduce((x, y) => x + y, 0) / around.length))
    }
    expect(worst).toBeLessThan(0.1)
  })

  it('winding hard, its floor is still smooth everywhere: no steps where the line swings out', () => {
    const field = generateTerrain(testMap({ size: 260, hills, channel: loop({ radius: 70, winding: 0.5, flatness: 1, smoothing: 200 }) }))
    // anywhere on its floor, the ground 1 m on is never more than a gentle slope away
    const n = field.samples
    let worst = 0
    for (let i = 0; i < n * (n - 1); i++) {
      if (field.track![i] < 1 || i % n === n - 1) continue
      for (const j of [i + 1, i + n]) if (field.track![j] >= 1) worst = Math.max(worst, Math.abs(field.heights[j] - field.heights[i]))
    }
    expect(worst).toBeLessThan(0.3)
  })

  it('on a climb its floor is a smooth ramp, not a staircase of little ridges', () => {
    // big smooth hills, the floor following them all the way (flatness 0): it climbs and drops
    const big = { seed: 2, height: 30, wavelength: 120, octaves: 1, roughness: 0.5 }
    const field = generateTerrain(testMap({ size: 200, hills: big, channel: loop({ flatness: 0 }) }))
    // how sharply the slope changes from one metre to the next, anywhere on its floor
    const n = field.samples
    const h = field.heights
    let worst = 0
    for (let i = n + 1; i < n * (n - 1) - 1; i++) {
      const across = [i - 1, i, i + 1]
      const down = [i - n, i, i + n]
      for (const [a, b, c] of [across, down]) {
        if (field.track![a] < 1 || field.track![b] < 1 || field.track![c] < 1) continue
        worst = Math.max(worst, Math.abs(h[a] - 2 * h[b] + h[c]))
      }
    }
    expect(worst).toBeLessThan(0.05)
  })

  it('marks its floor, for drawing it as a dirt track: fully across its width, fading out just past it', () => {
    const field = generateTerrain(big({ channel: loop() }))
    const track = (x: number, z: number) => {
      const n = field.samples
      return field.track![Math.round((z + field.size / 2) / field.cellSize) * n + Math.round((x + field.size / 2) / field.cellSize)]
    }
    expect(track(0, -60)).toBe(1) // on its line
    expect(track(0, -57)).toBe(1) // across its floor
    expect(track(0, -50)).toBeLessThan(0.5) // on the bank
    expect(track(0, 0)).toBe(0) // the middle of the map
  })

  it('owns its floor and banks, as the clearing owns its patch: found jumps keep off them', () => {
    const field = generateTerrain(big({ channel: loop(), clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0.8 } }))
    const n = field.samples
    const owned = (x: number, z: number) => field.owned![Math.round((z + field.size / 2) / field.cellSize) * n + Math.round((x + field.size / 2) / field.cellSize)]
    expect(owned(0, -60)).toBe(1) // on its line
    expect(owned(0, -48)).toBe(1) // on its bank
    expect(owned(0, 0)).toBe(1) // the clearing
    expect(owned(70, 70)).toBe(0) // the hills
    // and nothing the finder finds starts, takes off or lands there
    for (const jump of findJumps(field)) {
      for (const p of [jump.runUp[0], jump.lip, jump.landing]) expect(owned(p.x, p.z), JSON.stringify(p)).toBe(0)
    }
  })

  it('switched off, leaves the ground alone', () => {
    const off = generateTerrain(big({ channel: loop({ show: false }) }))
    expect(off.heights).toEqual(generateTerrain(big()).heights)
    expect(off.track).toBeUndefined() // and no track to draw
  })

  it('builds jumps into its floor and registers them: exact, facing the way it is ridden, fast, and they throw you', () => {
    for (const [way, turn] of [['clockwise', 90], ['counterclockwise', -90]] as const) {
      const field = generateTerrain(testMap({ size: 260, channel: loop({ way, radius: 80, jumps: 4, jumpHeight: 3, landingStraight: 3 }) }))
      const jumps = designedJumps(field)
      expect(jumps).toHaveLength(4)
      for (const j of jumps) {
        expect(j.source).toBe('channel')
        expect(j.kind).toBe('fast')
        expect(j.speed).toBe(80)
        const bearing = Math.atan2(j.lip.x, -j.lip.z) / DEG
        expect(Math.abs(((bearing + turn - j.heading + 540) % 360) - 180), way).toBeLessThan(10) // round the loop the way it's ridden
        expect(j.airtime).toBeGreaterThan(0.5) // it throws you
        // its run-up comes along the track to the lip
        expect(Math.hypot(j.runUp.at(-1)!.x - j.lip.x, j.runUp.at(-1)!.z - j.lip.z)).toBeLessThan(1.5)
        expect(Math.hypot(j.runUp[0].x - j.lip.x, j.runUp[0].z - j.lip.z)).toBeGreaterThan(25)
      }
    }
  })
})

describe('flattestSpotNear', () => {
  /** A smooth hollow with its flat bottom at (cx, cz). */
  const hollow = (cx: number, cz: number) => ground((x, z) => 0.02 * ((x - cx) ** 2 + (z - cz) ** 2))

  it('finds the flattest ground near the middle, for the bike to start on', () => {
    const spot = flattestSpotNear(hollow(30, -20), 0, 0, 60)
    expect(Math.hypot(spot.x - 30, spot.z + 20)).toBeLessThan(3)
  })

  it('looks no further than asked', () => {
    const spot = flattestSpotNear(hollow(90, 0), 0, 0, 40)
    expect(Math.hypot(spot.x, spot.z)).toBeLessThanOrEqual(40)
    expect(spot.x).toBeGreaterThan(35) // as far toward the flat bottom as it may go
  })

  it('on ground that is all flat, stays where it was asked', () => {
    expect(flattestSpotNear(flat(), 10, 5, 60)).toEqual({ x: 10, z: 5 })
  })
})
