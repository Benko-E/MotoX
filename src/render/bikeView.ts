import * as THREE from 'three'
import type { Bike } from '../physics/bike'
import { FACTORY, type Livery } from './livery'
import { RiderMotion } from './riderMotion'
import { PEGS, RiderView } from './riderView'
import { buildWheel } from './wheel'

/**
 * A placeholder dirt bike drawn from the physics state: high bars on raked
 * forks, a long flat seat up high, high fenders clear of the tyres, an
 * engine and frame, a swingarm and shock that follow the suspension, and
 * wheels that spin. It leans into turns about where the tyres touch the
 * ground and turns its front wheel and bars with the steering; both are only
 * drawn, the physics bike stays upright. It only reads the physics, so
 * swapping in a real model later can't change the handling.
 */
/** The middle of the handlebar, in the bike's space: high, and well back from the front axle (the forks are raked). */
export const BARS = new THREE.Vector3(0, 0.74, -0.38)
/** Where the fork legs start under the top clamp, in the handlebar's space (and mirrored). */
const FORK_TOP = new THREE.Vector3(0.1, -0.12, -0.08)
/** Where the swingarm pivots, in the bike's space (and mirrored). */
const SWINGARM_PIVOT = new THREE.Vector3(0.1, 0, 0.16)
/** The top of the rear shock, and how far along the swingarm its bottom is mounted. */
const SHOCK_TOP = new THREE.Vector3(0, 0.38, 0.12)
const SHOCK_ALONG = 0.4
/** Spinning up in the dirt flat out, the rear tyre's surface runs this much faster than the ground, m/s. */
const WHEELSPIN_SURFACE = 12
const UP = { x: 0, y: 1, z: 0 }
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

export class BikeView {
  /** Follows the physics bike exactly. */
  private readonly root = new THREE.Group()
  /** Sits on the ground under the bike and tips it into the turn. */
  private readonly leanPivot = new THREE.Group()
  /** Everything that's drawn, lifted back up from the lean pivot. */
  private readonly model = new THREE.Group()
  /** The front wheel and fender, turned with the steering. */
  private readonly frontEnd = new THREE.Group()
  /** The handlebar, turned with the steering about its own middle. */
  private readonly bars = new THREE.Group()
  private readonly rider: RiderView
  /** What the rider's body is doing: standing, soaking up landings, a foot out. */
  readonly riderMotion = new RiderMotion()
  /** The rider's lean as drawn: follows the lean input, so the body moves smoothly. */
  private riderLean = 0
  private readonly wheels: THREE.Object3D[] = []
  private readonly forks: THREE.Mesh[]
  private readonly swingarm: THREE.Mesh[]
  private readonly shock: THREE.Mesh
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  private readonly blend = new THREE.Quaternion()
  private readonly fromTurn = new THREE.Quaternion()
  private readonly toTurn = new THREE.Quaternion()
  private readonly inverse = new THREE.Quaternion()
  private readonly pivot = new THREE.Vector3()
  private readonly leanAxis = new THREE.Vector3()
  private readonly normal = new THREE.Vector3()
  /** How far each wheel hangs below the top of its suspension this frame, metres. */
  private drops = [0, 0]
  /** Extra turns the rear wheel is drawn with while it spins up in the dirt, radians. */
  private wheelspinTurns = 0
  /** How hard the rear tyre is spinning up in the dirt, 0 to 1 (set by the ground effects). */
  rearWheelspin = 0

  constructor(
    scene: THREE.Scene,
    private readonly bike: Bike,
    /** The colours of the bike and its rider. */
    livery: Livery = FACTORY,
  ) {
    const red = new THREE.MeshStandardMaterial({ color: livery.plastics, roughness: 0.55 })
    const white = new THREE.MeshStandardMaterial({ color: livery.plates, roughness: 0.6 })
    const dark = new THREE.MeshStandardMaterial({ color: livery.trim, roughness: 0.8 })
    const metal = new THREE.MeshStandardMaterial({ color: livery.metal, roughness: 0.4, metalness: 0.6 })
    const spring = new THREE.MeshStandardMaterial({ color: livery.shock, roughness: 0.5 })
    const wheelParts = {
      tyre: new THREE.MeshStandardMaterial({ color: livery.tyres, roughness: 0.95 }),
      rim: new THREE.MeshStandardMaterial({ color: livery.rims, roughness: 0.35, metalness: 0.7 }),
      spokes: new THREE.MeshStandardMaterial({ color: livery.spokes, roughness: 0.45 }),
      metal,
      trim: dark,
    }

    /** A box part; `tilt` (radians) lifts its front end. */
    const box = (
      parent: THREE.Object3D,
      size: [number, number, number],
      material: THREE.Material,
      at: [number, number, number],
      name = '',
      tilt = 0,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...at)
      mesh.rotation.x = tilt
      mesh.name = name
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }
    /** A tube between two fixed points of the bike. */
    const tube = (from: [number, number, number], to: [number, number, number], thickness: number, material: THREE.Material) =>
      placeBetween(this.rod(thickness, material), new THREE.Vector3(...from), new THREE.Vector3(...to))
    const half = bike.stats.build.wheelbase / 2

