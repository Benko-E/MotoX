import type { JumpShape } from '../maps/types'

/**
 * The side-on shape of a jump, shared by lips in the ground and by solid
 * ramps. `u` is the distance along the riding direction, with 0 at the lip:
 *
 *        deck
 *       ______
 *      /      \__          face: a curve that starts flat and ends at lipAngle
 *     /          \__       back: starts at backAngle and flattens out at the
 *   _/              \___         bottom, so landings on it are smooth
 *   -face   0   deck
 *
 * Both curves are parabolas. A parabola that starts flat and ends at angle a
 * after climbing h metres is 2h / tan(a) long, which is why the lengths are
 * worked out from the height and angle instead of being set separately.
 */

const DEG = Math.PI / 180
const MIN_ANGLE = 1 // degrees; flatter than this would make an endless face

export function faceLength(shape: JumpShape): number {
  return (2 * shape.height) / Math.tan(Math.max(shape.lipAngle, MIN_ANGLE) * DEG)
}

export function backLength(shape: JumpShape): number {
  return (2 * shape.height) / Math.tan(Math.max(shape.backAngle, MIN_ANGLE) * DEG)
}

/** Height of the jump above the ground at `u` metres along the riding direction. */
export function jumpHeightAt(shape: JumpShape, u: number): number {
  if (shape.height <= 0) return 0
  const face = faceLength(shape)
  if (u < -face) return 0
  if (u <= 0) {
    const t = (u + face) / face
    return shape.height * t * t
  }
  if (u <= shape.deckLength) return shape.height
  const t = (u - shape.deckLength) / backLength(shape)
  if (t >= 1) return 0
  return shape.height * (1 - t) * (1 - t)
}

/** Riding direction and its right-hand side for a compass heading in degrees. */
export function headingAxes(heading: number) {
  const h = heading * DEG
  return {
    forward: { x: Math.sin(h), z: -Math.cos(h) },
    right: { x: Math.cos(h), z: Math.sin(h) },
  }
}
