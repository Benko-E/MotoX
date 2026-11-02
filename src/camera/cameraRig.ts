import * as THREE from 'three'
import type { Ride } from '../ride'
import type { SettingsStore } from '../settings/store'
import { FlyCamera } from './flyCamera'

/** The views C goes through, in order. */
export const VIEWS = ['chase', 'close', 'high', 'helmet', 'free'] as const
export type View = (typeof VIEWS)[number]
export const VIEW_NAMES: Record<View, string> = {
  chase: 'Chase',
  close: 'Close',
  high: 'High',
  helmet: 'Helmet',
  free: 'Free roam',
}
/** Where each view behind the bike keeps its settings: `${prefix}.back`, `.up` and `.look`. */
const BEHIND: Partial<Record<View, string>> = { chase: 'camera', close: 'camera.close', high: 'camera.high' }
/** Seconds the camera takes to follow the bike up and down. */
const RISE = 0.15
/** The helmet view looks this far down from level, radians. */
const HELMET_DIP = 6 * (Math.PI / 180)

/** What the camera needs to know about the drawn bike. */
export interface BikeView {
  /** The bike as drawn: pitched, turned and leaning. */
  root: THREE.Object3D
  /** Where the rider's head is drawn, in world space. */
  headPosition(target: THREE.Vector3): THREE.Vector3
  /** Hidden in the helmet view, so the camera doesn't look at the inside of it. */
  headVisible: boolean
}

/**
 * The camera, in one of its views: behind the bike (chase, close, high),
 * through the rider's helmet, or flying free. C goes to the next one.
 */
export class CameraRig {
  view: View = 'chase'
  /** Which way the views behind the bike look from, radians: swings round after the bike. */
  private heading = 0
  /** How high they follow the bike, smoothed so bumps don't shake the view. */
  private y = 0
  private readonly fly: FlyCamera
  private readonly head = new THREE.Vector3()

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly store: SettingsStore,
    lookSurface: HTMLElement,
  ) {
    this.fly = new FlyCamera(
      camera,
      {
        get speed() { return store.get('camera.flySpeed') },
        get fast() { return store.get('camera.flyFast') },
        get look() { return store.get('camera.flyLook') },
      },
      lookSurface,
    )
  }

  /** Goes to the next view; flying starts from where the camera is. */
  next(): View {
    this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length]
    if (this.view === 'free') this.fly.takeOver()
    return this.view
  }

  get flying(): boolean {
    return this.view === 'free'
  }

  /** Call once a frame, after the bike has been drawn. */
  update(ride: Ride, bike: BikeView, dt: number): void {
    const fov = this.store.get('camera.fov')
    if (this.camera.fov !== fov) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    // the views behind the bike keep following even while another is on, so switching back doesn't swoop
    const lag = this.store.get('camera.lag')
    this.heading = lag > 0 ? this.heading + (ride.heading - this.heading) * (1 - Math.exp(-dt / lag)) : ride.heading
    this.y += (ride.y - this.y) * (1 - Math.exp(-dt / RISE))
    bike.headVisible = this.view !== 'helmet'

    if (this.view === 'free') {
      this.fly.update(dt)
      return
    }
    if (this.view === 'helmet') {
      // from the rider's eyes, looking the way the bike points, tilting with it half as much
      const r = bike.root.rotation
      bike.headPosition(this.head)
      this.camera.position.copy(this.head)
      this.camera.rotation.set(r.x - HELMET_DIP, r.y, r.z * 0.5, 'YXZ')
      return
    }
    const prefix = BEHIND[this.view]!
    const pull = 1 + (this.store.get('camera.speedPull') / 100) * (Math.abs(ride.speed) * 3.6 / 100)
    const back = this.store.get(`${prefix}.back`) * pull
    this.camera.position.set(
      ride.x - Math.sin(this.heading) * back,
      this.y + this.store.get(`${prefix}.up`),
      ride.z + Math.cos(this.heading) * back,
    )
    this.camera.lookAt(ride.x, this.y + this.store.get(`${prefix}.look`), ride.z)
  }
}
