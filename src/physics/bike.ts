import RAPIER from '@dimforge/rapier3d-compat'
import type { BikeStats, WheelStats } from '../config'
import { add, cross, dot, normalize, rotate, scale, sub, vec, yawRotation, type Quat, type Vec3 } from './vec'
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
 * - sideways tyre grip pushes at the height of the centre of mass, so grip
 *   alone never tips the bike over (arcade: the upright helper decides lean)
 * - rolling resistance (and later engine and brakes) pushes at the tyre's
 *   contact point, so braking dives the nose and throttle lifts it
 */

/** The frame and engine as a solid box, half sizes in metres. */
const FRAME_HALF = vec(0.15, 0.15, 0.45)
/** Extra height when putting the bike down, so it settles onto its wheels. */
const PLACE_CLEARANCE = 0.05
/** Wheels are swept from this far above the top of their travel, so a wheel
 * pushed past the end of its travel (bottomed out) can still tell by how much. */
const SWEEP_ABOVE = 0.5
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
    const { tyres } = this.stats

    // Every push this step is worked out from how the bike moved at the start
    // of the step, then all are applied together as steady forces for the
    // whole step (the way gravity is). Applying one before working out the
    // next would let the first one change what the second one sees.
    const linvel = body.linvel()
    const angvel = body.angvel()
    const velocityAt = (point: Vec3) => add(linvel, cross(angvel, sub(point, centerOfMass)))
    const pushes: Array<[Vec3, Vec3]> = []

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
      pushes.push([scale(normal, wheel.load), wheelCenter])

      // Tyre: grip against sliding sideways, and a little rolling resistance.
      const rollDirection = normalize(sub(forward, scale(normal, dot(forward, normal))))
      const side = normalize(cross(rollDirection, normal))
      const velocity = velocityAt(contact)
      const massShare = mass / 2
      // The force that would stop the sideways slide within this step, limited by grip.
      const maxGrip = tyres.grip * wheel.load
      const sideways = clamp((-dot(velocity, side) * massShare * tyres.lateralResponse) / dt, -maxGrip, maxGrip)
      const gripPoint = add(contact, scale(up, dot(sub(centerOfMass, contact), up)))
      pushes.push([scale(side, sideways), gripPoint])

      const rolling = dot(velocity, rollDirection)
      const resistance = Math.min((Math.abs(rolling) * massShare) / dt, tyres.rollingResistance * wheel.load)
      pushes.push([scale(rollDirection, -Math.sign(rolling) * resistance), contact])
      wheel.spin += (rolling * dt) / stats.radius
    })

    body.resetForces(true)
    body.resetTorques(true)
    for (const [force, point] of pushes) body.addForceAtPoint(force, point, true)

    // Upright helper: a spring and damper on the sideways lean.
    const { upright } = this.stats
    const strength = grounded > 0 ? 1 : upright.airStrength
    const leanRate = dot(angvel, forward)
    const torque = (upright.stiffness * (0 - this.roll) - upright.damping * leanRate) * strength
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
