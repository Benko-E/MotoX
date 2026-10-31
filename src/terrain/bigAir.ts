import type { MapDef } from '../maps/types'
import { sampleCoord, type Heightfield } from './heightfield'

/**
 * Big air: huge natural kickers shaped into the hills. Each one is a level
 * run-in, a kicker curving up to its lip, then ground falling away under the
 * flight to a landing slope that meets it, bending out to level again. Each
 * goes where the land already falls away the most, as big as it can be (the
 * most air) without raising or cutting the ground more than the map allows:
 * taller hills give bigger jumps.
 */

const DEG = Math.PI / 180
/** Its run-in is level and straight for this far before the kicker, metres. */
const RUN_IN = 40
/** Its face curves up no harder than pressing you down with this much more than your weight. */
const FACE_PULL = 1.3
/** Its runout bends back to level no harder than this. */
const RUNOUT_PULL = 2
/** Its landing slope runs on past where you touch down, for landing long: this share of the flight's length. */
const LANDING_ZONE = 0.3
/** Then it's level for this far, metres. */
const RUNOUT_LEVEL = 20
/** Under the flight the ground falls away, at most this share of the flight's length below it (a third of the way along). */
const KNUCKLE = 0.2
/** The least air worth calling big air, seconds; the most tried, and the steps between. */
const LEAST_AIR = 2
const MOST_AIR = 5.5
const AIR_STEP = 0.1
/** Spots for a lip are tried on a grid this far apart, metres, facing this many ways; then finer round the best. */
const COARSE = 25
const HEADINGS = 18
const FINE = 5
const FINE_TURN = 2.5
/** The ground is read along a spot every this far, metres. */
const SAMPLE = 2
/** Lips are at least this far apart, metres. */
const APART = 100
/** Its dirt fades out over this far past its width, metres. */
const DIRT_EDGE = 3

/** One big air's shape down its middle, for a given air: distances along from the lip (negative: before it), heights relative to the lip. */
export interface BigAirShape {
  airtime: number
  speed: number
  angle: number
  /** Where its level run-in starts, the foot of its kicker, where you land at its speed, where its landing slope ends, where it's level again, and its end. */
  start: number
  foot: number
  landing: number
  zoneEnd: number
  runoutEnd: number
  end: number
  /** How tall its kicker is, metres. */
  faceHeight: number
  /** How far below the lip you touch down, metres, and how steep the slope is there, degrees. */
  landingDrop: number
  landingAngle: number
  /** The ground's height `d` metres along; level before its start and after its end. */
  groundAt(d: number): number
}

/** The shape of a big air that gives `airtime` seconds of air when hit at `speed` km/h, its lip `angle` degrees steep. */
export function bigAirShape(airtime: number, speed: number, angle: number, gravity: number): BigAirShape {
  const v = speed / 3.6
  const lip = angle * DEG
  // the kicker: a curve up from level to the lip angle
  const faceRadius = (v * v) / (FACE_PULL * gravity)
  const foot = -faceRadius * Math.sin(lip)
  const faceHeight = faceRadius * (1 - Math.cos(lip))
  // the flight off it (where the wheels are), and where it comes down after `airtime`
  const across = v * Math.cos(lip)
  const flightAt = (d: number) => d * Math.tan(lip) - (gravity * d * d) / (2 * across * across)
  const landing = across * airtime
  const landingY = flightAt(landing)
  const landingSlope = (v * Math.sin(lip) - gravity * airtime) / across
  const fall = Math.atan(-landingSlope)
  const landingSpeed = Math.hypot(across, v * Math.sin(lip) - gravity * airtime)
  // the landing slope runs on, then bends out to level
  const zoneEnd = landing * (1 + LANDING_ZONE)
  const zoneY = landingY + landingSlope * (zoneEnd - landing)
  const runoutRadius = (landingSpeed * landingSpeed) / (RUNOUT_PULL * gravity)
  const runoutEnd = zoneEnd + runoutRadius * Math.sin(fall)
  const bottom = zoneY - runoutRadius * (1 - Math.cos(fall))
  const knuckle = KNUCKLE * landing
  const arc = (radius: number, x: number) => Math.sqrt(Math.max(radius * radius - x * x, 0))

  const groundAt = (d: number) => {
    if (d <= foot) return -faceHeight
    if (d <= 0) return -faceHeight + faceRadius - arc(faceRadius, d - foot)
    if (d <= landing) {
      // under the flight, falling away behind the lip and meeting it again, along it, where you land
      const t = d / landing
      return flightAt(d) - knuckle * 6.75 * t * (1 - t) * (1 - t)
    }
    if (d <= zoneEnd) return landingY + landingSlope * (d - landing)
    if (d <= runoutEnd) return bottom + runoutRadius - arc(runoutRadius, d - runoutEnd)
    return bottom
  }
  return {
    airtime,
    speed,
    angle,
    start: foot - RUN_IN,
    foot,
    landing,
    zoneEnd,
    runoutEnd,
    end: runoutEnd + RUNOUT_LEVEL,
    faceHeight,
    landingDrop: -landingY,
    landingAngle: fall / DEG,
    groundAt,
  }
}

