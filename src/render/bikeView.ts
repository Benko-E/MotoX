import * as THREE from 'three'
import type { Bike } from '../physics/bike'
import { RiderView } from './riderView'

/**
 * A placeholder bike drawn from the physics state: a frame, a seat, forks
 * that stretch with the suspension, and wheels that spin. It leans into turns
 * about where the tyres touch the ground and turns its front wheel with the
 * steering; both are only drawn, the physics bike stays upright. It only reads
 * the physics, so swapping in a real model later can't change the handling.
 */
export class BikeView {
  /** Follows the physics bike exactly. */
  private readonly root = new THREE.Group()
  /** Sits on the ground under the bike and tips it into the turn. */
  private readonly leanPivot = new THREE.Group()
  /** Everything that's drawn, lifted back up from the lean pivot. */
  private readonly model = new THREE.Group()
  /** The front wheel and fork, turned with the steering. */
  private readonly frontEnd = new THREE.Group()
  private readonly rider: RiderView
  /** The rider's lean as drawn: follows the lean input, so the body moves smoothly. */
  private riderLean = 0
  private readonly wheels: THREE.Mesh[] = []
  private readonly legs: THREE.Mesh[] = []
  private readonly blend = new THREE.Quaternion()
  private readonly from = new THREE.Quaternion()
  private readonly to = new THREE.Quaternion()

  constructor(
    scene: THREE.Scene,
    private readonly bike: Bike,
  ) {
    const red = new THREE.MeshStandardMaterial({ color: 0xd8432b, roughness: 0.6 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 })
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.4, metalness: 0.6 })
    const tyre = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95 })
    const rim = new THREE.MeshStandardMaterial({ color: 0xe0b23a, roughness: 0.5 })

    const box = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }
    const half = bike.stats.build.wheelbase / 2
    box(this.model, 0.3, 0.3, 0.9, red, 0, 0, 0) // frame and engine (same size as the physics box)
    box(this.model, 0.26, 0.12, 0.75, dark, 0, 0.2, 0.15) // seat
    box(this.model, 0.24, 0.16, 0.3, red, 0, 0.22, -0.3) // tank
    box(this.frontEnd, 0.7, 0.04, 0.04, dark, 0, 0.42, 0.1) // handlebar
    box(this.frontEnd, 0.3, 0.03, 0.35, red, 0, 0.12, -0.05) // front fender
    this.frontEnd.position.z = -half
    this.model.add(this.frontEnd)

    // A wheel with a yellow stripe across, so you can see it turn.
    const wheelShape = new THREE.CylinderGeometry(1, 1, 0.12, 24).rotateZ(Math.PI / 2)
    const stripeShape = new THREE.BoxGeometry(0.13, 1.6, 0.18)
    for (let i = 0; i < 2; i++) {
      const parent = i === 0 ? this.frontEnd : this.model
      const wheel = new THREE.Mesh(wheelShape, tyre)
      wheel.add(new THREE.Mesh(stripeShape, rim))
      wheel.castShadow = true
      this.wheels.push(wheel)
      parent.add(wheel)
      // Fork legs at the front, swingarm at the rear: run from the frame to the axle.
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), metal)
      leg.castShadow = true
      this.legs.push(leg)
      parent.add(leg)
    }

    this.rider = new RiderView(this.model, this.frontEnd)
    this.leanPivot.add(this.model)
    this.root.add(this.leanPivot)
    scene.add(this.root)
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

  /** Draws the bike `alpha` of the way from the previous physics step to the latest; `dt` is the frame time. */
  update(alpha: number, dt: number): void {
    const { previous, current, stats, wheels } = this.bike
    this.root.position.lerpVectors(
      new THREE.Vector3().copy(previous.position),
      new THREE.Vector3().copy(current.position),
      alpha,
    )
    this.from.copy(previous.rotation)
    this.to.copy(current.rotation)
    this.root.quaternion.copy(this.blend.slerpQuaternions(this.from, this.to, alpha))

    const half = stats.build.wheelbase / 2
    const drops = wheels.map((state) => THREE.MathUtils.lerp(state.previousExtension, state.extension, alpha))
    wheels.forEach((_state, i) => {
      const radius = this.bike.radius(i)
      const along = i === 0 ? 0 : half // the front wheel sits in the front end, already at -half
      const wheel = this.wheels[i]
      wheel.scale.set(1, radius, radius)
      wheel.position.set(0, -drops[i], along)
      wheel.rotation.x = -wheels[i].spin

      // The leg runs from 0.25 m above the top of the travel down to the axle.
      const leg = this.legs[i]
      const top = 0.25
      leg.scale.y = top + drops[i]
      leg.position.set(0, (top - drops[i]) / 2, along)
    })
    this.frontEnd.rotation.y = (-this.bike.steerAngle * Math.PI) / 180

    // Lean about the line where the tyres touch the ground.
    const groundBelow = (drops[0] + drops[1] + this.bike.radius(0) + this.bike.radius(1)) / 2
    this.leanPivot.position.y = -groundBelow
    this.model.position.y = groundBelow
    this.leanPivot.rotation.z = -this.bike.lean

    this.riderLean += (this.bike.controls.lean - this.riderLean) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.08))
    const squash = (wheels[0].compressionRatio + wheels[1].compressionRatio) / 2
    this.frontEnd.updateMatrixWorld(true)
    this.rider.update(this.riderLean, squash)
  }
}
