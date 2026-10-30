/**
 * What a map is made of. Maps are pure data, so a new map is a new data file;
 * the terrain generator turns one of these into ground.
 *
 * Directions: `heading` is the direction you face, in degrees, like a
 * compass. 0 rides toward -z ("north"), 90 rides toward +x ("east").
 */

export interface MapDef {
  /** Width and depth of the (square) map, metres. The middle is at x = 0, z = 0. */
  size: number
  /** Distance between terrain height samples, metres. Smaller is finer but slower. */
  cellSize: number
  hills: {
    /** Change this for a different random landscape with the same character. */
    seed: number
    /** How tall the hills get, metres (from the lowest dips to the highest tops is about twice this). */
    height: number
    /** Typical distance from one hilltop to the next, metres. */
    wavelength: number
    /** Layers of smaller bumps on top of the big hills. */
    octaves: number
    /** How strong each smaller layer is compared to the one before, 0 to 1. Higher is bumpier. */
    roughness: number
  }
  /** The map's edge rises into a wall of hills, so you can't ride off the world. */
  edge: {
    /** Distance from the middle (along x or z) where the rise begins, metres. */
    start: number
    /** How much higher the very edge is, metres. */
    rise: number
  }
  /** A clearing: a patch of calm, gently rolling ground among the hills. You start in it. */
  clearing: {
    /** Its middle, metres. */
    x: number
    z: number
    /** How far out it's calm, metres. Its edge wanders in and out a little, like a natural one. */
    radius: number
    /** Then it blends back into the hills over this far, metres. */
    blend: number
    /** How calm: 0 leaves the hills as they are, 1 makes it level; in between keeps a little of their roll. */
    calm: number
  }
  /** Where the bike starts: on the flattest ground near here, facing `heading`. */
  spawn: { x: number; z: number; heading: number }
}
