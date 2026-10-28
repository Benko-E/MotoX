/**
 * Smooth following, the same on every screen. Each call moves `current` part
 * of the way to `target`, more for a longer frame, so after one second it has
 * covered the same distance whether that second had 60 frames or 144.
 *
 * `lag` is in seconds: after one lag the value has covered about 63% of the
 * way, after three about 95%. 0 means no lag at all.
 */
export function smoothToward(current: number, target: number, lag: number, dt: number): number {
  if (lag <= 0) return target
  return target + (current - target) * Math.exp(-dt / lag)
}

/** The same for an angle in degrees, always turning the short way round. */
export function smoothAngleToward(current: number, target: number, lag: number, dt: number): number {
  const difference = ((((target - current) % 360) + 540) % 360) - 180
  return smoothToward(current, current + difference, lag, dt)
}
