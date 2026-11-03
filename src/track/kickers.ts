import { squareCentre, type Layout } from './layout'
import type { Jump } from './jumpSpots'

/** How the kickers are built, as set in the debug menu's Track tab. */
export interface KickerShape {
  /** How high the lip is above the ground around it, metres. */
  height: number
  /** How steep the face is, radians. */
  angle: number
  /** How wide the top is, side to side, metres. */
  width: number
}

/** A kicker: the middle of its lip, and which way you ride off it (a unit vector). */
export interface Kicker {
  x: number
  z: number
  dx: number
  dz: number
}

/** How many times steeper the back and sides are than the face. */
const STEEPER = 2
/** The steepest the back and sides get, radians. */
const STEEPEST = (60 * Math.PI) / 180

/**
 * The kickers: man-made bumps of dirt you hit at speed and fly off. Each
 * is a ridge across the way you ride: a long face up to the lip, then a
 * short steep drop at the back, and steep sides, so it stands on the ground
 * like a wedge (four flat faces, the front and back ones running down to the
 * sides' corners). Their height is added on top of whatever the ground does
 * underneath, so they'll sit on a dished track just as well as a flat one.
 */
export class Kickers {
  /** How far the face reaches back from the lip, metres. */
  readonly face: number
  /** How far the back drops away past the lip, metres. */
  readonly back: number
  /** How far the sides reach out past the top's width, metres. */
  readonly side: number
  private readonly faceSlope: number
  private readonly steepSlope: number

  constructor(
    readonly list: readonly Kicker[],
    readonly shape: KickerShape,
  ) {
    const angle = Math.min(Math.max(shape.angle, 0.01), STEEPEST)
    this.faceSlope = Math.tan(angle)
    this.steepSlope = Math.tan(Math.min(angle * STEEPER, STEEPEST))
    this.face = shape.height / this.faceSlope
    this.back = shape.height / this.steepSlope
    this.side = this.back
  }

  /** One on each of `jumps`: its lip at the far edge of the face square (the second), facing along the jump. */
  static onJumps(layout: Layout, jumps: readonly Jump[], shape: KickerShape): Kickers {
    const list = jumps.map(({ at }) => {
      const runUp = squareCentre(layout, layout.squares[at[0]])
      const face = squareCentre(layout, layout.squares[at[1]])
      const long = Math.hypot(face.x - runUp.x, face.z - runUp.z) || 1
      const dx = (face.x - runUp.x) / long
      const dz = (face.z - runUp.z) / long
      const half = layout.shape.square / 2
      return { x: face.x + dx * half, z: face.z + dz * half, dx, dz }
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
      const across = Math.abs(-(x - k.x) * k.dz + (z - k.z) * k.dx) - this.shape.width / 2
      if (across > this.side) continue
      const { height } = this.shape
      const lengthways = along < 0 ? height + along * this.faceSlope : height - along * this.steepSlope
      const sideways = height - Math.max(across, 0) * this.steepSlope
      highest = Math.max(highest, Math.min(lengthways, sideways))
    }
    return highest
  }
}
