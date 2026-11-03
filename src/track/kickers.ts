import { squareCentre, type Layout } from './layout'
import type { Jump } from './jumpSpots'
import type { Track } from './track'

/** How the kickers are built, as set in the debug menu's Track tab. */
export interface KickerShape {
  /** How high the lip is above the ground around it, metres. */
  height: number
  /** How steep the face is, radians. */
  angle: number
  /** How wide it is on the ground, side to side, metres (the track's width, for now). The lip is a little narrower. */
  width: number
}

/** A kicker: the middle of its lip, and which way you ride off it (a unit vector). */
export interface Kicker {
  x: number
  z: number
  dx: number
  dz: number
}

/** How many times steeper the back is than the face. */
const STEEPER = 2
/** The steepest the back gets, radians. */
const STEEPEST = (60 * Math.PI) / 180

/**
 * The kickers: man-made bumps of dirt you hit at speed and fly off. Each
 * is a ridge across the way you ride: a long face up to the lip, then a
 * short steep drop at the back. On the ground it's a rectangle as wide as
 * the track; its lip is a little narrower, so the sides are steep triangles
 * leaning in from the ground's edges up to the lip's ends (four flat faces).
 * Their height is added on top of whatever the ground does underneath, so
 * they'll sit on a dished track just as well as a flat one.
 */
export class Kickers {
  /** How far the face reaches back from the lip, metres. */
  readonly face: number
  /** How far the back drops away past the lip, metres. */
  readonly back: number
  /** Half the lip's width, metres. */
  readonly lip: number
  /** How far the sides reach out past the lip's ends, metres. */
  readonly side: number
  private readonly faceSlope: number
  private readonly backSlope: number
  private readonly sideSlope: number

  constructor(
    readonly list: readonly Kicker[],
    readonly shape: KickerShape,
  ) {
    const angle = Math.min(Math.max(shape.angle, 0.01), STEEPEST)
    this.faceSlope = Math.tan(angle)
    this.backSlope = Math.tan(Math.min(angle * STEEPER, STEEPEST))
    this.face = shape.height / this.faceSlope
    this.back = shape.height / this.backSlope
    // the lip 2 m narrower than the ground under it, or 1 m on a narrow track (under 10 m)
    const half = Math.max(shape.width, 1) / 2
    this.lip = Math.max(half - (shape.width > 10 ? 1 : 0.5), 0.25)
    this.side = half - this.lip
    this.sideSlope = shape.height / this.side
  }

  /**
   * One on each of `jumps`, sitting on `track` as it actually runs (relaxing
   * can bend it a little off the grid's line): its lip on the track's middle
   * at the far edge of the face square (the second), and turned to line up
   * with the track from the foot of its face to the lip.
   */
  static onJumps(layout: Layout, track: Track, jumps: readonly Jump[], shape: KickerShape): Kickers {
    const { samples } = track
    const n = samples.length
    const { face } = new Kickers([], shape)
    const back = Math.max(1, Math.round(face / (track.length / n)))
    const list = jumps.map(({ at }) => {
      const runUp = squareCentre(layout, layout.squares[at[0]])
      const faceSquare = squareCentre(layout, layout.squares[at[1]])
      const half = layout.shape.square / 2
      const long = Math.hypot(faceSquare.x - runUp.x, faceSquare.z - runUp.z) || 1
      const lip = track.nearest(faceSquare.x + ((faceSquare.x - runUp.x) / long) * half, faceSquare.z + ((faceSquare.z - runUp.z) / long) * half)
      // the jump may run either way round the spline: step back the way it comes from
      const s = samples[lip]
      const way = s.tx * (faceSquare.x - runUp.x) + s.tz * (faceSquare.z - runUp.z) >= 0 ? 1 : -1
      const foot = samples[(lip - way * back + n) % n]
      const chord = Math.hypot(s.x - foot.x, s.z - foot.z) || 1
      return { x: s.x, z: s.z, dx: (s.x - foot.x) / chord, dz: (s.z - foot.z) / chord }
    })
    return new Kickers(list, shape)
  }

  /** How high the kickers stand at (x, z), above the ground under them, metres. */
  heightAt(x: number, z: number): number {
    let highest = 0
    for (const k of this.list) {
      // along the way you ride from the lip (before it negative), and out to the side
      const along = (x - k.x) * k.dx + (z - k.z) * k.dz
      if (along < -this.face || along > this.back) continue
      const across = Math.abs(-(x - k.x) * k.dz + (z - k.z) * k.dx) - this.lip
      if (across > this.side) continue
      const { height } = this.shape
      const lengthways = along < 0 ? height + along * this.faceSlope : height - along * this.backSlope
      const sideways = height - Math.max(across, 0) * this.sideSlope
      highest = Math.max(highest, Math.min(lengthways, sideways))
    }
    return highest
  }
}
