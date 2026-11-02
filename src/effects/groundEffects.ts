import * as THREE from 'three'
import { WHEELBASE, WHEEL_RADIUS } from '../bike/bikeModel'
import type { Ground, Ride } from '../ride'
import { DirtSpray, type DirtSettings } from './dirtSpray'
import { TyreTracks, type TrackSettings } from './tyreTracks'

/** How the tyres scrub the dirt, read live so the debug menu applies at once. */
export interface ScrubSettings {
  /** Below this speed, full throttle spins the rear tyre up in the dirt, km/h. */
  wheelspinUntil: number
  /** How hard the tyres scrub carving a turn at the grip limit, 0 to 1. */
  carving: number
}

/** Braking skids fully from this speed up, m/s; slower it fades. */
const SKID_FULL = 3
/** The front tyre skids this much less than the rear under the brake. */
const FRONT_SKID = 0.4
/** The front tyre scrubs this much less than the rear carving. */
const FRONT_CARVE = 0.5
/** Spinning up in the dirt flat out, the rear tyre's surface runs this much faster than the ground, m/s. */
const WHEELSPIN_SURFACE = 12

/**
 * Where the tyres meet the dirt: the tracks they leave, and the clods they
 * throw up spinning up (throttle from low speed), skidding (braking) and
 * carving (turning at the grip limit). Only looks: it reads the ride and
 * never changes it.
 */
export class GroundEffects {
  readonly tracks: TyreTracks
  readonly dirt: DirtSpray
  /** Extra turns the rear wheel is drawn with while it spins up, radians. */
  rearWheelspin = 0
  private readonly at = new THREE.Vector3()
  private readonly normal = new THREE.Vector3()
  private readonly pointing = new THREE.Vector3()
  private readonly side = new THREE.Vector3()
  private readonly thrown = new THREE.Vector3()
  private readonly velocity = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    tracks: TrackSettings,
    dirt: DirtSettings,
    private readonly scrub: ScrubSettings,
    private readonly ground: Ground,
  ) {
    this.tracks = new TyreTracks(tracks)
    this.dirt = new DirtSpray(dirt, ground, () => 9.81)
    scene.add(this.tracks.mesh, this.dirt.mesh)
  }

  /** Call once a frame, after the ride has stepped. */
  update(ride: Ride, input: { throttle: boolean; brake: boolean }, dt: number): void {
    const forward = new THREE.Vector3(Math.sin(ride.heading), 0, -Math.cos(ride.heading))
    // up out of the ground, tipped with the bike's pitch along the slope
    this.normal.set(0, Math.cos(ride.pitch), 0).addScaledVector(forward, -Math.sin(ride.pitch))
    this.velocity.copy(forward).multiplyScalar(ride.speed).setY(ride.vy)
    const kmh = Math.abs(ride.speed) * 3.6

    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? 1 : -1
      const x = ride.x + forward.x * sign * (WHEELBASE / 2)
      const z = ride.z + forward.z * sign * (WHEELBASE / 2)
      if (ride.airborne) {
        this.tracks.touch(i, null, this.normal, 0)
        continue
      }
      const at = this.at.set(x, this.ground(x, z), z)

      // how hard this tyre scrubs: spinning up, skidding, carving
      const spin = i === 1 && input.throttle && ride.speed >= 0 ? clamp(1 - kmh / Math.max(this.scrub.wheelspinUntil, 1e-6)) : 0
      const skid = input.brake && ride.speed > 0 ? Math.min(ride.speed / SKID_FULL, 1) * (i === 0 ? FRONT_SKID : 1) : 0
      const carve = ride.limit === 'grip' ? Math.abs(ride.steering) * this.scrub.carving * (i === 0 ? FRONT_CARVE : 1) : 0
      const amount = Math.min(spin + skid + carve, 1)
      if (i === 1) this.rearWheelspin += (spin * WHEELSPIN_SURFACE * dt) / WHEEL_RADIUS
      this.tracks.touch(i, at, this.normal, amount)

      if (amount > 0) {
        // the way this tyre points along the ground (the front turned by the steering)
        this.pointing.copy(forward)
        if (i === 0) this.pointing.applyAxisAngle(this.normal, (-ride.wheelAngle * Math.PI) / 180)
        this.side.crossVectors(this.pointing, this.normal)
        // Spinning up throws dirt out behind, skidding pushes it on ahead,
        // carving flings it out to the outside of the turn.
        this.thrown
          .copy(this.pointing)
          .multiplyScalar(0.5 * skid - spin)
          .addScaledVector(this.side, -Math.sign(ride.turnRate) * carve)
        if (this.thrown.lengthSq() < 1e-6) this.thrown.copy(this.pointing).negate()
        this.dirt.throwFrom(at, this.thrown.normalize(), this.velocity, amount, dt)
      }
    }
    this.tracks.update(dt)
    this.dirt.update(dt)
  }
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
