import type { Track } from './track'

/** The bike's numbers the speed round the lap depends on, as in the Bike tab. */
export interface BikeLimits {
  /** km/h */
  topSpeed: number
  /** Seconds from standing to 100 km/h. */
  zeroToHundred: number
  /** Seconds from 100 km/h to a stop, braking. */
  brakeToStop: number
  /** How hard the tyres can push sideways, g. */
  grip: number
}

const KMH = 1 / 3.6
const G = 9.81

/**
 * How fast a rider flat out would be going at each of the track's samples,
 * m/s: as fast as each corner can be taken on grip, speeding up out of it
 * the way the bike accelerates, and braking in time for the next one, never
 * past top speed. Riding the line down the middle, no powerslides, so a
 * good rider can beat it a little. Worked out the same way the ride speeds
 * up and brakes.
 */
export function naturalSpeeds(track: Track, bike: BikeLimits): number[] {
  const top = bike.topSpeed * KMH
  const hundred = 100 * KMH
  const target = Math.min(hundred, 0.95 * top)
  const punch = (top * Math.atanh(target / top)) / bike.zeroToHundred
  const braking = hundred / bike.brakeToStop
  const n = track.samples.length
  const step = track.length / n
  // the fastest each sample's corner can be taken
  const speeds = track.radii().map((r) => Math.min(top, Math.sqrt(bike.grip * G * r)))
  // twice round each way, so the lap's end and start agree
  for (let i = 1; i < n * 2; i++) {
    const v = speeds[(i - 1) % n]
    const push = punch * Math.max(1 - (v / top) ** 2, 0)
    // over `step` metres at speed v, it speeds up by push x time (time = step / v)
    const k = i % n
    speeds[k] = Math.min(speeds[k], v + (push * step) / Math.max(v, 1))
  }
  for (let i = n * 2 - 2; i >= 0; i--) {
    const k = i % n
    speeds[k] = Math.min(speeds[k], Math.sqrt(speeds[(i + 1) % n] ** 2 + 2 * braking * step))
  }
  return speeds
}
