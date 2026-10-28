/**
 * What a map is made of. Maps are pure data, so a new map is a new data file;
 * the terrain generator turns one of these into ground.
 *
 * Directions: `heading` is the direction you ride over a jump, in degrees,
 * like a compass. 0 rides toward -z ("north"), 90 rides toward +x ("east").
 */

/** The side-on shape of a jump: a curved take-off face, a flat top, a back slope. */
export interface JumpShape {
  /** Height of the lip above the ground, metres. */
  height: number
  /** Steepness at the very top of the take-off face, degrees. Steeper kicks you up more. */
  lipAngle: number
  /** Length of the flat top behind the lip, metres. 0 = a sharp lip. */
  deckLength: number
  /** Steepness at the top of the back side, degrees. The back side is the landing. */
  backAngle: number
}

/** A natural jump shaped into the ground itself. Smooth, blends into the hills. */
export interface LipDef extends JumpShape {
  /** Position of the lip (top of the take-off face), metres. */
  x: number
  z: number
  heading: number
  /** Width of the full-height part, metres. */
  width: number
  /** How far the sides take to fade back into the hills, metres. */
  sideBlend: number
}

/** A ramp built on top of the ground as its own solid shape, with a sharp lip. */
export interface RampDef extends JumpShape {
  /** Position of the lip (top of the take-off face), metres. */
  x: number
  z: number
  heading: number
  /** Width, metres. */
  width: number
}

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
  /** A flat open area for testing acceleration, braking and turning. */
  flatArea: {
    x: number
    z: number
    /** Fully flat out to this distance, metres. */
    radius: number
    /** Then blends into the hills over this distance, metres. */
    blend: number
    /** Ground height of the flat area, metres. */
    height: number
  }
  /** The map's edge rises into a wall of hills, so you can't ride off the world. */
  edge: {
    /** Distance from the middle (along x or z) where the rise begins, metres. */
    start: number
    /** How much higher the very edge is, metres. */
    rise: number
  }
  lips: LipDef[]
  ramps: RampDef[]
  /** Where the bike starts. */
  spawn: { x: number; z: number; heading: number }
}
