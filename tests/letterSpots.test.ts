import { describe, expect, it } from 'vitest'
import type { GhostRide } from '../src/world/ghostRider'
import type { JumpSpot } from '../src/world/jumpFinder'
import { placeLetters, placeLettersGradually, pointAlong, sliceOf, sliceTurn, type LetterPlan } from '../src/world/letterSpots'

const DEG = Math.PI / 180
/** M O T O X, getting harder. */
const targets = [0, 0.25, 0.5, 0.75, 1]
const plan = (spread = 350): LetterPlan => ({ spread, turn: 0, difficulties: targets })

/** A made-up jump `distance` m out from the middle toward compass `bearing`, ridden outward; `air` is how long the ghost will fly it. */
function jump(bearing: number, distance: number, air: number): JumpSpot {
  const x = Math.sin(bearing * DEG) * distance
  const z = -Math.cos(bearing * DEG) * distance
  const dx = Math.sin(bearing * DEG)
  const dz = -Math.cos(bearing * DEG)
  return {
    lip: { x, y: 0, z },
    heading: bearing,
    runUp: [{ x: x - dx * 30, y: 0, z: z - dz * 30 }, { x, y: 0, z }],
    lipAngle: 20,
    speed: 70,
    airtime: air,
    landing: { x: x + dx * 30, y: 0, z: z + dz * 30 },
    score: air,
  }
}

/** A pretend ghost: lands every jump except the ones listed, flying for the jump's airtime. */
function ghost(refuse: JumpSpot[] = []) {
  const ridden: JumpSpot[] = []
  const ride = (spot: JumpSpot): GhostRide => {
    ridden.push(spot)
    if (refuse.includes(spot)) return { landed: false, reason: 'crashed: head hit the ground', flight: [], airtime: 0, speed: 70 }
    const flight = [spot.lip, { ...spot.lip, y: 5 }, spot.landing]
    return { landed: true, flight, airtime: spot.airtime, speed: spot.speed }
  }
  return { ride, ridden }
}

/** Slices are 72 degrees wide starting at north (turn 0); these bearings are the middle of each. */
const middles = [36, 108, 180, 252, 324]

describe('slices', () => {
  it('cut the map into five like a pie, turned by the seed', () => {
    expect(middles.map((b) => sliceOf(Math.sin(b * DEG), -Math.cos(b * DEG), 0, 5))).toEqual([0, 1, 2, 3, 4])
    expect(sliceOf(Math.sin(36 * DEG), -Math.cos(36 * DEG), 50, 5)).toBe(4) // turned 50 degrees on: 36 now falls before slice 0 starts
  })

  it('each seed turns them its own way, less than one slice round', () => {
    expect(sliceTurn(1337, 5)).toBe(sliceTurn(1337, 5))
    const turns = [0, 1, 2, 3, 1337].map((seed) => sliceTurn(seed, 5))
    expect(new Set(turns).size).toBe(5)
    for (const turn of turns) {
      expect(turn).toBeGreaterThanOrEqual(0)
      expect(turn).toBeLessThan(72)
    }
  })
})

