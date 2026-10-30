import type { GhostRide } from './ghostRider'
import type { JumpSpot, Point } from './jumpFinder'

/**
 * Where the letters go. The map round the middle is cut into slices like a
 * pie, one per letter. In each slice the ghost rides a handful of jumps, from
 * the easiest to the hardest there; the ones it lands are rated against each
 * other. Only then are the letters handed out to the slices, so each letter
 * gets a jump about as hard as it wants: X goes wherever the sickest jump is,
 * not wherever it happened to be dealt.
 *
 * A letter that wants air is only put where a bike riding on the ground
 * can't reach it, from any side: then any way you get there counts, but
 * every way needs a jump. If none of the rides so far is high enough, the
 * ghost rides more, the biggest jumps first.
 */

/** What one letter asks for. */
export interface LetterWish {
  /** How hard its jump should be, 0 (the easiest landed) to 1 (the hardest). */
  difficulty: number
  /** Where on the flight it floats (see pointAlong), and how close the bike's middle must come to grab it, metres. */
  along: number
  grabSize: number
  /** How far its grab sphere must stay above a bike riding on the ground, metres. 0: no need to leave the ground. */
  airGap: number
}

export interface LetterPlan {
  /** How far from the middle the letters' jumps may be, run-up to landing, metres. */
  spread: number
  /** How far the slices are turned round from north, degrees. */
  turn: number
  /** One wish per letter, and one slice per letter. */
  letters: LetterWish[]
  /** The ground's height anywhere. */
  groundAt: (x: number, z: number) => number
}

export interface LetterSpot {
  /** Which letter: its place in the plan's list. */
  letter: number
  slice: number
  jump: JumpSpot
  /** The path the ghost flew over the jump, lift-off to touchdown: the letter floats on it. */
  flight: Point[]
  /** How hard its jump is next to the other landed ones, 0 (the easiest) to 1 (the hardest). */
  difficulty: number
}

const DEG = Math.PI / 180
/** Seeds one apart turn the slices by this much (sunflower seeds space out this way), degrees. */
const GOLDEN_ANGLE = 137.508
/** The ghost tries this many jumps in each slice, spread from the easiest to the hardest. */
const RUNGS = 6
/** If it can't land one, it tries up to this many of about the same size. */
const TRIES = 3
/** How hard a jump is: its airtime in seconds, plus a second for every this many km/h it needs. */
const SPEED_PER_SECOND = 40
/** Two letters in one slice counts as badly as this many wrong difficulties, so it only happens when a slice is empty. */
const SHARING = 10
/** A letter left without a jump at all counts as worse still. */
const MISSING = 100
/** While a letter has nowhere high enough to go, the ghost rides up to this many more jumps. */
const MORE_RIDES = 40
/** The ground round a letter is read this finely, looking for the nearest of it, metres. */
const REACH_STEP = 0.25

/** Which slice (0 to `slices` - 1) the point (x, z) falls in, counting round from north turned on by `turn` degrees. */
export function sliceOf(x: number, z: number, turn: number, slices: number): number {
  const bearing = Math.atan2(x, -z) / DEG
  const round = (((bearing - turn) % 360) + 360) % 360
  return Math.floor(round / (360 / slices)) % slices
}

/** How far a map's seed turns the slices round from north, degrees: a different way for every seed, less than one slice. */
export function sliceTurn(seed: number, slices: number): number {
  const width = 360 / slices
  return (((seed * GOLDEN_ANGLE) % width) + width) % width
}

/**
 * How far a letter at `point` with a grab sphere `grabSize` across (radius)
 * stays out of reach of a bike riding on the ground: from the sphere's edge to
 * the middle of a bike riding `rideHeight` up on the nearest ground in any
 * direction, metres. Negative: you can grab it without leaving the ground.
 * Measured to `upTo` metres; more comes out as at least that.
 */
