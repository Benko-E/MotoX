import { describe, expect, it } from 'vitest'
import type { MapDef } from '../src/maps/types'
import { faceLength, jumpHeightAt } from '../src/terrain/profile'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { generateTerrain } from '../src/terrain/generate'
import { buildRampMesh } from '../src/terrain/ramps'

/** A small flat test map; each test switches on the one feature it checks. */
function testMap(overrides: Partial<MapDef> = {}): MapDef {
  return {
    size: 100,
    cellSize: 1,
    hills: { seed: 1, height: 0, wavelength: 40, octaves: 3, roughness: 0.5 },
    flatArea: { x: 0, z: 0, radius: 0, blend: 0, height: 0 },
    edge: { start: 50, rise: 0 },
    lips: [],
    ramps: [],
    ...overrides,
  }
}

const hilly = { seed: 7, height: 10, wavelength: 30, octaves: 3, roughness: 0.5 }

describe('jump profile', () => {
  // height 2 m, lip 28 degrees -> the face is 2 * 2 / tan(28 deg) = 7.5229 m long
  const shape = { height: 2, lipAngle: 28, deckLength: 3, backAngle: 20 }

  it('rises from the ground to the lip height along a curved face', () => {
    expect(faceLength(shape)).toBeCloseTo(7.5229, 3)
    expect(jumpHeightAt(shape, -7.6)).toBe(0) // before the face starts
    expect(jumpHeightAt(shape, -7.5229 / 2)).toBeCloseTo(0.5, 4) // a quarter of the height halfway up
    expect(jumpHeightAt(shape, 0)).toBeCloseTo(2, 6) // the lip
  })

  it('is as steep as lipAngle right at the lip', () => {
    const slope = (jumpHeightAt(shape, 0) - jumpHeightAt(shape, -0.001)) / 0.001
    expect(slope).toBeCloseTo(Math.tan((28 * Math.PI) / 180), 2) // 0.5317
  })

  it('stays at full height along the deck, then comes back down to the ground', () => {
    expect(jumpHeightAt(shape, 2.9)).toBe(2)
    // back side is 2 * 2 / tan(20 deg) = 10.990 m long
    expect(jumpHeightAt(shape, 3 + 10.99 / 2)).toBeCloseTo(0.5, 2)
    expect(jumpHeightAt(shape, 3 + 11.1)).toBe(0)
  })
})

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
    const a = generateTerrain(testMap({ hills: hilly })).field.heights
    const b = generateTerrain(testMap({ hills: hilly })).field.heights
    const c = generateTerrain(testMap({ hills: { ...hilly, seed: 8 } })).field.heights
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('makes hills about as tall as asked', () => {
    const { heights } = generateTerrain(testMap({ hills: hilly })).field
    const highest = Math.max(...heights.map(Math.abs))
    expect(highest).toBeGreaterThan(3)
    expect(highest).toBeLessThanOrEqual(10)
  })

  it('keeps the flat area perfectly flat', () => {
    const map = testMap({ hills: hilly, flatArea: { x: 10, z: -5, radius: 15, blend: 10, height: 2 } })
    const { field } = generateTerrain(map)
    for (const [x, z] of [[10, -5], [24, -5], [10, 9], [0, -15]]) {
      expect(heightAt(field, x, z)).toBe(2)
    }
    expect(heightAt(field, 40, 40)).not.toBe(2) // out in the hills
  })

  it('raises the map edge into a wall', () => {
    const { field } = generateTerrain(testMap({ edge: { start: 30, rise: 20 } }))
    expect(heightAt(field, 0, 0)).toBe(0)
    expect(heightAt(field, 29, 0)).toBe(0)
    expect(heightAt(field, 50, 0)).toBeCloseTo(20, 6)
    expect(heightAt(field, 0, -50)).toBeCloseTo(20, 6)
  })

  it('shapes a lip into the ground, facing the way you ride over it', () => {
    // heading 0 rides toward -z, so the take-off face is on the +z side of the lip
    const lip = { x: 0, z: 0, heading: 0, width: 10, sideBlend: 5, height: 3, lipAngle: 30, deckLength: 4, backAngle: 20 }
    const { field } = generateTerrain(testMap({ lips: [lip] }))
    const face = faceLength(lip) // 2 * 3 / tan(30 deg) = 10.392 m
    expect(heightAt(field, 0, 0)).toBeCloseTo(3, 6)
    expect(heightAt(field, 0, -2)).toBeCloseTo(3, 6) // on the deck
    expect(heightAt(field, 0, face / 2)).toBeCloseTo(0.75, 1) // halfway up the face
    expect(heightAt(field, 11, 0)).toBe(0) // beyond the side blend
  })

  it('turns a lip with its heading', () => {
    // heading 90 rides toward +x: the deck is at +x, the face at -x
    const lip = { x: 0, z: 0, heading: 90, width: 10, sideBlend: 5, height: 3, lipAngle: 30, deckLength: 4, backAngle: 20 }
    const { field } = generateTerrain(testMap({ lips: [lip] }))
    expect(heightAt(field, 2, 0)).toBeCloseTo(3, 6)
    expect(heightAt(field, -2, 0)).toBeLessThan(2.5)
  })

  it('levels the ground under a ramp so it sits flat', () => {
    const ramp = { x: 10, z: 10, heading: 45, width: 6, height: 2, lipAngle: 25, deckLength: 2, backAngle: 30 }
    const { field, ramps } = generateTerrain(testMap({ hills: hilly, ramps: [ramp] }))
    expect(ramps).toHaveLength(1)
    const base = ramps[0].baseY
    // points under the ramp: at the lip, and 3 m back along the face
    const back = 3 / Math.SQRT2
    expect(heightAt(field, 10, 10)).toBeCloseTo(base, 4)
    expect(heightAt(field, 10 - back, 10 + back)).toBeCloseTo(base, 4)
  })
})

describe('buildRampMesh', () => {
  it('builds a solid that follows the jump profile at the ramp position', () => {
    const ramp = { x: 5, z: 0, heading: 0, width: 4, height: 2, lipAngle: 25, deckLength: 2, backAngle: 30 }
    const { positions, indices } = buildRampMesh(ramp, 1)
    expect(indices.length % 3).toBe(0)
    let top = -Infinity
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      top = Math.max(top, positions[i + 1])
      minX = Math.min(minX, positions[i])
      maxX = Math.max(maxX, positions[i])
    }
    expect(top).toBeCloseTo(3, 6) // base 1 m + 2 m tall
    expect(minX).toBeCloseTo(3, 6) // 4 m wide around x = 5
    expect(maxX).toBeCloseTo(7, 6)
  })
})
