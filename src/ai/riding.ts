import type { Bike } from '../physics/bike'
import type { JumpSpot } from '../world/jumps'

/**
 * Riding skills shared by everything that rides a bike without a keyboard:
 * the ghost that tries jumps, and the AI riders.
 */

const DEG = Math.PI / 180
/** Leaning in the air: full lean this many degrees off the ground's slope, and how much it eases off for the spin it already has (seconds). */
const PITCH_OFF = 15
const SPIN_EASE = 0.25
/** In the air it lines up with the ground this far ahead of where it is, seconds. */
const LOOK_AHEAD = 0.3
/** Keeping to a jump's line: full lock this many metres off it, or this many degrees turned off its way. */
const OFF_LINE = 4
const TURNED_OFF = 20

/**
 * Leaning that keeps the bike lined up with the slope it's about to land on,
 * -1 (back) to 1 (forward). `pitchRate` is how fast the nose is coming up, radians a second.
 */
export function leanToLand(bike: Bike, groundAt: (x: number, z: number) => number, pitchRate: number): number {
  const p = bike.body.translation()
  const v = bike.body.linvel()
  const ahead = { x: p.x + v.x * LOOK_AHEAD, z: p.z + v.z * LOOK_AHEAD }
  const across = Math.hypot(v.x, v.z) || 1
  const step = 2
  const dx = (v.x / across) * step
  const dz = (v.z / across) * step
  const slope = Math.atan((groundAt(ahead.x + dx, ahead.z + dz) - groundAt(ahead.x - dx, ahead.z - dz)) / (2 * step))
  // nose higher than the slope: lean forward; already turning that way: ease off
  return clamp((bike.pitch - slope) / DEG / PITCH_OFF + pitchRate * SPIN_EASE, -1, 1)
}

/** Steering that brings a bike at `p`, heading `heading`, back onto a jump's line, -1 (left) to 1 (right). */
export function steerOntoLine(p: { x: number; z: number }, heading: number, jump: JumpSpot): number {
  const fx = Math.sin(jump.heading * DEG)
  const fz = -Math.cos(jump.heading * DEG)
  const offRight = (p.x - jump.lip.x) * -fz + (p.z - jump.lip.z) * fx
  return clamp(-(offRight / OFF_LINE + turnBetween(heading, jump.heading) / TURNED_OFF), -1, 1)
}

/** The way from heading `b` to heading `a`, -180 to 180 degrees (positive: `a` is to the right). */
export function turnBetween(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
