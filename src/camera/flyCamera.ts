import * as THREE from 'three'

/** How the free-roam camera flies, read live so the debug menu applies at once. */
export interface FlySettings {
  /** Flying speed, m/s. */
  speed: number
  /** Speed × this while Shift is held. */
  fast: number
  /** How far the view turns per pixel the mouse moves, degrees. */
  look: number
}

/** The mouse button that looks around while held (2 = right, like editors). */
const LOOK_BUTTON = 2
const MAX_PITCH = 89 * (Math.PI / 180)

/**
 * A free camera for looking around: W A S D fly level with the ground
 * whichever way it looks, Space goes up, Q down, Shift faster, and holding
 * the right mouse button looks around.
 */
export class FlyCamera {
  private readonly keys = new Set<string>()
  private looking = false
  private dx = 0
  private dy = 0
  private yaw = 0
  private pitch = 0

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly settings: FlySettings,
    lookSurface: HTMLElement,
  ) {
    addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.code)
    })
    addEventListener('keyup', (e) => this.keys.delete(e.code))
    addEventListener('blur', () => {
      this.keys.clear()
      this.looking = false
    })
    lookSurface.addEventListener('mousedown', (e) => {
      if (e.button === LOOK_BUTTON) this.looking = true
    })
    // let go anywhere, even over the menu
    addEventListener('mouseup', (e) => {
      if (e.button === LOOK_BUTTON) this.looking = false
    })
    addEventListener('mousemove', (e) => {
      if (!this.looking) return
      this.dx += e.movementX
      this.dy += e.movementY
    })
    lookSurface.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Starts flying from wherever the camera is now, looking the same way. */
  takeOver(): void {
    const look = this.camera.getWorldDirection(new THREE.Vector3())
    this.yaw = Math.atan2(-look.x, -look.z)
    this.pitch = Math.asin(THREE.MathUtils.clamp(look.y, -1, 1))
    this.dx = this.dy = 0
  }

  update(dt: number): void {
    const s = this.settings
    const turn = s.look * (Math.PI / 180)
    this.yaw -= this.dx * turn
    this.pitch = THREE.MathUtils.clamp(this.pitch - this.dy * turn, -MAX_PITCH, MAX_PITCH)
    this.dx = this.dy = 0
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')

    const axis = (plus: string, minus: string) => (this.keys.has(plus) ? 1 : 0) - (this.keys.has(minus) ? 1 : 0)
    const forward = axis('KeyW', 'KeyS')
    const right = axis('KeyD', 'KeyA')
    const up = axis('Space', 'KeyQ')
    const step = s.speed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? s.fast : 1) * dt
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const p = this.camera.position
    p.x += (-sin * forward + cos * right) * step
    p.z += (-cos * forward - sin * right) * step
    p.y += up * step
  }
}
