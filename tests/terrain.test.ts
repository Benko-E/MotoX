import { describe, expect, it } from 'vitest'
import type { MapDef } from '../src/maps/types'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { generateTerrain } from '../src/terrain/generate'
import { flattestSpotNear } from '../src/terrain/startingSpot'
import { flat, ground } from './physicsSetup'

/** A small flat test map; each test switches on the one thing it checks. */
function testMap(overrides: Partial<MapDef> = {}): MapDef {
  return {
    size: 100,
    cellSize: 1,
    hills: { seed: 1, height: 0, wavelength: 40, octaves: 3, roughness: 0.5 },
    edge: { start: 50, rise: 0 },
    clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0 },
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
