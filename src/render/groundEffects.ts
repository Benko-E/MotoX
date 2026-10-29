import * as THREE from 'three'
import type { EffectSettings } from '../config'
import type { Bike } from '../physics/bike'
import type { BikeView } from './bikeView'
import { DirtSpray } from './dirtSpray'
import { tyreScrub } from './scrub'
import { TyreShadows } from './tyreShadows'
import { TyreTracks } from './tyreTracks'

/**
 * Where the tyres meet the dirt: the tracks they leave, the clods they throw
 * up when they slide, skid or spin, and the soft shadow under each one. All
 * worked out from the drawn bike each frame; nothing here touches the physics.
 */
export class GroundEffects {
  readonly tracks: TyreTracks
  readonly dirt: DirtSpray
  readonly shadows: TyreShadows
  private readonly at = [new THREE.Vector3(), new THREE.Vector3()]
  private readonly normal = new THREE.Vector3()
  private readonly pointing = new THREE.Vector3()
  private readonly side = new THREE.Vector3()
  private readonly thrown = new THREE.Vector3()
  private readonly velocity = new THREE.Vector3()
  private readonly below = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    private readonly bike: Bike,
    private readonly view: BikeView,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: EffectSettings,
    /** The ground height under a point, metres. */
    private readonly groundAt: (x: number, z: number) => number,
    /** How hard things fall right now, m/s². */
    gravity: () => number,
  ) {
    this.tracks = new TyreTracks(settings.tyreTracks)
    this.dirt = new DirtSpray(settings.dirt, groundAt, gravity)
    this.shadows = new TyreShadows()
    scene.add(this.tracks.mesh, this.dirt.mesh, this.shadows.group)
  }

  /** Call once a frame, after the bike is drawn. */
  update(dt: number): void {
    const { bike, settings } = this
    const ground = bike.groundNormal
    const normal = ground ? this.normal.set(ground.x, ground.y, ground.z) : this.normal.set(0, 1, 0)
    const v = bike.body.linvel()
    this.velocity.set(v.x, v.y, v.z)
    let rearSpin = 0

    bike.wheels.forEach((wheel, i) => {
      const at = this.view.contactPoint(i, this.at[i])
      this.pointingOf(i, normal)
      const scrub = tyreScrub(bike, i, settings.wheelspinUntil)
      if (i === 1) rearSpin = scrub.spin
      this.tracks.touch(i, wheel.onGround ? at : null, normal, scrub.amount)

      if (wheel.onGround && scrub.amount > 0) {
        // Spinning up throws dirt out behind the tyre, sliding throws it the
        // way the tyre slides, skidding pushes it on ahead.
        this.side.crossVectors(this.pointing, normal)
        this.thrown
          .copy(this.pointing)
          .multiplyScalar(0.5 * scrub.skid - scrub.spin)
          .addScaledVector(this.side, Math.sign(scrub.sideways) * scrub.slide)
        if (this.thrown.lengthSq() < 1e-6) this.thrown.copy(this.pointing).negate()
        this.dirt.throwFrom(at, this.thrown.normalize(), this.velocity, scrub.amount, dt)
      }

      if (wheel.onGround) this.shadows.place(i, at, normal, this.pointing, 0, settings.tyreShadow)
      else {
        const height = this.groundAt(at.x, at.z)
        this.below.set(at.x, height, at.z)
        this.shadows.place(i, this.below, this.normal.set(0, 1, 0), this.pointing, at.y - height, settings.tyreShadow)
        if (ground) normal.set(ground.x, ground.y, ground.z)
      }
    })
    this.view.rearWheelspin = rearSpin
    this.tracks.update(dt)
    this.dirt.update(dt)
  }

  /** Which way tyre `i` points along the ground (the front turned by the steering), into `this.pointing`. */
  private pointingOf(i: number, normal: THREE.Vector3): void {
    const r = this.bike.body.rotation()
    const forward = this.pointing.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w))
    forward.addScaledVector(normal, -forward.dot(normal)).normalize()
    if (i === 0) forward.applyAxisAngle(normal, (-this.bike.steerAngle * Math.PI) / 180)
  }
}
