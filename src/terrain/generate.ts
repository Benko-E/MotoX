import type { MapDef } from '../maps/types'
import { createHeightfield, sampleCoord, type Heightfield } from './heightfield'
import { createPerlin, fractalNoise, type Noise2D } from './noise'

/** A clearing's edge wanders in and out by up to this share of its radius. */
const RAGGED = 0.2
/** A channel's line is followed in steps this long, metres. */
const CHANNEL_STEP = 1
/** Whatever of the land a channel's floor keeps, it keeps only rolls longer than this, metres: no short bumps to rattle over. */
const FLOOR_FINEST = 12
/** A channel's floor is drawn as a dirt track, fading out over this far past its width, metres. */
const TRACK_EDGE = 3
/** Round a channel jump the track runs straight at least this far before its face, metres (the jump finder looks this far back), and eases from curve to straight over this share of a jump length. */
const STRAIGHT_RUN_IN = 30
const STRAIGHT_EASE = 0.5
/** A channel jump's lip is rounded over about this far, metres. */
const LIP_ROUND = 3
/** A channel jump climbs over this share of its length, and drops away over the rest. */
const JUMP_FACE = 0.7

/** Turns a map's data into ground: rolling hills, a clearing calmed among them, rising into a wall at the edge. */
export function generateTerrain(map: MapDef): Heightfield {
  const field = createHeightfield(map.size, map.cellSize)
  const noise = createPerlin(map.hills.seed)
  const n = field.samples

  for (let iz = 0; iz < n; iz++) {
    const z = sampleCoord(field, iz)
    for (let ix = 0; ix < n; ix++) {
      const x = sampleCoord(field, ix)
      field.heights[iz * n + ix] = hillHeight(map, noise, x, z) + edgeRise(map, x, z)
    }
  }
  carveChannel(map, noise, field)
  calmClearing(map, noise, field)
  return field
}

/**
 * Carves the loop channel. Its line runs round the clearing's middle,
 * wandering in and out by noise. Along it, the floor follows the land evened
 * out over `smoothing` metres, `flatness` of the way, with the jumps shaped on
 * top; across it, the ground is drawn to the floor's height fully within half
 * the width of the line and less and less over the banks.
 */
