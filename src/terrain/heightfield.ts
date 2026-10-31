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
  /** How much each sample is dirt (a track's floor, a big air's), 0 to 1, for drawing it so. Missing when the map has neither. */
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
    /** Where it starts (the foot of its face) and ends (the bottom of its drop), on the track's line. */
    foot: { x: number; z: number }
    end: { x: number; z: number }
    /** How long it was built (face and drop) and how high, metres. */
    length: number
    height: number
    /**
     * The straight round it (none when the track has no landing straight), on
     * the track's line in the order you ride it: where it eases in from the
     * curve, where it's fully straight from and to, and where it's eased back out.
     */
    straight?: { easeFrom: { x: number; z: number }; from: { x: number; z: number }; to: { x: number; z: number }; easeTo: { x: number; z: number } }
  }[]
  /**
   * The big air jumps shaped into the hills, smallest first: where each one's
   * lip is (x, z, and how high, y) and the way it's ridden, compass degrees.
   */
  bigAirs?: {
    x: number
    y: number
    z: number
    heading: number
    /** The speed it's built to be hit at, km/h, and the air it gives then, seconds. */
    speed: number
    airtime: number
    /** How steep its lip is, degrees; how tall its kicker is, metres. */
    angle: number
    faceHeight: number
    /** Where you touch down at its speed: how far below the lip, metres, on a slope this steep, degrees. */
    landingDrop: number
    landingAngle: number
    /** The most the ground was raised or cut to shape it, metres. */
    moved: number
    /**
     * Down its middle, in the order you ride it: where its level run-in starts,
     * the foot of its kicker, where you land, where the landing slope ends and
     * bends out, where that's level again, and its end.
     */
    start: { x: number; z: number }
    foot: { x: number; z: number }
    landing: { x: number; z: number }
    zoneEnd: { x: number; z: number }
    runoutEnd: { x: number; z: number }
    end: { x: number; z: number }
    /** Its run-in up to the lip, about a metre apart. */
    runUp: { x: number; z: number }[]
  }[]
  /** A clearing's calm edge as it really runs, wandering in and out round its radius, all the way round. Missing when the map has none. */
  clearingEdge?: { x: number; z: number }[]
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
