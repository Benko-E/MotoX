import * as THREE from 'three'
import { seeded, squareCentre, type Layout } from './layout'

/** How the track is drawn through its layout, as set in the debug menu's Track tab. */
export interface TrackShape {
  /** How wide the track is, edge to edge, metres. */
  width: number
  /** How far each point gets nudged off its square's middle, as a share of the square (0 to 0.45). */
  wobble: number
  /** How much the grid's square corners get rounded off, 0 (not at all) to 1. */
  rounding: number
}

/** A spot along the track's middle: where it is, and which way the track runs there (a unit vector). */
export interface Sample {
  x: number
  z: number
  tx: number
  tz: number
}

/** How many times the corners get rounded off. */
const ROUNDING_PASSES = 3
/** Metres between samples along the track. */
const SPACING = 1
/** Corners wider than this count as straight, for finding the start, metres. */
const STRAIGHT = 60
/** How far into the longest straight the start is, metres. */
const START_IN = 10
/** Metres either side a corner's sharpness is averaged over, so one sample's wobble doesn't count as a corner. */
const CORNER_SPAN = 3

/**
 * The track: a smooth closed spline through the layout's squares, each
 * point nudged a little off its square's middle so it doesn't look drawn
 * on graph paper. The nudges are smoothed along the loop, so neighbouring
 * points lean the same way and the track sways rather than jitters. Same
 * seed, same nudges.
 */
export class Track {
  readonly curve: THREE.CatmullRomCurve3
  /** One lap, metres. */
  readonly length: number
  /** A spot every metre round the lap, from the start of the spline. */
  readonly samples: Sample[]
  /** The tightest corner's radius, metres, and where it is (a sample's index). */
  readonly tightest: { radius: number; at: number }

  constructor(
    readonly layout: Layout,
    readonly shape: TrackShape,
  ) {
    const random = seeded(layout.shape.seed * 7919 + 1)
    const n = layout.squares.length
    const reach = THREE.MathUtils.clamp(shape.wobble, 0, 0.45) * layout.shape.square
    // a random nudge per point, smoothed twice with its neighbours, then scaled back up to full reach
    let nudges = layout.squares.map(() => [random() * 2 - 1, random() * 2 - 1])
    for (let pass = 0; pass < 2; pass++) {
      nudges = nudges.map((_, i) => {
        const [a, b, c] = [nudges[(i + n - 1) % n], nudges[i], nudges[(i + 1) % n]]
        return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
      })
    }
    const biggest = Math.max(1e-6, ...nudges.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))))
    // the squares' middles, corners rounded off: each point pulled toward
    // halfway between its neighbours, a few times over (straights stay put)
    let middles = layout.squares.map((s) => squareCentre(layout, s))
    const pull = THREE.MathUtils.clamp(shape.rounding, 0, 1) * 0.5
    for (let pass = 0; pass < ROUNDING_PASSES; pass++) {
      middles = middles.map((b, i) => {
        const a = middles[(i + n - 1) % n]
        const c = middles[(i + 1) % n]
        return { x: b.x + ((a.x + c.x) / 2 - b.x) * pull, z: b.z + ((a.z + c.z) / 2 - b.z) * pull }
      })
    }
    const points = middles.map(({ x, z }, i) => new THREE.Vector3(x + (nudges[i][0] / biggest) * reach, 0, z + (nudges[i][1] / biggest) * reach))
    // centripetal: no loops or overshoot at the tight corners
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
    this.length = this.curve.getLength()

    const count = Math.max(8, Math.round(this.length / SPACING))
    this.samples = []
    const at = new THREE.Vector3()
    const along = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      this.curve.getPointAt(i / count, at)
      this.curve.getTangentAt(i / count, along)
      const flat = Math.hypot(along.x, along.z) || 1
      this.samples.push({ x: at.x, z: at.z, tx: along.x / flat, tz: along.z / flat })
    }
    this.tightest = this.radii().reduce((t, radius, i) => (radius < t.radius ? { radius, at: i } : t), { radius: Infinity, at: 0 })
  }

  /** Each sample's corner radius, metres (Infinity where it's dead straight). */
  radii(): number[] {
    const { samples } = this
    const n = samples.length
    const span = Math.max(1, Math.round(CORNER_SPAN / SPACING))
    const step = this.length / n
    return samples.map((_, i) => {
      const a = samples[(i - span + n) % n]
      const b = samples[(i + span) % n]
      const turned = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz))
      return turned < 1e-6 ? Infinity : (2 * span * step) / turned
    })
  }

  /** Where the bike starts: a little way into the longest straight, pointing along the track. */
  start(): { x: number; z: number; heading: number } {
    const radii = this.radii()
    const n = radii.length
    // the longest run of straight-ish samples, going round past the end if it has to
    let best = { from: 0, long: 0 }
    let from = -1
    for (let i = 0; i < n * 2; i++) {
      if (radii[i % n] > STRAIGHT) {
        if (from < 0) from = i
        if (i - from + 1 > best.long && i - from < n) best = { from, long: i - from + 1 }
      } else from = -1
    }
    const s = this.samples[(best.from + Math.min(Math.round(START_IN / SPACING), best.long >> 1)) % n]
    return { x: s.x, z: s.z, heading: Math.atan2(s.tx, -s.tz) }
  }

  /** How far (x, z) is from the track's middle, metres. */
  distanceTo(x: number, z: number): number {
    let nearest = Infinity
    for (const s of this.samples) nearest = Math.min(nearest, (s.x - x) ** 2 + (s.z - z) ** 2)
    return Math.sqrt(nearest)
  }
}
