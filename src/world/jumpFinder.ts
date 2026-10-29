import { heightAt, type Heightfield } from '../terrain/heightfield'

/**
 * Finds the natural jumps in a map's hills, only by reading the ground's
 * heights, so it works for any map or seed. A hill is a jump where you can
 * ride up it and the top rolls over more sharply than the bike can follow at
 * speed: the ground drops away and you fly. For each one it works out a
 * speed to hit it at, how long you'd fly and where you'd land, by following
 * the flight path over the ground (simple flight maths, not the full physics).
 *
 * What it finds is data: the markers on the ground, the minimap and (later)
 * AI riders all read the same list.
 */

export interface Point {
  x: number
  y: number
  z: number
}

export interface JumpSpot {
  /** Where you take off: the top of the run-up. */
  lip: Point
  /** Which way to ride it, compass degrees (0 = toward -z, 90 = toward +x). */
  heading: number
  /** The run-up on the ground, from where it starts to the lip, about 1.5 m apart. */
  runUp: Point[]
  /** How steeply the run-up climbs into the lip, degrees. */
  lipAngle: number
  /** A good speed to hit it at, km/h, and how long you'd fly at that speed, seconds. */
  speed: number
  airtime: number
  /** Where you'd land at that speed. */
  landing: Point
  /** How good a jump it is: the longer the flight and the more squarely it climbs the hill, the higher. */
  score: number
}

export interface FinderSettings {
  /** How far apart the spots looked at are, metres, and how many directions are tried at each. */
  spacing: number
  headings: number
  /** Shorter flights than this aren't worth marking, seconds. */
  minAirtime: number
  /** Speeds tried, km/h. */
  speeds: number[]
  /** A run-up climbs at least this steeply into the top, and no more steeply than the bike can ride up with speed, degrees. */
  minRunUpSlope: number
  maxRunUpSlope: number
  /** How long a run-up is, metres. */
  runUpLength: number
  /** Nowhere on the run-up may the ground tilt the bike sideways more than this, degrees. */
  maxSideTilt: number
  /** Jumps closer together than this, pointing much the same way, count as one, metres. */
  separation: number
  /** Gravity, m/s². */
  gravity: number
}

export const FINDER_DEFAULTS: FinderSettings = {
  spacing: 8,
  headings: 16,
  minAirtime: 1,
  speeds: [50, 65, 80, 95],
  minRunUpSlope: 6,
  maxRunUpSlope: 45,
  runUpLength: 30,
  maxSideTilt: 28,
  separation: 20,
  gravity: 9.81,
}

const DEG = Math.PI / 180
/** The line of ground up to a top is read every this many metres. */
const PROFILE_STEP = 0.5
/** The bike leaves the ground at most this far before the top, metres. */
const TAKE_OFF_SEARCH = 20
/** The run-up has to climb into the top over this last stretch, metres. */
const RUN_IN = 10
/** Flights are followed in steps this long, seconds, up to the longest. */
const FLIGHT_STEP = 0.03
const LONGEST_FLIGHT = 6
/** A run-up climbs within about 40 degrees of straight up the slope (the cosine of it). */
const MIN_SQUARELY = 0.75
/** Right after take-off the flight may dip this far into the ground without counting as landed (the height grid isn't exact), metres. */
const GRID_SLACK = 0.08
/** The bike's middle sits about this high over the ground as it takes off, metres. */
const RIDE_HEIGHT = 0.6

export function findJumps(field: Heightfield, changes: Partial<FinderSettings> = {}): JumpSpot[] {
  const search = findJumpsGradually(field, changes)
  let step = search.next()
  while (!step.done) step = search.next()
  return step.value
}

/**
 * The same, a bit at a time: it stops after each row of the map, so the game
 * can draw frames in between (it takes about half a second in all). Keep
 * calling next() until it's done; the jumps are its final value.
 */
