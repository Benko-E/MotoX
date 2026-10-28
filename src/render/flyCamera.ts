import * as THREE from 'three'
import type { Config } from '../config'
import type { Input } from '../core/input'

/** The camera never goes closer to the ground than this, metres. */
const GROUND_CLEARANCE = 0.5
const MAX_PITCH = (89 * Math.PI) / 180

/**
 * A free-flying camera for looking around the map. Click the game to steer
 * the view with the mouse (Esc gives the mouse back), or drag with the button
 * held; W/A/S/D fly, E/Q go up and down, Shift goes fast.
 *
 * Movement runs on the fixed physics step like everything else, and drawing
 * blends between the last two steps. Looking around follows the mouse
 * directly, every frame.
 */
export class FlyCamera {
  private readonly position = new THREE.Vector3()
  private readonly previous = new THREE.Vector3()
  private yaw = 0
  private pitch = 0

  constructor(
    element: HTMLElement,
    private readonly config: Config,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    // Click to capture the mouse. Where a browser won't allow that, holding
    // the button and dragging works too.
    let dragging = false
    element.addEventListener('mousedown', () => (dragging = true))
    document.addEventListener('mouseup', () => (dragging = false))
    element.addEventListener('click', () => {
      element.requestPointerLock()?.catch?.(() => {})
    })
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== element && !dragging) return
      const sensitivity = this.config.flyCamera.mouseSensitivity
      this.yaw -= event.movementX * sensitivity
      this.pitch = clamp(this.pitch - event.movementY * sensitivity, -MAX_PITCH, MAX_PITCH)
    })
  }

  /** Puts the camera at `from`, looking at `to`. */
  place(from: THREE.Vector3Like, to: THREE.Vector3Like): void {
    this.position.copy(from)
    this.previous.copy(from)
    const look = new THREE.Vector3().copy(to).sub(from)
    this.yaw = Math.atan2(-look.x, -look.z)
    this.pitch = Math.atan2(look.y, Math.hypot(look.x, look.z))
  }

  step(dt: number, input: Input): void {
    this.previous.copy(this.position)
    const { speed, fastMultiplier } = this.config.flyCamera
    const metres = speed * (input.isDown('flyFast') ? fastMultiplier : 1) * dt

    const cosPitch = Math.cos(this.pitch)
    const forward = new THREE.Vector3(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    this.position
      .addScaledVector(forward, input.axis('flyMove') * metres)
      .addScaledVector(right, input.axis('flyStrafe') * metres)
    this.position.y += input.axis('flyLift') * metres

    const floor = this.groundAt(this.position.x, this.position.z) + GROUND_CLEARANCE
    if (this.position.y < floor) this.position.y = floor
  }

  /** Moves the real camera, blended `alpha` of the way from the previous step to the latest. */
  apply(camera: THREE.PerspectiveCamera, alpha: number): void {
    camera.position.lerpVectors(this.previous, this.position, alpha)
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
