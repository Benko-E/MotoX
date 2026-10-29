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

  /** Near the middle, wherever the ground is flattest. */
  spawn: { x: 0, z: 0, heading: 270 },
}
