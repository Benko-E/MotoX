import * as THREE from 'three'

/** The eye sits this far in front of the middle of the helmet, metres (just past the goggles). */
const EYE_AHEAD = 0.16
/** Seconds the view takes to follow the way the bike points: a touch of lag takes the edge off bumps. */
const LOOK_LAG = 0.06
/** Looking this far down from straight ahead, so the bars show (about 12 degrees). */
const DOWN = new THREE.Vector3(0, -Math.tan((12 * Math.PI) / 180), 0)

/**
 * The helmet view: looking out from the rider's head the way the bike
 * points, nose up and down with it, but with the horizon always level (it
 * doesn't tip over with the lean, which would make you seasick).
 */
export class HelmetCamera {
  private readonly look = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private placed = false

  /** Moves `camera` for this frame: `head` is the rider's head and `forward` the way the bike points, both in world space. */
  update(camera: THREE.PerspectiveCamera, dt: number, head: THREE.Vector3, forward: THREE.Vector3): void {
    if (!this.placed) {
      this.look.copy(forward)
      this.placed = true
    }
    this.look.lerp(forward, 1 - Math.exp(-dt / LOOK_LAG)).normalize()
    camera.position.copy(head).addScaledVector(this.look, EYE_AHEAD)
    camera.up.set(0, 1, 0)
    // looking a little down, so the bars and number plate show at the bottom
    camera.lookAt(this.target.copy(camera.position).add(this.look).add(DOWN))
  }

  /** Forget the way it was looking, so the next update starts straight ahead. */
  snap(): void {
    this.placed = false
  }
}
