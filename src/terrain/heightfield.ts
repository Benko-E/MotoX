/**
 * The ground as a square grid of heights.
 *
 * Sample (ix, iz) sits at x = -size/2 + ix * cellSize, z = -size/2 + iz * cellSize
 * and is stored at heights[iz * samples + ix].
 */
export interface Heightfield {
  /** Width and depth in metres, centred on x = 0, z = 0. */
  size: number
  /** Samples along each side. */
  samples: number
  /** Distance between samples in metres. */
  cellSize: number
  heights: Float32Array
  /** How much each sample is the floor of a track, 0 to 1, for drawing it as dirt. Missing when the map has none. */
  track?: Float32Array
  /** The lips of the jumps shaped into a track, and the compass heading the track runs there, degrees. */
  trackJumps?: {
    x: number
    z: number
    heading: number
    /** The track's line up to the lip, about a metre apart, from where its run-up starts. */
    runUp: { x: number; z: number }[]
    /** The speed it's built to be hit at, km/h. */
    speed: number
  }[]
  /** Which samples belong to a map feature (a track, a clearing, ...): 1 if one owns it. The jump finder keeps off them. */
  owned?: Uint8Array
  /** The line down the middle of a track, its points about a metre apart, going round clockwise. */
  trackLine?: { x: number; z: number }[]
}

export function createHeightfield(size: number, cellSize: number): Heightfield {
  const samples = Math.max(2, Math.round(size / cellSize) + 1)
  return {
    size,
    samples,
    cellSize: size / (samples - 1),
    heights: new Float32Array(samples * samples),
  }
}

/** World x (or z) of sample column (or row) `i`. */
export function sampleCoord(field: Heightfield, i: number): number {
  return -field.size / 2 + i * field.cellSize
}

/** Ground height at any point, blended between the four nearest samples. */
export function heightAt(field: Heightfield, x: number, z: number): number {
  const n = field.samples
  const fx = clamp((x + field.size / 2) / field.cellSize, 0, n - 1)
  const fz = clamp((z + field.size / 2) / field.cellSize, 0, n - 1)
  const ix = Math.min(Math.floor(fx), n - 2)
  const iz = Math.min(Math.floor(fz), n - 2)
  const tx = fx - ix
  const tz = fz - iz
  const h = field.heights
  const row = iz * n + ix
  const near = h[row] * (1 - tx) + h[row + 1] * tx
  const far = h[row + n] * (1 - tx) + h[row + n + 1] * tx
  return near * (1 - tz) + far * tz
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