export function reachGap(point: Point, grabSize: number, rideHeight: number, groundAt: (x: number, z: number) => number, upTo = 10): number {
  let nearest = Math.abs(point.y - groundAt(point.x, point.z))
  const reach = Math.min(grabSize + rideHeight + upTo, nearest)
  for (let dz = -reach; dz <= reach; dz += REACH_STEP) {
    for (let dx = -reach; dx <= reach; dx += REACH_STEP) {
      const across = Math.hypot(dx, dz)
      if (across >= nearest) continue // can't be any nearer
      nearest = Math.min(nearest, Math.hypot(across, groundAt(point.x + dx, point.z + dz) - point.y))
    }
  }
  return nearest - rideHeight - grabSize
}

/** The point on a flight `along` the way: 0 lift-off, 0.5 the highest point, 1 touchdown. */
export function pointAlong(flight: Point[], along: number): Point {
  if (flight.length === 1) return { ...flight[0] }
  let top = 0
  for (let i = 1; i < flight.length; i++) if (flight[i].y > flight[top].y) top = i
  const a = Math.min(Math.max(along, 0), 1)
  const at = a <= 0.5 ? (a / 0.5) * top : top + ((a - 0.5) / 0.5) * (flight.length - 1 - top)
  const i = Math.min(Math.floor(at), flight.length - 2)
  const t = at - i
  const p = flight[i]
  const q = flight[i + 1]
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t }
}

/** The ghost trying a jump: all at once, or a bit at a time (pausing like a generator). */
export type Ride = (jump: JumpSpot) => GhostRide | Generator<void, GhostRide>

/** All in one go; see placeLettersGradually. */
export function placeLetters(jumps: readonly JumpSpot[], plan: LetterPlan, ride: Ride): LetterSpot[] {
  const search = placeLettersGradually(jumps, plan, ride)
  let step = search.next()
  while (!step.done) step = search.next()
  return step.value
}

/** Places the letters, pausing after every ghost ride (and inside it, if it pauses), so the game can run frames in between. */
export function* placeLettersGradually(jumps: readonly JumpSpot[], plan: LetterPlan, ride: Ride): Generator<void, LetterSpot[]> {
  const wishes = plan.letters
  const slices = wishes.length
  const within = (p: Point) => Math.hypot(p.x, p.z) <= plan.spread
  const bySlice: JumpSpot[][] = Array.from({ length: slices }, () => [])
  for (const jump of jumps) {
    if (within(jump.runUp[0]) && within(jump.lip) && within(jump.landing)) bySlice[sliceOf(jump.lip.x, jump.lip.z, plan.turn, slices)].push(jump)
  }

  const landed: Landed[] = []
  const tried = new Set<JumpSpot>()
  /** The ghost tries `jump`; true if it landed it. */
  const tryJump = function* (jump: JumpSpot, slice: number): Generator<void, boolean> {
    tried.add(jump)
    const riding = ride(jump)
    const result = 'next' in riding ? yield* riding : riding
    yield
    if (!result.landed) return false
    // which letters it could carry: those it leaves out of reach of the ground, if they need to be
    const fits = wishes.map(
      (wish) =>
        wish.airGap <= 0 ||
        reachGap(pointAlong(result.flight, wish.along), wish.grabSize, result.rideHeight, plan.groundAt, wish.airGap + 0.5) >= wish.airGap,
    )
    landed.push({ slice, jump, flight: result.flight, hardness: result.airtime + result.speed / SPEED_PER_SECOND, fits })
    return true
  }

  for (let slice = 0; slice < slices; slice++) {
    // easiest first, by the jump finder's guess at how much air each gives
    const inSlice = bySlice[slice].sort((a, b) => a.score - b.score)
    // jumps a map feature built are always tried: they're there to be used
    for (const jump of inSlice) if (jump.source !== 'found') yield* tryJump(jump, slice)
    for (const rung of rungs(inSlice.length)) {
      let tries = 0
      for (const i of outFrom(rung, inSlice.length)) {
        if (tries >= TRIES) break
        if (tried.has(inSlice[i])) continue
        tries++
        if (yield* tryJump(inSlice[i], slice)) break
      }
    }
  }

  // a letter with nowhere high enough to go: ride more, the biggest jumps first
  let spots = handOut(landed, wishes, slices)
  const untried = bySlice.flatMap((inSlice, slice) => inSlice.filter((jump) => !tried.has(jump)).map((jump) => ({ jump, slice })))
  untried.sort((a, b) => b.jump.score - a.jump.score)
  for (let more = 0; spots.length < wishes.length && more < Math.min(MORE_RIDES, untried.length); more++) {
    if (yield* tryJump(untried[more].jump, untried[more].slice)) spots = handOut(landed, wishes, slices)
  }
  return spots
}

