import { seeded } from '../track/layout'
import type { Track } from '../track/track'

/** The rolling ground the noise makes, as set in the debug menu's Terrain tab. */
export interface NoiseShape {
  seed: number
  /** How far up or down the ground rolls at most, metres. */
  height: number
  /** Metres from one big rise to the next. */
  width: number
  /** How much the smaller bumps add on top of the big swells, 0 to 1. */
  detail: number
}

/** How the track is laid into the ground. */
export interface CarveShape {
  /** The ups and downs along the track are evened out over this far, metres (0: it follows every bump). */
  smoothing: number
  /** How much of the ground's sideways tilt the track keeps across it, 0 (flat across) to 1 (all of it). */
  camber: number
  /** Past the track's edges, the ground blends back into the hills over this far, metres. */
  banks: number
}

/** How far the height grid reaches from the middle of the world, either way, metres. */
export const TERRAIN_HALF = 512
/** Metres between the grid's points. */
export const TERRAIN_CELL = 2
/** The last this many metres to the grid's edge, the noise dies away to flat, so it meets the flat ground beyond. */
const EDGE_FADE = 100
/** Smaller bump layers on top of the big swell, each half the size of the last. */
const SMALL_LAYERS = 4

/**
 * The ground: rolling hills from noise, worked out once into a grid of
 * heights, with the track laid into it. Along the track its floor follows
 * the land, evened out over the Smoothing distance; across it, it keeps
 * Camber's share of the ground's sideways tilt (none: flat across). Past
 * the track's edges the ground blends back into the hills over the Banks.
 * Same seed, same hills.
 */
export class Terrain {
  /** Points along each side of the grid. */
  readonly samples = Math.round((2 * TERRAIN_HALF) / TERRAIN_CELL) + 1
  /** The ground's height at each point of the grid, row by row (z), metres. */
  readonly heights: Float32Array
  /** The tops of the big swells (the first noise layer, the one Width sets the size of), before the track's laid in. */
  readonly peaks: { x: number; z: number }[] = []

  constructor(noise: NoiseShape, track: Track, carve: CarveShape) {
    const n = this.samples
    const { land, swell } = makeLand(noise)
    this.heights = new Float32Array(n * n)
    const swells = new Float32Array(n * n)
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        this.heights[iz * n + ix] = land(coord(ix), coord(iz))
        swells[iz * n + ix] = swell(coord(ix), coord(iz))
      }
    }
    // a top: higher than all eight grid points round it, and above the middle height
    for (let iz = 1; iz < n - 1; iz++) {
      for (let ix = 1; ix < n - 1; ix++) {
        const h = swells[iz * n + ix]
        if (h <= 0) continue
        let top = true
        for (let dz = -1; dz <= 1 && top; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dz) && swells[(iz + dz) * n + ix + dx] >= h) {
              top = false
              break
            }
          }
        }
        if (top) this.peaks.push({ x: coord(ix), z: coord(iz) })
      }
    }
    this.carve(track, carve, land)
  }

  /**
   * How high the ground is at (x, z), metres: in between the grid's points,
   * on the same two triangles the ground is drawn with in each square, so
   * what you ride is exactly what you see.
   */
  heightAt(x: number, z: number): number {
    const n = this.samples
    const fx = Math.min(Math.max((x + TERRAIN_HALF) / TERRAIN_CELL, 0), n - 1.000001)
    const fz = Math.min(Math.max((z + TERRAIN_HALF) / TERRAIN_CELL, 0), n - 1.000001)
    const ix = Math.floor(fx)
    const iz = Math.floor(fz)
    const u = fx - ix
    const v = fz - iz
    const h = this.heights
    const a = h[iz * n + ix]
    const b = h[iz * n + ix + 1]
    const c = h[(iz + 1) * n + ix]
    const d = h[(iz + 1) * n + ix + 1]
    // each square is split corner to corner from (x+1, z) to (x, z+1)
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v)
  }

  /**
   * Lays the track in: works out its floor round the loop, then pulls the
   * ground near it to that floor (tilted by camber across), fully within
   * the track's width and less and less over the banks.
   */
  private carve(track: Track, carve: CarveShape, land: (x: number, z: number) => number): void {
    const { samples } = track
    const count = samples.length
    const step = track.length / count
    const half = track.shape.width / 2
    // along: the land under the middle, evened out; across: its tilt, from the land at both edges
    const floor = evenOut(
      Float64Array.from(samples, (s) => land(s.x, s.z)),
      carve.smoothing / step,
    )
    const tilt = Float64Array.from(samples, (s) => {
      const lx = s.tz
      const lz = -s.tx
      return (land(s.x + lx * half, s.z + lz * half) - land(s.x - lx * half, s.z - lz * half)) / (2 * half)
    })
    const camber = Math.min(Math.max(carve.camber, 0), 1)
    const leaning = evenOut(tilt, carve.smoothing / step).map((t) => t * camber)

    // the nearest point of the track's middle to each grid point near it, and how far off to the left
    const n = this.samples
    const reach = half + Math.max(carve.banks, 0)
    const nearest = new Float32Array(n * n).fill(Infinity)
    const at = new Int32Array(n * n).fill(-1)
    const left = new Float32Array(n * n)
    const cells = Math.ceil(reach / TERRAIN_CELL)
    samples.forEach((s, k) => {
      const cx = Math.round((s.x + TERRAIN_HALF) / TERRAIN_CELL)
      const cz = Math.round((s.z + TERRAIN_HALF) / TERRAIN_CELL)
      for (let iz = Math.max(cz - cells, 0); iz <= Math.min(cz + cells, n - 1); iz++) {
        for (let ix = Math.max(cx - cells, 0); ix <= Math.min(cx + cells, n - 1); ix++) {
          const dx = coord(ix) - s.x
          const dz = coord(iz) - s.z
          const d = Math.hypot(dx, dz)
          const i = iz * n + ix
          if (d >= nearest[i]) continue
          nearest[i] = d
          at[i] = k
          left[i] = dx * s.tz - dz * s.tx
        }
      }
    })
    for (let i = 0; i < n * n; i++) {
      const k = at[i]
      if (k < 0) continue
      const out = nearest[i] - half
      const weight = out <= 0 ? 1 : carve.banks > 0 ? 1 - smoothstep(out / carve.banks) : 0
      if (weight <= 0) continue
      const level = floor[k] + leaning[k] * left[i]
      this.heights[i] += (level - this.heights[i]) * weight
    }
  }
}

