/**
 * Turns the plain settings in the config (km/h, seconds, metres, "sag")
 * into the numbers the physics works with (metres per second, newtons).
 */

const KMH = 1 / 3.6
const SIXTY = 60 * KMH

export interface SpeedSettings {
  topSpeed: number
  secondsTo60: number
  secondsToStopFrom60: number
  coastSlowdown: number
}

export interface TurningSettings {
  tightestTurnSlow: number
  tightestTurnFast: number
  turnCurve: number
}

/**
 * Full-throttle acceleration fades from its strongest at a standstill to
 * nothing at top speed: a(v) = a0 * (1 - (v / top)^2). Getting from 0 to v60
 * along that curve takes (top / a0) * atanh(v60 / top), so this is the a0
 * that makes it take exactly secondsTo60.
 */
export function launchAcceleration(speed: SpeedSettings): number {
  const top = Math.max(speed.topSpeed * KMH, SIXTY * 1.05)
  return (top * Math.atanh(SIXTY / top)) / Math.max(speed.secondsTo60, 0.1)
}

/** How hard full throttle accelerates at `v` m/s (forward). */
export function driveAcceleration(speed: SpeedSettings, v: number): number {
  const top = Math.max(speed.topSpeed * KMH, SIXTY * 1.05)
  if (v >= top) return 0
  const fade = v > 0 ? 1 - (v / top) ** 2 : 1
  return launchAcceleration(speed) * fade
}

/** Full brake, m/s². */
export function brakeDeceleration(speed: SpeedSettings): number {
  return SIXTY / Math.max(speed.secondsToStopFrom60, 0.1)
}

/** With neither throttle nor brake, m/s². */
export function coastDeceleration(speed: SpeedSettings): number {
  return speed.coastSlowdown * KMH
}

/** The top speed in m/s. */
export function topSpeed(speed: SpeedSettings): number {
  return speed.topSpeed * KMH
}

/**
 * Radius of the tightest turn at `v` m/s, metres: tightestTurnSlow when
 * barely moving, tightestTurnFast at top speed, and in between along a curve
 * (turnCurve 1 = evenly with speed, higher stays tight longer).
 */
export function turnRadiusAt(turning: TurningSettings, speed: SpeedSettings, v: number): number {
  const share = Math.min(Math.abs(v) / Math.max(topSpeed(speed), 1), 1)
  return turning.tightestTurnSlow + (turning.tightestTurnFast - turning.tightestTurnSlow) * share ** turning.turnCurve
}

/**
 * The spring stiffness (N/m) that sinks in by `sag` of its `travel` under
 * `load` newtons, for a spring whose force is k * x * (1 + progression * (x / travel)^2).
 */
export function springRate(load: number, travel: number, sag: number, progression: number): number {
  const squeeze = Math.max(sag, 0.01) * travel
  return load / (squeeze * (1 + progression * Math.max(sag, 0.01) ** 2))
}

/**
 * Damping (N per m/s) from a plain 0-to-1-ish setting: 1 is exactly enough
 * to stop a bounce without overshooting, 0.5 half that, and so on.
 */
export function dampingRate(ratio: number, spring: number, load: number, gravity: number): number {
  return ratio * 2 * Math.sqrt(spring * (load / gravity))
}