function carveChannel(map: MapDef, noise: Noise2D, field: Heightfield): void {
  const ch = map.channel
  if (!ch.show || ch.radius <= 0) return
  const middle = { x: map.clearing.x, z: map.clearing.z }
  const count = Math.max(16, Math.round((2 * Math.PI * ch.radius) / CHANNEL_STEP))
  const n = field.samples
  const heightAt = (x: number, z: number) => {
    const ix = Math.min(Math.max(Math.round((x + field.size / 2) / field.cellSize), 0), n - 1)
    const iz = Math.min(Math.max(Math.round((z + field.size / 2) / field.cellSize), 0), n - 1)
    return field.heights[iz * n + ix]
  }

  // the line: how far out it runs at each compass bearing from the middle, going round clockwise
  const radiusAt = (bearing: number) => ch.radius * (1 + ch.winding * fractalNoise(noise, 13 + Math.cos(bearing) * 1.2, 57 + Math.sin(bearing) * 1.2, 3, 0.5))
  const xs = new Float64Array(count)
  const zs = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    const bearing = (k / count) * Math.PI * 2
    const r = radiusAt(bearing)
    xs[k] = middle.x + Math.sin(bearing) * r
    zs[k] = middle.z - Math.cos(bearing) * r
  }
  let along = alongLine(xs, zs)

  // the jumps: evenly round the loop, each its own size; where each one's face starts, as a point of the line
  const jumpSizes = Array.from({ length: Math.max(0, ch.jumps) }, (_, j) => 1 + ch.jumpVary * fractalNoise(noise, 211 + j * 3.7, 5, 2, 0.5))
  const loopLength = along[count - 1] + Math.hypot(xs[0] - xs[count - 1], zs[0] - zs[count - 1])
  const jumpFeet = jumpSizes.map((_, j) => nearestAlong(along, ((j + 0.5) / ch.jumps) * loopLength))
  // straight round each jump, so you land back on the track: from before its face to well past its lip
  const stretches = ch.landingStraight > 0
    ? jumpSizes.map((size, j) => {
        const jumpLength = ch.jumpLength * size
        const ease = jumpLength * STRAIGHT_EASE
        return { at: jumpFeet[j], before: Math.max(STRAIGHT_RUN_IN, jumpLength) + ease, after: jumpLength * (JUMP_FACE + ch.landingStraight) + ease, ease }
      })
    : []
  for (const stretch of stretches) {
    const points = stretchPoints(along, stretch)
    const [a, b] = [points[0].k, points[points.length - 1].k]
    const span = stretch.before + stretch.after
    for (const { k, metres, w } of points) {
      const t = Math.min(metres / span, 1)
      xs[k] += (xs[a] + (xs[b] - xs[a]) * t - xs[k]) * w
      zs[k] += (zs[a] + (zs[b] - zs[a]) * t - zs[k]) * w
    }
  }
  along = alongLine(xs, zs)
  const length = along[count - 1] + Math.hypot(xs[0] - xs[count - 1], zs[0] - zs[count - 1])
  const land = new Float64Array(count)
  for (let k = 0; k < count; k++) land[k] = heightAt(xs[k], zs[k])
  field.trackLine = Array.from(xs, (x, k) => ({ x, z: zs[k] }))

  // the floor: the land evened out round the loop, keeping (1 - flatness) of its gentler rolls; then the jumps
  const even = evenOut(land, ch.smoothing / CHANNEL_STEP)
  const gentle = evenOut(land, FLOOR_FINEST / CHANNEL_STEP)
  const floor = new Float64Array(count)
  for (let k = 0; k < count; k++) floor[k] = even[k] + (gentle[k] - even[k]) * (1 - ch.flatness)
  const bumps = new Float64Array(count)
  field.trackJumps = []
  for (let j = 0; j < jumpSizes.length; j++) {
    const size = jumpSizes[j]
    const height = ch.jumpHeight * size
    const jumpLength = ch.jumpLength * size
    const start = along[jumpFeet[j]]
    for (let k = 0; k < count; k++) {
      const u = (along[k] - start + length) % length // metres past the foot of its face
      if (u >= jumpLength) continue
      const face = jumpLength * JUMP_FACE
      // up a curved face to the lip, steepest at the top; then a quick drop, easing out at the bottom
      bumps[k] += u <= face ? height * (u / face) ** 2 : height * (1 - (u - face) / (jumpLength - face)) ** 2
    }
    // where its lip is, and which way the track runs there
    const lipAlong = (start + jumpLength * JUMP_FACE) % length
    let lip = 0
    for (let k = 1; k < count; k++) if (Math.abs(along[k] - lipAlong) < Math.abs(along[lip] - lipAlong)) lip = k
    const next = (lip + 1) % count
    field.trackJumps.push({ x: xs[lip], z: zs[lip], heading: (Math.atan2(xs[next] - xs[lip], -(zs[next] - zs[lip])) * 180) / Math.PI })
  }
  // lips rounded a little, as dirt ones are: a sharp crease saw-tooths across the ground's grid
  const rounded = ch.jumps > 0 ? evenOut(bumps, LIP_ROUND / CHANNEL_STEP) : bumps
  for (let k = 0; k < count; k++) floor[k] += rounded[k]

  // shape the ground near the line, and mark its floor as track
  const track = (field.track ??= new Float32Array(n * n))
  const reach = ch.width / 2 + Math.max(ch.banks, TRACK_EDGE)
  const outer = ch.radius * (1 + ch.winding) + reach
  const toIndex = (w: number) => (w + field.size / 2) / field.cellSize
  // the nearest point of the line is within this many points of the one at the same bearing
  const window = Math.ceil((reach / Math.max(ch.radius * (1 - ch.winding), 1)) * (count / (2 * Math.PI))) + 2
  for (let iz = Math.max(0, Math.floor(toIndex(middle.z - outer))); iz <= Math.min(n - 1, Math.ceil(toIndex(middle.z + outer))); iz++) {
    for (let ix = Math.max(0, Math.floor(toIndex(middle.x - outer))); ix <= Math.min(n - 1, Math.ceil(toIndex(middle.x + outer))); ix++) {
      const x = sampleCoord(field, ix)
      const z = sampleCoord(field, iz)
      const fromMiddle = Math.hypot(x - middle.x, z - middle.z)
      if (fromMiddle > outer || fromMiddle < ch.radius * (1 - ch.winding) - reach) continue
      // the nearest point of the line: it's round about the same bearing
      const bearing = Math.atan2(x - middle.x, -(z - middle.z))
      const guess = Math.round(((bearing + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * count) % count
      if (Math.abs(fromMiddle - Math.hypot(xs[guess] - middle.x, zs[guess] - middle.z)) > reach * 2) continue // nowhere near it
      // every 4th point first, then the ones either side of the best of those
      let nearest = Infinity
      let at = guess
      const look = (d: number) => {
        const k = (guess + d + 2 * count) % count
        const dist = Math.hypot(x - xs[k], z - zs[k])
        if (dist < nearest) {
          nearest = dist
          at = k
        }
      }
      for (let d = -window; d <= window; d += 4) look(d)
      const best = at - guess
      for (let d = best - 3; d <= best + 3; d++) look(d)
      // then exactly: onto the stretch of line either side of that point, its floor blended along it
      // (taking one point's floor alone makes a staircase on every climb)
      let level = floor[at]
      for (const other of [(at + count - 1) % count, (at + 1) % count]) {
        const sx = xs[other] - xs[at]
        const sz = zs[other] - zs[at]
        const t = Math.min(Math.max(((x - xs[at]) * sx + (z - zs[at]) * sz) / (sx * sx + sz * sz || 1), 0), 1)
        const dist = Math.hypot(x - (xs[at] + sx * t), z - (zs[at] + sz * t))
        if (dist < nearest) {
          nearest = dist
          level = floor[at] + (floor[other] - floor[at]) * t
        }
      }
      const out = nearest - ch.width / 2
      const i = iz * n + ix
      track[i] = Math.max(track[i], out <= 0 ? 1 : 1 - smoothstep(out / TRACK_EDGE))
      const weight = out <= 0 ? 1 : ch.banks > 0 ? 1 - smoothstep(out / ch.banks) : 0
      if (weight <= 0) continue
      field.heights[i] += (level - field.heights[i]) * weight
    }
  }
}

/**
 * Calms the ground in the clearing: each point is drawn `calm` of the way to
 * the clearing's average height, fully inside its (wandering) edge and less
 * and less across the blend, so it keeps a little of the hills' roll.
 */
function calmClearing(map: MapDef, noise: Noise2D, field: Heightfield): void {
  const { clearing } = map
  if (clearing.calm <= 0 || clearing.radius <= 0) return
  const n = field.samples
  const toIndex = (w: number) => (w + field.size / 2) / field.cellSize
  const reach = clearing.radius * (1 + RAGGED) + clearing.blend
  const from = (w: number) => Math.max(0, Math.floor(toIndex(w - reach)))
  const to = (w: number) => Math.min(n - 1, Math.ceil(toIndex(w + reach)))
  // its edge: how far out it reaches each way round, from noise of its own
  const edgeAt = (dx: number, dz: number) => {
    const angle = Math.atan2(dz, dx)
    return clearing.radius * (1 + RAGGED * fractalNoise(noise, 37 + Math.cos(angle) * 1.5, 91 + Math.sin(angle) * 1.5, 2, 0.5))
  }

  let total = 0
  let count = 0
  for (let iz = from(clearing.z); iz <= to(clearing.z); iz++) {
    for (let ix = from(clearing.x); ix <= to(clearing.x); ix++) {
      const dx = sampleCoord(field, ix) - clearing.x
      const dz = sampleCoord(field, iz) - clearing.z
      if (Math.hypot(dx, dz) > clearing.radius) continue
      total += field.heights[iz * n + ix]
      count++
    }
  }
  if (count === 0) return
  const level = total / count

  for (let iz = from(clearing.z); iz <= to(clearing.z); iz++) {
    for (let ix = from(clearing.x); ix <= to(clearing.x); ix++) {
      const dx = sampleCoord(field, ix) - clearing.x
      const dz = sampleCoord(field, iz) - clearing.z
      const out = Math.hypot(dx, dz) - edgeAt(dx, dz)
      const inside = out <= 0 ? 1 : clearing.blend > 0 ? 1 - smoothstep(out / clearing.blend) : 0
      if (inside <= 0) continue
      const i = iz * n + ix
      field.heights[i] += (level - field.heights[i]) * clearing.calm * inside
    }
  }
}

function hillHeight(map: MapDef, noise: Noise2D, x: number, z: number): number {
  const { hills } = map
  const wave = Math.max(hills.wavelength, 1)
  return fractalNoise(noise, x / wave, z / wave, hills.octaves, hills.roughness) * hills.height
}

function edgeRise(map: MapDef, x: number, z: number): number {
  const half = map.size / 2
  const fromMiddle = Math.max(Math.abs(x), Math.abs(z))
  if (fromMiddle <= map.edge.start || half <= map.edge.start) return 0
  return map.edge.rise * smoothstep((fromMiddle - map.edge.start) / (half - map.edge.start))
}

function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1)
  return c * c * (3 - 2 * c)
}