interface Landed {
  slice: number
  jump: JumpSpot
  flight: Point[]
  hardness: number
  /** Which letters it could carry (by place in the plan). */
  fits: boolean[]
}

/** Up to RUNGS places along a list `n` long, from the first to the last, evenly spread. */
function rungs(n: number): number[] {
  const count = Math.min(RUNGS, n)
  if (count <= 1) return count ? [0] : []
  return [...new Set(Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1))))]
}

/** `i`, then its neighbours either side, further and further out. */
function* outFrom(i: number, n: number): Generator<number> {
  for (let d = 0; d < n; d++) {
    if (i + d < n) yield i + d
    if (d > 0 && i - d >= 0) yield i - d
  }
}

/**
 * Gives each letter a jump. Every way of putting the letters in the slices
 * is tried (5 letters in 5 slices: 3125 ways, quick); in each, a letter takes
 * the free jump in its slice nearest the difficulty it wants. The way where
 * they come nearest wins, harder letters counting more, so X gets the
 * hardest jump before anything else is settled.
 */
function handOut(landed: Landed[], wishes: LetterWish[], slices: number): LetterSpot[] {
  const targets = wishes.map((wish) => wish.difficulty)
  const rated = rate(landed)
  const weight = targets.map((target) => 1 + target)
  const order = targets.map((_, i) => i).sort((a, b) => weight[b] - weight[a])
  let best: LetterSpot[] = []
  let bestCost = Infinity
  const ways = slices ** targets.length
  for (let way = 0; way < ways; way++) {
    const sliceFor = targets.map((_, i) => Math.floor(way / slices ** i) % slices)
    let cost = SHARING * (targets.length - new Set(sliceFor).size)
    if (cost >= bestCost) continue
    const taken = new Set<Landed>()
    const spots: LetterSpot[] = []
    for (const letter of order) {
      let pick: Landed | null = null
      for (const option of rated.keys()) {
        if (option.slice !== sliceFor[letter] || taken.has(option) || !option.fits[letter]) continue
        if (!pick || Math.abs(rated.get(option)! - targets[letter]) < Math.abs(rated.get(pick)! - targets[letter])) pick = option
      }
      if (!pick) {
        cost += MISSING
        continue
      }
      taken.add(pick)
      const difficulty = rated.get(pick)!
      cost += weight[letter] * Math.abs(difficulty - targets[letter])
      spots.push({ letter, slice: pick.slice, jump: pick.jump, flight: pick.flight, difficulty })
    }
    if (cost < bestCost) {
      bestCost = cost
      best = spots
    }
  }
  return best.sort((a, b) => a.letter - b.letter)
}

/** How hard each landed jump is next to the others: 0 the easiest, 1 the hardest, jumps alike sharing a rating. */
function rate(landed: Landed[]): Map<Landed, number> {
  const rated = new Map<Landed, number>()
  const n = landed.length
  for (const jump of landed) {
    const easier = landed.filter((other) => other.hardness < jump.hardness).length
    const alike = landed.filter((other) => other.hardness === jump.hardness).length
    rated.set(jump, n > 1 ? (easier + (alike - 1) / 2) / (n - 1) : 0)
  }
  return rated
}
