import * as THREE from 'three'
import type { Config } from '../config'
import { smoothAngleToward, smoothToward } from '../core/smoothing'

/** The camera never goes closer to the ground than this, metres. */
const GROUND_CLEARANCE = 0.5
/** If the bike suddenly ends up this far away (reset, drop), jump to it instead of gliding. */
const SNAP_DISTANCE = 30

/**
 * Third-person camera behind the bike. It follows only the bike's compass
 * heading, never its pitch or lean, so wheelies, jumps and leaning into turns
 * don't swing the view around. Height follows with its own, longer lag, so
 * bumps and landings don't shake the picture.
 */
export class ChaseCamera {
  private heading = 0
  private readonly focus = new THREE.Vector3()
  private placed = false

  constructor(
    private readonly config: Config,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  /** Moves `camera` for this frame. `dt` is the real frame time, `speed` in m/s. */
  update(
    camera: THREE.PerspectiveCamera,
    dt: number,
    bikePosition: THREE.Vector3,
    bikeHeading: number,
    speed: number,
  ): void {
    const c = this.config.chaseCamera
    if (!this.placed || this.focus.distanceTo(bikePosition) > SNAP_DISTANCE) {
      this.focus.copy(bikePosition)
      this.heading = bikeHeading
      this.placed = true
    }
    this.heading = smoothAngleToward(this.heading, bikeHeading, c.turnLag, dt)
    this.focus.x = smoothToward(this.focus.x, bikePosition.x, c.positionLag, dt)
    this.focus.z = smoothToward(this.focus.z, bikePosition.z, c.positionLag, dt)
    this.focus.y = smoothToward(this.focus.y, bikePosition.y, c.heightLag, dt)

    const h = (this.heading * Math.PI) / 180
    const distance = c.distance + c.distancePerSpeed * speed
    const x = this.focus.x - Math.sin(h) * distance
    const z = this.focus.z + Math.cos(h) * distance
    const y = Math.max(this.focus.y + c.height, this.groundAt(x, z) + GROUND_CLEARANCE)
    camera.position.set(x, y, z)
    camera.lookAt(this.focus.x, this.focus.y + c.lookHeight, this.focus.z)
  }

  /** Forget where it was, so the next update starts straight behind the bike. */
  snap(): void {
    this.placed = false
  }
}
