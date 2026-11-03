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
 * Places up to `amount` jumps, `need` squares each: again and again it
 * picks a spot at random from the ones left, and somewhere along it at
 * random. A jump only uses up its own squares: what's left of the spot
 * either side of it stays a spot, if it's still long enough. Same seed,
 * same jumps.
 */
export function placeJumps(spots: JumpSpot[], amount: number, need: number, seed: number): Jump[] {
  const random = seeded(seed * 104729 + 7)
  const left = [...spots]
  const jumps: Jump[] = []
  while (jumps.length < amount && left.length > 0) {
    const [spot] = left.splice(Math.floor(random() * left.length), 1)
    const from = Math.floor(random() * (spot.at.length - need + 1))
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