/** A spot tried for a lip: how big a big air fits there (its index in the sizes tried), the most ground it moves, and the lip's height. */
interface Fit {
  x: number
  z: number
  heading: number
  size: number
  moved: number
  y: number
}

/** Shapes the map's big air into the hills of `field` (after its track, before its clearing), and records each on it. */
export function shapeBigAirs(map: MapDef, field: Heightfield, gravity: number): void {
  const air = map.bigAir
  if (!air || air.count <= 0) return
  // every size tried, smallest first, its heights read down its middle; the run-in and kicker are the same for all
  const sizes: { shape: BigAirShape; heights: Float64Array }[] = []
  for (let k = 0; LEAST_AIR + k * AIR_STEP <= MOST_AIR + 1e-9; k++) {
    const shape = bigAirShape(Math.round((LEAST_AIR + k * AIR_STEP) * 10) / 10, air.speed, air.angle, gravity)
    const heights = Float64Array.from({ length: Math.floor((shape.end - shape.start) / SAMPLE) + 1 }, (_, i) => shape.groundAt(shape.start + i * SAMPLE))
    sizes.push({ shape, heights })
  }
  const start = sizes[0].shape.start
  /** The first sample at or past the lip. */
  const lipAt = Math.ceil(-start / SAMPLE)
  const longest = sizes[sizes.length - 1].heights.length
  const margin = Math.ceil(air.banks / SAMPLE)
  /** How far the ground may be raised or cut, metres: a share of the hills' height, so taller hills make bigger jumps. */
  const shaping = air.shaping * map.hills.height
  const middle = { x: map.clearing.x, z: map.clearing.z }
  const clearingReach = map.clearing.radius > 0 ? map.clearing.radius * 1.2 + map.clearing.blend : 0
  const half = field.size / 2
  const n = field.samples
  const sampleAt = (x: number, z: number) => Math.round((z + half) / field.cellSize) * n + Math.round((x + half) / field.cellSize)
  const placed: Fit[] = []
  // where a big air may reach: inside its spread, clear of the wall at the edge, the clearing, other features and other big airs
  const free = (x: number, z: number) => {
    const out = Math.hypot(x - middle.x, z - middle.z)
    if (out > air.spread || out < clearingReach) return false
    if (Math.max(Math.abs(x), Math.abs(z)) >= Math.min(half, map.edge.start)) return false
    return !field.owned?.[sampleAt(x, z)]
  }
  const natural = [new Float64Array(longest), new Float64Array(longest), new Float64Array(longest)]

  /** The biggest big air whose lip fits at (x, z) facing `heading`, or null. */
  const fit = (x: number, z: number, heading: number): Fit | null => {
    if (placed.some((other) => Math.hypot(other.x - x, other.z - z) < APART)) return null
    const fx = Math.sin(heading * DEG)
    const fz = -Math.cos(heading * DEG)
    const outer = air.width / 2 + air.banks
    // how far along it's free, its banks and the blend at either end included
    let freeTo = longest + margin
    for (let i = -margin; i < longest + margin; i++) {
      const d = start + i * SAMPLE
      const cx = x + fx * d
      const cz = z + fz * d
      if (!free(cx, cz) || !free(cx - fz * outer, cz + fx * outer) || !free(cx + fz * outer, cz - fx * outer)) {
        freeTo = i
        break
      }
    }
    const reach = Math.min(longest, freeTo - margin)
    if (reach < sizes[0].heights.length) return null
    // the land down its middle and along both edges of its floor
    for (let i = 0; i < reach; i++) {
      const d = start + i * SAMPLE
      const cx = x + fx * d
      const cz = z + fz * d
      natural[0][i] = field.heights[sampleAt(cx, cz)]
      natural[1][i] = field.heights[sampleAt(cx - (fz * air.width) / 2, cz + (fx * air.width) / 2)]
      natural[2][i] = field.heights[sampleAt(cx + (fz * air.width) / 2, cz - (fx * air.width) / 2)]
    }
    // how far the land is from a size, at most, with its lip set at the best height: its landing (from the lip on)
    // within the shaping, and its run-in and kicker, built anyway, within that and the kicker's height
    const misfit = (k: number) => {
      const { shape, heights } = sizes[k]
      if (heights.length > reach) return { moved: Infinity, y: 0 }
      const land = { low: Infinity, high: -Infinity }
      const build = { low: Infinity, high: -Infinity }
      for (const line of natural) {
        for (let i = 0; i < heights.length; i++) {
          const off = line[i] - heights[i]
          const part = i >= lipAt ? land : build
          if (off < part.low) part.low = off
          if (off > part.high) part.high = off
        }
      }
      const lowest = Math.max(land.high - shaping, build.high - shaping - shape.faceHeight)
      const highest = Math.min(land.low + shaping, build.low + shaping + shape.faceHeight)
      if (lowest > highest) return { moved: Infinity, y: 0 }
      const y = Math.min(Math.max((land.high + land.low) / 2, lowest), highest)
      return { moved: Math.max(land.high - y, y - land.low), y }
    }
    if (misfit(0).moved > shaping) return null
    // the biggest that fits (bigger ones move more ground)
    let fits = 0
    let tooBig = sizes.length
    while (tooBig - fits > 1) {
      const k = (fits + tooBig) >> 1
      if (misfit(k).moved <= shaping) fits = k
      else tooBig = k
    }
    return { x, z, heading, size: fits, ...misfit(fits) }
  }

  for (let made = 0; made < air.count; made++) {
    const found: { best: Fit | null } = { best: null }
    const consider = (x: number, z: number, heading: number) => {
      const tried = fit(x, z, heading)
      const { best } = found
      if (tried && (!best || tried.size > best.size || (tried.size === best.size && tried.moved < best.moved))) found.best = tried
    }
    for (let z = middle.z - air.spread; z <= middle.z + air.spread; z += COARSE) {
      for (let x = middle.x - air.spread; x <= middle.x + air.spread; x += COARSE) {
        if (Math.hypot(x - middle.x, z - middle.z) > air.spread) continue
        for (let h = 0; h < HEADINGS; h++) consider(x, z, (h * 360) / HEADINGS)
      }
    }
    const rough = found.best
    if (!rough) break
    // then finer round the best
    const turn = 180 / HEADINGS
    for (let dz = -COARSE / 2; dz <= COARSE / 2; dz += FINE) {
      for (let dx = -COARSE / 2; dx <= COARSE / 2; dx += FINE) {
        for (let dh = -turn; dh <= turn; dh += FINE_TURN) consider(rough.x + dx, rough.z + dz, rough.heading + dh)
      }
    }
    const best = found.best!
    shape(field, sizes[best.size].shape, best, air)
    placed.push(best)
  }

  field.bigAirs = placed
    .map((p) => record(sizes[p.size].shape, p))
    .sort((a, b) => a.airtime - b.airtime)
}

