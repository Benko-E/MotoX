import RAPIER from '@dimforge/rapier3d-compat'
import type { CrashSettings, FallingOverSettings, LandingSettings } from '../config'
import type { Bike } from './bike'
import { add, dot, rotate, vec, type Vec3 } from './vec'
import type { PhysicsWorld } from './world'

/**
 * Watches the bike for crashes, and puts it back up afterwards. It also
 * judges every landing after a jump: clean keeps all the speed; sloppy (a
 * near crash: nearly too sideways, or landing far nose-first or tail-first)
 * costs some speed and unsettles the bike for a moment; past the crash limits
 * it's a crash. Landing level is always clean, however high the jump.
 *
 * A crash is the rider's head touching the ground, a landing that's too far
 * off (nose-first or tail-first beyond `worstLandingAngle` to the slope, or
 * with more sideways speed than `worstSidewaysLanding`: a rider would be
 * flung over), or, as a safety net, the bike lying over sideways against the
 * ground. Anything less is left to the suspension and grip.
 *
 * While crashed the bike's controls are dead and it tumbles to a quick stop;
 * after `resetDelay` it's put back upright on the spot, facing the way it was
 * travelling.
 */

const DEG = Math.PI / 180
const UP = vec(0, 1, 0)
const FORWARD = vec(0, 0, -1)
const RIGHT = vec(1, 0, 0)
/** How big the rider's head is for touching the ground, metres. */
const HEAD_RADIUS = 0.15
/** Where the rider's head is, in the bike's own space: leaning back, sitting, leaning forward.
 * (The same places the placeholder rider is drawn.) */
export const HEAD_BACK = vec(0, 1.23, 0.2)
export const HEAD_SITTING = vec(0, 1.18, -0.14)
export const HEAD_FORWARD = vec(0, 1.08, -0.37)
/** Shorter than this in the air isn't a jump whose landing gets judged, seconds. */
const MIN_AIRTIME = 0.15
/** Right after being put back up nothing counts as a crash, seconds. */
const GRACE = 0.5
/** How close to the ground the bike's middle has to be for "tipped over" to count, metres. */
const NEAR_GROUND = 0.9

export class CrashWatcher {
  /** Crashed right now. */
  crashed = false
  /** Why the last crash happened, in words. */
  reason: string | null = null
  /** Crashes so far. */
  count = 0
  /** Seconds until the bike is put back up. */
  timeLeft = 0
  /** Landings judged so far. */
  landings = 0
  /** How the last one went: how sloppy (0 = clean, 1 = as sloppy as it gets) and the speed it cost, km/h. */
  lastLanding: { sloppiness: number; speedLost: number } | null = null

