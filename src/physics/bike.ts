import RAPIER from '@dimforge/rapier3d-compat'
import type { BikeStats, WheelStats } from '../config'
import { maxSteerAngle } from './steering'
import { add, cross, dot, normalize, rotate, rotateAround, scale, sub, vec, yawRotation, type Quat, type Vec3 } from './vec'
import type { PhysicsWorld } from './world'

/**
 * The bike's physics: one solid body for bike and rider, held up by two
 * "feeler" wheels.
 *
 * Each wheel is a ball swept straight down (along the bike's own down
 * direction) from the top of its suspension travel. Where it touches the
 * ground, the suspension is squeezed by that much and pushes back like a
 * spring with a damper. The wheels themselves aren't solid, only the frame
 * is, so a frame hitting the ground means the suspension bottomed out.
 *
 * The bike's own frame of reference: forward is -z, right is +x, up is +y,
 * and the origin is the middle point between the tops of the two suspensions.
 *
 * How forces are applied, on purpose:
 * - suspension pushes straight out of the ground (along the surface normal)
 *   at the wheel centre, so on a side slope the tyres must grip to hold the
 *   bike, and a wheel hitting the edge of a step gets pushed back
 * - those pushes act on the bike's centre line, so leaning never tips or
 *   twists it by itself (arcade: the upright helper decides the lean)
 * - sideways tyre grip pushes at the height of the centre of mass, so grip
 *   alone never tips the bike over (arcade: the upright helper decides lean)
 * - rolling resistance, brakes and the engine push at the tyre's contact
 *   point, so braking dives the nose and throttle lifts it
 * - each tyre has one grip budget shared by pushing along and sideways;
 *   sideways hold comes first, so braking or throttle in a turn is weaker
 *   instead of making the bike spin
 * - steering turns the front tyre's direction; the bike then follows it
 *   because the tyres don't like sliding sideways
 */

/** The frame and engine as a solid box, half sizes in metres. */
const FRAME_HALF = vec(0.15, 0.15, 0.45)
/** Extra height when putting the bike down, so it settles onto its wheels. */
const PLACE_CLEARANCE = 0.05
/** Wheels are swept from this far above the top of their travel, so a wheel
 * pushed past the end of its travel (bottomed out) can still tell by how much. */
const SWEEP_ABOVE = 0.5
/** kg per m³ at sea level. */
const AIR_DENSITY = 1.2
const UP = vec(0, 1, 0)
const FORWARD = vec(0, 0, -1)
const RIGHT = vec(1, 0, 0)

export interface Pose {
  position: Vec3
  rotation: Quat
}

export interface WheelState {
  /** Touching the ground in the latest step. */
  onGround: boolean
  /** How far the suspension is pushed in, metres. More than its travel when bottomed out. */
  compression: number
  /** The same as a share of its travel, 0 to 1. */
  compressionRatio: number
  /** Pushed past the end of its travel in the latest step. */
  bottomedOut: boolean
  /** From the top of the suspension travel down to the wheel centre, metres. */
  extension: number
  /** The same one physics step ago, for smooth drawing. */
  previousExtension: number
  /** How far the wheel has turned, radians. */
  spin: number
  /** How hard the suspension pushes, newtons. */
  load: number
}

export class Bike {
  readonly body: RAPIER.RigidBody
  /** Front wheel first, then rear. */
  readonly wheels: WheelState[]
  /** Seconds since both wheels left the ground (0 while on the ground). */
  airtime = 0
  /** How long the last jump lasted, seconds. */
  lastAirtime = 0
  /** Where the bike was one physics step ago and is now, for smooth drawing. */
  previous: Pose
  current: Pose

  /** Set these before each update: throttle and brake 0 to 1, steer -1 (left) to 1 (right). */
  readonly controls = { throttle: 0, brake: 0, steer: 0 }
  /** How far the front wheel is turned, degrees (positive = right). */
  steerAngle = 0
  /** The most it may turn at the current speed, degrees. */
  maxSteer = 0
  /** The lean the upright helper is aiming for, radians (positive = right). */
  targetLean = 0

  private massKey = ''

