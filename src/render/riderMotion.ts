import type { Bike } from '../physics/bike'

/**
 * What the placeholder rider is doing with his body, worked out from the bike
 * each frame: sitting or standing on the pegs, crouching to soak up a landing,
 * and putting a foot out in tight turns and powerslides. Only looks.
 */

const DEG = Math.PI / 180
/** Sits below this speed and stands above the next, km/h; in between, part way. */
const SIT_BELOW = 15
const STAND_ABOVE = 35
/** Seconds it takes to stand up or sit down. */
const STAND_TIME = 0.3
/** Hitting the ground this fast crouches all the way, m/s straight into it. */
const SOAK_FULL = 9
/** Seconds the crouch takes to go down on landing, and to come back up. */
const SOAK_DOWN = 0.05
const SOAK_BACK = 0.3
/** In a turn leaning further than the first, the inside foot comes out; all the way by the second, degrees. */
const LEG_OUT_FROM = 18
const LEG_OUT_FULL = 32
/** ...but only in slow turns: fully below the first speed, not at all above the second, km/h. */
const LEG_OUT_SLOW = 40
const LEG_OUT_FAST = 50
/** Seconds the foot takes to come out, and to go back on the peg. */
const LEG_OUT_TIME = 0.15
const LEG_IN_TIME = 0.2

export class RiderMotion {
  /** 0 sitting down to 1 standing on the pegs. */
  standing = 0
  /** How deep he's crouched soaking up a landing, 0 to 1. */
  absorb = 0
  /** A foot out: -1 the left one all the way, 1 the right one. */
  legOut = 0

  private soakTo = 0
  private wasInAir = false
  private readonly lastVelocity = { x: 0, y: 0, z: 0 }

  /** Call once a frame. */
  update(bike: Bike, dt: number): void {
    const inAir = !bike.wheels.some((wheel) => wheel.onGround)
    const v = bike.body.linvel()
    const kmh = Math.hypot(v.x, v.z) * 3.6

    // Landing: crouch as deep as the hit was hard (how fast the bike was
    // going straight into the ground just before), then come back up.
    if (this.wasInAir && !inAir) {
      const n = bike.groundNormal ?? { x: 0, y: 1, z: 0 }
      const into = -(this.lastVelocity.x * n.x + this.lastVelocity.y * n.y + this.lastVelocity.z * n.z)
      this.soakTo = Math.max(this.soakTo, clamp(into / SOAK_FULL, 0, 1))
    }
    if (inAir) Object.assign(this.lastVelocity, { x: v.x, y: v.y, z: v.z })
    this.wasInAir = inAir
    this.absorb += (this.soakTo - this.absorb) * ease(dt, SOAK_DOWN)
    this.soakTo += (0 - this.soakTo) * ease(dt, SOAK_BACK)

    // Standing on the pegs at speed and in the air, sitting when slow.
    const standTo = inAir ? 1 : clamp((kmh - SIT_BELOW) / (STAND_ABOVE - SIT_BELOW), 0, 1)
    this.standing += (standTo - this.standing) * ease(dt, STAND_TIME)

    // The inside foot comes out in a powerslide, and in tight slow turns.
    let legTo = 0
    if (!inAir && bike.wheels[0].onGround) {
      const leaning = Math.abs(bike.lean) / DEG
      const tight = smoothstep((leaning - LEG_OUT_FROM) / (LEG_OUT_FULL - LEG_OUT_FROM))
      const slow = clamp((LEG_OUT_FAST - kmh) / (LEG_OUT_FAST - LEG_OUT_SLOW), 0, 1)
      const inside = Math.abs(bike.lean) > DEG ? Math.sign(bike.lean) : Math.sign(bike.controls.steer)
      legTo = Math.max(bike.powersliding, tight * slow) * inside
    }
    const outward = Math.abs(legTo) > Math.abs(this.legOut) && legTo * this.legOut >= 0
    this.legOut += (legTo - this.legOut) * ease(dt, outward ? LEG_OUT_TIME : LEG_IN_TIME)
  }
}

function ease(dt: number, seconds: number): number {
  return seconds > 0 ? 1 - Math.exp(-dt / seconds) : 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function smoothstep(t: number): number {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}
