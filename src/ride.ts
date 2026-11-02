import { WHEELBASE } from './bike/bikeModel'

/**
 * How the bike rides, dead simple: no physics, the bike goes where you point
 * it. W speeds it up (hardest from a standstill), S slows it down (and
 * reverses slowly from a stop), A/D
 * turn it. The numbers you tune live in the debug menu (Tuning); the rest are
 * in HANDLING.
 *
 * Turning: the tightest turn the bike can make is whichever circle is bigger of
 * - the front wheel's: wheelbase / tan(front wheel lock);
 * - grip's: speed² / grip, how tight the tyres can hold at this speed.
 * Slow, the front wheel decides; fast, grip does, and turns get wider.
 * A/D ask for a share of that tightest turn: all of it held, none let go,
 * swinging between them over barsSwing. So turning in and straightening up
 * are equally quick at any speed.
 *
 * Up and down, just as simple: on the ground the bike follows it, gravity
 * pulling it back down slopes (Slope pull), and it leaves
 * it wherever the ground drops away faster than gravity could pull the bike
 * down after it (off a ramp's lip). In the air, gravity pulls it down and
 * nothing else changes: no throttle, brakes or turning until it lands.
 */
export const HANDLING = {
  /** Fastest backwards, holding S from a stop, km/h. */
  reverseSpeed: 8,
  /** Seconds the steering takes to swing over (and back when you let go). */
  barsSwing: 0.12,
}

/** The numbers tuned in the debug menu's Bike tab. */
export interface Tuning {
  /** km/h. */
  topSpeed: number
  /** Seconds from 0 to 100 km/h, holding W. */
  zeroToHundred: number
  /** Seconds from 100 km/h to a stop with nothing held. */
  coastToStop: number
  /** Seconds from 100 km/h to a stop, holding S. */
  brakeToStop: number
  /** How far the front wheel turns either way, degrees. */
  frontWheelLock: number
  /** How hard the tyres can push sideways, g. */
  grip: number
  /** How much of gravity along a slope pulls the bike back uphill and on downhill, 0 to 1.5. */
  slopePull: number
}

export interface Input {
  throttle: boolean
  brake: boolean
  left: boolean
  right: boolean
}

const KMH = 1 / 3.6
const DEG = Math.PI / 180
const G = 9.81
/** How far behind the bike the ground is felt to find its slope, metres. */
const SLOPE_FEEL = 0.05
/** Air shorter than this is a bump, not a jump: the airtime isn't shown, seconds. */
export const MIN_AIRTIME = 0.15
/** How far ahead of a landing the ground is felt to find the slope landed on, metres. */
const IMPACT_FEEL = 0.3

/** The height of the ground at a point, metres. */
export type Ground = (x: number, z: number) => number

export class Ride {
  /** Where the bike is, metres: across the ground, and its height (of the ground under the middle of the bike while on it). */
  x = 0
  z = 0
  y = 0
  /** How fast it's going up, m/s (negative coming down). */
  vy = 0
  /** Whether it's in the air, and its speed along the ground while it is, m/s. */
  airborne = false
  private airSpeed = 0
  /** How long it's been in the air this jump (or was, once landed), seconds. */
  airtime = 0
  /** How hard the last landing hit, m/s straight into the ground. */
  impact = 0
  /** How far its nose points up, radians: along the ground's slope, or the way it's flying. */
  pitch = 0
  /** Which way it points, radians: 0 toward -z, growing as it turns right. */
  heading = 0
  /** Forward speed, m/s (negative rolling backwards). */
  speed = 0
  /** How hard it slowed down this step, m/s² (0 when speeding up or standing). */
  slowing = 0
  /** How much of the tightest turn the rider is asking for: -1 all of it left, 0 straight, 1 all of it right. */
  steering = 0
  /** How far the rider is asking the bars to turn, degrees (positive = right): the steering share of full lock. */
  bars = 0
  /** How far the front wheel actually turns, degrees: the bars, or less where grip can't hold that tight a turn. */
  wheelAngle = 0
  /** What A/D are asking for: -1 full left, 0 straight, 1 full right. */
  steer = 0
  /** The circle the bike is riding round, metres (Infinity going straight). */
  turnRadius = Infinity
  /** How fast the bike swings round, degrees per second (positive = right). */
  turnRate = 0
  /** What's setting the turn radius: the front wheel's lock, grip, or nothing (going straight). */
  limit: 'front wheel' | 'grip' | null = null
  /** How far the wheels have rolled, radians. */
  spin = 0

