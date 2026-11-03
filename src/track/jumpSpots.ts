import type { Layout, Square } from './layout'

/** A spot a jump fits: a straight run of squares on the loop, in riding order. */
export interface JumpSpot {
  squares: Square[]
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
  let run: Square[] = []
  for (let k = 1; k <= n; k++) {
    const i = (corner + k) % n
    if (through[i]) run.push(squares[i])
    else {
      if (run.length >= need) spots.push({ squares: run })
      run = []
    }
  }
  return spots
}
