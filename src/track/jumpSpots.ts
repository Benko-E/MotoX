import { seeded, type Layout } from './layout'

/** A spot a jump fits: a straight run of the loop's squares, as their places on the loop, in riding order. */
export interface JumpSpot {
  at: number[]
}

/** A jump placed in a spot: which squares of the loop it takes, in riding order (run-up, face, flight..., roll-out). */
export interface Jump {
  at: number[]
}

/**
 * Walks the loop square by square, looking for straight runs: squares the
 * loop goes straight through (in one side and out the opposite one), one
 * after another in a line. Every run at least `need` squares long is a spot
 * a jump fits. The corners either end don't count: the track bends in them.
 */
export function findJumpSpots(layout: Layout, need: number): JumpSpot[] {
  const { squares } = layout
  const n = squares.length
  const through = squares.map((s, i) => {
    const a = squares[(i + n - 1) % n]
    const b = squares[(i + 1) % n]
    return s.col - a.col === b.col - s.col && s.row - a.row === b.row - s.row
  })
  // start just after a corner, so no run gets cut in two at the loop's end
  const corner = through.indexOf(false)
  if (corner < 0) return []
  const spots: JumpSpot[] = []
  let run: number[] = []
  for (let k = 1; k <= n; k++) {
    const i = (corner + k) % n
    if (through[i]) run.push(i)
    else {
      if (run.length >= need) spots.push({ at: run })
      run = []
    }
  }
  return spots
}

/**
 * Places up to `amount` jumps, `need` squares each, on a loop of `loop`
 * squares. First it spaces `amount` targets evenly round the lap, from a
 * random start, and lets each wander off its even place, more the less the
 * `spacing` (0 to 1): at 1 they stay perfectly even, at 0 they could be
 * anywhere (pure random). Then each jump goes in the free place closest to
 * its target. The more spacing, the more starts it tries, keeping the one
 * whose closest two jumps are farthest apart. A jump only uses up its own
 * squares: what's left of the spot either side of it stays a spot, if it's
 * still long enough. Asking for more than there's room for (jumpRoom)
 * places as many as there's room for. Same seed, same jumps.
 */
export function placeJumps(spots: JumpSpot[], asked: number, need: number, seed: number, spacing: number, loop: number): Jump[] {
  const random = seeded(seed * 104729 + 7)
  // more than fit is the same as as many as fit: the targets don't shift about
  const amount = Math.min(asked, jumpRoom(spots, need))
  const even = Math.min(Math.max(spacing, 0), 1)
  const tries = 1 + Math.round(even * (MOST_STARTS - 1))
  let best: { jumps: Jump[]; closest: number } = { jumps: [], closest: -1 }
  for (let t = 0; t < tries; t++) {
    const jumps = placeFrom(spots, amount, need, loop, random() * loop, 1 - even, random)
    const closest = closestGap(jumps, loop)
    if (jumps.length > best.jumps.length || (jumps.length === best.jumps.length && closest > best.closest)) best = { jumps, closest }
  }
  return best.jumps
}

/** The most jumps of `need` squares that fit in `spots`, packed end to end. */
export function jumpRoom(spots: JumpSpot[], need: number): number {
  return spots.reduce((sum, { at }) => sum + Math.floor(at.length / need), 0)
}

/** At full Spacing, how many starting points round the lap it tries. */
const MOST_STARTS = 12

/** The smallest gap round the lap, in squares, between two of `jumps` (the whole lap if there's only one). */
function closestGap(jumps: Jump[], loop: number): number {
  const starts = jumps.map((j) => j.at[0]).sort((a, b) => a - b)
  let closest = loop
  starts.forEach((s, i) => (closest = Math.min(closest, (i + 1 < starts.length ? starts[i + 1] : starts[0] + loop) - s)))
  return closest
}

/** One go at placing the jumps: targets evenly spaced from `start`, each wandering up to `wander` (0 to 1) of half a lap. */
function placeFrom(spots: JumpSpot[], amount: number, need: number, loop: number, start: number, wander: number, random: () => number): Jump[] {
  const left = [...spots]
  const jumps: Jump[] = []
  /** How far round the lap, in squares, from a jump starting at loop square `at` to `target`. */
  const apart = (at: number, target: number) => {
    const d = (((at + need / 2 - target) % loop) + loop) % loop
    return Math.min(d, loop - d)
  }
  const room = (long: number) => Math.floor(long / need)
  for (let k = 0; k < amount && left.length > 0; k++) {
    const target = start + (k * loop) / amount + (random() * 2 - 1) * wander * (loop / 2)
    // a jump may only waste room another jump could use if there's room to spare for the ones still to come
    const spare = jumpRoom(left, need) - (amount - k)
    let best = { spot: 0, from: 0, off: Infinity }
    left.forEach(({ at }, spot) => {
      for (let from = 0; from + need <= at.length; from++) {
        const wasted = room(at.length) - 1 - room(from) - room(at.length - from - need)
        if (wasted > spare) continue
        const off = apart(at[from], target)
        if (off < best.off) best = { spot, from, off }
      }
    })
    const [spot] = left.splice(best.spot, 1)
    const { from } = best
    jumps.push({ at: spot.at.slice(from, from + need) })
    for (const rest of [spot.at.slice(0, from), spot.at.slice(from + need)]) {
      if (rest.length >= need) left.push({ at: rest })
    }
  }
  return jumps
}

/** The runs of squares the track must run dead straight through under `jumps`: each one's run-up and face, and its roll-out. */
export function straightSquares(jumps: Jump[]): number[][] {
  return jumps.flatMap(({ at }) => [[at[0], at[1]], [at[at.length - 1]]])
}