export function* findJumpsGradually(field: Heightfield, changes: Partial<FinderSettings> = {}): Generator<void, JumpSpot[]> {
  const s = { ...FINDER_DEFAULTS, ...changes }
  const at = (x: number, z: number) => heightAt(field, x, z)
  const edge = field.size / 2 - s.runUpLength - 40
  const found: JumpSpot[] = []
  const tried = new Set<string>()

  for (let x = -edge; x <= edge; x += s.spacing) {
    for (let z = -edge; z <= edge; z += s.spacing) {
      for (let k = 0; k < s.headings; k++) {
        const heading = (k / s.headings) * 360
        const dx = Math.sin(heading * DEG)
        const dz = -Math.cos(heading * DEG)
        // Climbing here, riding this way? Then walk up to the top: the lip.
        const rise = (at(x + dx, z + dz) - at(x - dx, z - dz)) / 2
        if (Math.atan(rise) < s.minRunUpSlope * DEG) continue
        let along = 0
        while (along < 40 && at(x + dx * (along + 1), z + dz * (along + 1)) > at(x + dx * along, z + dz * along)) along++
        const lx = x + dx * along
        const lz = z + dz * along
        // many starting points lead up to the same top: try each top and direction once
        const key = `${Math.round(lx / 2)},${Math.round(lz / 2)},${k}`
        if (tried.has(key)) continue
        tried.add(key)
        const spot = tryJump(at, s, lx, lz, heading, dx, dz)
        if (typeof spot !== 'string') found.push(spot)
      }
    }
    yield
  }
  return keepBest(found, s.separation)
}

/**
 * Whether riding from (x, z) heading this way, up to the top, is a jump: the
 * jump, or in words why not. For finding out why a hill wasn't marked.
 */
export function judgeJump(field: Heightfield, x: number, z: number, heading: number, changes: Partial<FinderSettings> = {}): JumpSpot | string {
  const s = { ...FINDER_DEFAULTS, ...changes }
  const at = (px: number, pz: number) => heightAt(field, px, pz)
  const dx = Math.sin(heading * DEG)
  const dz = -Math.cos(heading * DEG)
  let along = 0
  while (along < 60 && at(x + dx * (along + 1), z + dz * (along + 1)) > at(x + dx * along, z + dz * along)) along++
  return tryJump(at, s, x + dx * along, z + dz * along, heading, dx, dz)
}

/**
 * Whether riding up to the top at (ax, az) this way is a jump, and what it's
 * like; if not, why not. At speed the bike leaves the ground before the top,
 * where the hill bends away faster than gravity can hold it down, so where it
 * takes off (and how steeply) depends on how fast you hit it.
 */
function tryJump(
  at: (x: number, z: number) => number,
  s: FinderSettings,
  ax: number,
  az: number,
  heading: number,
  dx: number,
  dz: number,
): JumpSpot | string {
  /** The ground's height `d` metres along the line from the top (negative: before it), on multiples of PROFILE_STEP. */
  const behind = s.runUpLength + 3
  const profile = new Float32Array(Math.round((behind + 3) / PROFILE_STEP) + 1)
  for (let i = 0; i < profile.length; i++) {
    const d = -behind + i * PROFILE_STEP
    profile[i] = at(ax + dx * d, az + dz * d)
  }
  const h = (d: number) => profile[Math.round((d + behind) / PROFILE_STEP)]
  const climb = Math.atan((h(0) - h(-RUN_IN)) / RUN_IN) / DEG
  if (climb < s.minRunUpSlope) return `the run-up hardly climbs (${climb.toFixed(0)} deg)`
  // How squarely it climbs the hill: 1 straight up the slope, less the more it cuts across.
  const g = gradient(at, ax - dx * RUN_IN, az - dz * RUN_IN)
  const steepest = Math.hypot(g.x, g.z)
  const squarely = steepest > 0 ? Math.max(0, (g.x * dx + g.z * dz) / steepest) : 0
  if (squarely < MIN_SQUARELY) return 'it cuts across the hill' // nobody hits a jump like that
  for (let d = -s.runUpLength; d < 0; d += 1.5) {
    const steep = Math.atan((h(d + 1.5) - h(d)) / 1.5) / DEG
    if (steep > s.maxRunUpSlope) return `a wall on the way up (${steep.toFixed(0)} deg)`
  }
  // and nowhere on it does the ground tilt the bike too far sideways (riding across a steep face)
  for (let d = -s.runUpLength; d < 0; d += 3) {
    const tilt = sideTilt(at, ax + dx * d, az + dz * d, dx, dz)
    if (tilt > s.maxSideTilt) return `the run-up tilts you sideways (${tilt.toFixed(0)} deg)`
  }
  // Later, obstacles (rocks, trees) get checked here too: on the run-up and where you land.

  // At each speed: where the bike takes off, and its flight from there. The
  // best jump wins: the most air, a little better landing on a downslope
  // (a level landing is clean in the game, so a flat one is fine too).
  let best: { speed: number; airtime: number; landing: Point; mismatch: number; from: number; angle: number; good: number } | null = null
  let longest = 0
  for (const speed of s.speeds) {
    const v = speed / 3.6
    const from = takeOff(h, v, s.gravity, s.runUpLength)
    const angle = Math.atan((h(from + 0.5) - h(from - 0.5)) / 1) / DEG
    const flight = fly(at, s.gravity, ax + dx * from, az + dz * from, h(from), angle, v, dx, dz)
    longest = Math.max(longest, flight?.airtime ?? 0)
    if (!flight || flight.airtime < s.minAirtime) continue
    const good = flight.airtime * Math.max(0.5, 1 - flight.mismatch / 90)
    if (!best || good > best.good) best = { speed, ...flight, from, angle, good }
  }
  if (!best) return `too little air (${longest.toFixed(2)} s at most)`
  const lx = ax + dx * best.from
  const lz = az + dz * best.from
  const runUp: Point[] = []
  for (let back = s.runUpLength; back >= 0; back -= 1.5) {
    const px = lx - dx * back
    const pz = lz - dz * back
    runUp.push({ x: px, y: at(px, pz), z: pz })
  }
  return {
    lip: { x: lx, y: at(lx, lz), z: lz },
    heading,
    runUp,
    lipAngle: best.angle,
    speed: best.speed,
    airtime: best.airtime,
    landing: best.landing,
    // longer flights, squarely up the hill, a little better onto a downslope
    score: best.good * squarely * squarely,
  }
}

