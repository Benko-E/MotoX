import { EARTH_GRAVITY, type Config } from '../config'
import { Bike } from '../physics/bike'
import { CrashWatcher } from '../physics/crashes'
import { PhysicsWorld } from '../physics/world'
import { heightAt, type Heightfield } from '../terrain/heightfield'
import type { JumpSpot, Point } from './jumpFinder'

/**
 * An invisible bike that tries a jump for real: the same bike, the same
 * physics and the same crash rules as yours, in a physics world of its own on
 * the same ground, so nobody sees it and it can't bump into you. It starts at
 * the bottom of the run-up at the jump's speed, holds that speed, keeps to
 * the line, keeps the bike level with the ground below in the air, and lands.
 *
 * What it flew is what the letters sit on: the jump finder's flight is simple
 * maths, so only a real ride shows where a bike really goes.
 */

export interface GhostRide {
  /** Took off and landed without crashing. */
  landed: boolean
  /** Why not, in words, when it didn't. */
  reason?: string
  /** Where the bike's middle flew, from lift-off to touchdown, one point per physics step. */
  flight: Point[]
  /** How long it flew, seconds, and how fast it was going as it took off, km/h. */
  airtime: number
  speed: number
}

const DEG = Math.PI / 180
/** The take-off is looked for from this far before the lip to this far past it, metres. Hops before that are bumps on the run-up. */
const TAKE_OFF_ZONE = 10
/** Shorter hops than this are bumps, not the jump, seconds. */
const MIN_FLIGHT = 0.25
/** After touching down it rides on this long, so a crash straight after the landing still counts, seconds. */
const RIDE_OUT = 0.75
/** And then it has to be rolling on at least this fast, m/s: not stopped dead or bounced back off something. */
const STILL_ROLLING = 3
/** Steering back onto the line: full lock this many metres off it, or this many degrees turned off it. */
const OFF_LINE = 4
const TURNED_OFF = 20
/** Leaning in the air: full lean this many degrees off the ground's slope, and how much it eases off for the spin it already has (seconds). */
const PITCH_OFF = 15
const SPIN_EASE = 0.25
/** In the air it lines up with the ground this far ahead of where it is, seconds. */
const LOOK_AHEAD = 0.3
/** Riding a bit at a time, it pauses after this many physics steps (a few milliseconds' work). */
const STEPS_PER_PAUSE = 60

export class GhostRider {
  private readonly physics = new PhysicsWorld()
  private readonly bike: Bike

  constructor(
    private readonly field: Heightfield,
    /** The game's settings, read live: the ghost rides with the same bike and rules as you. */
    private readonly settings: Config,
  ) {
    this.physics.setGround(field)
    this.bike = new Bike(this.physics, settings.bike, settings.advanced.bikeBody)
  }

  /** Lets go of its physics world. It can't ride after this. */
  dispose(): void {
    this.physics.world.free()
  }

  /** Rides `jump` all in one go. */
  ride(jump: JumpSpot): GhostRide {
    const ride = this.rideGradually(jump)
    let step = ride.next()
    while (!step.done) step = ride.next()
    return step.value
  }

