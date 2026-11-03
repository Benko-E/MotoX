import type { Track } from './track'

/** A line across the track: its middle, which way the track runs through it, and half its length. */
interface Gate {
  x: number
  z: number
  tx: number
  tz: number
  half: number
}

/** What just happened, if anything: the lap started, a split was taken, or a lap was finished. */
export type LapEvent =
  | { kind: 'start' }
  | { kind: 'split'; split: number; of: number; time: number }
  | { kind: 'lap'; time: number; best: boolean }

/** How far past the track's edge a line still counts as crossed, metres: riding the very edge is fine. */
const MARGIN = 3

/**
 * Times laps over the splits. Crossing the start line starts the clock.
 * The first split taken after it sets which way round you're riding: the
 * one after the start along the track, or the one before it (riding the
 * other way). After that the splits only count in that order, and crossing
 * the start line again once they're all taken finishes the lap and starts
 * the next. Crossing it again early (turned back, cut across) starts over.
 */
export class LapTimer {
  private gates: Gate[] = []
  private last: { x: number; z: number } | undefined
  /** Seconds into this lap. */
  time = 0
  running = false
  /** The fastest lap so far on this track, seconds. */
  best = Infinity
  /** +1 riding along the track, -1 against it, 0 not known yet. */
  private way = 0
  /** Splits taken this lap. */
  private taken = 0
  /** The gate that counts next, once the way is known. */
  private next = 0

  /** Times laps over `splits` (samples of `track`, the start line first), forgetting the old track's best. */
  setGates(track: Track, splits: readonly number[]): void {
    const half = track.shape.width / 2 + MARGIN
    this.gates = splits.map((at) => {
      const { x, z, tx, tz } = track.samples[at]
      return { x, z, tx, tz, half }
    })
    this.best = Infinity
    this.reset()
  }

  /** Stops the clock, ready to start again at the start line (after a reset, say). */
  reset(): void {
    this.running = false
    this.time = 0
    this.way = 0
    this.taken = 0
    this.last = undefined
  }

  /** Moves the clock on `dt` seconds, with the bike now at (x, z). */
  update(x: number, z: number, dt: number): LapEvent | undefined {
    if (this.running) this.time += dt
    const last = this.last
    this.last = { x, z }
    if (!last) return
    const gate = this.gates.findIndex((g) => crossed(g, last.x, last.z, x, z))
    if (gate < 0) return
    const count = this.gates.length
    if (gate === 0) {
      if (this.running && this.taken === count - 1) {
        const time = this.time
        const best = time < this.best
        if (best) this.best = time
        this.startLap()
        return { kind: 'lap', time, best }
      }
      this.way = 0
      this.startLap()
      return { kind: 'start' }
    }
    if (!this.running) return
    if (this.way === 0) {
      // the first split after the start says which way round you're riding
      if (gate === 1) this.way = 1
      else if (gate === count - 1) this.way = -1
      else return
    } else if (gate !== this.next) return
    this.taken++
    this.next = (gate + this.way + count) % count
    return { kind: 'split', split: this.taken, of: count - 1, time: this.time }
  }

  private startLap(): void {
    this.running = true
    this.time = 0
    this.taken = 0
    this.next = this.way > 0 ? 1 : this.gates.length - 1
  }
}

/** Whether going from (ax, az) to (bx, bz) crosses `gate`'s line, either way. */
function crossed(gate: Gate, ax: number, az: number, bx: number, bz: number): boolean {
  const before = (ax - gate.x) * gate.tx + (az - gate.z) * gate.tz
  const after = (bx - gate.x) * gate.tx + (bz - gate.z) * gate.tz
  if (before === after || Math.sign(before) === Math.sign(after)) return false
  // where it crosses, how far off the track's middle
  const t = before / (before - after)
  const x = ax + (bx - ax) * t
  const z = az + (bz - az) * t
  return Math.abs(-(x - gate.x) * gate.tz + (z - gate.z) * gate.tx) <= gate.half
}
