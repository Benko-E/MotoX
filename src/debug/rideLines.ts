import * as THREE from 'three'
import { RIDE_HEIGHT, WHEELBASE, WHEEL_RADIUS } from '../bike/bikeModel'
import type { Ride } from '../ride'
import type { SettingsStore } from '../settings/store'
import type { LineSetting, Setting } from '../settings/types'

/** Where the bike and rider's centre of mass sits, above the ground and back from the middle of the bike, metres. */
const CENTRE_OF_MASS = { up: RIDE_HEIGHT + 0.25, back: 0.1 }
/** Metres of arrow per m/s of speed, per m/s² of slowing down, and the steering arrow's length. */
const PER_SPEED = 0.15
const PER_SLOWING = 0.25
const STEERING_LENGTH = 2.5
const DEG = Math.PI / 180

/**
 * The bike's debug arrows, each switched on in the debug menu: where it's
 * going, how hard it's slowing down, and where the front wheel points. They
 * draw over everything, so the bike never hides them.
 */
export class RideLines {
  private readonly arrows = new Map<string, THREE.ArrowHelper>()
  private readonly from = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    settings: Setting[],
    private readonly store: SettingsStore,
  ) {
    for (const s of settings.filter((s): s is LineSetting => s.kind === 'line')) {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, s.color, 0.3, 0.16)
      for (const part of [arrow.line, arrow.cone]) {
        const material = part.material as THREE.Material
        material.depthTest = false
        part.renderOrder = 999
      }
      arrow.visible = false
      scene.add(arrow)
      this.arrows.set(s.id, arrow)
    }
  }

  update(ride: Ride): void {
    const forward = new THREE.Vector3(Math.sin(ride.heading), 0, -Math.cos(ride.heading))
    const frontWheel = new THREE.Vector3(ride.x, WHEEL_RADIUS, ride.z).addScaledVector(forward, WHEELBASE / 2)

    // Forward: the way the bike is going, longer the faster.
    const going = ride.speed < 0 ? -1 : 1
    this.show('line.forward', frontWheel, this.dir.copy(forward).multiplyScalar(going), 0.5 + Math.abs(ride.speed) * PER_SPEED)

    // Slowing down: backwards from the centre of mass, longer the harder it slows.
    this.from.set(ride.x, CENTRE_OF_MASS.up, ride.z).addScaledVector(forward, -CENTRE_OF_MASS.back)
    const length = ride.slowing * PER_SLOWING
    this.show('line.braking', this.from, this.dir.copy(forward).multiplyScalar(-going), length, length > 0.02)

    // Steering: the way the front wheel points, while A or D is held.
    const wheelHeading = ride.heading + ride.bars * DEG
    this.dir.set(Math.sin(wheelHeading), 0, -Math.cos(wheelHeading))
    this.show('line.steering', frontWheel, this.dir, STEERING_LENGTH, ride.steer !== 0)
  }

  private show(id: string, from: THREE.Vector3, dir: THREE.Vector3, length: number, visible = true): void {
    const arrow = this.arrows.get(id)!
    arrow.visible = visible && this.store.isOn(id)
    if (!arrow.visible) return
    arrow.position.copy(from)
    arrow.setDirection(dir)
    arrow.setLength(Math.max(length, 0.35), 0.3, 0.16)
  }
}
