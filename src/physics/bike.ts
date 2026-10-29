import RAPIER from '@dimforge/rapier3d-compat'
import type { BikeStats } from '../config'
import {
  brakeDeceleration,
  coastDeceleration,
  dampingRate,
  driveAcceleration,
  springRate,
  turnRadiusAt,
} from './bikeTuning'
import { add, cross, dot, normalize, rotate, scale, sub, vec, yawRotation, type Quat, type Vec3 } from './vec'
import type { PhysicsWorld } from './world'

/**
 * The bike's physics, arcade style, the way the 90s games did it.
 *
 * Suspension is real physics. Each wheel is a ball swept straight down from
 * the top of its suspension travel; where it touches the ground, a spring and
 * a damper push back. Landings, bumps and the fork diving under braking come
 * from that. The wheels aren't solid, only the frame is, so a frame hitting
 * the ground means the suspension bottomed out.
 *
 * Riding is direct control instead of simulated tyres:
 * - throttle, brake and coasting speed the bike up and slow it down exactly
 *   as the speed settings say
 * - steering sets how fast the bike turns, from the turning settings. It turns
 *   about its rear wheel like a real bike, so the rear follows the front's path
 * - grip keeps it going the way it points by taking away sideways speed, as
 *   hard as the grip setting allows, and a turn that would need more grip than
 *   that is made wider instead, so the bike never slides out on its own
 * - the physics bike always stays upright. Leaning into turns is worked out
 *   here, but only drawn
 *
 * The bike's own frame of reference: forward is -z, right is +x, up is +y,
 * and the origin is the middle point between the tops of the two suspensions.
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
const DEG = Math.PI / 180
/** Shorter times in the air don't count as a jump for `lastAirtime`, seconds. */
const MIN_JUMP = 0.15

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

  /** Set these before each update: throttle and brake 0 to 1, steer -1 (left) to 1 (right),
   * lean -1 (back) to 1 (forward). */
  readonly controls = { throttle: 0, brake: 0, steer: 0, lean: 0 }
  /** How far the bike is drawn leaning into the turn, radians (positive = right). */
  lean = 0
  /** How far the front wheel is drawn turned, degrees (positive = right). */
  steerAngle = 0
  /** Radius of the tightest turn at the current speed, metres. */
  turnRadius = Infinity

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

    this.wheels = [0, 1].map((i) => ({
      onGround: false,
      compression: 0,
      compressionRatio: 0,
      bottomedOut: false,
      extension: this.travel(i),
      previousExtension: this.travel(i),
      spin: 0,
      load: 0,
    }))
    this.current = this.readPose()
    this.previous = this.current
  }

  /** Puts the bike upright at a point, heading in degrees (0 = toward -z), standing still. */
  place(x: number, y: number, z: number, heading: number): void {
    this.body.setTranslation({ x, y, z }, true)
    this.body.setRotation(yawRotation(-heading * DEG), true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.wheels.forEach((wheel, i) => {
      wheel.onGround = wheel.bottomedOut = false
      wheel.compression = wheel.compressionRatio = wheel.load = 0
      wheel.extension = wheel.previousExtension = this.travel(i)
    })
    this.airtime = 0
    this.lean = 0
    this.current = this.readPose()
    this.previous = this.current
  }

  /** Puts the bike upright with its wheels just above the ground (plus `drop` metres). */
  placeOnGround(x: number, z: number, heading: number, drop = 0): void {
    const half = this.stats.build.wheelbase / 2
    const forward = vec(Math.sin(heading * DEG), 0, -Math.cos(heading * DEG))
    const groundAt = (along: number) =>
      this.physics.groundHeightAt(x + forward.x * along, z + forward.z * along, this.body) ?? 0
    const ground = Math.max(groundAt(half), groundAt(-half))
    const reach = Math.max(this.travel(0) + this.radius(0), this.travel(1) + this.radius(1))
    this.place(x, ground + reach + PLACE_CLEARANCE + drop, z, heading)
  }

  /** Back upright on the spot, facing the same way, standing still. */
  resetUpright(): void {
    const { x, z } = this.body.translation()
    this.placeOnGround(x, z, this.heading)
  }

  /** Works out this physics step. Call before the world steps. */
  update(dt: number): void {
    this.applyMass()
    const body = this.body
    const { stats } = this
    const rotation = body.rotation()
    const up = rotate(rotation, UP)
    const forward = rotate(rotation, FORWARD)
    const position = body.translation()
    const centerOfMass = body.worldCom()
    const mass = stats.weight.total
    const gravity = this.physics.gravity

    // Everything this step is worked out from how the bike moved at the start
    // of the step, then applied together. Applying one push before working out
    // the next would let the first change what the second sees.
    const linvel = body.linvel()
    const angvel = body.angvel()
    const velocityAt = (point: Vec3) => add(linvel, cross(angvel, sub(point, centerOfMass)))
    const pushes: Array<[Vec3, Vec3]> = []

    const throttle = clamp(this.controls.throttle, 0, 1)
    const brake = clamp(this.controls.brake, 0, 1)
    const steer = clamp(this.controls.steer, -1, 1)
    const lean = clamp(this.controls.lean, -1, 1)

    // ---- Suspension ----
    const loads = this.staticLoads(gravity)
    let grounded = 0
    let groundNormal = vec(0, 0, 0)
    let groundPoint = vec(0, 0, 0)
    this.wheels.forEach((wheel, i) => {
      const travel = this.travel(i)
      const along = i === 0 ? -stats.build.wheelbase / 2 : stats.build.wheelbase / 2
      const top = add(position, rotate(rotation, vec(0, 0, along)))
      const down = scale(up, -1)
      const sweepFrom = add(top, scale(up, SWEEP_ABOVE))
      const hit = this.physics.world.castShape(
        sweepFrom, rotation, down, new RAPIER.Ball(this.radius(i)), 0, SWEEP_ABOVE + travel, true,
        undefined, undefined, undefined, body,
      )

      const before = wheel.compression
      wheel.previousExtension = wheel.extension
      // All ground and ramp tops face upward. A surface found facing down means
      // the sweep started under the ground (the bike is upside down): no wheel.
      if (!hit || hit.normal1.y <= 0) {
        wheel.onGround = wheel.bottomedOut = false
        wheel.extension = travel
        wheel.compression = wheel.compressionRatio = wheel.load = 0
        return
      }
      wheel.onGround = true
      const reach = hit.time_of_impact - SWEEP_ABOVE // negative when pushed past the end of travel
      wheel.extension = Math.max(reach, 0)
      wheel.compression = travel - reach
      wheel.compressionRatio = Math.min(wheel.compression / travel, 1)
      wheel.bottomedOut = reach < 0

      const normal = hit.normal1
      const wheelCenter = add(top, scale(down, wheel.extension))
      // Pushes act on the bike's centre line, so a push never tips the bike sideways.
      const groundForward = normalize(sub(forward, scale(normal, dot(forward, normal))))
      const groundSide = normalize(cross(groundForward, normal))
      const pushAt = sub(wheelCenter, scale(groundSide, dot(sub(wheelCenter, centerOfMass), groundSide)))

      // A spring sized so the bike sinks in by `sag` under its own weight, that
      // gets stiffer toward the end of its travel, plus a damper going by how
      // fast the suspension squeezed since the last step.
      const { suspension } = stats
      const k = springRate(loads[i], travel, suspension.sag, suspension.stiffening)
      const squeezeSpeed = (wheel.compression - before) / dt
      const inTravel = Math.min(wheel.compression, travel)
      const spring = k * inTravel * (1 + suspension.stiffening * (inTravel / travel) ** 2)
      const damping = squeezeSpeed > 0 ? suspension.bumpDamping : suspension.reboundDamping
      const damper = squeezeSpeed * dampingRate(damping, k, loads[i], gravity)

      // Past the end of the travel: stop the wheel heading into the ground dead
      // within this step (only the part the spring and damper don't already
      // do), then ease it back out. Uses how fast it is really heading in right
      // now, and how much of the bike a push there actually moves (the bike can
      // also turn about its centre of mass), so it can never throw it back up.
      const past = Math.max(-reach, 0)
      let stop = suspension.bottomOutStiffness * past
      if (past > 0) {
        const intoGround = -dot(velocityAt(pushAt), normal)
        const moved = this.massMovedAt(pushAt, normal, centerOfMass, rotation, mass)
        stop += Math.max(0, (moved * intoGround) / dt - (spring + damper))
      }
      // A wheel is only a wheel while the bike is roughly upright on the ground:
      // lying on its side or standing on its tail, the frame takes over.
      const asWheel = clamp((dot(up, normal) - 0.34) / (0.5 - 0.34), 0, 1) // full up to 60°, none past 70°
      wheel.load = Math.max(0, spring + damper + stop) * asWheel
      pushes.push([scale(normal, wheel.load), pushAt])

      wheel.spin += (dot(velocityAt(pushAt), groundForward) * dt) / this.radius(i)
      if (asWheel > 0) {
        grounded++
        groundNormal = add(groundNormal, normal)
        groundPoint = add(groundPoint, hit.witness1)
      }
    })

    let newLinvel = linvel
    let newAngvel = angvel
    const right = rotate(rotation, RIGHT)
    const { rider } = stats
    let leanTorque = 0

    if (grounded > 0) {
      // ---- Riding on the ground ----
      const n = normalize(groundNormal)
      const contact = scale(groundPoint, 1 / grounded)
      const ahead = normalize(sub(forward, scale(n, dot(forward, n))))
      const side = normalize(cross(ahead, n))
      const speedAhead = dot(linvel, ahead)
      const { speed, turning } = stats
      // Riding control fades out as the bike stops being upright on its wheels
      // (a wheelie past 45° to the ground, lying on its side).
      const onWheels =
        clamp((dot(up, n) - 0.34) / (0.5 - 0.34), 0, 1) * clamp((0.9 - Math.abs(dot(forward, n))) / (0.9 - 0.7), 0, 1)

      // Speeding up and slowing down. Brakes and coasting can at most bring the
      // bike to a stop (allowing for the slope it is on), never push it backward.
      const drive = this.wheels[1].onGround ? throttle * driveAcceleration(speed, speedAhead) : 0
      const braking = brake * brakeDeceleration(speed)
      const coasting = (1 - throttle) * coastDeceleration(speed)
      const nextSpeed = speedAhead + (drive - gravity * dot(UP, ahead)) * dt
      const canSlow = Math.abs(nextSpeed) / dt
      const slowing = Math.min(braking + coasting, canSlow)
      const brakeShare = braking + coasting > 0 ? braking / (braking + coasting) : 0
      const against = -Math.sign(nextSpeed)
      pushes.push([scale(ahead, mass * (drive * onWheels)), centerOfMass])
      pushes.push([scale(ahead, mass * against * slowing * (1 - brakeShare) * onWheels), centerOfMass])
      // Braking acts lower down, so it dips the nose (noseDive 1 = at the ground, like a real bike).
      const comHeight = dot(sub(centerOfMass, contact), n)
      const brakePoint = sub(centerOfMass, scale(n, comHeight * clamp(stats.weight.noseDive, 0, 1)))
      pushes.push([scale(ahead, mass * against * slowing * brakeShare * onWheels), brakePoint])

      // Turning: the turn asked for, made wider if grip can't hold it.
      this.turnRadius = Math.max(turnRadiusAt(turning, speed, speedAhead), speedAhead ** 2 / (turning.grip * gravity))
      // with the front wheel up in a wheelie there's less to steer with
      const steering = steer * (this.wheels[0].onGround ? 1 : clamp(rider.wheelieSteering, 0, 1))
      const wantedTurnRate = (-steering * speedAhead) / this.turnRadius
      const turnNow = dot(angvel, n)
      const newTurn = turnNow + (wantedTurnRate - turnNow) * ease(dt, turning.steeringResponse) * onWheels
      newAngvel = add(angvel, scale(n, newTurn - turnNow))

      // Grip: it goes where it points. The rear wheel must not slide sideways,
      // so the middle of the bike moves sideways just as much as turning about
      // the rear wheel needs, and no more. Grip limits how hard that can pull.
      const toRear = stats.build.wheelbase / 2 + stats.weight.forward
      const wantedSideways = -newTurn * toRear
      const sideways = dot(linvel, side)
      const maxPull = turning.grip * gravity * dt
      const pull = clamp(wantedSideways - sideways, -maxPull, maxPull) * onWheels
      newLinvel = add(linvel, scale(side, pull))

      // Leaning into the turn, for the drawing: as far as the turn pulls sideways, up to maxLean.
      const leanWanted = clamp(-Math.atan((speedAhead * newTurn) / gravity), -turning.maxLean * DEG, turning.maxLean * DEG)
      this.lean += (leanWanted - this.lean) * ease(dt, turning.leanResponse)
      this.steerAngle = (steer * Math.atan(stats.build.wheelbase / turnRadiusAt(turning, speed, speedAhead))) / DEG

      // Leaning back with the throttle open lifts the front into a wheelie;
      // leaning forward with the brake on lifts the rear into a stoppie. Each
      // eases the bike toward its angle (measured from the ground) and holds it
      // there, so it can't loop over. Let go and gravity brings it back down.
      const noseUp = Math.asin(clamp(dot(forward, n), -1, 1))
      let liftTo = 0
      let lifting = 0
      if (lean < 0 && this.wheels[1].onGround) {
        liftTo = -lean * throttle * rider.wheelieAngle * DEG
        lifting = -lean
      } else if (lean > 0 && this.wheels[0].onGround) {
        liftTo = -lean * brake * rider.stoppieAngle * DEG
        lifting = lean
      }
      // nothing to do with both wheels down and no lift asked for
      if (lifting > 0 && (Math.abs(liftTo) > 0.5 * DEG || Math.abs(noseUp) > 0.5 * DEG)) {
        const wantedRate = clamp((liftTo - noseUp) / Math.max(rider.liftResponse, 0.05), -3, 3)
        const rateNow = dot(newAngvel, right)
        newAngvel = add(newAngvel, scale(right, (wantedRate - rateNow) * ease(dt, 0.04) * lifting))
      }
      // Moving your body forward or back squashes the front or rear suspension a little.
      leanTorque = -lean * rider.weightShift * onWheels
    } else {
      // ---- In the air ----
      // Steering turns the bike slowly about the vertical, if airTurn allows it.
      const { turning } = stats
      if (steer !== 0) {
        const wanted = -steer * turning.airTurn * DEG
        const turnNow = dot(angvel, UP)
        const newTurn = turnNow + (wanted - turnNow) * ease(dt, turning.steeringResponse)
        newAngvel = add(angvel, scale(UP, newTurn - turnNow))
      }
      // Leaning spins the bike nose up (back) or nose down (forward). Without
      // leaning it keeps whatever spin it has.
      if (lean !== 0) {
        const wanted = -lean * rider.airSpin * DEG
        const rateNow = dot(newAngvel, right)
        newAngvel = add(newAngvel, scale(right, (wanted - rateNow) * ease(dt, rider.airSpinResponse) * Math.abs(lean)))
      }
      this.lean += (0 - this.lean) * ease(dt, stats.turning.leanResponse)
      this.steerAngle = steer * 10
    }

    // ---- Upright helper: keeps the physics bike from tipping sideways ----
    // It works about the level part of the bike's forward direction. It lets
    // go when the bike points up or down (a wheelie past 60°, a nose dive),
    // where "tipping sideways" stops meaning anything and pushing would just
    // spin it, and when the bike has already fallen over (past 70°), where
    // pushing would lever it up off the ground.
    const { upright } = stats.build
    const level = normalize(vec(forward.x, 0, forward.z))
    const pointing = clamp((0.87 - Math.abs(forward.y)) / (0.87 - 0.5), 0, 1) // full below 30°, none past 60°
    const fallen = clamp((Math.abs(this.roll) - 70 * DEG) / ((50 - 70) * DEG), 0, 1) // full below 50°, none past 70°
    const tipRate = dot(angvel, level)
    const uprightTorque = (upright.stiffness * -this.roll - upright.damping * tipRate) * pointing * fallen

    body.setLinvel(newLinvel, true)
    body.setAngvel(newAngvel, true)
    body.resetForces(true)
    body.resetTorques(true)
    for (const [force, point] of pushes) body.addForceAtPoint(force, point, true)
    body.addTorque(scale(level, uprightTorque), true)
    body.addTorque(scale(right, leanTorque), true)

    if (grounded === 0) this.airtime += dt
    else if (this.airtime > 0) {
      // a little hop off a bump isn't a jump worth remembering
      if (this.airtime >= MIN_JUMP) this.lastAirtime = this.airtime
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

  /** How fast the rear wheel is sliding sideways, m/s (positive = to the right). */
  get slide(): number {
    const rotation = this.body.rotation()
    const forward = rotate(rotation, FORWARD)
    const right = normalize(vec(-forward.z, 0, forward.x))
    const rear = sub(this.body.worldCom(), scale(forward, this.stats.build.wheelbase / 2 + this.stats.weight.forward))
    const v = add(this.body.linvel(), cross(this.body.angvel(), sub(rear, this.body.worldCom())))
    return dot(v, right)
  }

  /** Sideways tilt of the physics bike, radians. Positive = right side down. (The drawn lean is `lean`.) */
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
      return Math.atan2(right.z, right.x) / DEG
    }
    return Math.atan2(forward.x, -forward.z) / DEG
  }

  /** Suspension travel of wheel `i` (0 = front), metres. */
  travel(i: number): number {
    return i === 0 ? this.stats.suspension.frontTravel : this.stats.suspension.rearTravel
  }

  /** Radius of wheel `i` (0 = front), metres. */
  radius(i: number): number {
    return i === 0 ? this.stats.build.frontWheel : this.stats.build.rearWheel
  }

  /** How much of the bike's weight rests on each wheel when standing level, newtons. */
  private staticLoads(gravity: number): [number, number] {
    const { wheelbase } = this.stats.build
    const toFront = wheelbase / 2 - this.stats.weight.forward
    const toRear = wheelbase / 2 + this.stats.weight.forward
    const weight = this.stats.weight.total * gravity
    return [(weight * toRear) / wheelbase, (weight * toFront) / wheelbase]
  }

  private readPose(): Pose {
    const p = this.body.translation()
    const r = this.body.rotation()
    return { position: vec(p.x, p.y, p.z), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }
  }

  /**
   * How much mass a push along `direction` at `point` moves, kg. Less than the
   * whole bike's, because part of the push turns the bike instead.
   */
  private massMovedAt(point: Vec3, direction: Vec3, centerOfMass: Vec3, rotation: Quat, mass: number): number {
    const { inertia } = this.stats.build
    const twist = cross(sub(point, centerOfMass), direction)
    // in the bike's own frame, where its inertia is pitch (x), yaw (y), roll (z)
    const local = rotate({ x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w }, twist)
    const turning = local.x ** 2 / inertia.pitch + local.y ** 2 / inertia.yaw + local.z ** 2 / inertia.roll
    return 1 / (1 / mass + turning)
  }

  /** Sets mass, balance point and inertia from the stats, when they changed. */
  private applyMass(): void {
    const { weight } = this.stats
    const { inertia } = this.stats.build
    const key = JSON.stringify([weight, inertia])
    if (key === this.massKey) return
    this.massKey = key
    this.body.setAdditionalMassProperties(
      weight.total,
      vec(0, weight.height, -weight.forward),
      vec(inertia.pitch, inertia.yaw, inertia.roll),
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    )
  }
}

/** How much of the way to go this step, for following something with a lag of `seconds`. */
function ease(dt: number, seconds: number): number {
  return seconds > 0 ? 1 - Math.exp(-dt / seconds) : 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
