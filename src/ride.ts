/**
 * How the bike rides, dead simple: no physics, the bike goes where you point
 * it. W speeds it up, S slows it down (and reverses slowly from a stop), A/D
 * turn it. Every number that changes the feel is in SETTINGS.
 */
export const SETTINGS = {
  /** Fastest the bike goes, km/h. */
  topSpeed: 80,
  /** Seconds from standing still to top speed, holding W. */
  timeToTopSpeed: 4,
  /** Seconds to brake from top speed to a stop, holding S. */
  timeToStop: 1.5,
  /** Seconds to roll to a stop from top speed with nothing held. */
  rollToStop: 8,
  /** Fastest backwards, holding S from a stop, km/h. */
  reverseSpeed: 8,
  /** How fast the bike turns holding A or D, degrees per second. */
  turnRate: 110,
  /** Below this speed the bike turns less, down to not at all standing still, km/h. */
  fullTurnSpeed: 15,
  /** How far the bars turn holding A or D, degrees. */
  barsLock: 30,
  /** Seconds the bars take to swing over (and back when you let go). */
  barsSwing: 0.12,
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
  /** How far the bars are turned, degrees (positive = right). */
  bars = 0
  /** How far the wheels have rolled, radians. */
  spin = 0

  step(input: Input, dt: number, radius: number): void {
    const s = SETTINGS
    const top = s.topSpeed * KMH
    if (input.throttle) {
      this.speed = Math.min(this.speed + (top / s.timeToTopSpeed) * dt, top)
    } else if (input.brake && this.speed > 0) {
      this.speed = Math.max(this.speed - (top / s.timeToStop) * dt, 0)
    } else if (input.brake) {
      this.speed = Math.max(this.speed - (top / s.timeToTopSpeed) * dt, -s.reverseSpeed * KMH)
    } else {
      const roll = (top / s.rollToStop) * dt
      this.speed = Math.sign(this.speed) * Math.max(Math.abs(this.speed) - roll, 0)
    }

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    this.bars += (steer * s.barsLock - this.bars) * (1 - Math.exp(-dt / s.barsSwing))
    // turning grows with speed up to fullTurnSpeed; going backwards it turns the other way
    const grip = Math.min(Math.abs(this.speed) / (s.fullTurnSpeed * KMH), 1) * Math.sign(this.speed)
    this.heading += (this.bars / s.barsLock) * s.turnRate * DEG * grip * dt

    this.x += Math.sin(this.heading) * this.speed * dt
    this.z -= Math.cos(this.heading) * this.speed * dt
    this.spin += (this.speed * dt) / radius
  }
}
