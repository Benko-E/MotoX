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
  hills: number
}

export interface TurningSettings {
  tightestTurnSlow: number
  tightestTurnFast: number
  turnCurve: number
}

/**
 * The engine and the air, like a real bike's. The engine has a limited
 * power: past a third of top speed, going twice as fast it pulls half as
 * hard (so a climb, which needs more pull, costs speed); below that the tyre
 * can only grip so hard, and it pulls the same all the way from a standstill.
 * The air holds back k * v², always, throttle or not. On the flat they meet
 * at exactly topSpeed; downhill gravity can push past it until the air reins
 * it in. Their strength (k) is whatever gets you to 60 in secondsTo60.
 */
function airStrength(speed: SpeedSettings): number {
  const top = Math.max(speed.topSpeed * KMH, SIXTY * 1.05)
  const key = `${top} ${speed.secondsTo60}`
  let k = strengths.get(key)
  if (k === undefined) {
    // engine minus air is k * pull(v), so the time to 60 is (time with k = 1) / k
    const pull = (v: number) => Math.min(3 * top * top, top ** 3 / Math.max(v, 1e-9)) - v * v
    const steps = 400
    let time = 0
    for (let i = 0; i < steps; i++) time += SIXTY / steps / pull(((i + 0.5) / steps) * SIXTY)
    k = time / Math.max(speed.secondsTo60, 0.1)
    if (strengths.size > 50) strengths.clear()
    strengths.set(key, k)
  }
  return k
}
const strengths = new Map<string, number>()

/** How hard full throttle pulls at `v` m/s (forward), before the air and the hill. */
export function engineAcceleration(speed: SpeedSettings, v: number): number {
  const top = Math.max(speed.topSpeed * KMH, SIXTY * 1.05)
  const k = airStrength(speed)
  return Math.min(3 * k * top * top, (k * top ** 3) / Math.max(v, 1e-9))
}

/** How hard the air holds the bike back at `v` m/s, m/s². */
export function airDrag(speed: SpeedSettings, v: number): number {
  return airStrength(speed) * v * v
}

/** Off the throttle the engine holds back too: with the air, coastSlowdown at 60 km/h. m/s². */
export function engineBraking(speed: SpeedSettings): number {
  return Math.max(speed.coastSlowdown * KMH - airDrag(speed, SIXTY), 0)
}

/** Full brake, m/s². */
export function brakeDeceleration(speed: SpeedSettings): number {
  return SIXTY / Math.max(speed.secondsToStopFrom60, 0.1)
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
