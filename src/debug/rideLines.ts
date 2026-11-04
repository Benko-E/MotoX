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
/** Points round the turning circle, and how high above the ground it's drawn, metres. */
const CIRCLE_POINTS = 128
const CIRCLE_LIFT = 0.04
const DEG = Math.PI / 180

/**
 * The bike's debug lines, each switched on in the debug menu: where it's
 * going, how hard it's slowing down, where the front wheel points, and the
 * circle it's turning round; plus the turn readout. They draw over
 * everything, so the bike never hides them.
 */
export class RideLines {
  private readonly arrows = new Map<string, THREE.ArrowHelper>()
  /** A circle 1 m across the ground, scaled to the turn radius. */
  private readonly circle: THREE.LineLoop
  private readonly readout = document.getElementById('turn')!
  private readonly from = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    settings: Setting[],
    private readonly store: SettingsStore,
  ) {
    for (const s of settings.filter((s): s is LineSetting => s.kind === 'line' && s.id.startsWith('line.') && s.id !== 'line.turnCircle' && s.color !== undefined)) {
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

    const points = Array.from({ length: CIRCLE_POINTS }, (_, i) => {
      const a = (i / CIRCLE_POINTS) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    })
    const color = settings.find((s): s is LineSetting => s.id === 'line.turnCircle')!.color
    const material = new THREE.LineBasicMaterial({ color, depthTest: false })
    this.circle = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material)
    this.circle.renderOrder = 999
    this.circle.visible = false
    scene.add(this.circle)
  }

  update(ride: Ride): void {
    const forward = new THREE.Vector3(Math.sin(ride.heading), 0, -Math.cos(ride.heading))
    const frontWheel = new THREE.Vector3(ride.x, ride.y + WHEEL_RADIUS, ride.z).addScaledVector(forward, WHEELBASE / 2)

    // Forward: the way the bike is going, longer the faster.
    const going = ride.speed < 0 ? -1 : 1
    this.show('line.forward', frontWheel, this.dir.copy(forward).multiplyScalar(going), 0.5 + Math.abs(ride.speed) * PER_SPEED)

    // Slowing down: backwards from the centre of mass, longer the harder it slows.
    this.from.set(ride.x, ride.y + CENTRE_OF_MASS.up, ride.z).addScaledVector(forward, -CENTRE_OF_MASS.back)
    const length = ride.slowing * PER_SLOWING
    this.show('line.braking', this.from, this.dir.copy(forward).multiplyScalar(-going), length, length > 0.02)

    // Steering: the way the rider turns the bars, while A or D is held.
    const wheelHeading = ride.heading + ride.bars * DEG
    this.dir.set(Math.sin(wheelHeading), 0, -Math.cos(wheelHeading))
    this.show('line.steering', frontWheel, this.dir, STEERING_LENGTH, ride.steer !== 0)

    // Turning circle: centred off to the side the bike turns toward, through the bike's middle.
    const turning = ride.turnRadius < 1e4 && ride.speed !== 0
    this.circle.visible = turning && this.store.isOn('line.turnCircle')
    if (this.circle.visible) {
      const side = Math.sign(ride.steering) // not the wheel: powersliding, it points the other way
      const right = this.dir.set(Math.cos(ride.heading), 0, Math.sin(ride.heading))
      this.circle.position.set(ride.x, ride.y + CIRCLE_LIFT, ride.z).addScaledVector(right, side * ride.turnRadius)
      this.circle.scale.setScalar(ride.turnRadius)
    }

    this.readout.hidden = !this.store.isOn('line.turnReadout')
    if (!this.readout.hidden) {
      this.readout.textContent = turning
        ? [`turn radius ${ride.turnRadius.toFixed(1)} m`, `${Math.abs(ride.turnRate).toFixed(0)}°/s`, ride.limit ?? '', ...(ride.sliding > 0 ? [`sliding ${Math.abs(ride.slideYaw / (Math.PI / 180)).toFixed(0)}°`] : [])].join('\n')
        : 'going straight'
    }
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
