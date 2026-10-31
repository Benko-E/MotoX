import type { MapDef } from './types'

/**
 * Milestone 1's free-ride map: nothing but rolling hills, with the jumps that
 * are in them by nature.
 *
 * Every number here has a slider in the tuning panel (` key), under "map".
 */
export const freeride: MapDef = {
  size: 1000,
  cellSize: 1,

  hills: { seed: 1337, height: 60, wavelength: 180, octaves: 8, roughness: 0.3 },

  edge: { start: 400, rise: 50 },

  /** Where you start: calm ground to get going on. */
  clearing: { x: 0, z: 0, radius: 30, blend: 40, calm: 0.85 },

  /** A track winding round the clearing, with natural jumps along it. */
  track: { show: true, way: 'counterclockwise', radius: 310, winding: 0.4, width: 8, banks: 10, flatness: 0.05, smoothing: 18, jumps: 4, jumpHeight: 4.4, jumpLength: 33, jumpVary: 0.15, jumpSpeed: 80, landingStraight: 3 },

  /** Big natural kickers in the hillsides, for big air. */
  bigAir: { count: 3, speed: 90, angle: 35, shaping: 0.2, width: 14, banks: 15, spread: 380 },

  /** In the clearing, wherever its ground is flattest. */
  spawn: { x: 0, z: 0, heading: 270 },
}
