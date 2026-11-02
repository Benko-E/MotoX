/**
 * How the bike rides, dead simple: no physics, the bike goes where you point
 * it. W speeds it up, S slows it down (and reverses slowly from a stop), A/D
 * turn it. The numbers you tune live in the debug menu (Tuning); the rest are
 * in HANDLING.
 */
export const HANDLING = {
  /** Fastest backwards, holding S from a stop, km/h. */
  reverseSpeed: 8,
  /** How fast the bike turns holding A or D, degrees per second. */
  turnRate: 110,
  /** Below this speed the bike turns less, down to not at all standing still, km/h. */
  fullTurnSpeed: 15,
  /** Seconds the bars take to swing over (and back when you let go). */
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
}

export interface Input {
  throttle: boolean
  brake: boolean
  left: boolean
  right: boolean
}

const KMH = 1 / 3.6
const DEG = Math.PI / 180

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
  /** How far the bars are turned, degrees (positive = right). */
  bars = 0
  /** Where the bars are heading: -1 full left, 0 straight, 1 full right. */
  steer = 0
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
    this.bars += (this.steer * tune.frontWheelLock - this.bars) * (1 - Math.exp(-dt / h.barsSwing))
    // turning grows with speed up to fullTurnSpeed; going backwards it turns the other way
    const grip = Math.min(Math.abs(this.speed) / (h.fullTurnSpeed * KMH), 1) * Math.sign(this.speed)
    const turning = tune.frontWheelLock > 0 ? this.bars / tune.frontWheelLock : 0
    this.heading += turning * h.turnRate * DEG * grip * dt

    this.x += Math.sin(this.heading) * this.speed * dt
    this.z -= Math.cos(this.heading) * this.speed * dt
    this.spin += (this.speed * dt) / radius
  }
}
