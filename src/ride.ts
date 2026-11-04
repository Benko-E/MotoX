import { WHEELBASE } from './bike/bikeModel'

/**
 * How the bike rides, dead simple: no physics, every number is set straight
 * in the debug menu's Bike tab. W speeds it up (hardest from a standstill),
 * S slows it down (and backs it up from a stop), and S wins if both are
 * held. A/D turn it round a circle: the Slow turn circle up to 30 km/h,
 * widening to the Fast one at top speed, Blend setting how. A/D swing the
 * steering over in Steering speed, and back when let go.
 *
 * Powerslides (Space and steer, like a handbrake): the rear swings out so
 * the bike points into the turn while it carries on along its line, the
 * turn tightens to Slide turn circle's share, and it loses Speed scrub
 * every second (the engine doesn't push while it slides). Let go of Space
 * or A/D and the rear hooks back up.
 *
 * Wheelies (lean back with the down arrow, and W): the front lifts and stays
 * up; let go of W and it stays up above Hold above. Up, the steering only
 * turns Wheelie steering's share as tight. No powerslides on one wheel.
 *
 * Up and down: on the ground the bike follows it, gravity pulling it back
 * down slopes (Slope pull), feeling the slope from wheel to wheel. Where the
 * ground drops away, the suspension stretches as far as its travel to keep
 * the wheels on it; past that (off a kicker's lip) the bike leaves the
 * ground. In the air: no throttle or brakes. It holds the angle it left the
 * lip at unless the arrows tilt it: all the way round is a flip. Holding
 * A/D as it leaves the lip, it spins that way at Spin rate for as long as
 * the key stays held; let go and the spin dies away over Spin stop, and
 * it's gone for that jump. Otherwise A/D only turn it gently (Air turn),
 * stopping when let go.
 *
 * Crashes: landing too far sideways to the way it's flying (fast enough),
 * or too far nose-down or tail-down to the ground. The bike falls over and
 * slides to a stop; a moment later it's back up, right there.
 */
/** Up to this speed, the bike turns in the Slow turn circle, km/h. */
export const SLOW_TURN_UNTIL = 30

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
  /** Fastest backwards, holding S from a stop, km/h. */
  reverseSpeed: number
  /** The turn circle's radius up to 30 km/h, and at top speed, metres. */
  slowCircle: number
  fastCircle: number
  /** How the turn widens from slow to fast: 0 evenly with speed, up to 1 staying tight longer and widening late. */
  circleBlend: number
  /** Seconds the steering takes to swing over (and back when you let go). */
  steerTime: number
  /** How much of gravity along a slope pulls the bike back uphill and on downhill, 0 to 1.5. */
  slopePull: number
  /** How far the rear swings out sliding at full steering, degrees. */
  slideAngle: number
  /** Seconds the rear takes to swing out, and to hook back up. */
  kickOut: number
  /** How big the slide's turn is next to the normal turn at that speed, 0.2 to 1.5. */
  slideCircle: number
  /** Speed sliding scrubs off at full steering, km/h per second. */
  slideScrub: number
  /** Seconds the front takes to come up, and to come back down. */
  liftTime: number
  /** Acceleration with the front up, as a share of normal (0.5 to 1.5). */
  wheelieAccel: number
  /** How much of the turn is left with the front up, 0 (none) to 1 (all of it). */
  wheelieSteer: number
  /** Above this speed the front stays up without W, km/h. */
  wheelieHold: number
  /** How far the front comes up in a full wheelie, degrees. */
  wheelieAngle: number
  /** Landing pointing more than this off the way it's flying crashes it, degrees. */
  sideLimit: number
  /** Slower than this, a crooked landing doesn't crash it, km/h. */
  sideMinSpeed: number
  /** Landing more than this nose-down or tail-down to the ground crashes it, degrees. */
  noseTailLimit: number
  /** Holding A/D off a lip, how fast it spins while the key stays held, degrees per second. */
  airSpinRate: number
  /** How fast A/D turn it in the air on top, degrees per second; it stops when let go. */
  airTurn: number
  /** Seconds a spin takes to die away to nothing, once its key is let go. */
  airSpinStop: number
  /** How fast the arrows tilt it in the air, degrees per second. */
  tiltRate: number
  /** Seconds down after a crash, before it's back up. */
  getUp: number
  /** How far the suspension stretches to keep the wheels on the ground as it drops away, metres. */
  travel: number
}