  private airborneFor = 0
  private grace = GRACE
  private getUpHeading = 0

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly bike: Bike,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: CrashSettings,
    readonly safety: FallingOverSettings,
    readonly landing: LandingSettings,
  ) {}

  /** Call after every physics step. */
  step(dt: number): void {
    if (this.crashed) {
      this.timeLeft -= dt
      if (this.timeLeft <= 0) this.recover()
      return
    }
    const anyDown = this.bike.wheels.some((wheel) => wheel.onGround)
    if (this.grace > 0) this.grace -= dt
    else {
      if (this.settings.enabled) {
        const reason = this.check(anyDown)
        if (reason) this.crash(reason)
      }
      const touchdown = this.bike.touchdown
      if (touchdown && !this.crashed) this.judgeLanding(touchdown.angle, touchdown.sideways)
    }
    this.airborneFor = anyDown ? 0 : this.airborneFor + dt
  }

  /** Back upright on the spot straight away, facing the way the bike was going. */
  recover(): void {
    const heading = this.crashed ? this.getUpHeading : this.bike.heading
    const { x, z } = this.bike.body.translation()
    this.bike.setCrashed(false)
    this.bike.placeOnGround(x, z, heading)
    this.crashed = false
    this.timeLeft = 0
    this.grace = GRACE
    this.airborneFor = 0
  }

  private crash(reason: string): void {
    this.crashed = true
    this.reason = reason
    this.count++
    this.timeLeft = this.settings.resetDelay
    this.getUpHeading = this.bike.travelHeading
    this.bike.setCrashed(true)
  }

  /** How sloppy a landing was: how near it came to a crash, from its angle to the ground (radians) and how fast it went sideways (m/s). */
  private judgeLanding(angle: number, sideways: number): void {
    const { landing, settings } = this
    const sloppiness = Math.max(
      between(Math.abs(sideways) * 3.6, landing.sloppySideways, settings.worstSidewaysLanding),
      between(Math.abs(angle) / DEG, landing.sloppyAngle, settings.worstLandingAngle),
    )
    const speedLost = sloppiness > 0 ? this.bike.landSloppily(sloppiness, landing) * 3.6 : 0
    this.lastLanding = { sloppiness, speedLost }
    this.landings++
  }

  private check(anyDown: boolean): string | null {
    const { settings, bike } = this
    const rotation = bike.body.rotation()
    if (this.headTouching()) return 'head hit the ground'

    // A landing after a jump: judged against the slope it lands on. (Checked
    // before tipping, so a bad landing is named for what went wrong.)
    if (anyDown && this.airborneFor >= MIN_AIRTIME) {
      const slope = bike.groundNormal ?? UP
      const noseUp = Math.asin(Math.max(-1, Math.min(1, dot(rotate(rotation, FORWARD), slope)))) / DEG
      if (noseUp < -settings.worstLandingAngle) return 'landed nose first'
      if (noseUp > settings.worstLandingAngle) return 'landed tail first'
      if (Math.abs(bike.slide) * 3.6 > settings.worstSidewaysLanding) return 'landed sideways too fast'
    }

    // Lying over sideways against the ground it's on. Only sideways: tipping
    // forward or back (wheelies, riding up a ramp, leaning back after a jump)
    // never counts; flips are caught by the head or the landing instead.
    const ground = bike.groundNormal ?? UP
    const sideways = Math.asin(Math.min(Math.abs(dot(rotate(rotation, RIGHT), ground)), 1)) / DEG
    if (sideways > this.safety.sideTip && this.nearGround(anyDown)) return 'fell over'
    return null
  }

  /** Whether the rider's head is touching anything solid. */
  private headTouching(): boolean {
    const { body, controls } = this.bike
    const head = add(body.translation(), rotate(body.rotation(), headPosition(controls.lean)))
    const hit = this.physics.world.intersectionWithShape(
      head, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(HEAD_RADIUS),
      undefined, undefined, undefined, body,
    )
    if (hit !== null) return true
    // Under the ground counts too: the head can go right through the
    // ground's surface (in the moment after getting up, when nothing counts)
    // and would otherwise never touch it again.
    const ground = this.physics.groundHeightAt(head.x, head.z, body)
    return ground !== null && head.y - HEAD_RADIUS < ground
  }

  private nearGround(anyDown: boolean): boolean {
    if (anyDown) return true
    const middle = this.bike.body.worldCom()
    const ground = this.physics.groundHeightAt(middle.x, middle.z, this.bike.body)
    return ground !== null && middle.y - ground < NEAR_GROUND
  }
}

/** How far `value` is from `clean` (0) to `worst` (1), held between 0 and 1. Past `clean` with `worst` no further on, it's 1. */
function between(value: number, clean: number, worst: number): number {
  return Math.min(Math.max((value - clean) / Math.max(worst - clean, 1e-6), 0), 1)
}

/** Where the head is in the bike's space for a lean of -1 (back) to 1 (forward). */
function headPosition(lean: number): Vec3 {
  const t = Math.min(Math.abs(lean), 1)
  const to = lean < 0 ? HEAD_BACK : HEAD_FORWARD
  return vec(0, HEAD_SITTING.y + (to.y - HEAD_SITTING.y) * t, HEAD_SITTING.z + (to.z - HEAD_SITTING.z) * t)
}
