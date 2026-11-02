import { WHEELBASE } from './bike/bikeModel'

/**
 * How the bike rides, dead simple: no physics, the bike goes where you point
 * it. W speeds it up, S slows it down (and reverses slowly from a stop), A/D
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

export class Ride {
  /** Where the bike is on the ground, metres. */
  x = 0
  z = 0
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

  step(input: Input, tune: Tuning, dt: number, radius: number): void {
    const h = HANDLING
    const top = tune.topSpeed * KMH
    const hundred = 100 * KMH
    const before = this.speed
    if (input.throttle) {
      this.speed = Math.min(this.speed + (hundred / tune.zeroToHundred) * dt, top)
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

    this.x += Math.sin(this.heading) * this.speed * dt
    this.z -= Math.cos(this.heading) * this.speed * dt
    this.spin += (this.speed * dt) / radius
  }
}
