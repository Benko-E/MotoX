import type { MapDef } from '../maps/types'
import { createHeightfield, sampleCoord, type Heightfield } from './heightfield'
import { createPerlin, fractalNoise, type Noise2D } from './noise'

/** Turns a map's data into ground: rolling hills, rising into a wall at the edge. */
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
  return field
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
