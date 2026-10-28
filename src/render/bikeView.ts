import * as THREE from 'three'
import type { Bike } from '../physics/bike'

/**
 * A placeholder bike drawn from the physics state: a frame, a seat, forks
 * that stretch with the suspension, and wheels that spin. It only reads the
 * physics, so swapping in a real model later can't change the handling.
 */
export class BikeView {
  private readonly root = new THREE.Group()
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

    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      this.root.add(mesh)
      return mesh
    }
    const half = bike.stats.wheelbase / 2
    box(0.3, 0.3, 0.9, red, 0, 0, 0) // frame and engine (same size as the physics box)
    box(0.26, 0.12, 0.75, dark, 0, 0.2, 0.15) // seat
    box(0.24, 0.16, 0.3, red, 0, 0.22, -0.3) // tank
    box(0.7, 0.04, 0.04, dark, 0, 0.42, -half + 0.1) // handlebar
    box(0.3, 0.03, 0.35, red, 0, 0.12, -half - 0.05) // front fender

    // A wheel with a yellow stripe across, so you can see it turn.
    const wheelShape = new THREE.CylinderGeometry(1, 1, 0.12, 24).rotateZ(Math.PI / 2)
    const stripeShape = new THREE.BoxGeometry(0.13, 1.6, 0.18)
    for (let i = 0; i < 2; i++) {
      const wheel = new THREE.Mesh(wheelShape, tyre)
      wheel.add(new THREE.Mesh(stripeShape, rim))
      wheel.castShadow = true
      this.wheels.push(wheel)
      this.root.add(wheel)
      // Fork legs at the front, swingarm at the rear: run from the frame to the axle.
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), metal)
      leg.castShadow = true
      this.legs.push(leg)
      this.root.add(leg)
    }

    scene.add(this.root)
  }

  /** Draws the bike `alpha` of the way from the previous physics step to the latest. */
  update(alpha: number): void {
    const { previous, current, stats, wheels } = this.bike
    this.root.position.lerpVectors(
      new THREE.Vector3().copy(previous.position),
      new THREE.Vector3().copy(current.position),
      alpha,
    )
    this.from.copy(previous.rotation)
    this.to.copy(current.rotation)
    this.root.quaternion.copy(this.blend.slerpQuaternions(this.from, this.to, alpha))

    const half = stats.wheelbase / 2
    wheels.forEach((state, i) => {
      const radius = i === 0 ? stats.front.radius : stats.rear.radius
      const along = i === 0 ? -half : half
      const drop = THREE.MathUtils.lerp(state.previousExtension, state.extension, alpha)
      const wheel = this.wheels[i]
      wheel.scale.set(1, radius, radius)
      wheel.position.set(0, -drop, along)
      wheel.rotation.x = -state.spin

      // The leg runs from 0.25 m above the top of the travel down to the axle.
      const leg = this.legs[i]
      const top = 0.25
      leg.scale.y = top + drop
      leg.position.set(0, (top - drop) / 2, along)
    })
  }
}
