import * as THREE from 'three'
import { FACTORY, type Livery } from './livery'
import { PEGS, RiderView, type RiderShape } from './riderView'
import { buildWheel } from './wheel'

/**
 * The dirt bike and its rider, built from boxes, rods and rings, so a livery
 * recolours all of it. It knows nothing about how the bike rides: you put it
 * somewhere, point it, turn its bars and spin its wheels. The bike's origin
 * is halfway between the axles; the tyres touch the ground RIDE_HEIGHT below it.
 */
/** The middle of the handlebar, in the bike's space: high, and well back from the front axle (the forks are raked). */
export const BARS = new THREE.Vector3(0, 0.74, -0.38)
/** Distance between the two axles, metres. */
export const WHEELBASE = 1.48
/** Both wheels' radius, metres. */
export const WHEEL_RADIUS = 0.43
/** How far the axles hang below the bike's frame, metres (the suspension at rest). */
const AXLE_DROP = 0.2
/** How far the bike's origin sits above the ground. */
export const RIDE_HEIGHT = AXLE_DROP + WHEEL_RADIUS
/** Where the fork legs start under the top clamp, in the handlebar's space (and mirrored). */
const FORK_TOP = new THREE.Vector3(0.1, -0.12, -0.08)
/** Where the swingarm pivots, in the bike's space (and mirrored). */
const SWINGARM_PIVOT = new THREE.Vector3(0.1, 0, 0.16)
/** The top of the rear shock, and how far along the swingarm its bottom is mounted. */
const SHOCK_TOP = new THREE.Vector3(0, 0.38, 0.12)
const SHOCK_ALONG = 0.4
/** What the rider's body is doing: how far up on the pegs, how deep in a landing crouch. */
export type RiderMotionShape = Pick<RiderShape, 'standing' | 'absorb'>
const STILL: RiderMotionShape = { standing: 0, absorb: 0 }
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

export class BikeModel {
  /** Put this where the bike is and turn it the way it points (it faces -z). */
  readonly root = new THREE.Group()
  /** Everything that's drawn, lifted so the tyres sit on the root's ground. */
  private readonly model = new THREE.Group()
  /** The front wheel and fender, turned with the steering. */
  private readonly frontEnd = new THREE.Group()
  /** The handlebar, turned with the steering about its own middle. */
  private readonly bars = new THREE.Group()
  private readonly rider: RiderView
  private readonly wheels: THREE.Object3D[] = []
  private readonly forks: THREE.Mesh[]
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()

  constructor(
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
    const half = WHEELBASE / 2

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
      wheel.scale.setScalar(WHEEL_RADIUS)
      wheel.position.set(0, -AXLE_DROP, i === 0 ? 0 : half) // the front wheel sits in the front end, already at -half
      this.wheels.push(wheel)
      ;(i === 0 ? this.frontEnd : this.model).add(wheel)
    }
    // Fork legs from the top clamp down to the front axle (they follow the
    // steering), swingarm arms from the pivot back to the rear axle, and the rear shock.
    this.forks = [0, 1].map(() => this.rod(0.06, metal))
    const { from, to } = this
    for (const sign of [-1, 1]) {
      from.set(sign * SWINGARM_PIVOT.x, SWINGARM_PIVOT.y, SWINGARM_PIVOT.z)
      placeBetween(this.rod(0.05, metal), from, to.set(sign * SWINGARM_PIVOT.x, -AXLE_DROP, half))
    }
    to.set(0, SWINGARM_PIVOT.y, SWINGARM_PIVOT.z).lerp(from.set(0, -AXLE_DROP, half), SHOCK_ALONG)
    placeBetween(this.rod(0.07, spring), from.copy(SHOCK_TOP), to)

    this.rider = new RiderView(this.model, this.bars, livery)
    this.model.position.y = RIDE_HEIGHT
    this.root.add(this.model)
    this.update(0, 0)
  }

  /** A rod of `thickness` on the bike, stretched between two points with `placeBetween`. */
  private rod(thickness: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, 1), material)
    mesh.castShadow = true
    this.model.add(mesh)
    return mesh
  }

  /**
   * Turns the bars `steer` degrees (positive = right) and the wheels to
   * `spin` radians rolled, the rear `rearSpin` further (spinning up in the dirt).
   */
  update(steer: number, spin: number, rearSpin = 0, motion: RiderMotionShape = STILL): void {
    const turn = (-steer * Math.PI) / 180
    this.frontEnd.rotation.y = turn
    this.bars.rotation.y = turn
    this.wheels[0].rotation.x = -spin
    this.wheels[1].rotation.x = -spin - rearSpin

    const { from, to } = this
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1
      from.set(sign * FORK_TOP.x, FORK_TOP.y, FORK_TOP.z).applyAxisAngle(Y_AXIS, turn).add(BARS)
      to.set(sign * FORK_TOP.x, -AXLE_DROP, 0).applyAxisAngle(Y_AXIS, turn).add(this.frontEnd.position)
      placeBetween(this.forks[side], from, to)
    }
    // the rider stands, sits and crouches as `motion` says; his hands follow the bars
    this.model.updateMatrixWorld(true)
    this.rider.update(0, 0.3, steer, { ...motion, legOut: 0 })
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