describe('handing out the letters', () => {
  // every slice has a gentle, a middling and a big jump, except slice 1 with an extra-gentle one and slice 3 with a monster
  const jumps = middles.flatMap((b, slice) => [
    jump(b, 100, slice === 1 ? 1.0 : 1.4),
    jump(b + 10, 200, 2),
    jump(b - 10, 300, slice === 3 ? 4.5 : 2.6),
  ])

  it('X goes to the slice with the hardest jump, M to the one with the easiest', () => {
    const spots = placeLetters(jumps, plan(), ghost().ride)
    const of = (letter: number) => spots.find((spot) => spot.letter === letter)!
    expect(of(4).slice).toBe(3)
    expect(of(4).jump.airtime).toBe(4.5)
    expect(of(0).slice).toBe(1)
    expect(of(0).jump.airtime).toBe(1.0)
  })

  it('puts each letter in a slice of its own when it can', () => {
    const spots = placeLetters(jumps, plan(), ghost().ride)
    expect(spots).toHaveLength(5)
    expect(new Set(spots.map((spot) => spot.slice)).size).toBe(5)
  })

  it('rates the jumps the ghost landed from 0, the easiest, to 1, the hardest', () => {
    const spots = placeLetters(jumps, plan(), ghost().ride)
    expect(spots.find((spot) => spot.letter === 0)!.difficulty).toBe(0)
    expect(spots.find((spot) => spot.letter === 4)!.difficulty).toBe(1)
  })

  it('a jump the ghost can\'t land is left out: the next one of about that size in the slice is tried', () => {
    const monster = jumps.find((j) => j.airtime === 4.5)!
    const spots = placeLetters(jumps, plan(), ghost([monster]).ride)
    expect(spots.some((spot) => spot.jump === monster)).toBe(false)
    expect(spots.find((spot) => spot.letter === 4)!.jump.airtime).toBe(2.6)
  })

  it('when a slice has nothing to jump, letters share the other slices, each on a jump of its own', () => {
    const some = jumps.filter((j) => sliceOf(j.lip.x, j.lip.z, 0, 5) <= 2) // slices 3 and 4 are empty
    const spots = placeLetters(some, plan(), ghost().ride)
    expect(spots).toHaveLength(5)
    expect(new Set(spots.map((spot) => spot.jump)).size).toBe(5)
  })

  it('only uses jumps within spread of the middle', () => {
    const spots = placeLetters(jumps, plan(250), ghost().ride)
    for (const spot of spots) expect(Math.hypot(spot.jump.landing.x, spot.jump.landing.z)).toBeLessThanOrEqual(250)
  })

  it('the letters sit on the path the ghost really flew', () => {
    const spots = placeLetters(jumps, plan(), ghost().ride)
    for (const spot of spots) expect(spot.flight[1].y).toBe(5)
  })
})

describe('the ghost rides', () => {
  it('about six jumps a slice, from the easiest to the hardest there, not every one', () => {
    const many = middles.flatMap((b) => Array.from({ length: 40 }, (_, i) => jump(b - 30 + i * 1.5, 60 + i * 6, 1 + i * 0.1)))
    const { ride, ridden } = ghost()
    placeLetters(many, plan(), ride)
    expect(ridden.length).toBeLessThanOrEqual(30)
    const airs = ridden.filter((j) => sliceOf(j.lip.x, j.lip.z, 0, 5) === 0).map((j) => j.airtime)
    expect(Math.min(...airs)).toBeCloseTo(1, 5) // the easiest in the slice
    expect(Math.max(...airs)).toBeCloseTo(4.9, 5) // and the hardest
  })

  it('a bit at a time between frames, ending with the same letters', () => {
    const jumps = middles.flatMap((b) => [jump(b, 100, 1.2), jump(b + 10, 250, 2.5)])
    const search = placeLettersGradually(jumps, plan(), ghost().ride)
    let pauses = 0
    let step = search.next()
    while (!step.done) {
      pauses++
      step = search.next()
    }
    expect(pauses).toBeGreaterThanOrEqual(10) // it stopped after every ride
    expect(step.value).toEqual(placeLetters(jumps, plan(), ghost().ride))
  })

  it('also pauses inside a ride, when the ghost rides a bit at a time', () => {
    const jumps = middles.map((b) => jump(b, 100, 1.2))
    const { ride } = ghost()
    const slowRide = function* (spot: JumpSpot) {
      yield
      yield
      return ride(spot)
    }
    const search = placeLettersGradually(jumps, plan(), slowRide)
    let pauses = 0
    let step = search.next()
    while (!step.done) {
      pauses++
      step = search.next()
    }
    expect(pauses).toBe(15) // two inside each of the five rides, and one after each
    expect(step.value).toEqual(placeLetters(jumps, plan(), ghost().ride))
  })
})

describe('pointAlong', () => {
  // up for 4 steps to the top, down for 8
  const flight = [0, 2, 3.5, 4.5, 5, 4.5, 4, 3, 2, 1, 0.5, 0.2, 0].map((y, i) => ({ x: i, y, z: 0 }))

  it('0 is lift-off, 1 touchdown, and 0.5 always the highest point', () => {
    expect(pointAlong(flight, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(pointAlong(flight, 1)).toEqual({ x: 12, y: 0, z: 0 })
    expect(pointAlong(flight, 0.5)).toEqual({ x: 4, y: 5, z: 0 })
  })

  it('in between, part way up or down', () => {
    expect(pointAlong(flight, 0.25).x).toBeCloseTo(2, 6) // halfway from lift-off to the top
    expect(pointAlong(flight, 0.75).x).toBeCloseTo(8, 6) // halfway from the top to touchdown
    expect(pointAlong(flight, 0.125).x).toBeCloseTo(1, 6)
    expect(pointAlong(flight, 0.125).y).toBeCloseTo(2, 6)
  })
})
