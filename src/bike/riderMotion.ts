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
  /** Speeding up or slowing down this hard shifts his weight all the way, m/s². */
  shiftFull: number
  /** How far he leans back speeding up, and forward slowing down, all the way, 0 to 1. */
  leanBack: number
  leanForward: number
  /** Seconds his weight takes to shift. */
  shiftTime: number
  /** The inside foot comes out in turns slower than this, km/h (gone by 10 km/h faster). */
  footOutBelow: number
  /** ...steering harder than this share of the tightest turn, 0 to 1 (all the way out at full steering). */
  footOutFrom: number
  /** How far his head turns to look into a turn at full steering, degrees. */
  headTurn: number
}

/** The foot comes out over this many km/h above footOutBelow. */
const FOOT_FADE = 10
/** Seconds the foot takes to come out, and to go back on the peg. */
const FOOT_OUT_TIME = 0.15
const FOOT_IN_TIME = 0.2
/** Seconds his head takes to turn. */
const LOOK_TIME = 0.15
const DEG = Math.PI / 180

/**
 * What the rider is doing with his body, worked out from the ride each
 * frame: sitting or standing on the pegs, crouching to soak up a landing,
 * shifting his weight back and forward as the bike speeds up and slows down,
 * putting the inside foot out in slow tight turns, and looking into turns.
 * Only looks.
 */
export class RiderMotion {
  /** 0 sitting down to 1 standing on the pegs. */
  standing = 0
  /** How deep he's crouched soaking up a landing, 0 to crouchDepth. */
  absorb = 0
  /** -1 leaning back to 1 leaning forward. */
  lean = 0
  /** A foot out: -1 the left one all the way, 1 the right one. */
  legOut = 0
  /** How far his head turns, radians (negative = to the right). */
  look = 0

  private soakTo = 0
  private wasAirborne = false
  private lastSpeed = 0

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

    // Weight: back as the bike speeds up, forward as it slows (braking,
    // climbing); level in the air.
    const speeding = dt > 0 ? (Math.abs(ride.speed) - Math.abs(this.lastSpeed)) / dt : 0
    this.lastSpeed = ride.speed
    const shift = ride.airborne ? 0 : clamp(Math.abs(speeding) / Math.max(s.shiftFull, 1e-6))
    // ...unless he's putting his weight back or forward himself (the arrow keys)
    const leanTo = ride.riderLean !== 0 ? ride.riderLean : speeding > 0 ? -shift * s.leanBack : shift * s.leanForward
    this.lean += (leanTo - this.lean) * ease(dt, s.shiftTime)

    // The inside foot comes out in slow, tight turns, and powersliding.
    let legTo = 0
    if (!ride.airborne) {
      const tight = smoothstep((Math.abs(ride.steering) - s.footOutFrom) / Math.max(1 - s.footOutFrom, 1e-6))
      const slow = clamp((s.footOutBelow + FOOT_FADE - kmh) / FOOT_FADE)
      legTo = Math.max(ride.sliding * Math.abs(ride.steering), tight * slow) * Math.sign(ride.steering)
    }
    const outward = Math.abs(legTo) > Math.abs(this.legOut) && legTo * this.legOut >= 0
    this.legOut += (legTo - this.legOut) * ease(dt, outward ? FOOT_OUT_TIME : FOOT_IN_TIME)

    // Looking where he's going.
    this.look += (-ride.steering * s.headTurn * DEG - this.look) * ease(dt, LOOK_TIME)
  }
}

function ease(dt: number, seconds: number): number {
  return seconds > 0 ? 1 - Math.exp(-dt / seconds) : 1
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function smoothstep(t: number): number {
  const c = clamp(t)
  return c * c * (3 - 2 * c)
}
