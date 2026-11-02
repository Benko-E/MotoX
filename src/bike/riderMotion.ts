import type { Ride } from '../ride'

/** How the rider moves, read live so the debug menu applies at once. */
export interface RiderMotionSettings {
  /** Sits below this speed and stands above the next, km/h; in between, part way. */
  sitBelow: number
  standAbove: number
  /** Seconds it takes to stand up or sit down. */
  standTime: number
  /** Hitting the ground this fast crouches all the way, m/s straight into it. */
  hardestLanding: number
  /** How deep "all the way" is, 0 to 1.5 (1 = the rider's full crouch). */
  crouchDepth: number
  /** Seconds the crouch takes to go down on landing, and to come back up. */
  soakDown: number
  soakBack: number
}

/**
 * What the rider is doing with his body, worked out from the ride each
 * frame: sitting or standing on the pegs, and crouching to soak up a
 * landing. Only looks.
 */
export class RiderMotion {
  /** 0 sitting down to 1 standing on the pegs. */
  standing = 0
  /** How deep he's crouched soaking up a landing, 0 to crouchDepth. */
  absorb = 0

  private soakTo = 0
  private wasAirborne = false

  constructor(private readonly settings: RiderMotionSettings) {}

  /** Call once a frame, after the ride has stepped. */
  update(ride: Ride, dt: number): void {
    const s = this.settings
    // Landing: crouch as deep as the hit was hard, then come back up.
    if (this.wasAirborne && !ride.airborne) {
      this.soakTo = Math.max(this.soakTo, clamp(ride.impact / Math.max(s.hardestLanding, 1e-6)) * s.crouchDepth)
    }
    this.wasAirborne = ride.airborne
    this.absorb += (this.soakTo - this.absorb) * ease(dt, s.soakDown)
    this.soakTo -= this.soakTo * ease(dt, s.soakBack)

    // Standing on the pegs at speed and in the air, sitting when slow.
    const kmh = Math.abs(ride.speed) * 3.6
    const standTo = ride.airborne ? 1 : clamp((kmh - s.sitBelow) / Math.max(s.standAbove - s.sitBelow, 1e-6))
    this.standing += (standTo - this.standing) * ease(dt, s.standTime)
  }
}

function ease(dt: number, seconds: number): number {
  return seconds > 0 ? 1 - Math.exp(-dt / seconds) : 1
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