/** Which way the bike went down: over to its left or right, over the front, or looped out over the back. */
export type CrashWay = 'left' | 'right' | 'front' | 'back'

export interface Input {
  throttle: boolean
  brake: boolean
  left: boolean
  right: boolean
  /** Space: powerslide. */
  slide: boolean
  /** Arrow keys: the rider leans back (and with W, wheelies) or forward. */
  leanBack: boolean
  leanForward: boolean
}

const KMH = 1 / 3.6
const DEG = Math.PI / 180
const G = 9.81
/** Air shorter than this is a bump, not a jump: the airtime isn't shown, seconds. */
export const MIN_AIRTIME = 0.15
/** How far ahead of a landing the ground is felt to find the slope landed on, metres. */
const IMPACT_FEEL = 0.3

/** An angle brought round to between -half a turn and half a turn, radians. */
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
/** How fast the bike slides to a stop on its side, m/s². */
const CRASH_SLIDE = 9

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
  /** How far the rider turns the bars, degrees (positive = right): the steering share of the slow turn's wheel angle. */
  bars = 0
  /** How far the front wheel actually turns, degrees: enough for the circle it's riding round. */
  wheelAngle = 0
  /** What A/D are asking for: -1 full left, 0 straight, 1 full right. */
  steer = 0
  /** The circle the bike is riding round, metres (Infinity going straight). */
  turnRadius = Infinity
  /** How fast the bike swings round, degrees per second (positive = right). */
  turnRate = 0
  /** How it's turning: normally, powersliding, on a wheelie, or not (going straight). */
  limit: 'turning' | 'powerslide' | 'wheelie' | null = null
  /** How far into a powerslide it is, 0 (hooked up) to 1 (rear all the way out). */
  sliding = 0
  /** How far the bike's body points off the way it's going, radians (positive = nose to the right): the rear swung out. */
  slideYaw = 0
  /** How far the wheels have rolled, radians. */
  spin = 0
  /** How far up the front is, 0 (on the ground) to 1 (all the way up to the wheelie angle). */
  wheelie = 0
  /** Where the rider puts his weight: -1 all the way back, 0 in the middle, 1 all the way forward. */
  riderLean = 0
  /** How far the body has spun round in the air off the way it's flying, radians (positive = nose to the right). */
  airYaw = 0
  /** In the air: the spin it took off with, and the gentle turn A/D add on top, radians per second (positive = right). */
  private airSpin = 0
  private airSteer = 0
  /** Which key it took off spinning with (1 right, -1 left), until it's let go; then 0 for the rest of the jump. */
  private spinKey = 0
  /** Down: which way it went, and for how long, seconds. Null while riding. */
  crash: { way: CrashWay; time: number } | null = null

  /** Which way the bike's body points, radians: the way it's going, plus the rear swung out sliding. */
  get bodyHeading(): number {
    return this.heading + this.slideYaw + this.airYaw
  }

  /**
   * Where the middle of the bike's body is drawn: sliding, it swings about
   * the front wheel, which stays on the line, so the rear swings out.
   */
  get bodyX(): number {
    return this.x + (Math.sin(this.heading) - Math.sin(this.heading + this.slideYaw)) * (WHEELBASE / 2)
  }

  get bodyZ(): number {
    return this.z - (Math.cos(this.heading) - Math.cos(this.heading + this.slideYaw)) * (WHEELBASE / 2)
  }

  step(input: Input, tune: Tuning, dt: number, radius: number, ground: Ground): void {
    if (this.crash) {
      this.down(tune, dt, ground)
      return
    }
    this.riderLean = (input.leanForward ? 1 : 0) - (input.leanBack ? 1 : 0)
    // Wheelie: leaning back with W lifts the front; it stays up while he
    // leans back, with W or fast enough. In the air it stays as it left the ground.
    const up = !this.airborne && input.leanBack && this.speed > 0 && (input.throttle || (this.wheelie > 0 && this.speed >= tune.wheelieHold * KMH))
    // Powerslide: Space while steering, rolling forward on the ground (not
    // holding a wheelie; one dropping doesn't wait for the front to land, it
    // comes down as fast as the rear kicks out). The rear swings out toward
    // the steering's share of the slide angle.
    const wantSlide = input.slide && !this.airborne && !up && this.steer !== 0 && this.speed > 0
    if (!this.airborne) {
      const easing = wantSlide ? Math.min(tune.liftTime, tune.kickOut) : tune.liftTime
      this.wheelie += ((up ? 1 : 0) - this.wheelie) * (1 - Math.exp(-dt / Math.max(easing, 1e-6)))
      if (this.wheelie < 1e-3) this.wheelie = 0
    }
    const kick = 1 - Math.exp(-dt / Math.max(tune.kickOut, 1e-6))
    this.sliding += ((wantSlide ? 1 : 0) - this.sliding) * kick
    if (this.sliding < 1e-3) this.sliding = 0
    this.slideYaw += (this.sliding * this.steering * tune.slideAngle * DEG - this.slideYaw) * kick

    if (this.airborne) {
      this.fly(input, tune, dt, radius, ground)
      return
    }
    const top = tune.topSpeed * KMH
    const hundred = 100 * KMH
    const before = this.speed

    // The slope from the rear wheel to the front, the way it's going: rise
    // per metre. Over the wheelbase, so it doesn't twitch on every little bump.
    const sin = Math.sin(this.heading)
    const cos = Math.cos(this.heading)
    const going = this.speed < 0 ? -1 : 1
    const reach = WHEELBASE / 2
    const front = ground(this.x + sin * reach, this.z - cos * reach)
    const rear = ground(this.x - sin * reach, this.z + cos * reach)
    const slope = (going * (front - rear)) / WHEELBASE
    // Gravity along the slope pulls back down it, uphill or down (sin of its
    // angle). Before throttle and brakes, so coasting or braking can hold the bike still.
    this.speed -= G * tune.slopePull * (slope / Math.sqrt(1 + slope * slope)) * dt

    // S wins over W: braking, or backing up from a stop
    if (input.brake && this.speed > 0) {
      this.speed = Math.max(this.speed - (hundred / tune.brakeToStop) * dt, 0)
    } else if (input.brake) {
      this.speed = Math.max(this.speed - (hundred / tune.zeroToHundred) * dt, -tune.reverseSpeed * KMH)
    } else if (input.throttle) {
      // The engine pushes hardest from a standstill and runs out of push at
      // top speed: push = punch x (1 - (speed / top)²). Punch is set so 0 to
      // 100 still takes zeroToHundred (or to just under top speed, if that's
      // below 100). Climbing, gravity eats into what's left, so you slow down.
      // Sliding, the rear's spinning sideways and doesn't push.
      const target = Math.min(hundred, 0.95 * top)
      const punch = ((top * Math.atanh(target / top)) / tune.zeroToHundred) * (1 + (tune.wheelieAccel - 1) * this.wheelie)
      this.speed += punch * Math.max(1 - (this.speed / top) ** 2, 0) * (1 - this.sliding) * dt
    } else {
      const roll = (hundred / tune.coastToStop) * (1 - this.sliding) * dt
      this.speed = Math.sign(this.speed) * Math.max(Math.abs(this.speed) - roll, 0)
    }
    // sliding scrubs off a steady amount of speed
    const scrub = tune.slideScrub * KMH * this.sliding * dt
    this.speed = Math.sign(this.speed) * Math.max(Math.abs(this.speed) - scrub, 0)
    // faster than top speed (down a hill, say), it slows back down to it as if coasting
    if (this.speed > top) this.speed = Math.max(top, this.speed - (hundred / tune.coastToStop) * dt)
    this.slowing = dt > 0 ? Math.max(Math.abs(before) - Math.abs(this.speed), 0) / dt : 0

    this.steer = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    this.steering += (this.steer - this.steering) * (1 - Math.exp(-dt / Math.max(tune.steerTime, 1e-6)))
    if (Math.abs(this.steering) < 1e-3) this.steering = 0
    // the circle at this speed, tightened sliding; on a wheelie only part of the turn is left
    const circle = turnCircle(tune, this.speed) * (1 + (tune.slideCircle - 1) * this.sliding)
    // curvature (1 / radius), signed: positive turns right
    const curve = (this.steering / circle) * (1 + (tune.wheelieSteer - 1) * this.wheelie)
    this.turnRadius = curve === 0 ? Infinity : 1 / Math.abs(curve)
    this.limit = curve === 0 ? null : this.wheelie > 0.5 ? 'wheelie' : this.sliding > 0.5 ? 'powerslide' : 'turning'
    // the front wheel turns as far as that circle takes; sliding, the body
    // swings into the turn and the wheel keeps pointing along the line
    // (opposite lock); up in a wheelie, it points straight
    this.wheelAngle = (Math.atan(WHEELBASE * curve) / DEG - this.slideYaw / DEG) * (1 - this.wheelie)
    this.bars = (this.steering * Math.atan(WHEELBASE / Math.max(tune.slowCircle, 0.1))) / DEG
    // round the circle at this speed; backwards, it swings the other way
    const rate = this.speed * curve
    this.turnRate = rate / DEG
    this.heading += rate * dt

    // Along the ground: up or down a slope, part of the speed goes into climbing.
    const across = this.speed / Math.sqrt(1 + slope * slope)
    this.x += Math.sin(this.heading) * across * dt
    this.z -= Math.cos(this.heading) * across * dt
    this.spin += (this.speed * dt) / radius
    this.pitch = Math.atan(slope)

    // Left to itself, gravity would carry the bike to `free`. The ground
    // pushes it up if it's higher; if it's lower, the suspension stretches
    // to keep the wheels on it, as far as its travel, and past that (off a
    // lip) the bike leaves the ground.
    const height = ground(this.x, this.z)
    const vy = this.vy - G * dt
    const free = this.y + vy * dt
    if (free <= height) {
      // (no time passed, the first frame, say: nothing to rise at)
      this.vy = dt > 0 ? (height - this.y) / dt : 0
      this.y = height
    } else if (free - height <= tune.travel) {
      this.vy = vy
      this.y = free
    } else {
      this.airborne = true
      this.airSpeed = across
      this.airtime = 0
      this.vy = vy
      this.y = free
      // it flies at the angle it's flying, a wheelie's lift and all
      this.pitch = Math.atan2(vy, Math.abs(across)) + this.wheelie * tune.wheelieAngle * DEG
      this.wheelie = 0
      this.airYaw = 0
      // holding A/D as it leaves the lip, it spins that way while the key's held
      this.spinKey = this.steer
      this.airSpin = this.steer * tune.airSpinRate * DEG
      this.airSteer = 0
    }
  }

  /** A step in the air: gravity pulls it down, the rest carries on as it left the ground. */
  private fly(input: Input, tune: Tuning, dt: number, radius: number, ground: Ground): void {
    this.vy -= G * dt
    this.x += Math.sin(this.heading) * this.airSpeed * dt
    this.z -= Math.cos(this.heading) * this.airSpeed * dt
    this.y += this.vy * dt
    this.spin += (this.speed * dt) / radius
    this.airtime += dt
    // the arrows tilt it: back (down) lifts the nose, forward (up) drops it
    this.pitch += ((input.leanBack ? 1 : 0) - (input.leanForward ? 1 : 0)) * tune.tiltRate * DEG * dt
    this.spinAround(input, tune, dt)
    this.airYaw += this.airTurnRate * dt
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
      this.land(tune, Math.atan(slope))
    }
  }

  /**
   * Touching down: crashes if it's too far sideways to the way it's flying
   * (fast enough for that to matter), or too far nose-down or tail-down to
   * the ground it lands on. Otherwise it rides on the way it's pointing.
   */
  private land(tune: Tuning, groundAngle: number): void {
    // a whole turn round, either way, is as good as none
    const off = wrap(this.airYaw + this.slideYaw)
    const tilt = wrap(this.pitch - groundAngle)
    this.pitch = groundAngle + tilt
    let way: CrashWay | null = null
    if (Math.abs(off) > tune.sideLimit * DEG && Math.abs(this.speed) >= tune.sideMinSpeed * KMH) way = off > 0 ? 'left' : 'right'
    else if (tilt < -tune.noseTailLimit * DEG) way = 'front'
    else if (tilt > tune.noseTailLimit * DEG) way = 'back'
    // landed it: it carries on the way it points
    this.heading += this.airYaw
    this.airYaw = 0
    if (way) Object.assign(this, { crash: { way, time: 0 }, sliding: 0, slideYaw: 0, wheelie: 0 })
  }

  /**
   * A/D in the air. Took off spinning: it keeps spinning at Spin rate while
   * that key stays held; let go (or press the other) and the spin dies away
   * evenly over Spin stop, gone for the rest of the jump. Not spinning, A/D
   * turn it gently (Air turn), stopping when let go.
   */
  private spinAround(input: Input, tune: Tuning, dt: number): void {
    const key = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (this.spinKey !== 0 && key !== this.spinKey) this.spinKey = 0
    const full = tune.airSpinRate * DEG
    if (this.spinKey !== 0) this.airSpin = this.spinKey * full
    else this.airSpin = Math.sign(this.airSpin) * Math.max(Math.abs(this.airSpin) - (full / Math.max(tune.airSpinStop, 1e-3)) * dt, 0)
    const gentle = this.spinKey !== 0 ? 0 : key * tune.airTurn * DEG
    this.airSteer += (gentle - this.airSteer) * (1 - Math.exp(-dt / Math.max(tune.steerTime, 1e-6)))
  }

  /** How fast it's turning round in the air: the spin, and the gentle turn on top. */
  private get airTurnRate(): number {
    return this.airSpin + this.airSteer
  }

  /** A step lying down after a crash: it slides to a stop, then gets back up, right there, facing the way it points. */
  private down(tune: Tuning, dt: number, ground: Ground): void {
    const crash = this.crash!
    crash.time += dt
    this.speed = Math.sign(this.speed) * Math.max(Math.abs(this.speed) - CRASH_SLIDE * dt, 0)
    this.x += Math.sin(this.heading) * this.speed * dt
    this.z -= Math.cos(this.heading) * this.speed * dt
    this.y = ground(this.x, this.z)
    Object.assign(this, { vy: 0, steer: 0, steering: 0, bars: 0, wheelAngle: 0, turnRate: 0, turnRadius: Infinity, limit: null, slowing: 0, riderLean: 0 })
    if (crash.time >= tune.getUp) Object.assign(this, { crash: null, speed: 0, pitch: 0 })
  }
}

/**
 * The turn circle's radius at `speed` (m/s), metres: the slow one up to
 * SLOW_TURN_UNTIL, widening to the fast one at top speed (and staying there
 * past it). Blend 0 widens it evenly with speed; up to 1, it stays tight
 * longer and widens late (the curve's power goes from 1 to 3).
 */
export function turnCircle(tune: Tuning, speed: number): number {
  const kmh = Math.abs(speed) / KMH
  const span = tune.topSpeed - SLOW_TURN_UNTIL
  const t = span > 0 ? Math.min(Math.max((kmh - SLOW_TURN_UNTIL) / span, 0), 1) : kmh > SLOW_TURN_UNTIL ? 1 : 0
  const shaped = t ** (1 + 2 * Math.min(Math.max(tune.circleBlend, 0), 1))
  return Math.max(tune.slowCircle + (tune.fastCircle - tune.slowCircle) * shaped, 0.1)
}
