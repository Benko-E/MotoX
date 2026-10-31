import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { MapDef } from '../src/maps/types'
import { initPhysics } from '../src/physics/world'
import { bigAirShape } from '../src/terrain/bigAir'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { GhostRider } from '../src/world/ghostRider'
import { featureJumps } from '../src/world/jumps'

const DEG = Math.PI / 180
const G = 9.81

describe('a big air jump, as shaped', () => {
  const shape = bigAirShape(3.5, 90, 35, G)
  const v = 90 / 3.6
  const across = v * Math.cos(35 * DEG)
  /** Where the wheels are in the air, off the lip at its speed and angle, relative to the lip. */
  const flight = (d: number) => d * Math.tan(35 * DEG) - (G * d * d) / (2 * across * across)
  const slope = (d: number) => (shape.groundAt(d + 0.05) - shape.groundAt(d - 0.05)) / 0.1

  it('throws you for the airtime it was built for: the flight off its lip meets the ground again that far on, along the slope', () => {
    expect(shape.landing).toBeCloseTo(across * 3.5, 1)
    for (let d = 0.5; d < shape.landing - 0.5; d += 0.5) expect(shape.groundAt(d), `${d} m`).toBeLessThan(flight(d))
    expect(shape.groundAt(shape.landing)).toBeCloseTo(flight(shape.landing), 3)
    const flightSlope = (flight(shape.landing + 0.05) - flight(shape.landing - 0.05)) / 0.1
    expect(slope(shape.landing)).toBeCloseTo(flightSlope, 2)
    expect(shape.landingAngle).toBeCloseTo(-Math.atan(flightSlope) / DEG, 1)
    expect(shape.landingDrop).toBeCloseTo(-flight(shape.landing), 3)
  })

  it('climbs its face from level to the lip angle after a level run-in, and drops away behind the lip', () => {
    expect(shape.groundAt(0)).toBeCloseTo(0, 6)
    expect(shape.foot - shape.start).toBeCloseTo(40, 6)
    for (let d = shape.start; d <= shape.foot; d += 2) expect(shape.groundAt(d)).toBeCloseTo(-shape.faceHeight, 6)
    expect(slope(shape.foot + 0.1)).toBeCloseTo(0, 1)
    expect(slope(-0.1)).toBeCloseTo(Math.tan(35 * DEG), 1)
    expect(slope(0.1)).toBeLessThan(0)
    expect(shape.faceHeight).toBeGreaterThan(3)
  })

  it('never bends harder than a bike at its speed can ride through, up its face and out of its landing', () => {
    // how sharply it curves (the second difference, allowing for how steep it is)
    const bend = (d: number) => (shape.groundAt(d + 0.5) - 2 * shape.groundAt(d) + shape.groundAt(d - 0.5)) / 0.25 / (1 + slope(d) ** 2) ** 1.5
    for (let d = shape.foot; d < -0.5; d += 0.5) expect(v * v * bend(d), `face at ${d} m`).toBeLessThan(1.6 * G)
    const landingSpeed = Math.hypot(across, G * 3.5 - v * Math.sin(35 * DEG))
    for (let d = shape.landing + 0.5; d < shape.end; d += 0.5) expect(landingSpeed ** 2 * bend(d), `runout at ${d} m`).toBeLessThan(2.1 * G)
  })

  it('levels out after its landing and stays level to its end', () => {
    expect(shape.runoutEnd).toBeGreaterThan(shape.landing)
    expect(shape.end).toBeGreaterThan(shape.runoutEnd)
    for (let d = shape.runoutEnd + 0.5; d <= shape.end; d += 1) expect(slope(d)).toBeCloseTo(0, 2)
    expect(shape.groundAt(shape.end + 50)).toBeCloseTo(shape.groundAt(shape.end), 6)
    expect(shape.groundAt(shape.start - 50)).toBeCloseTo(shape.groundAt(shape.start), 6)
  })

  it('built for more air, lands further on, lower, and on a steeper slope', () => {
    const bigger = bigAirShape(4, 90, 35, G)
    expect(bigger.landing).toBeGreaterThan(shape.landing)
    expect(bigger.landingDrop).toBeGreaterThan(shape.landingDrop)
    expect(bigger.landingAngle).toBeGreaterThan(shape.landingAngle)
  })
})

/** A hilly test map with big air and nothing else in the way. */
function testMap(bigAir: Partial<MapDef['bigAir']> = {}, more: Partial<MapDef> = {}): MapDef {
  return {
    size: 600,
    cellSize: 1,
    hills: { seed: 3, height: 40, wavelength: 180, octaves: 3, roughness: 0.4 },
    edge: { start: 280, rise: 0 },
    clearing: { x: 0, z: 0, radius: 20, blend: 20, calm: 0.8 },
    track: { show: false, way: 'clockwise', radius: 200, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 0, jumpHeight: 3, jumpLength: 20, jumpVary: 0, jumpSpeed: 80, landingStraight: 1 },
    bigAir: { count: 1, speed: 90, angle: 35, shaping: 0.2, width: 14, banks: 15, spread: 260, ...bigAir },
    spawn: { x: 0, z: 0, heading: 0 },
    ...more,
  }
}
type BigAir = NonNullable<Heightfield['bigAirs']>[number]
/** Points down a big air's middle, a metre apart, from where its run-in starts to its end. */
const middleOf = (air: BigAir) => {
  const length = Math.hypot(air.end.x - air.start.x, air.end.z - air.start.z)
  return Array.from({ length: Math.floor(length) + 1 }, (_, i) => ({ x: air.start.x + ((air.end.x - air.start.x) * i) / length, z: air.start.z + ((air.end.z - air.start.z) * i) / length }))
}
const sampleOf = (field: Heightfield, x: number, z: number) => Math.round((z + field.size / 2) / field.cellSize) * field.samples + Math.round((x + field.size / 2) / field.cellSize)