/** Shapes one big air into the ground: its floor fully, its banks blending into the hills, and the same at either end. */
function shape(field: Heightfield, s: BigAirShape, at: Fit, air: MapDef['bigAir']): void {
  const n = field.samples
  const fx = Math.sin(at.heading * DEG)
  const fz = -Math.cos(at.heading * DEG)
  const halfWide = air.width / 2
  const outer = halfWide + air.banks
  const from = s.start - air.banks
  const to = s.end + air.banks
  const xs = [from, to].flatMap((d) => [at.x + fx * d - fz * outer, at.x + fx * d + fz * outer])
  const zs = [from, to].flatMap((d) => [at.z + fz * d + fx * outer, at.z + fz * d - fx * outer])
  const toIndex = (w: number) => (w + field.size / 2) / field.cellSize
  const [ix0, ix1] = [Math.max(0, Math.floor(toIndex(Math.min(...xs)))), Math.min(n - 1, Math.ceil(toIndex(Math.max(...xs))))]
  const [iz0, iz1] = [Math.max(0, Math.floor(toIndex(Math.min(...zs)))), Math.min(n - 1, Math.ceil(toIndex(Math.max(...zs))))]
  const owned = (field.owned ??= new Uint8Array(n * n))
  const dirt = (field.track ??= new Float32Array(n * n))
  const fade = (over: number, by: number) => (by > 0 ? 1 - smoothstep(over / by) : 0)

  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const dx = sampleCoord(field, ix) - at.x
      const dz = sampleCoord(field, iz) - at.z
      const d = dx * fx + dz * fz
      const across = Math.abs(dx * -fz + dz * fx)
      if (d < from || d > to || across > outer) continue
      const sideways = across <= halfWide ? 1 : fade(across - halfWide, air.banks)
      const lengthways = d < s.start ? fade(s.start - d, air.banks) : d > s.end ? fade(d - s.end, air.banks) : 1
      const weight = Math.min(sideways, lengthways)
      if (weight <= 0) continue
      const i = iz * n + ix
      field.heights[i] += (at.y + s.groundAt(d) - field.heights[i]) * weight
      owned[i] = 1
      const floor = across <= halfWide ? 1 : fade(across - halfWide, DIRT_EDGE)
      dirt[i] = Math.max(dirt[i], floor * lengthways)
    }
  }
}

/** What's recorded on the map of one big air shaped at `at`. */
function record(s: BigAirShape, at: Fit): NonNullable<Heightfield['bigAirs']>[number] {
  const fx = Math.sin(at.heading * DEG)
  const fz = -Math.cos(at.heading * DEG)
  const along = (d: number) => ({ x: at.x + fx * d, z: at.z + fz * d })
  return {
    x: at.x,
    y: at.y,
    z: at.z,
    heading: ((at.heading % 360) + 360) % 360,
    speed: s.speed,
    airtime: s.airtime,
    angle: s.angle,
    faceHeight: s.faceHeight,
    landingDrop: s.landingDrop,
    landingAngle: s.landingAngle,
    moved: at.moved,
    start: along(s.start),
    foot: along(s.foot),
    landing: along(s.landing),
    zoneEnd: along(s.zoneEnd),
    runoutEnd: along(s.runoutEnd),
    end: along(s.end),
    runUp: Array.from({ length: Math.floor(-s.start) + 1 }, (_, i) => along(s.start + i)),
  }
}

function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return c * c * (3 - 2 * c)
}