/** `values` round a loop, evened out over about `span` of them (three box passes make a smooth bell). */
function evenOut(values: Float64Array, span: number): Float64Array {
  const count = values.length
  const half = Math.max(1, Math.round(span / 2))
  let even = values
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float64Array(count)
    let sum = 0
    for (let k = -half; k <= half; k++) sum += even[((k % count) + count) % count]
    for (let k = 0; k < count; k++) {
      next[k] = sum / (2 * half + 1)
      sum += even[(k + half + 1) % count] - even[(((k - half) % count) + count) % count]
    }
    even = next
  }
  return even
}

/** Metres along a line of points from its first, at each point. */
function alongLine(xs: Float64Array, zs: Float64Array): Float64Array {
  const along = new Float64Array(xs.length)
  for (let k = 1; k < xs.length; k++) along[k] = along[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1])
  return along
}

/** The point of a line nearest `metres` along it. */
function nearestAlong(along: Float64Array, metres: number): number {
  let best = 0
  for (let k = 1; k < along.length; k++) if (Math.abs(along[k] - metres) < Math.abs(along[best] - metres)) best = k
  return best
}

/**
 * The points of a loop line from `before` metres before point `at` to
 * `after` metres past it, each with how far it is from the first, metres,
 * and a weight: 1, but easing in from 0 over the first and last `ease` metres.
 */
function stretchPoints(along: Float64Array, stretch: { at: number; before: number; after: number; ease: number }) {
  const count = along.length
  const total = along[count - 1] + (along[1] - along[0]) // round the loop, near enough
  const span = stretch.before + stretch.after
  const a = nearestAlong(along, (along[stretch.at] - stretch.before + total) % total)
  const points: { k: number; metres: number; w: number }[] = []
  for (let d = 0; d < count; d++) {
    const k = (a + d) % count
    const metres = (along[k] - along[a] + total) % total
    if (metres > span || (d > 0 && k === a)) break
    points.push({ k, metres, w: smoothstep(Math.min(metres, span - metres) / Math.max(stretch.ease, 1e-6)) })
  }
  return points
}
