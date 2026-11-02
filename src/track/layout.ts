/** How the track's loop is laid out, as set in the debug menu's Track tab. */
export interface LayoutShape {
  /** Picks which loop you get: the same seed always lays out the same loop. */
  seed: number
  /** How many squares across the grid is, both ways. */
  across: number
  /** How big each square is, metres. Two bits of track side by side are at least this far apart. */
  square: number
  /** How many squares long the loop is (rounded down to even). */
  length: number
}

/** A grid square: its column (along x) and row (along z), from 0. */
export interface Square {
  col: number
  row: number
}

/** A laid-out loop: the squares it runs through, in riding order, the last joining back to the first. */
export interface Layout {
  shape: LayoutShape
  squares: Square[]
}

/** How many tries at pushing the loop out before giving up (the grid's full). */
const TRIES = 20000

/**
 * Lays out a loop on a grid of big squares, from a seed. It starts as the
 * four squares in the middle and grows: again and again it picks a side of
 * the loop (two squares next to each other on it) and pushes that side out
 * one square sideways, into free squares. The loop never uses a square
 * twice, so it can't cross itself, but it can wander anywhere: S-bends,
 * hairpins, long straights. Same seed, same loop.
 */
export function layOut(shape: LayoutShape): Layout {
  const random = seeded(shape.seed)
  const across = Math.max(2, Math.round(shape.across))
  const length = Math.min(Math.floor(shape.length / 2) * 2, across * across)
  const mid = Math.floor(across / 2) - 1
  const squares: Square[] = [
    { col: mid, row: mid },
    { col: mid + 1, row: mid },
    { col: mid + 1, row: mid + 1 },
    { col: mid, row: mid + 1 },
  ]
  const used = new Set(squares.map(key))
  const free = (s: Square) => s.col >= 0 && s.row >= 0 && s.col < across && s.row < across && !used.has(key(s))

  for (let tries = 0; squares.length < length && tries < TRIES; tries++) {
    const i = Math.floor(random() * squares.length)
    const a = squares[i]
    const b = squares[(i + 1) % squares.length]
    // sideways from a to b, one way or the other
    const side = random() < 0.5 ? 1 : -1
    const dCol = -(b.row - a.row) * side
    const dRow = (b.col - a.col) * side
    const outA = { col: a.col + dCol, row: a.row + dRow }
    const outB = { col: b.col + dCol, row: b.row + dRow }
    if (!free(outA) || !free(outB)) continue
    squares.splice(i + 1, 0, outA, outB)
    used.add(key(outA))
    used.add(key(outB))
  }
  return { shape, squares }
}

/** Where a square's middle is in the world: the grid is centred on the world's middle (0, 0). */
export function squareCentre(layout: Layout, s: Square): { x: number; z: number } {
  const { across, square } = layout.shape
  const half = (Math.round(across) - 1) / 2
  return { x: (s.col - half) * square, z: (s.row - half) * square }
}

function key(s: Square): string {
  return `${s.col},${s.row}`
}

/** A random number generator that gives the same numbers, 0 to 1, for the same seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = Math.round(seed) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