    // Bodywork: a long flat seat up high, the tank and radiator shrouds under
    // the front of it, number plates, and the rear fender sweeping up clear of the tyre.
    box(this.model, [0.24, 0.08, 0.86], dark, [0, 0.48, 0.24], 'seat')
    box(this.model, [0.26, 0.17, 0.42], red, [0, 0.46, -0.2]) // tank
    box(this.model, [0.4, 0.26, 0.24], red, [0, 0.38, -0.3]) // radiator shrouds
    box(this.model, [0.3, 0.2, 0.32], white, [0, 0.38, 0.44]) // side number plates
    box(this.model, [0.2, 0.03, 0.6], red, [0, 0.53, 0.92], 'rear fender', -0.25)
    // Engine, frame and exhaust.
    box(this.model, [0.24, 0.3, 0.34], dark, [0, -0.06, -0.08]) // crankcase
    box(this.model, [0.2, 0.2, 0.16], metal, [0, 0.16, -0.2], '', 0.25) // cylinder
    tube([0, 0.56, -0.46], [0, -0.18, -0.25], 0.06, metal) // down tube
    tube([0, 0.53, -0.44], [0, 0.36, 0.32], 0.06, metal) // top rail, under the tank and seat
    tube([0, 0.36, 0.32], [0, 0, 0.16], 0.06, metal) // down to the swingarm pivot
    tube([0.14, 0.12, -0.28], [0.16, 0.24, 0.3], 0.05, metal) // exhaust pipe
    tube([0.16, 0.27, 0.3], [0.17, 0.4, 0.72], 0.1, dark) // silencer
    for (const peg of PEGS) box(this.model, [0.1, 0.03, 0.05], dark, [peg.x, peg.y, peg.z]) // footpegs

    // The handlebar sits high and back, on the tops of the raked forks. It
    // turns about its own middle, like on a real bike, where the steering head is.
    this.bars.position.copy(BARS)
    box(this.bars, [0.82, 0.035, 0.035], dark, [0, 0, 0], 'handlebar')
    box(this.bars, [0.12, 0.05, 0.05], dark, [0, -0.03, 0]) // bar pad
    box(this.bars, [0.26, 0.05, 0.12], metal, [0, -0.11, -0.07]) // top clamp
    box(this.bars, [0.28, 0.22, 0.02], white, [0, -0.2, -0.14], '', -0.35) // front number plate
    this.model.add(this.bars)

    // The front wheel and fender turn with the steering. The fender is mounted
    // high, on the forks, so the tyre never touches it.
    box(this.frontEnd, [0.14, 0.03, 0.46], red, [0, 0.5, -0.1], 'front fender', 0.15)
    this.frontEnd.position.z = -half
    this.model.add(this.frontEnd)

    // Spoked wheels: thin knobby tyres on rims, so you can see through them.
    for (let i = 0; i < 2; i++) {
      const wheel = buildWheel(wheelParts, i === 1)
      wheel.name = i === 0 ? 'front tyre' : 'rear tyre'
      this.wheels.push(wheel)
      ;(i === 0 ? this.frontEnd : this.model).add(wheel)
    }
    // Fork legs from the top clamp down to the front axle, swingarm arms from
    // the pivot back to the rear axle, and the rear shock: they follow the suspension.
    this.forks = [0, 1].map(() => this.rod(0.06, metal))
    this.swingarm = [0, 1].map(() => this.rod(0.05, metal))
    this.shock = this.rod(0.07, spring)

