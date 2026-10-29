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
  /** Which of config.camera.views it shows. */
  view = 'chase'
  /** How far it's zoomed, as a share of the view's distance (the scroll wheel). */
  zoom = 1
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
    const c = this.config.camera
    if (!this.placed || this.focus.distanceTo(bikePosition) > SNAP_DISTANCE) {
      this.focus.copy(bikePosition)
      this.heading = bikeHeading
      this.placed = true
    }
    this.heading = smoothAngleToward(this.heading, bikeHeading, c.turnLag, dt)
    this.focus.x = smoothToward(this.focus.x, bikePosition.x, c.positionLag, dt)
    this.focus.z = smoothToward(this.focus.z, bikePosition.z, c.positionLag, dt)
    this.focus.y = smoothToward(this.focus.y, bikePosition.y, c.heightLag, dt)

    const view = (c.views as Record<string, { distance: number; height: number; lookHeight: number }>)[this.view] ?? c.views.chase
    const h = (this.heading * Math.PI) / 180
    const distance = view.distance * this.zoom + c.distancePerSpeed * speed
    const x = this.focus.x - Math.sin(h) * distance
    const z = this.focus.z + Math.cos(h) * distance
    const y = Math.max(this.focus.y + view.height * this.zoom, this.groundAt(x, z) + GROUND_CLEARANCE)
    camera.position.set(x, y, z)
    camera.lookAt(this.focus.x, this.focus.y + view.lookHeight, this.focus.z)
  }

  /** Zooms out (positive) or in by scroll wheel clicks, within camera.closest and camera.furthest. */
  zoomBy(clicks: number): void {
    const { zoomStep, closest, furthest } = this.config.camera
    this.zoom = Math.min(Math.max(this.zoom * (1 + zoomStep) ** clicks, closest), furthest)
  }

  /** Forget where it was, so the next update starts straight behind the bike. */
  snap(): void {
    this.placed = false
  }
}
