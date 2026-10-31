import { heightAt, type Heightfield } from '../terrain/heightfield'

/**
 * Jumps: the ones the map's features build (a track's kickers, big
 * air...). A feature says where each of its jumps is, which way it's ridden
 * and how fast; here each one is measured: where a bike at that speed leaves
 * the ground, and its flight. AI riders, the letters and the debug lanes all
 * read this list.
 */

export interface Point {
  x: number
  y: number
  z: number
}

export type JumpKind = 'fast' | 'bigAir'

export interface JumpSpot {
  /** Where you leave the ground. */
  lip: Point
  /** Which way to ride it, compass degrees (0 = toward -z, 90 = toward +x). */
  heading: number
  /** The run-up on the ground, from where it starts to the lip. */
  runUp: Point[]
  /** The speed it's built to be hit at, km/h, and how long you fly at it, seconds. */
  speed: number
  airtime: number
  /** Where you land at that speed, and the flight there: where the middle of the bike is at each moment, from the lip (none if it never throws you). */
  landing: Point
  flight: Point[]
  /** The map feature that built it ('track', ...). */
  source: string
  /** What it's like: fast (long, low and quick), or big air (high, plenty of airtime). */
  kind: JumpKind
}

const DEG = Math.PI / 180
const GRAVITY = 9.81
/** The ground along a jump is read every this many metres. */
const PROFILE_STEP = 0.5
/** You leave the ground at most this far before the top, metres. */
const TAKE_OFF_SEARCH = 20
/** A run-up the feature doesn't give is this long, straight back from where you take off, metres. */
const RUN_UP = 30
/** Flights are followed in steps this long, seconds, up to the longest. */
const FLIGHT_STEP = 0.03
const LONGEST_FLIGHT = 6
/** Right after take-off the flight may dip this far into the ground without counting as landed (the height grid isn't exact), metres. */
const GRID_SLACK = 0.08
/** Shorter than this isn't a flight, only the bike settling onto the ground, seconds. */
const NOT_A_FLIGHT = 0.2
/** The bike's middle sits about this high over the ground as it takes off, metres. */
const RIDE_HEIGHT = 0.6

/**
 * Measures a jump a feature built: riding up to its top at `top` toward
 * `heading` at `speed` km/h, where you leave the ground (the first spot where
 * it bends away faster than gravity can hold you to it, else the top itself)
 * and your flight from there. `runUp` is the feature's own, if it has one.
 */
export function measureJump(
  field: Heightfield,
  top: { x: number; z: number },
  heading: number,
  speed: number,
  source: string,
  kind: JumpKind,
  runUp?: readonly { x: number; z: number }[],
  gravity = GRAVITY,
): JumpSpot {
  const at = (x: number, z: number) => heightAt(field, x, z)
  const dx = Math.sin(heading * DEG)
  const dz = -Math.cos(heading * DEG)
  const h = (d: number) => at(top.x + dx * d, top.z + dz * d)
  const v = speed / 3.6
  const from = takeOff(h, v, gravity)
  const lx = top.x + dx * from
  const lz = top.z + dz * from
  const angle = Math.atan((h(from + PROFILE_STEP) - h(from - PROFILE_STEP)) / (2 * PROFILE_STEP)) / DEG
  const flight = fly(at, gravity, lx, lz, at(lx, lz), angle, v, dx, dz)
  const lip = { x: lx, y: at(lx, lz), z: lz }
  // the feature's run-up, up to where you take off; else a straight one
  const line = runUp
    ? [...runUp.filter((p) => (p.x - top.x) * dx + (p.z - top.z) * dz < from - PROFILE_STEP), { x: lx, z: lz }]
    : Array.from({ length: Math.round(RUN_UP / 1.5) + 1 }, (_, i) => ({ x: lx - dx * (RUN_UP - i * 1.5), z: lz - dz * (RUN_UP - i * 1.5) }))
  return {
    lip,
    heading,
    runUp: line.map((p) => ({ x: p.x, y: at(p.x, p.z), z: p.z })),
    speed,
    airtime: flight?.airtime ?? 0,
    landing: flight?.landing ?? lip,
    flight: flight?.path ?? [],
    source,
    kind,
  }
}

/** The jumps the map's features built, measured: the track's kickers, then its big air (smallest first). */
export function featureJumps(field: Heightfield, gravity = GRAVITY): JumpSpot[] {
  return [
    ...(field.trackJumps ?? []).map((jump) => measureJump(field, jump, jump.heading, jump.speed, 'track', 'fast', jump.runUp, gravity)),
    ...(field.bigAirs ?? []).map((air) => measureJump(field, air, air.heading, air.speed, 'bigAir', 'bigAir', air.runUp, gravity)),
  ]
}

/**
 * Where a bike riding up to the top at `v` m/s leaves the ground, metres
 * along from the top (negative: before it): the first spot where the hill
 * bends away more sharply than gravity can hold it to (v² × bend > g × cos
 * slope). If it never does, it rides right to the top.
 */
function takeOff(h: (d: number) => number, v: number, gravity: number): number {
  const slopeAt = (d: number) => (h(d + 0.5) - h(d - 0.5)) / 1
  for (let d = -TAKE_OFF_SEARCH; d < 0; d += PROFILE_STEP) {
    const slope = slopeAt(d)
    const curve = (h(d + 2) - 2 * h(d) + h(d - 2)) / 4 // negative where it rolls over
    const bend = -curve / (1 + slope * slope) ** 1.5
    if (v * v * bend < gravity / Math.sqrt(1 + slope * slope)) continue
    // that sees a sharp lip a little early: you can't leave while the ground still steepens under you
    while (d < 0 && slopeAt(d + PROFILE_STEP) > slopeAt(d)) d += PROFILE_STEP
    return d
  }
  return 0
}

/** Follows the flight from the lip until it meets the ground again. Null if it never leaves it. */
function fly(
  at: (x: number, z: number) => number,
  gravity: number,
  lx: number,
  lz: number,
  lipY: number,
  lipAngle: number,
  speed: number,
  dx: number,
  dz: number,
): { airtime: number; landing: Point; path: Point[] } | null {
  const across = speed * Math.cos(lipAngle * DEG)
  const up = speed * Math.sin(lipAngle * DEG)
  const path: Point[] = [{ x: lx, y: lipY + RIDE_HEIGHT, z: lz }]
  for (let t = FLIGHT_STEP; t <= LONGEST_FLIGHT; t += FLIGHT_STEP) {
    const d = across * t
    const y = lipY + RIDE_HEIGHT + up * t - (gravity * t * t) / 2
    const px = lx + dx * d
    const pz = lz + dz * d
    const groundY = at(px, pz)
    path.push({ x: px, y, z: pz })
    // still clear of the ground (allowing for the bumps of the height grid right at take-off)
    if (y - RIDE_HEIGHT > groundY - GRID_SLACK) continue
    if (t < NOT_A_FLIGHT) return null // never really left the ground
    return { airtime: t, landing: { x: px, y: groundY, z: pz }, path }
  }
  return null
}
