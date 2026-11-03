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
  /** How many times the finished line gets relaxed, the last step of all. */
  relax: number
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
/** How far into the longest straight the start line is, metres. */
const START_IN = 10
/** How far behind the start line the bike starts, metres. */
const BEHIND = 6
/** Metres outside a straight run the track takes to ease onto its line. */
const EASE = 8
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
    /** Runs of the loop's squares (their places on it, in riding order, in a line) the track must run dead straight through. */
    straights: readonly number[][] = [],
  ) {
    const straight = new Set(straights.flat())
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
    // the `straight` squares stay dead on their middles, no wobble or rounding,
    // so the track runs straight through them (a jump's run-up, face and roll-out)
    const points = middles.map(({ x, z }, i) => {
      if (straight.has(i)) {
        const middle = squareCentre(layout, layout.squares[i])
        return new THREE.Vector3(middle.x, 0, middle.z)
      }
      return new THREE.Vector3(x + (nudges[i][0] / biggest) * reach, 0, z + (nudges[i][1] / biggest) * reach)
    })
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
    // The spline still bends a little through the straight squares, toward
    // its wobbly points either side, so pull the track's middle right onto
    // the line there, easing back to the spline just outside them.
    for (const run of straights) this.pullStraight(run)
    // last of all, relax the whole line: smooths kinks, leaves straights straight
    this.relax(shape.relax)
    if (straights.length > 0 || shape.relax > 0) this.retangent()
    // measured again round the finished line, which pulling and relaxing shortened
    this.length = this.samples.reduce((sum, s, i, all) => {
      const b = all[(i + 1) % all.length]
      return sum + Math.hypot(b.x - s.x, b.z - s.z)
    }, 0)
    this.tightest = this.radii().reduce((t, radius, i) => (radius < t.radius ? { radius, at: i } : t), { radius: Infinity, at: 0 })
  }

  /**
   * Pulls the samples in `run`'s squares onto the straight line through
   * their middles, and the ones within EASE metres either side partway, so
   * the track bends smoothly onto the line and off it again.
   */
  private pullStraight(run: readonly number[]): void {
    const { layout, samples } = this
    const n = samples.length
    const { square } = layout.shape
    const squares = layout.squares
    const first = squareCentre(layout, squares[run[0]])
    // which way the run goes: across its first square, from the one before to the one after
    const before = squareCentre(layout, squares[(run[0] + squares.length - 1) % squares.length])
    const after = squareCentre(layout, squares[(run[0] + 1) % squares.length])
    const long = Math.hypot(after.x - before.x, after.z - before.z) || 1
    const dx = (after.x - before.x) / long
    const dz = (after.z - before.z) / long
    // next to a corner it eases on inside the run's end square, leaving the corner alone
    const n2 = squares.length
    const corner = (i: number) => {
      const [a, s, b] = [squares[(i + n2 - 1) % n2], squares[i], squares[(i + 1) % n2]]
      return s.col - a.col !== b.col - s.col || s.row - a.row !== b.row - s.row
    }
    const from = -square / 2 + (corner((run[0] + n2 - 1) % n2) ? EASE : 0)
    const to = (run.length - 0.5) * square - (corner((run[run.length - 1] + 1) % n2) ? EASE : 0)
    // only this bit of the lap: from just before the run's first square to just after its last
    const last = squareCentre(layout, squares[run[run.length - 1]])
    const start = this.nearest(first.x - dx * (square / 2 + EASE), first.z - dz * (square / 2 + EASE))
    const end = this.nearest(last.x + dx * (square / 2 + EASE), last.z + dz * (square / 2 + EASE))
    for (let k = 0, i = start; k <= (end - start + n) % n; k++, i = (i + 1) % n) {
      const s = samples[i]
      const u = (s.x - first.x) * dx + (s.z - first.z) * dz
      const off = -(s.x - first.x) * dz + (s.z - first.z) * dx
      const outside = u < from ? from - u : u > to ? u - to : 0
      const t = Math.min(outside / EASE, 1)
      const pull = 1 - t * t * (3 - 2 * t)
      s.x += dz * off * pull
      s.z -= dx * off * pull
    }
  }

  /**
   * Relaxes the line `passes` times: each pass moves every sample halfway
   * to the middle of its two neighbours. Bends and kinks soften (and
   * corners pull in a little); a dead-straight bit is already in the middle
   * of its neighbours, so it stays put. Each pass reaches about a metre
   * further along, so it takes a lot of them to smooth a big bend.
   */
  private relax(passes: number): void {
    const { samples } = this
    const n = samples.length
    let xs = samples.map((s) => s.x)
    let zs = samples.map((s) => s.z)
    for (let pass = 0; pass < passes; pass++) {
      xs = xs.map((x, i) => (x + (xs[(i + n - 1) % n] + xs[(i + 1) % n]) / 2) / 2)
      zs = zs.map((z, i) => (z + (zs[(i + n - 1) % n] + zs[(i + 1) % n]) / 2) / 2)
    }
    samples.forEach((s, i) => Object.assign(s, { x: xs[i], z: zs[i] }))
  }

  /** Works out which way the track runs at each sample again, from its neighbours, after they've been moved. */
  private retangent(): void {
    const { samples } = this
    const n = samples.length
    const along = samples.map((_, i) => {
      const a = samples[(i + n - 1) % n]
      const b = samples[(i + 1) % n]
      const long = Math.hypot(b.x - a.x, b.z - a.z) || 1
      return { tx: (b.x - a.x) / long, tz: (b.z - a.z) / long }
    })
    samples.forEach((s, i) => Object.assign(s, along[i]))
  }

  /** The sample nearest (x, z). */
  nearest(x: number, z: number): number {
    let best = 0
    let bestD = Infinity
    this.samples.forEach((s, i) => {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2
      if (d < bestD) [best, bestD] = [i, d]
    })
    return best
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

  /** Where the bike starts: a little way behind the start line, pointing along the track toward it. */
  start(): { x: number; z: number; heading: number } {
    const n = this.samples.length
    const s = this.samples[(this.startAt() - Math.round(BEHIND / SPACING) + n) % n]
    return { x: s.x, z: s.z, heading: Math.atan2(s.tx, -s.tz) }
  }

  /** The start line's sample: a little way into the longest straight. */
  startAt(): number {
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
    return (best.from + Math.min(Math.round(START_IN / SPACING), best.long >> 1)) % n
  }

  /** How far (x, z) is from the track's middle, metres. */
  distanceTo(x: number, z: number): number {
    let nearest = Infinity
    for (const s of this.samples) nearest = Math.min(nearest, (s.x - x) ** 2 + (s.z - z) ** 2)
    return Math.sqrt(nearest)
  }
}
