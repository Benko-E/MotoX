import type { Bike } from '../physics/bike'
import { add, cross, dot, normalize, rotate, rotateAround, scale, sub, vec } from '../physics/vec'

/**
 * How hard a tyre is scrubbing the dirt right now: sliding sideways across
 * the way it points, spinning up under throttle, or skidding under the brake.
 * It only decides how things look (how dark the track is, how much dirt flies),
 * never how the bike rides.
 */
export interface Scrub {
  /** Everything together, 0 (just rolling) to 1 (flat out). */
  amount: number
  /** How fast the tyre slides sideways across the way it points, m/s (positive = to the bike's right). */
  sideways: number
  /** Sliding sideways, 0 to 1. */
  slide: number
  /** Spinning up under throttle, 0 to 1 (the rear tyre only: it's the driven one). */
  spin: number
  /** Skidding under the brake, 0 to 1. */
  skid: number
}

const NONE: Scrub = { amount: 0, sideways: 0, slide: 0, spin: 0, skid: 0 }
const DEG = Math.PI / 180
/** Sliding sideways this fast scrubs flat out, m/s. */
const SLIDE_FULL = 4
/** Braking skids fully from this speed up, m/s; slower it fades. */
const SKID_FULL = 3
/** The front tyre skids this much less than the rear under the brake. */
const FRONT_SKID = 0.4

/** How hard tyre `i` (0 = front) scrubs; the rear spins up under throttle below `wheelspinUntil` km/h. */
export function tyreScrub(bike: Bike, i: number, wheelspinUntil: number): Scrub {
  const wheel = bike.wheels[i]
  if (!wheel.onGround || bike.crashed) return NONE
  const { body, stats, controls } = bike
  const rotation = body.rotation()
  const n = bike.groundNormal ?? vec(0, 1, 0)
  // where the tyre is, and which way it points along the ground (the front turned by the steering)
  const along = i === 0 ? -stats.build.wheelbase / 2 : stats.build.wheelbase / 2
  const axle = add(body.translation(), rotate(rotation, vec(0, -wheel.extension, along)))
  const forward = rotate(rotation, vec(0, 0, -1))
  let pointing = normalize(sub(forward, scale(n, dot(forward, n))))
  if (i === 0) pointing = rotateAround(pointing, n, -bike.steerAngle * DEG)
  const side = cross(pointing, n)

  // how the tyre moves over the ground
  const v = add(body.linvel(), cross(body.angvel(), sub(axle, body.worldCom())))
  const sideways = dot(v, side)
  const rolling = dot(v, pointing)
  const groundSpeed = Math.hypot(v.x, v.y, v.z)

  const slide = Math.min(Math.abs(sideways) / SLIDE_FULL, 1)
  const spin = i === 1 ? clamp(controls.throttle, 0, 1) * clamp(1 - (groundSpeed * 3.6) / Math.max(wheelspinUntil, 1e-6), 0, 1) : 0
  const skid = clamp(controls.brake, 0, 1) * Math.min(Math.abs(rolling) / SKID_FULL, 1) * (i === 0 ? FRONT_SKID : 1)
  return { amount: Math.min(slide + spin + skid, 1), sideways, slide, spin, skid }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