    this.rider = new RiderView(this.model, this.bars, livery)
    this.leanPivot.add(this.model)
    this.root.add(this.leanPivot)
    scene.add(this.root)
  }

  /** A rod of `thickness` on the bike, stretched between two points with `placeBetween`. */
  private rod(thickness: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, 1), material)
    mesh.castShadow = true
    this.model.add(mesh)
    return mesh
  }

  /** Where the bike is drawn this frame (between physics steps). */
  get position(): THREE.Vector3 {
    return this.root.position
  }

  /** The compass heading the bike is drawn facing, degrees (0 = toward -z, 90 = toward +x). */
  get heading(): number {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion)
    if (Math.abs(forward.y) > 0.9) {
      // pointing nearly straight up or down: read it off the bike's right side
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion)
      return (Math.atan2(right.z, right.x) * 180) / Math.PI
    }
    return (Math.atan2(forward.x, -forward.z) * 180) / Math.PI
  }

  /**
   * Where drawn tyre `i` (0 = front) touches the ground this frame, or its
   * lowest point while it's in the air, in world space.
   */
  contactPoint(i: number, target: THREE.Vector3): THREE.Vector3 {
    const half = this.bike.stats.build.wheelbase / 2
    this.root.updateMatrixWorld()
    target.set(0, -this.drops[i], i === 0 ? -half : half).applyMatrix4(this.root.matrixWorld) // the axle
    const down = this.bike.groundNormal ?? UP
    return target.addScaledVector(this.normal.set(down.x, down.y, down.z), -this.bike.radius(i))
  }

  /** Draws the bike `alpha` of the way from the previous physics step to the latest; `dt` is the frame time. */
  update(alpha: number, dt: number): void {
    const { previous, current, stats, wheels } = this.bike
    this.root.position.lerpVectors(
      new THREE.Vector3().copy(previous.position),
      new THREE.Vector3().copy(current.position),
      alpha,
    )
    this.fromTurn.copy(previous.rotation)
    this.toTurn.copy(current.rotation)
    this.root.quaternion.copy(this.blend.slerpQuaternions(this.fromTurn, this.toTurn, alpha))

    const half = stats.build.wheelbase / 2
    const drops = wheels.map((state) => THREE.MathUtils.lerp(state.previousExtension, state.extension, alpha))
    this.drops = drops
    // spinning up, the rear tyre's surface runs this much faster than the ground
    this.wheelspinTurns += (this.rearWheelspin * WHEELSPIN_SURFACE * Math.min(dt, 0.1)) / this.bike.radius(1)
    wheels.forEach((_state, i) => {
      const radius = this.bike.radius(i)
      const along = i === 0 ? 0 : half // the front wheel sits in the front end, already at -half
      const wheel = this.wheels[i]
      wheel.scale.setScalar(radius)
      wheel.position.set(0, -drops[i], along)
      wheel.rotation.x = -wheels[i].spin - (i === 1 ? this.wheelspinTurns : 0)
    })
    const turn = (-this.bike.steerAngle * Math.PI) / 180
    this.frontEnd.rotation.y = turn
    this.bars.rotation.y = turn

    // The fork legs run from under the top clamp down to the front axle, and
    // the swingarm from its pivot back to the rear axle (in the bike's space).
    const { from, to } = this
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1
      from.set(sign * FORK_TOP.x, FORK_TOP.y, FORK_TOP.z).applyAxisAngle(Y_AXIS, turn).add(BARS)
      to.set(sign * FORK_TOP.x, -drops[0], 0).applyAxisAngle(Y_AXIS, turn).add(this.frontEnd.position)
      placeBetween(this.forks[side], from, to)
      from.set(sign * SWINGARM_PIVOT.x, SWINGARM_PIVOT.y, SWINGARM_PIVOT.z)
      placeBetween(this.swingarm[side], from, to.set(sign * SWINGARM_PIVOT.x, -drops[1], half))
    }
    to.set(0, SWINGARM_PIVOT.y, SWINGARM_PIVOT.z).lerp(from.set(0, -drops[1], half), SHOCK_ALONG)
    placeBetween(this.shock, from.copy(SHOCK_TOP), to)

    // Lean about the line where the tyres touch the ground: through the rear
    // tyre (in a wheelie the only one down), along the ground the way the bike
    // points. Not along the bike itself: up in a wheelie that line points up
    // too, and leaning about it would twist the bike off where it's going.
    this.pivot.set(0, -(drops[1] + this.bike.radius(1)), half)
    this.leanPivot.position.copy(this.pivot)
    this.model.position.copy(this.pivot).negate()
    this.leanAxis.set(0, 0, -1)
    const ground = this.bike.groundNormal
    if (ground) {
      const forward = this.leanAxis.applyQuaternion(this.root.quaternion)
      const normal = this.normal.set(ground.x, ground.y, ground.z)
      forward.addScaledVector(normal, -forward.dot(normal)).normalize()
      forward.applyQuaternion(this.inverse.copy(this.root.quaternion).invert()) // back into the bike's own space
    }
    this.leanPivot.quaternion.setFromAxisAngle(this.leanAxis, this.bike.lean)

    this.riderLean += (this.bike.controls.lean - this.riderLean) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.08))
    const squash = (wheels[0].compressionRatio + wheels[1].compressionRatio) / 2
    this.model.updateMatrixWorld(true)
    this.riderMotion.update(this.bike, Math.min(dt, 0.1))
    this.rider.update(this.riderLean, squash, this.bike.steerAngle, this.riderMotion)
  }
}

/** Stretches a rod from `a` to `b` (both in its parent's space). */
function placeBetween(rod: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const along = new THREE.Vector3().subVectors(b, a)
  rod.position.addVectors(a, b).multiplyScalar(0.5)
  rod.scale.z = Math.max(along.length(), 0.01)
  rod.quaternion.setFromUnitVectors(Z_AXIS, along.normalize())
  return rod
}
