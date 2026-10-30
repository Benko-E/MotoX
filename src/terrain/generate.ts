import type { MapDef } from '../maps/types'
import { createHeightfield, sampleCoord, type Heightfield } from './heightfield'
import { createPerlin, fractalNoise, type Noise2D } from './noise'

/** A clearing's edge wanders in and out by up to this share of its radius. */
const RAGGED = 0.2

/** Turns a map's data into ground: rolling hills, a clearing calmed among them, rising into a wall at the edge. */
export function generateTerrain(map: MapDef): Heightfield {
  const field = createHeightfield(map.size, map.cellSize)
  const noise = createPerlin(map.hills.seed)
  const n = field.samples

  for (let iz = 0; iz < n; iz++) {
    const z = sampleCoord(field, iz)
    for (let ix = 0; ix < n; ix++) {
      const x = sampleCoord(field, ix)
      field.heights[iz * n + ix] = hillHeight(map, noise, x, z) + edgeRise(map, x, z)
    }
  }
  calmClearing(map, noise, field)
  return field
}

/**
 * Calms the ground in the clearing: each point is drawn `calm` of the way to
 * the clearing's average height, fully inside its (wandering) edge and less
 * and less across the blend, so it keeps a little of the hills' roll.
 */
function calmClearing(map: MapDef, noise: Noise2D, field: Heightfield): void {
  const { clearing } = map
  if (clearing.calm <= 0 || clearing.radius <= 0) return
  const n = field.samples
  const toIndex = (w: number) => (w + field.size / 2) / field.cellSize
  const reach = clearing.radius * (1 + RAGGED) + clearing.blend
  const from = (w: number) => Math.max(0, Math.floor(toIndex(w - reach)))
  const to = (w: number) => Math.min(n - 1, Math.ceil(toIndex(w + reach)))
  // its edge: how far out it reaches each way round, from noise of its own
  const edgeAt = (dx: number, dz: number) => {
    const angle = Math.atan2(dz, dx)
    return clearing.radius * (1 + RAGGED * fractalNoise(noise, 37 + Math.cos(angle) * 1.5, 91 + Math.sin(angle) * 1.5, 2, 0.5))
  }

  let total = 0
  let count = 0
  for (let iz = from(clearing.z); iz <= to(clearing.z); iz++) {
    for (let ix = from(clearing.x); ix <= to(clearing.x); ix++) {
      const dx = sampleCoord(field, ix) - clearing.x
      const dz = sampleCoord(field, iz) - clearing.z
      if (Math.hypot(dx, dz) > clearing.radius) continue
      total += field.heights[iz * n + ix]
      count++
    }
  }
  if (count === 0) return
  const level = total / count

  for (let iz = from(clearing.z); iz <= to(clearing.z); iz++) {
    for (let ix = from(clearing.x); ix <= to(clearing.x); ix++) {
      const dx = sampleCoord(field, ix) - clearing.x
      const dz = sampleCoord(field, iz) - clearing.z
      const out = Math.hypot(dx, dz) - edgeAt(dx, dz)
      const inside = out <= 0 ? 1 : clearing.blend > 0 ? 1 - smoothstep(out / clearing.blend) : 0
      if (inside <= 0) continue
      const i = iz * n + ix
      field.heights[i] += (level - field.heights[i]) * clearing.calm * inside
    }
  }
}

function hillHeight(map: MapDef, noise: Noise2D, x: number, z: number): number {
  const { hills } = map
  const wave = Math.max(hills.wavelength, 1)
  return fractalNoise(noise, x / wave, z / wave, hills.octaves, hills.roughness) * hills.height
}

function edgeRise(map: MapDef, x: number, z: number): number {
  const half = map.size / 2
  const fromMiddle = Math.max(Math.abs(x), Math.abs(z))
  if (fromMiddle <= map.edge.start || half <= map.edge.start) return 0
  return map.edge.rise * smoothstep((fromMiddle - map.edge.start) / (half - map.edge.start))
}

function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return c * c * (3 - 2 * c)
}
