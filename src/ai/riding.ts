import type { Bike } from '../physics/bike'
import { topSpeed, type SpeedSettings, type TurningSettings } from '../physics/bikeTuning'
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

/**
 * The fastest a bend `radius` metres round can be taken, m/s: where the
 * bike's tightest turn is just that tight (top speed on one wide enough,
 * 0 on one too tight for the bike at all).
 */
export function cornerSpeed(radius: number, turning: TurningSettings, speed: SpeedSettings): number {
  const { tightestTurnSlow: slow, tightestTurnFast: fast, turnCurve } = turning
  if (radius < slow) return 0
  if (radius >= fast || fast <= slow) return topSpeed(speed)
  return topSpeed(speed) * ((radius - slow) / (fast - slow)) ** (1 / turnCurve)
}

/**
 * The fastest over a crest without being thrown off it, m/s: its slope turns
 * from `before` to `after` (radians, up positive) over `distance` metres, and
 * past this speed the ground falls away faster than gravity pulls you down.
 * Infinity where it doesn't fall away (level, a steady slope, a dip).
 */
export function crestSpeed(before: number, after: number, distance: number, gravity: number): number {
  const bend = (before - after) / distance // radians a metre, over the top
  if (bend <= 1e-9) return Infinity
  return Math.sqrt((gravity * Math.cos((before + after) / 2)) / bend)
}

/**
 * The fastest off a crest for a hop of at most `airtime` seconds, m/s: its
 * slope drops from `before` to `after` (radians, up positive), and leaving it
 * at v you're up for about 2 v sin(drop) / (g cos(after)). The more it drops
 * away, the slower; Infinity where it doesn't.
 */
export function hopSpeed(before: number, after: number, airtime: number, gravity: number): number {
  const drop = before - after
  if (drop <= 1e-9) return Infinity
  return (airtime * gravity * Math.cos(after)) / (2 * Math.sin(drop))
}

/**
 * The speed to ride at now, m/s: slow enough to brake down to each speed
 * needed ahead (`distance` metres on) in time, braking at `braking` m/s²;
 * with nothing ahead, flat out (Infinity).
 */
export function speedToMake(ahead: readonly { distance: number; speed: number }[], braking: number): number {
  let most = Infinity
  for (const { distance, speed } of ahead) most = Math.min(most, Math.sqrt(speed * speed + 2 * braking * Math.max(distance, 0)))
  return most
}

/**
 * The speed to ride up to a kicker's lip at, m/s, on ground `height` metres
 * up: climbing to the lip costs speed (as on a real bike), so the further
 * below it, the faster, to leave it at the jump's speed.
 */
export function windUpSpeed(jump: JumpSpot, height: number, gravity: number): number {
  return Math.sqrt((jump.speed / 3.6) ** 2 + 2 * gravity * Math.max(jump.lip.y - height, 0))
}

/** The way from heading `b` to heading `a`, -180 to 180 degrees (positive: `a` is to the right). */
export function turnBetween(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