/**
 * Where a bike riding up to the top at `v` m/s leaves the ground, metres
 * along from the top (negative: before it): the first spot where the hill
 * bends away more sharply than gravity can hold it to (v² × bend > g × cos
 * slope). If it never does, it rides right to the top.
 */
function takeOff(h: (d: number) => number, v: number, gravity: number, runUpLength: number): number {
  for (let d = -Math.min(runUpLength, TAKE_OFF_SEARCH); d < 0; d += 0.5) {
    const slope = (h(d + 0.5) - h(d - 0.5)) / 1
    const curve = (h(d + 2) - 2 * h(d) + h(d - 2)) / 4 // negative where it rolls over
    const bend = -curve / (1 + slope * slope) ** 1.5
    if (v * v * bend >= gravity / Math.sqrt(1 + slope * slope)) return d
  }
  return 0
}

/** Which way the ground climbs at a point, and how steeply: metres up per metre along x and z. */
function gradient(at: (x: number, z: number) => number, x: number, z: number): { x: number; z: number } {
  return { x: (at(x + 1, z) - at(x - 1, z)) / 2, z: (at(x, z + 1) - at(x, z - 1)) / 2 }
}

/** How far the ground tilts a bike riding this way sideways, degrees. */
function sideTilt(at: (x: number, z: number) => number, x: number, z: number, dx: number, dz: number): number {
  const g = gradient(at, x, z)
  return Math.atan(Math.abs(g.x * -dz + g.z * dx)) / DEG
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
): { airtime: number; landing: Point; mismatch: number } | null {
  const across = speed * Math.cos(lipAngle * DEG)
  const up = speed * Math.sin(lipAngle * DEG)
  for (let t = FLIGHT_STEP; t <= LONGEST_FLIGHT; t += FLIGHT_STEP) {
    const d = across * t
    const y = lipY + RIDE_HEIGHT + up * t - (gravity * t * t) / 2
    const px = lx + dx * d
    const pz = lz + dz * d
    const groundY = at(px, pz)
    // still clear of the ground (allowing for the bumps of the height grid right at take-off)
    if (y - RIDE_HEIGHT > groundY - GRID_SLACK) continue
    if (t < 0.15) return null // never really left the ground
    const falling = Math.atan2(up - gravity * t, across) / DEG
    const groundSlope = Math.atan((at(px + dx, pz + dz) - at(px - dx, pz - dz)) / 2) / DEG
    return { airtime: t, landing: { x: px, y: groundY, z: pz }, mismatch: Math.abs(falling - groundSlope) }
  }
  return null
}

/** Jumps pointing within this many degrees of each other count as the same line (if close together too). */
const SAME_WAY = 25

/** The best jump of any that are close together and point much the same way: the highest score. */
function keepBest(found: JumpSpot[], separation: number): JumpSpot[] {
  const kept: JumpSpot[] = []
  for (const spot of [...found].sort((a, b) => b.score - a.score)) {
    const same = kept.some(
      (other) =>
        Math.hypot(other.lip.x - spot.lip.x, other.lip.z - spot.lip.z) < separation &&
        Math.abs(((other.heading - spot.heading + 540) % 360) - 180) <= SAME_WAY,
    )
    if (!same) kept.push(spot)
  }
  return kept
}
