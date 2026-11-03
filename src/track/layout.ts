/** How the track's loop is laid out, as set in the debug menu's Track tab. */
export interface LayoutShape {
  /** Picks which loop you get: the same seed always lays out the same loop. */
  seed: number
  /** How many squares the grid is along x, and along z. */
  wide: number
  deep: number
  /** How big each square is, metres. */
  square: number
  /** How many times a straight bit of the loop gets pushed in (or out) a square. */
  bites: number
  /** The chance, 0 to 1, that the next push carries on pushing the last bit deeper. */
  deepen: number
  /** The widest bit that gets pushed, squares (at least 3, so there's grass inside a bite). */
  widest: number
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

/** A straight bit of the loop to push: where it starts on the loop, how many squares long, and which side (1 or -1) it goes. */
interface Push {
  at: number
  long: number
  side: number
}

/** How many tries per push before giving up on it. */
const TRIES = 200

/**
 * Lays out a loop on a grid of big squares, from a seed. It starts as a
 * ring round the grid, one square in from the edge, and gets bites taken
 * out of it: again and again a straight bit of the loop is pushed one
 * square sideways, in or out. Often the same bit gets pushed again, deeper,
 * so some bites go a long way in. The loop never uses a square twice, and
 * never runs right next to another part of itself: there's always at least
 * a square of grass between, so it can't cross or bunch up. Same seed, same loop.
 */
export function layOut(shape: LayoutShape): Layout {
  const random = seeded(shape.seed)
  const wide = Math.max(4, Math.round(shape.wide))
  const deep = Math.max(4, Math.round(shape.deep))
  const widest = Math.max(3, Math.round(shape.widest))

  // the ring: along the top, down the right, back along the bottom, up the left
  const squares: Square[] = []
  const [left, top, right, bottom] = [1, 1, wide - 2, deep - 2]
  for (let col = left; col < right; col++) squares.push({ col, row: top })
  for (let row = top; row < bottom; row++) squares.push({ col: right, row })
  for (let col = right; col > left; col--) squares.push({ col, row: bottom })
  for (let row = bottom; row > top; row--) squares.push({ col: left, row })

  const used = new Set(squares.map(key))
  const inside = (s: Square) => s.col >= 0 && s.row >= 0 && s.col < wide && s.row < deep
  /** The last push, to carry on deeper. */
  let last: Push | null = null

  for (let bite = 0; bite < shape.bites; bite++) {
    for (let tries = 0; tries < TRIES; tries++) {
      const push: Push =
        last && random() < shape.deepen
          ? last
          : {
              at: Math.floor(random() * squares.length),
              long: 3 + Math.floor(random() * (widest - 2)),
              side: random() < 0.5 ? 1 : -1,
            }
      if (pushOut(push)) {
        last = { ...push, at: push.at + 1 }
        break
      }
      if (push === last) last = null // it can't go any deeper
    }
  }
  return { shape, squares }

  /**
   * Pushes the straight bit of `long` squares starting at `at` one square
   * sideways: the loop then runs out to it, along it, and back, and the
   * squares in between are grass again. False if it doesn't fit.
   */
  function pushOut({ at, long, side }: Push): boolean {
    if (at < 0 || at + long > squares.length) return false
    const run = squares.slice(at, at + long)
    const stepCol = run[1].col - run[0].col
    const stepRow = run[1].row - run[0].row
    for (let i = 2; i < long; i++) {
      if (run[i].col - run[i - 1].col !== stepCol || run[i].row - run[i - 1].row !== stepRow) return false
    }
    // sideways to the run, on the side asked for
    const dCol = -stepRow * side
    const dRow = stepCol * side
    const moved = run.map((s) => ({ col: s.col + dCol, row: s.row + dRow }))
    if (!moved.every((s) => inside(s) && !used.has(key(s)))) return false
    // grass all round: nothing else on the loop next to the moved bit (corners
    // included), except where it joins on, just before and just after it
    const near = new Set([at - 1, at + long].map((i) => (i + squares.length) % squares.length))
    for (let i = 0; i < squares.length; i++) {
      if ((i >= at && i < at + long) || near.has(i)) continue
      if (moved.some((s) => Math.abs(s.col - squares[i].col) <= 1 && Math.abs(s.row - squares[i].row) <= 1)) return false
    }
    for (const s of run.slice(1, -1)) used.delete(key(s))
    for (const s of moved) used.add(key(s))
    squares.splice(at + 1, long - 2, ...moved)
    return true
  }
}

/** Where a square's middle is in the world: the grid is centred on the world's middle (0, 0). */
export function squareCentre(layout: Layout, s: Square): { x: number; z: number } {
  const { wide, deep, square } = layout.shape
  return {
    x: (s.col - (Math.round(wide) - 1) / 2) * square,
    z: (s.row - (Math.round(deep) - 1) / 2) * square,
  }
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
