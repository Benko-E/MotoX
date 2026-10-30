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
  /** A channel: a track of flat-ish ground winding through the hills in a loop round the clearing, with jumps shaped into it. */
  channel: {
    /** Cut it into the map at all. */
    show: boolean
    /** Which way round it's ridden (seen from above, north up): its jumps face that way. */
    way: 'clockwise' | 'counterclockwise'
    /** How far from the clearing's middle it runs, metres. */
    radius: number
    /** How much it wanders in and out, as a share of the radius. 0 is a circle. */
    winding: number
    /** How wide its flat-ish floor is, metres. */
    width: number
    /** Then its sides blend into the hills over this far, metres. */
    banks: number
    /** How much of the hills' bumpiness is taken out of its floor: 0 none, 1 all of it (it still rises and falls with the land). */
    flatness: number
    /** How gently its floor rises and falls along the way: the land's ups and downs are evened out over this far, metres. */
    smoothing: number
    /** Jumps shaped into its floor, facing the way it's ridden: how many, how high and how long (up the face and down the drop), metres. */
    jumps: number
    jumpHeight: number
    jumpLength: number
    /** How much each jump's size differs from the next, 0 to 1. */
    jumpVary: number
    /** The speed its jumps are built to be hit at, km/h: AI riders take them at this. */
    jumpSpeed: number
    /** Round each jump the track runs straight, so you land back on it: this many jump lengths past the lip (and one before the face). */
    landingStraight: number
  }
  /** Where the bike starts: on the flattest ground near here, facing `heading`. */
  spawn: { x: number; z: number; heading: number }
}
