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
  /** A run-up climbs at least this steeply into the lip, and no more steeply than the bike can ride up, degrees. */
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
  spacing: 6,
  headings: 24,
  minAirtime: 1,
  speeds: [40, 50, 60, 70, 80, 90],
  minRunUpSlope: 6,
  maxRunUpSlope: 32,
  runUpLength: 30,
  maxSideTilt: 15,
  separation: 30,
  gravity: 9.81,
}

const DEG = Math.PI / 180
/** The lip's angle is measured over this much run-up just before it, metres. */
const LIP_SPAN = 4
/** Flights are followed in steps this long, seconds, up to the longest. */
const FLIGHT_STEP = 0.02
const LONGEST_FLIGHT = 6
/** A run-up climbs within about 40 degrees of straight up the slope (the cosine of it). */
const MIN_SQUARELY = 0.75
/** The bike's middle sits about this high over the ground as it takes off, metres. */
const RIDE_HEIGHT = 0.6

export function findJumps(field: Heightfield, changes: Partial<FinderSettings> = {}): JumpSpot[] {
  const s = { ...FINDER_DEFAULTS, ...changes }
  const at = (x: number, z: number) => heightAt(field, x, z)
  const edge = field.size / 2 - s.runUpLength - 40
  const found: JumpSpot[] = []

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
        const spot = tryJump(at, s, lx, lz, heading, dx, dz)
        if (spot) found.push(spot)
      }
    }
  }
  return keepBest(found, s.separation)
}

/** Whether riding off the top at (lx, lz) this way is a jump, and what it's like. */
function tryJump(
  at: (x: number, z: number) => number,
  s: FinderSettings,
  lx: number,
  lz: number,
  heading: number,
  dx: number,
  dz: number,
): JumpSpot | null {
  const lipY = at(lx, lz)
  // the run-up: climbing into the lip, never too steep to ride up
  const lipAngle = Math.atan((lipY - at(lx - dx * LIP_SPAN, lz - dz * LIP_SPAN)) / LIP_SPAN) / DEG
  if (lipAngle < s.minRunUpSlope || lipAngle > s.maxRunUpSlope) return null
  const runUp: Point[] = []
  for (let back = s.runUpLength; back >= 0; back -= 1.5) {
    const px = lx - dx * back
    const pz = lz - dz * back
    runUp.push({ x: px, y: at(px, pz), z: pz })
  }
  for (let i = 1; i < runUp.length; i++) {
    const climb = Math.atan((runUp[i].y - runUp[i - 1].y) / 1.5) / DEG
    if (climb > s.maxRunUpSlope) return null // a wall on the way up
    // and nowhere on it does the ground tilt the bike too far sideways (riding across a steep face)
    if (sideTilt(at, runUp[i].x, runUp[i].z, dx, dz) > s.maxSideTilt) return null
  }
  // How squarely it climbs the hill: 1 straight up the slope, less the more it cuts across.
  const g = gradient(at, lx - dx * 2, lz - dz * 2)
  const steepest = Math.hypot(g.x, g.z)
  const squarely = steepest > 0 ? Math.max(0, (g.x * dx + g.z * dz) / steepest) : 0
  if (squarely < MIN_SQUARELY) return null // cutting across the hill: nobody hits a jump like that
  // Later, obstacles (rocks, trees) get checked here too: on the run-up and where you land.

  // Fly off the lip at each speed, and keep the one that lands softest
  // (coming down closest to the slope of the ground there).
  let best: { speed: number; airtime: number; landing: Point; mismatch: number } | null = null
  for (const speed of s.speeds) {
    const flight = fly(at, s.gravity, lx, lz, lipY, lipAngle, speed / 3.6, dx, dz)
    if (!flight || flight.airtime < s.minAirtime) continue
    if (!best || flight.mismatch < best.mismatch) best = { speed, ...flight }
  }
  if (!best) return null
  return {
    lip: { x: lx, y: lipY, z: lz },
    heading,
    runUp,
    lipAngle,
    speed: best.speed,
    airtime: best.airtime,
    landing: best.landing,
    // longer flights, squarely up the hill, landing softly onto a downslope score highest
    score: best.airtime * squarely * squarely * Math.max(0.2, 1 - best.mismatch / 45),
  }
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
    if (y - RIDE_HEIGHT > groundY) continue
    if (t < 0.1) return null // never really left the ground
    const falling = Math.atan2(up - gravity * t, across) / DEG
    const groundSlope = Math.atan((at(px + dx, pz + dz) - at(px - dx, pz - dz)) / 2) / DEG
    return { airtime: t, landing: { x: px, y: groundY, z: pz }, mismatch: Math.abs(falling - groundSlope) }
  }
  return null
}

/** The best jump of any that are close together and point much the same way: the highest score. */
function keepBest(found: JumpSpot[], separation: number): JumpSpot[] {
  const kept: JumpSpot[] = []
  for (const spot of [...found].sort((a, b) => b.score - a.score)) {
    const same = kept.some(
      (other) =>
        Math.hypot(other.lip.x - spot.lip.x, other.lip.z - spot.lip.z) < separation &&
        Math.abs(((other.heading - spot.heading + 540) % 360) - 180) <= 45,
    )
    if (!same) kept.push(spot)
  }
  return kept
}
