import type { MapDef } from './types'

/**
 * Milestone 1's free-ride map: rolling hills with natural jumps, and a big
 * flat area in the middle with a row of ramps along its west side.
 *
 * Every number here has a slider in the tuning panel (` key), under "map".
 */
export const freeride: MapDef = {
  size: 1000,
  cellSize: 2,

  hills: { seed: 1337, height: 51.5, wavelength: 150, octaves: 4, roughness: 0.42 },

  flatArea: { x: 0, z: 0, radius: 120, blend: 60, height: 0 },

  edge: { start: 400, rise: 50 },

  /** Natural jumps in the hills, different sizes and directions. */
  lips: [
    { x: 180, z: -120, heading: 45, width: 25, sideBlend: 20, height: 2.5, lipAngle: 20, deckLength: 0, backAngle: 15 },
    { x: -220, z: 150, heading: 200, width: 30, sideBlend: 25, height: 3.5, lipAngle: 24, deckLength: 3, backAngle: 18 },
    { x: 60, z: 260, heading: 0, width: 20, sideBlend: 15, height: 1.8, lipAngle: 16, deckLength: 0, backAngle: 12 },
    { x: -150, z: -250, heading: 120, width: 35, sideBlend: 30, height: 5, lipAngle: 26, deckLength: 4, backAngle: 20 },
    { x: 300, z: 150, heading: 300, width: 25, sideBlend: 20, height: 3, lipAngle: 22, deckLength: 2, backAngle: 16 },
  ],

  /** Built ramps, all riding west (heading 270) from the middle of the flat area. */
  ramps: [
    // small kicker
    { x: -40, z: -45, heading: 270, width: 4, height: 1, lipAngle: 22, deckLength: 1.5, backAngle: 30 },
    // medium kicker
    { x: -40, z: -15, heading: 270, width: 5, height: 2, lipAngle: 28, deckLength: 2, backAngle: 30 },
    // big kicker
    { x: -40, z: 15, heading: 270, width: 6, height: 3.5, lipAngle: 32, deckLength: 2.5, backAngle: 35 },
    // tabletop: clear the long deck and land on the back slope
    { x: -40, z: 45, heading: 270, width: 8, height: 2.5, lipAngle: 26, deckLength: 18, backAngle: 20 },
  ],

  /** In the middle of the flat area, facing the ramps. */
  spawn: { x: 20, z: 0, heading: 270 },
}