  constructor(
    private readonly physics: PhysicsWorld,
    /** Read live every step, so the tuning panel applies at once. */
    readonly stats: BikeStats,
  ) {
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false),
    )
    const frame = RAPIER.ColliderDesc.cuboid(FRAME_HALF.x, FRAME_HALF.y, FRAME_HALF.z)
      .setDensity(0) // the mass is set from the stats instead
      .setFriction(0.6)
    physics.world.createCollider(frame, this.body)
    this.applyMass()

    this.wheels = [stats.front, stats.rear].map((wheel) => ({
      onGround: false,
      compression: 0,
      compressionRatio: 0,
      bottomedOut: false,
      extension: wheel.travel,
      previousExtension: wheel.travel,
      spin: 0,
      load: 0,
    }))
    this.current = this.readPose()
    this.previous = this.current
  }

  /** Puts the bike upright at a point, heading in degrees (0 = toward -z), standing still. */
  place(x: number, y: number, z: number, heading: number): void {
    this.body.setTranslation({ x, y, z }, true)
    this.body.setRotation(yawRotation((-heading * Math.PI) / 180), true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.wheels.forEach((wheel, i) => {
      wheel.onGround = wheel.bottomedOut = false
      wheel.compression = wheel.compressionRatio = wheel.load = 0
      wheel.extension = wheel.previousExtension = this.wheelStats(i).travel
    })
    this.airtime = 0
    this.current = this.readPose()
    this.previous = this.current
  }

  /** Puts the bike upright with its wheels just above the ground (plus `drop` metres). */
  placeOnGround(x: number, z: number, heading: number, drop = 0): void {
    const h = (heading * Math.PI) / 180
    const half = this.stats.wheelbase / 2
    const forward = vec(Math.sin(h), 0, -Math.cos(h))
    const groundAt = (along: number) =>
      this.physics.groundHeightAt(x + forward.x * along, z + forward.z * along, this.body) ?? 0
    const ground = Math.max(groundAt(half), groundAt(-half))
    const reach = Math.max(...[this.stats.front, this.stats.rear].map((w) => w.travel + w.radius))
    this.place(x, ground + reach + PLACE_CLEARANCE + drop, z, heading)
  }

  /** Back upright on the spot, facing the same way, standing still. */
  resetUpright(): void {
    const { x, z } = this.body.translation()
    this.placeOnGround(x, z, this.heading)
  }

  /** Pushes the bike for one physics step. Call before the world steps. */
  update(dt: number): void {
    this.applyMass()
    const body = this.body
    const rotation = body.rotation()
    const up = rotate(rotation, UP)
    const forward = rotate(rotation, FORWARD)
    const position = body.translation()
    const centerOfMass = body.worldCom()
    const mass = this.stats.mass.bike + this.stats.mass.rider
    const { tyres, engine, brakes } = this.stats

    // Every push this step is worked out from how the bike moved at the start
    // of the step, then all are applied together as steady forces for the
    // whole step (the way gravity is). Applying one before working out the
    // next would let the first one change what the second one sees.
    const linvel = body.linvel()
    const angvel = body.angvel()
    const velocityAt = (point: Vec3) => add(linvel, cross(angvel, sub(point, centerOfMass)))
    const pushes: Array<[Vec3, Vec3]> = []

    const speedAlong = dot(linvel, forward)
    this.maxSteer = maxSteerAngle(this.stats.steering, speedAlong)
    this.steerAngle = clamp(this.controls.steer, -1, 1) * this.maxSteer
    const throttle = clamp(this.controls.throttle, 0, 1)
    const brake = clamp(this.controls.brake, 0, 1)

    let grounded = 0
    this.wheels.forEach((wheel, i) => {
      const stats = this.wheelStats(i)
      const along = i === 0 ? -this.stats.wheelbase / 2 : this.stats.wheelbase / 2
      const top = add(position, rotate(rotation, vec(0, 0, along)))
      const down = scale(up, -1)
      const sweepFrom = add(top, scale(up, SWEEP_ABOVE))
      const hit = this.physics.world.castShape(
        sweepFrom, rotation, down, new RAPIER.Ball(stats.radius), 0, SWEEP_ABOVE + stats.travel, true,
        undefined, undefined, undefined, body,
      )

      const before = wheel.compression
      wheel.previousExtension = wheel.extension
      if (!hit) {
        wheel.onGround = wheel.bottomedOut = false
        wheel.extension = stats.travel
        wheel.compression = wheel.compressionRatio = wheel.load = 0
        return
      }
      grounded++
      wheel.onGround = true
      const reach = hit.time_of_impact - SWEEP_ABOVE // negative when pushed past the end of travel
      wheel.extension = Math.max(reach, 0)
      wheel.compression = stats.travel - reach
      wheel.compressionRatio = Math.min(wheel.compression / stats.travel, 1)
      wheel.bottomedOut = reach < 0

      // Suspension: a spring that gets stiffer toward the end of its travel, plus a damper.
      const squeezeSpeed = (wheel.compression - before) / dt
      const inTravel = Math.min(wheel.compression, stats.travel)
      const spring = stats.spring * inTravel * (1 + stats.progression * (inTravel / stats.travel) ** 2)
      const damper = squeezeSpeed * (squeezeSpeed > 0 ? stats.bumpDamping : stats.reboundDamping)
      const contact = hit.witness1
      const normal = hit.normal1
      const wheelCenter = add(top, scale(down, wheel.extension))
      // Pushes act on the bike's centre line: when it leans, the tyre touches
      // the ground off to the side, and pushing there would tip the bike
      // further over or twist it. Height and fore/aft position stay as they
      // are, so braking still dives the nose and throttle still lifts it.
      const groundForward = normalize(sub(forward, scale(normal, dot(forward, normal))))
      const groundSide = normalize(cross(groundForward, normal))
      const onCenterLine = (point: Vec3) => sub(point, scale(groundSide, dot(sub(point, centerOfMass), groundSide)))

      // Past the end of the travel: stop this wheel's share of the bike dead
      // within this step (only the part the spring and damper don't already
      // do), then ease the wheel back out. Uses how fast the bike is really
      // heading into the ground right now, so it can never throw it back up.
      const past = Math.max(-reach, 0)
      let stop = this.stats.bottomOut.stiffness * past
      if (past > 0) {
        const intoGround = -dot(velocityAt(wheelCenter), normal)
        stop += Math.max(0, ((mass / 2) * intoGround) / dt - (spring + damper))
      }
      wheel.load = Math.max(0, spring + damper + stop)
      pushes.push([scale(normal, wheel.load), onCenterLine(wheelCenter)])

      // The way the tyre rolls: along the ground, and at the front turned by the steering.
      let rollDirection = groundForward
      if (i === 0) rollDirection = rotateAround(rollDirection, normal, (-this.steerAngle * Math.PI) / 180)
      const side = normalize(cross(rollDirection, normal))
      // Rolling speed is how fast the wheel hub moves along the ground. Sliding
      // is measured where the sideways grip pushes (centre line, at the height
      // of the centre of mass): measuring at the contact patch would mistake
      // the bike rolling upright, which swings the patch sideways, for a slide.
      const patch = onCenterLine(contact)
      const gripPoint = add(patch, scale(normal, dot(sub(centerOfMass, patch), normal)))
      const rolling = dot(velocityAt(onCenterLine(wheelCenter)), rollDirection)
      const sliding = dot(velocityAt(gripPoint), side)
      const massShare = mass / 2

      // Along the tyre. Everything that slows it (rolling resistance, brakes,
      // engine braking) can at most stop it within this step, so a braked bike
      // stands still instead of rocking back and forth. Then the engine drives
      // the rear wheel: its full push off the line, less as speed rises.
      const brakeShare = i === 0 ? brakes.frontShare : 1 - brakes.frontShare
      const engineBraking = i === 1 ? engine.engineBraking * (1 - throttle) * Math.min(Math.abs(rolling) / 5, 1) : 0
      const slowing = tyres.rollingResistance * wheel.load + brake * brakes.force * brakeShare + engineBraking
      let lengthways = -Math.sign(rolling) * Math.min((Math.abs(rolling) * massShare) / dt, slowing)
      if (i === 1) lengthways += throttle * Math.min(engine.maxForce, engine.power / Math.max(Math.abs(rolling), 1))

      // Grip: one budget for pushing along and sideways together. Sideways
      // comes first: it tries to stop the slide within this step. Brakes and
      // throttle get what is left (like ABS and traction control), so a tyre
      // never loses its hold sideways and swings the bike round.
      const maxGrip = tyres.grip * wheel.load
      const sideways = clamp((-sliding * massShare * tyres.lateralResponse) / dt, -maxGrip, maxGrip)
      const lengthGrip = Math.sqrt(Math.max(maxGrip ** 2 - sideways ** 2, 0))
      lengthways = clamp(lengthways, -lengthGrip, lengthGrip)
      pushes.push([scale(side, sideways), gripPoint])
      pushes.push([scale(rollDirection, lengthways), patch])
      wheel.spin += (rolling * dt) / stats.radius
    })

    // Air resistance grows with the square of speed; with engine power it sets the top speed.
    const airSpeed = Math.hypot(linvel.x, linvel.y, linvel.z)
    pushes.push([scale(linvel, -0.5 * AIR_DENSITY * this.stats.drag * airSpeed), centerOfMass])

    body.resetForces(true)
    body.resetTorques(true)
    for (const [force, point] of pushes) body.addForceAtPoint(force, point, true)

    // Upright helper: a spring and damper on the sideways lean. On the ground
    // it leans the bike into turns as far as a real bike leans for how hard it
    // is turning (the sideways pull is speed times turn rate).
    const { upright } = this.stats
    const maxLean = (upright.maxTurnLean * Math.PI) / 180
    const pull = (speedAlong * angvel.y) / this.physics.gravity
    this.targetLean = grounded > 0 ? clamp(-Math.atan(pull), -maxLean, maxLean) : 0
    const strength = grounded > 0 ? 1 : upright.airStrength
    const leanRate = dot(angvel, forward)
    const torque = (upright.stiffness * (this.targetLean - this.roll) - upright.damping * leanRate) * strength
    body.addTorque(scale(forward, torque), true)

    if (grounded === 0) this.airtime += dt
    else if (this.airtime > 0) {
      this.lastAirtime = this.airtime
      this.airtime = 0
    }
  }

  /** Remembers where the bike ended up. Call after the world steps. */
  record(): void {
    this.previous = this.current
    this.current = this.readPose()
  }

  /** Speed in any direction, m/s. */
  get speed(): number {
    const v = this.body.linvel()
    return Math.hypot(v.x, v.y, v.z)
  }

  /** Speed along the way the bike points, m/s (negative when rolling backward). */
  get forwardSpeed(): number {
    return dot(this.body.linvel(), rotate(this.body.rotation(), FORWARD))
  }

  /** Sideways lean, radians. Positive = leaning right. */
  get roll(): number {
    const rotation = this.body.rotation()
    return Math.atan2(-rotate(rotation, RIGHT).y, rotate(rotation, UP).y)
  }

  /** Nose up (positive) or down, radians. */
  get pitch(): number {
    return Math.asin(clamp(rotate(this.body.rotation(), FORWARD).y, -1, 1))
  }

  /** Compass heading the bike points to, degrees (0 = toward -z, 90 = toward +x). */
  get heading(): number {
    const rotation = this.body.rotation()
    const forward = rotate(rotation, FORWARD)
    // Pointing nearly straight up or down: read the heading off its right side instead.
    if (Math.abs(forward.y) > 0.9) {
      const right = rotate(rotation, RIGHT)
      return (Math.atan2(right.z, right.x) * 180) / Math.PI
    }
    return (Math.atan2(forward.x, -forward.z) * 180) / Math.PI
  }

  private wheelStats(i: number): WheelStats {
    return i === 0 ? this.stats.front : this.stats.rear
  }

  private readPose(): Pose {
    const p = this.body.translation()
    const r = this.body.rotation()
    return { position: vec(p.x, p.y, p.z), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }
  }

  /** Sets mass, balance point and inertia from the stats, when they changed. */
  private applyMass(): void {
    const { mass, centerOfMass, inertia } = this.stats
    const key = JSON.stringify([mass, centerOfMass, inertia])
    if (key === this.massKey) return
    this.massKey = key
    this.body.setAdditionalMassProperties(
      mass.bike + mass.rider,
      vec(0, centerOfMass.height, -centerOfMass.forward),
      vec(inertia.pitch, inertia.yaw, inertia.roll),
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    )
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
