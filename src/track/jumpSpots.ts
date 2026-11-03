import type { Track } from './track'

/** A jump's shape, as set in the debug menu's Track tab. */
export interface JumpShape {
  /** How high the lip is, metres. */
  height: number
  /** How steep the face rises to it, degrees. */
  angle: number
  /** Straight track before the face, metres, so you arrive lined up. */
  runUp: number
  /** Straight track after landing, metres, before the track can turn again. */
  rollOut: number
  /** The tightest the track may bend under the jump and still count as straight, metres of corner radius. */
  straight: number
  /** How much of the slope's pull the bike feels climbing the face, 0 to 1.5 (the Bike tab's Slope pull). */
  slopePull: number
}

/** Where a jump fits: from where on the lap (a sample's index) and how long each part is, metres, and how it flies. */
export interface JumpSpot {
  from: number
  runUp: number
  face: number
  flight: number
  rollOut: number
  /** How fast you arrive at the face, and leave the lip, m/s. */
  arrive: number
  leave: number
  /** Seconds in the air. */
  airtime: number
}

const G = 9.81
const DEG = Math.PI / 180

/**
 * Walks the track from the start, looking for room for a jump: run-up,
 * face, flight and roll-out all on straight-enough track. How far it
 * flies depends on how fast you'd naturally be going there (`speeds`, from
 * naturalSpeeds): a jump right after a corner is slower, so it flies
 * shorter and needs less room. Each spot found, it carries on from the end
 * of it, so the spots never overlap. Landing is on the flat track.
 */
export function findJumpSpots(track: Track, speeds: number[], jump: JumpShape): JumpSpot[] {
  const n = track.samples.length
  const step = track.length / n
  const radii = track.radii()
  const straight = (from: number, metres: number) => {
    for (let k = 0; k <= metres / step; k++) if (radii[(from + k) % n] < jump.straight) return false
    return true
  }
  const face = jump.height / Math.tan(jump.angle * DEG)
  const spots: JumpSpot[] = []
  // start at the start, so the lap's first jump is the first found
  const begin = nearest(track, track.start())
  for (let i = 0; i < n; ) {
    const from = (begin + i) % n
    const arrive = speeds[(from + Math.round(jump.runUp / step)) % n]
    // climbing the face, the slope's pull eats into the speed
    const leave = Math.sqrt(Math.max(arrive ** 2 - 2 * G * jump.slopePull * jump.height, 1))
    const { airtime, flight } = flyOff(leave, jump.angle, jump.height)
    const long = jump.runUp + face + flight + jump.rollOut
    if (i + long / step < n && straight(from, long)) {
      spots.push({ from, runUp: jump.runUp, face, flight, rollOut: jump.rollOut, arrive, leave, airtime })
      i += Math.ceil(long / step)
    } else i++
  }
  return spots
}

/** Off a lip `height` metres up at `speed` m/s, `angle` degrees up: how long until it's back down on flat ground, and how far along. */
export function flyOff(speed: number, angle: number, height: number): { airtime: number; flight: number } {
  const up = speed * Math.sin(angle * DEG)
  const airtime = (up + Math.sqrt(up * up + 2 * G * height)) / G
  return { airtime, flight: speed * Math.cos(angle * DEG) * airtime }
}

/** The sample nearest a spot. */
function nearest(track: Track, at: { x: number; z: number }): number {
  let best = 0
  let bestD = Infinity
  track.samples.forEach((s, i) => {
    const d = (s.x - at.x) ** 2 + (s.z - at.z) ** 2
    if (d < bestD) [best, bestD] = [i, d]
  })
  return best
}
