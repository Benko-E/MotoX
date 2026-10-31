import { leanToLand, steerOntoLine, windUpSpeed } from '../ai/riding'
import { EARTH_GRAVITY, type Config } from '../config'
import { Bike } from '../physics/bike'
import { CrashWatcher } from '../physics/crashes'
import { PhysicsWorld } from '../physics/world'
import { heightAt, type Heightfield } from '../terrain/heightfield'
import type { JumpSpot, Point } from './jumps'

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
  /** How high the middle of the bike rode above the ground on the run-up, metres. */
  rideHeight: number
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
    // it comes in faster, by what climbing to the lip costs, to leave it at the jump's speed
    const wanted = (x: number, z: number) => windUpSpeed(jump, heightAt(this.field, x, z), gravity)
    const forward = { x: Math.sin(jump.heading * DEG), z: -Math.cos(jump.heading * DEG) }

    bike.setCrashed(false)
    bike.placeOnGround(start.x, start.z, jump.heading)
    const startSpeed = wanted(start.x, start.z)
    bike.body.setLinvel({ x: forward.x * startSpeed, y: 0, z: forward.z * startSpeed }, true)

    const runUp = Math.hypot(jump.lip.x - start.x, jump.lip.z - start.z)
    const timeLimit = runUp / target + jump.airtime * 2 + 3
    let phase: 'runUp' | 'flying' | 'landed' = 'runUp'
    let flight: Point[] = []
    let airtime = 0
    let speed = 0
    let landedFor = 0
    let pitchBefore = bike.pitch
    let rideHeights = 0
    let rideSteps = 0
    const rideHeight = () => (rideSteps ? rideHeights / rideSteps : 0)
    const turnedDown = (reason: string): GhostRide => ({ landed: false, reason, flight, airtime: airtime || flight.length * dt, speed, rideHeight: rideHeight() })

    for (let t = 0, steps = 0; t < timeLimit; t += dt) {
      if (++steps % STEPS_PER_PAUSE === 0) yield
      const inAir = bike.wheels.every((wheel) => !wheel.onGround)
      const pitch = bike.pitch
      const pitchRate = (pitch - pitchBefore) / dt
      pitchBefore = pitch

      const controls = bike.controls
      const here = bike.body.translation()
      controls.throttle = !inAir && bike.forwardSpeed < wanted(here.x, here.z) ? 1 : 0
      controls.steer = steerOntoLine(bike.body.translation(), bike.heading, jump)
      controls.lean = inAir ? leanToLand(bike, (x, z) => heightAt(this.field, x, z), pitchRate) : 0

      bike.update(dt)
      this.physics.step(dt, gravity)
      bike.record()
      crashes.step(dt)
      if (crashes.crashed) return turnedDown(`crashed: ${crashes.reason}`)

      const nowInAir = bike.wheels.every((wheel) => !wheel.onGround)
      const { x, y, z } = bike.body.translation()
      const pastLip = (x - jump.lip.x) * forward.x + (z - jump.lip.z) * forward.z
      if (phase === 'runUp') {
        if (!nowInAir) {
          rideHeights += y - heightAt(this.field, x, z)
          rideSteps++
        }
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
        return bike.forwardSpeed >= STILL_ROLLING ? { landed: true, flight, airtime, speed, rideHeight: rideHeight() } : turnedDown('stopped dead after landing')
      }
    }
    return turnedDown(phase === 'runUp' ? 'never took off' : 'still going at the time limit')
  }
}