/** The grid point `i`'s place along x (or z), metres. */
function coord(i: number): number {
  return -TERRAIN_HALF + i * TERRAIN_CELL
}

/**
 * The noise's hills, metres: big swells and smaller bumps on them, dying
 * away to flat near the grid's edge (`land`); and the big swells alone (`swell`).
 */
function makeLand(noise: NoiseShape): { land: (x: number, z: number) => number; swell: (x: number, z: number) => number } {
  // each layer its own pattern, so their rises don't line up
  const layers = Array.from({ length: SMALL_LAYERS + 1 }, (_, i) => makeNoise2D(noise.seed * 31 + i + 1))
  const keep = 0.55 * Math.min(Math.max(noise.detail, 0), 1) // how much of each layer the next one keeps
  const amplitudes = layers.map((_, i) => keep ** i)
  // scaled so all the layers together never pass ± the height
  const scale = noise.height / amplitudes.reduce((a, b) => a + b, 0)
  const width = Math.max(noise.width, 1e-6)
  const fade = (x: number, z: number) => 1 - smoothstep((Math.max(Math.abs(x), Math.abs(z)) - (TERRAIN_HALF - EDGE_FADE)) / EDGE_FADE)
  return {
    land: (x, z) => {
      if (scale === 0) return 0
      let sum = 0
      for (let i = 0; i <= SMALL_LAYERS; i++) {
        if (amplitudes[i] === 0) break
        const f = 2 ** i / width
        sum += amplitudes[i] * layers[i](x * f, z * f)
      }
      return scale * sum * fade(x, z)
    },
    swell: (x, z) => scale * layers[0](x / width, z / width) * fade(x, z),
  }
}

/** Eight evenly spread slope directions, one picked per grid corner. */
const GX = Float64Array.from({ length: 8 }, (_, i) => Math.cos((i * Math.PI) / 4))
const GY = Float64Array.from({ length: 8 }, (_, i) => Math.sin((i * Math.PI) / 4))

/**
 * Smooth gradient (Perlin) noise from a seed: rolling values in -1..1 that
 * change smoothly, with about one rise or dip per 1 unit of x or y.
 */
function makeNoise2D(seed: number): (x: number, y: number) => number {
  // a shuffled 0..255 table, doubled so corner lookups never wrap by hand
  const random = seeded(seed)
  const order = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255]
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const corner = (ix: number, iy: number, fx: number, fy: number) => {
    const g = perm[perm[ix & 255] + (iy & 255)] & 7
    return GX[g] * fx + GY[g] * fy
  }
  return (x, y) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const u = fade(fx)
    const v = fade(fy)
    const a = corner(x0, y0, fx, fy)
    const b = corner(x0 + 1, y0, fx - 1, fy)
    const c = corner(x0, y0 + 1, fx, fy - 1)
    const d = corner(x0 + 1, y0 + 1, fx - 1, fy - 1)
    const value = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
    // raw values stay within about ±0.71; stretch to ±1
    return Math.max(-1, Math.min(1, value * Math.SQRT2))
  }
}

function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return c * c * (3 - 2 * c)
}

/** `values` round a loop, evened out over about `span` of them (three box passes make a smooth bell). */
function evenOut(values: Float64Array, span: number): Float64Array {
  const count = values.length
  const half = Math.round(span / 2)
  if (half < 1) return values
  let even = values
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float64Array(count)
    let sum = 0
    for (let k = -half; k <= half; k++) sum += even[((k % count) + count) % count]
    for (let k = 0; k < count; k++) {
      next[k] = sum / (2 * half + 1)
      sum += even[(k + half + 1) % count] - even[(((k - half) % count) + count) % count]
    }
    even = next
  }
  return even
}
