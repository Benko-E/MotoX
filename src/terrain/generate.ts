import type { LipDef, MapDef, RampDef } from '../maps/types'
import { createHeightfield, heightAt, sampleCoord, type Heightfield } from './heightfield'
import { createPerlin, fractalNoise, type Noise2D } from './noise'
import { backLength, faceLength, headingAxes, jumpHeightAt } from './profile'

/** Ground levelled this far around a ramp's footprint, metres. */
const RAMP_PAD_MARGIN = 1
/** Then blended back into the hills over this distance, metres. */
const RAMP_PAD_BLEND = 8

export interface PlacedRamp {
  def: RampDef
  /** Ground height the ramp stands on. */
  baseY: number
}

/**
 * Turns a map's data into ground. In order: rolling hills (flattened in the
 * flat area), the rising edge, the lips, and finally level pads under ramps.
 */
export function generateTerrain(map: MapDef): { field: Heightfield; ramps: PlacedRamp[] } {
  const field = createHeightfield(map.size, map.cellSize)
  const noise = createPerlin(map.hills.seed)
  const n = field.samples

  for (let iz = 0; iz < n; iz++) {
    const z = sampleCoord(field, iz)
    for (let ix = 0; ix < n; ix++) {
      const x = sampleCoord(field, ix)
      let h = hillHeight(map, noise, x, z) + edgeRise(map, x, z)
      for (const lip of map.lips) h += lipHeight(lip, x, z)
      field.heights[iz * n + ix] = h
    }
  }

  const ramps = map.ramps.map((def) => ({ def, baseY: heightAt(field, def.x, def.z) }))
  for (const ramp of ramps) levelUnderRamp(field, ramp)
  return { field, ramps }
}

function hillHeight(map: MapDef, noise: Noise2D, x: number, z: number): number {
  const { hills, flatArea } = map
  const wave = Math.max(hills.wavelength, 1)
  const h = fractalNoise(noise, x / wave, z / wave, hills.octaves, hills.roughness) * hills.height

  const distance = Math.hypot(x - flatArea.x, z - flatArea.z)
  let flat = 0
  if (distance <= flatArea.radius) flat = 1
  else if (flatArea.blend > 0) flat = 1 - smoothstep((distance - flatArea.radius) / flatArea.blend)
  return h * (1 - flat) + flatArea.height * flat
}

function edgeRise(map: MapDef, x: number, z: number): number {
  const half = map.size / 2
  const fromMiddle = Math.max(Math.abs(x), Math.abs(z))
  if (fromMiddle <= map.edge.start || half <= map.edge.start) return 0
  return map.edge.rise * smoothstep((fromMiddle - map.edge.start) / (half - map.edge.start))
}

function lipHeight(lip: LipDef, x: number, z: number): number {
  const { forward, right } = headingAxes(lip.heading)
  const dx = x - lip.x
  const dz = z - lip.z
  const u = dx * forward.x + dz * forward.z
  const v = Math.abs(dx * right.x + dz * right.z)
  const halfWidth = lip.width / 2
  let side = 0
  if (v <= halfWidth) side = 1
  else if (lip.sideBlend > 0) side = 1 - smoothstep((v - halfWidth) / lip.sideBlend)
  return side > 0 ? jumpHeightAt(lip, u) * side : 0
}

function levelUnderRamp(field: Heightfield, ramp: PlacedRamp): void {
  const { def, baseY } = ramp
  const { forward, right } = headingAxes(def.heading)
  const uMin = -faceLength(def) - RAMP_PAD_MARGIN
  const uMax = def.deckLength + backLength(def) + RAMP_PAD_MARGIN
  const vMax = def.width / 2 + RAMP_PAD_MARGIN

  // Only visit samples near the ramp.
  const reach = Math.max(-uMin, uMax) + vMax + RAMP_PAD_BLEND
  const n = field.samples
  const toIndex = (w: number) => (w + field.size / 2) / field.cellSize
  const ixFrom = Math.max(0, Math.floor(toIndex(def.x - reach)))
  const ixTo = Math.min(n - 1, Math.ceil(toIndex(def.x + reach)))
  const izFrom = Math.max(0, Math.floor(toIndex(def.z - reach)))
  const izTo = Math.min(n - 1, Math.ceil(toIndex(def.z + reach)))

  for (let iz = izFrom; iz <= izTo; iz++) {
    const dz = sampleCoord(field, iz) - def.z
    for (let ix = ixFrom; ix <= ixTo; ix++) {
      const dx = sampleCoord(field, ix) - def.x
      const u = dx * forward.x + dz * forward.z
      const v = Math.abs(dx * right.x + dz * right.z)
      const outside = Math.hypot(Math.max(uMin - u, 0, u - uMax), Math.max(v - vMax, 0))
      const weight = 1 - smoothstep(outside / RAMP_PAD_BLEND)
      if (weight <= 0) continue
      const i = iz * n + ix
      field.heights[i] = field.heights[i] * (1 - weight) + baseY * weight
    }
  }
}

function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return c * c * (3 - 2 * c)
}