  /** Rides `jump`, pausing every few physics steps so the game can run frames in between. */
  *rideGradually(jump: JumpSpot): Generator<void, GhostRide> {
    const { bike, settings } = this
    // crashes always count for the ghost, even when they're turned off for you
    const crashes = new CrashWatcher(
      this.physics,
      bike,
      { ...settings.crashes, enabled: true },
      settings.advanced.fallingOver,
      settings.jumps.landing,
    )
    const dt = 1 / settings.advanced.physics.stepHz
    const gravity = settings.jumps.gravity * EARTH_GRAVITY
    const target = jump.speed / 3.6
    const start = jump.runUp[0]
    const forward = { x: Math.sin(jump.heading * DEG), z: -Math.cos(jump.heading * DEG) }

    bike.setCrashed(false)
    bike.placeOnGround(start.x, start.z, jump.heading)
    bike.body.setLinvel({ x: forward.x * target, y: 0, z: forward.z * target }, true)

    const runUp = Math.hypot(jump.lip.x - start.x, jump.lip.z - start.z)
    const timeLimit = runUp / target + jump.airtime * 2 + 3
    let phase: 'runUp' | 'flying' | 'landed' = 'runUp'
    let flight: Point[] = []
    let airtime = 0
    let speed = 0
    let landedFor = 0
    let pitchBefore = bike.pitch
    const turnedDown = (reason: string): GhostRide => ({ landed: false, reason, flight, airtime: airtime || flight.length * dt, speed })

    for (let t = 0, steps = 0; t < timeLimit; t += dt) {
      if (++steps % STEPS_PER_PAUSE === 0) yield
      const inAir = bike.wheels.every((wheel) => !wheel.onGround)
      const pitch = bike.pitch
      const pitchRate = (pitch - pitchBefore) / dt
      pitchBefore = pitch

      const controls = bike.controls
      controls.throttle = !inAir && bike.forwardSpeed < target ? 1 : 0
      controls.steer = this.steerBack(jump, forward)
      controls.lean = inAir ? this.leanToLand(pitch, pitchRate) : 0

      bike.update(dt)
      this.physics.step(dt, gravity)
      bike.record()
      crashes.step(dt)
      if (crashes.crashed) return turnedDown(`crashed: ${crashes.reason}`)

      const nowInAir = bike.wheels.every((wheel) => !wheel.onGround)
      const { x, y, z } = bike.body.translation()
      const pastLip = (x - jump.lip.x) * forward.x + (z - jump.lip.z) * forward.z
      if (phase === 'runUp') {
        if (nowInAir && pastLip > -TAKE_OFF_ZONE) {
          phase = 'flying'
          speed = bike.speed * 3.6
          flight = [{ x, y, z }]
        } else if (pastLip > TAKE_OFF_ZONE) return turnedDown('never took off')
      } else if (phase === 'flying') {
        if (nowInAir) flight.push({ x, y, z })
        else if (flight.length * dt < MIN_FLIGHT) phase = 'runUp' // only a bump
        else {
          phase = 'landed'
          airtime = flight.length * dt
        }
      } else if ((landedFor += dt) >= RIDE_OUT) {
        return bike.forwardSpeed >= STILL_ROLLING ? { landed: true, flight, airtime, speed } : turnedDown('stopped dead after landing')
      }
    }
    return turnedDown(phase === 'runUp' ? 'never took off' : 'still going at the time limit')
  }

  /** Steering that brings the bike back onto the jump's line, -1 (left) to 1 (right). */
  private steerBack(jump: JumpSpot, forward: { x: number; z: number }): number {
    const p = this.bike.body.translation()
    const offRight = (p.x - jump.lip.x) * -forward.z + (p.z - jump.lip.z) * forward.x // metres right of the line
    const turnedRight = ((this.bike.heading - jump.heading + 540) % 360) - 180
    return clamp(-(offRight / OFF_LINE + turnedRight / TURNED_OFF), -1, 1)
  }

  /** Leaning that keeps the bike lined up with the slope it's about to land on, -1 (back) to 1 (forward). */
  private leanToLand(pitch: number, pitchRate: number): number {
    const { bike, field } = this
    const p = bike.body.translation()
    const v = bike.body.linvel()
    const ahead = { x: p.x + v.x * LOOK_AHEAD, z: p.z + v.z * LOOK_AHEAD }
    const across = Math.hypot(v.x, v.z) || 1
    const step = 2
    const dx = (v.x / across) * step
    const dz = (v.z / across) * step
    const slope = Math.atan((heightAt(field, ahead.x + dx, ahead.z + dz) - heightAt(field, ahead.x - dx, ahead.z - dz)) / (2 * step))
    // nose higher than the slope: lean forward; already turning that way: ease off
    return clamp(((pitch - slope) / DEG) / PITCH_OFF + pitchRate * SPIN_EASE, -1, 1)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
