export interface SteeringStats {
  maxAngle: number
  halfAngleSpeed: number
  falloff: number
}

/**
 * How far the front wheel may turn at a speed (m/s), in degrees: all of
 * maxAngle when standing still, half of it at halfAngleSpeed, and less and
 * less above that. One smooth curve, so there is no speed at which steering
 * suddenly changes.
 */
export function maxSteerAngle(steering: SteeringStats, speed: number): number {
  const ratio = Math.abs(speed) / Math.max(steering.halfAngleSpeed, 0.01)
  return steering.maxAngle / (1 + ratio ** steering.falloff)
}