describe('big air in the hills', () => {
  const plain = generateTerrain(testMap({ count: 0 }))
  const field = generateTerrain(testMap())
  const [air] = field.bigAirs ?? []

  it('shapes one where the land falls away, as big as it can without moving its landing hill more than its shaping (a share of the hills)', () => {
    expect(field.bigAirs).toHaveLength(1)
    expect(air.airtime).toBeGreaterThanOrEqual(2)
    expect(air.moved).toBeLessThanOrEqual(0.2 * 40)
    const lip = Math.hypot(air.x - air.start.x, air.z - air.start.z)
    for (const [i, p] of middleOf(air).entries()) {
      const moved = Math.abs(heightAt(field, p.x, p.z) - heightAt(plain, p.x, p.z))
      // the landing hill within the shaping; the run-in and kicker within that and the kicker's height
      expect(moved, `${i - lip} m from the lip`).toBeLessThan(0.2 * 40 + (i < lip ? air.faceHeight : 0) + 0.6)
    }
    // it really is a big drop: the runout is well below the lip
    expect(heightAt(field, air.x, air.z) - heightAt(field, air.end.x, air.end.z)).toBeGreaterThan(10)
  })

  it('flies about as planned, landing on its landing hill: a flight a little lower than planned comes down a little sooner, along the slope', () => {
    const spot = featureJumps(field).find((j) => j.source === 'bigAir')!
    expect(spot.kind).toBe('bigAir')
    expect(spot.speed).toBe(90)
    expect(spot.airtime).toBeGreaterThan(air.airtime * 0.75)
    expect(spot.airtime).toBeLessThanOrEqual(air.airtime + 0.05)
    const along = (p: { x: number; z: number }) => Math.hypot(p.x - air.x, p.z - air.z)
    expect(along(spot.landing)).toBeGreaterThan(along(air.landing) * 0.8)
    expect(along(spot.landing)).toBeLessThan(along(air.zoneEnd))
  })

  it('gets bigger with more shaping allowed, or with taller hills', () => {
    const shaped = generateTerrain(testMap({ shaping: 0.4 })).bigAirs![0]
    expect(shaped.airtime).toBeGreaterThan(air.airtime)
    const taller = generateTerrain(testMap({}, { hills: { ...testMap().hills, height: 70 } })).bigAirs![0]
    expect(taller.airtime).toBeGreaterThan(air.airtime)
  })

  it('keeps clear of the clearing, the track and the wall at the edge', () => {
    const withTrack = { track: { ...testMap().track, show: true } }
    const before = generateTerrain(testMap({ count: 0 }, withTrack))
    const after = generateTerrain(testMap({ count: 3 }, withTrack))
    expect(after.bigAirs!.length).toBeGreaterThan(0)
    for (const each of after.bigAirs!) {
      for (const p of middleOf(each)) {
        expect(before.owned![sampleOf(before, p.x, p.z)], `owned at ${p.x}, ${p.z}`).toBe(0)
        expect(Math.hypot(p.x, p.z)).toBeGreaterThan(20 * 1.2 + 20)
        expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(280)
      }
    }
  })

  it('shapes as many as asked for where they fit, apart from each other, smallest first', () => {
    const airs = generateTerrain(testMap({ count: 3 })).bigAirs!
    expect(airs).toHaveLength(3)
    for (let i = 1; i < airs.length; i++) expect(airs[i].airtime).toBeGreaterThanOrEqual(airs[i - 1].airtime)
    for (const a of airs) for (const b of airs) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(40)
  })

  it('owns its ground and draws its floor as dirt', () => {
    const lip = sampleOf(field, air.x, air.z)
    expect(field.owned![lip]).toBe(1)
    expect(field.track![lip]).toBeCloseTo(1, 1)
    expect(plain.owned![lip]).toBe(0)
  })

  it('shapes none when asked for none, and leaves the ground as it was', () => {
    expect(plain.bigAirs ?? []).toHaveLength(0)
    expect(generateTerrain(testMap({ count: 0 })).heights).toEqual(plain.heights)
  })
})

describe('big air, ridden by the ghost', () => {
  beforeAll(async () => {
    await initPhysics()
  })

  it('takes off at its speed, flies about as long as measured, and lands it', { timeout: 60_000 }, () => {
    const field = generateTerrain(testMap({ count: 3 }))
    const ghost = new GhostRider(field, structuredClone(config))
    for (const [i, spot] of featureJumps(field).filter((j) => j.source === 'bigAir').entries()) {
      const ride = ghost.ride(spot)
      expect(ride.landed, `big air ${i + 1}: ${ride.reason}`).toBe(true)
      expect(Math.abs(ride.airtime - spot.airtime), `big air ${i + 1}`).toBeLessThan(0.4)
    }
  })
})