  step(input: Input, tune: Tuning, dt: number, radius: number, ground: Ground): void {
    const h = HANDLING
    if (this.airborne) {
      this.fly(dt, radius, ground)
      return
    }
    const top = tune.topSpeed * KMH
    const hundred = 100 * KMH
    const before = this.speed

    // The slope just behind the bike (the way it's going), so on the step
    // that crosses a lip it's still the ramp's slope: rise per metre along the heading.
    const sin = Math.sin(this.heading)
    const cos = Math.cos(this.heading)
    const going = this.speed < 0 ? -1 : 1
    const behind = ground(this.x - sin * SLOPE_FEEL * going, this.z + cos * SLOPE_FEEL * going)
    const slope = (going * (ground(this.x, this.z) - behind)) / SLOPE_FEEL
    // Gravity along the slope pulls back down it, uphill or down (sin of its
    // angle). Before throttle and brakes, so coasting or braking can hold the bike still.
    this.speed -= G * tune.slopePull * (slope / Math.sqrt(1 + slope * slope)) * dt

    if (input.throttle) {
      // The engine pushes hardest from a standstill and runs out of push at
      // top speed: push = punch x (1 - (speed / top)²). Punch is set so 0 to
      // 100 still takes zeroToHundred (or to just under top speed, if that's
      // below 100). Climbing, gravity eats into what's left, so you slow down.
      const target = Math.min(hundred, 0.95 * top)
      const punch = (top * Math.atanh(target / top)) / tune.zeroToHundred
      this.speed += punch * Math.max(1 - (this.speed / top) ** 2, 0) * dt
    } else if (input.brake && this.speed > 0) {
      this.speed = Math.max(this.speed - (hundred / tune.brakeToStop) * dt, 0)
    } else if (input.brake) {
      this.speed = Math.max(this.speed - (hundred / tune.zeroToHundred) * dt, -h.reverseSpeed * KMH)
    } else {
      const roll = (hundred / tune.coastToStop) * dt
      this.speed = Math.sign(this.speed) * Math.max(Math.abs(this.speed) - roll, 0)
    }
    // lowering top speed below how fast you're going slows you down to it
    if (this.speed > top) this.speed = Math.max(top, this.speed - (hundred / tune.coastToStop) * dt)
    this.slowing = dt > 0 ? Math.max(Math.abs(before) - Math.abs(this.speed), 0) / dt : 0

    this.steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    this.steering += (this.steer - this.steering) * (1 - Math.exp(-dt / h.barsSwing))
    if (Math.abs(this.steering) < 1e-3) this.steering = 0
    this.bars = this.steering * tune.frontWheelLock
    // the tightest turn: whichever of the two circles is bigger
    const wheelRadius = WHEELBASE / Math.tan(tune.frontWheelLock * DEG)
    const gripRadius = (this.speed * this.speed) / (tune.grip * G)
    const tightest = Math.max(wheelRadius, gripRadius)
    // curvature (1 / radius), signed: positive turns right
    const curve = this.steering / tightest
    this.turnRadius = curve === 0 ? Infinity : 1 / Math.abs(curve)
    this.limit = curve === 0 ? null : gripRadius > wheelRadius ? 'grip' : 'front wheel'
    // the front wheel turns only as far as that circle takes
    this.wheelAngle = Math.atan(WHEELBASE * curve) / DEG
    // round the circle at this speed; backwards, it swings the other way
    const rate = this.speed * curve
    this.turnRate = rate / DEG
    this.heading += rate * dt

    // Along the ground: up or down a slope, part of the speed goes into climbing.
    const across = this.speed / Math.sqrt(1 + slope * slope)
    const climb = across * slope
    this.x += Math.sin(this.heading) * across * dt
    this.z -= Math.cos(this.heading) * across * dt
    this.spin += (this.speed * dt) / radius
    this.pitch = Math.atan(slope)

    // Thrown on along the slope, gravity would carry the bike to `thrown`; if
    // the ground drops away below that (off a lip), it leaves the ground.
    const height = ground(this.x, this.z)
    const thrown = this.y + climb * dt - 0.5 * G * dt * dt
    if (height < thrown - 1e-4) {
      this.airborne = true
      this.airSpeed = across
      this.airtime = 0
      this.vy = climb - G * dt
      this.y = thrown
    } else {
      this.vy = (height - this.y) / dt
      this.y = height
    }
  }

  /** A step in the air: gravity pulls it down, the rest carries on as it left the ground. */
  private fly(dt: number, radius: number, ground: Ground): void {
    this.vy -= G * dt
    this.x += Math.sin(this.heading) * this.airSpeed * dt
    this.z -= Math.cos(this.heading) * this.airSpeed * dt
    this.y += this.vy * dt
    this.spin += (this.speed * dt) / radius
    this.airtime += dt
    this.pitch = Math.atan2(this.vy, Math.abs(this.airSpeed))
    Object.assign(this, { steer: 0, steering: 0, bars: 0, wheelAngle: 0, turnRate: 0, turnRadius: Infinity, limit: null, slowing: 0 })

    const height = ground(this.x, this.z)
    if (this.y <= height) {
      // How hard it hit: its speed straight into the ground it landed on
      // (landing along a down slope barely hits at all).
      const going = this.airSpeed < 0 ? -1 : 1
      const ahead = ground(this.x + Math.sin(this.heading) * IMPACT_FEEL * going, this.z - Math.cos(this.heading) * IMPACT_FEEL * going)
      const slope = (ahead - height) / IMPACT_FEEL
      this.impact = Math.max((slope * Math.abs(this.airSpeed) - this.vy) / Math.sqrt(1 + slope * slope), 0)
      this.airborne = false
      this.y = height
      this.vy = 0
      this.speed = Math.sign(this.speed) * Math.abs(this.airSpeed)
    }
  }
}
