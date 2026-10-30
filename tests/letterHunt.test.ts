import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { JumpSpot } from '../src/world/jumpFinder'
import { LetterHunt } from '../src/world/letterHunt'
import { pointAlong, type LetterSpot } from '../src/world/letterSpots'

const settings = () => structuredClone(config.letters)
/** Each letter's flight runs along x at height 5, at its own z (letter i at z = 100 i), so they're far apart. */
const spot = (letter: number): LetterSpot => ({
  letter,
  slice: letter,
  jump: {} as JumpSpot,
  flight: Array.from({ length: 21 }, (_, i) => ({ x: i - 10, y: 5, z: letter * 100 })),
  difficulty: letter / 4,
})
const spots = [0, 1, 2, 3, 4].map(spot)
/** Where letter `i` floats with its settings. */
const at = (s: ReturnType<typeof settings>, i: number) => pointAlong(spots[i].flight, s.each[i].along)

describe('grabbing letters', () => {
  it('riding through a letter grabs it; passing further off than its grab size does not', () => {
    const s = settings()
    s.each[2].grabSize = 4
    const hunt = new LetterHunt(s)
    const letter = at(s, 2)
    hunt.update(spots, { ...letter, x: letter.x - 5, y: letter.y + 3 }, 1 / 60)
    hunt.update(spots, { ...letter, x: letter.x + 5, y: letter.y + 3 }, 1 / 60) // 3 m above it
    expect(hunt.grabbed[2]).toBe(true)

    s.each[2].grabSize = 2
    const missed = new LetterHunt(s)
    missed.update(spots, { ...letter, x: letter.x - 5, y: letter.y + 3 }, 1 / 60)
    missed.update(spots, { ...letter, x: letter.x + 5, y: letter.y + 3 }, 1 / 60)
    expect(missed.grabbed[2]).toBe(false)
  })

  it('flying through between two frames still grabs it', () => {
    const s = settings()
    s.each[4].grabSize = 1
    const hunt = new LetterHunt(s)
    const letter = at(s, 4)
    hunt.update(spots, { ...letter, x: letter.x - 3 }, 1 / 60)
    hunt.update(spots, { ...letter, x: letter.x + 3 }, 1 / 60) // never within 1 m at a frame, but went right through
    expect(hunt.grabbed[4]).toBe(true)
  })

  it('a bike put back somewhere else in one go does not grab what was in between', () => {
    const s = settings()
    const hunt = new LetterHunt(s)
    const letter = at(s, 0)
    hunt.update(spots, { ...letter, x: letter.x - 200 }, 1 / 60)
    hunt.update(spots, { ...letter, x: letter.x + 200 }, 1 / 60)
    expect(hunt.grabbed[0]).toBe(false)
  })

  it('in any order: grabbing T first lights only T', () => {
    const s = settings()
    const hunt = new LetterHunt(s)
    hunt.update(spots, at(s, 2), 1 / 60)
    expect(hunt.grabbed).toEqual([false, false, true, false, false])
  })

  it('a letter that has no spot (yet) can\'t be grabbed', () => {
    const s = settings()
    const hunt = new LetterHunt(s)
    hunt.update(spots.slice(0, 2), at(s, 3), 1 / 60)
    expect(hunt.grabbed[3]).toBe(false)
  })

  it('stays grabbed with respawn off; with it on, comes back respawnAfter seconds after it was grabbed', () => {
    const s = settings()
    s.respawn = false
    s.respawnAfter = 5
    const hunt = new LetterHunt(s)
    hunt.update(spots, at(s, 1), 1 / 60)
    const away = { x: 0, y: 500, z: 0 }
    for (let i = 0; i < 60 * 6; i++) hunt.update(spots, away, 1 / 60) // 6 s
    expect(hunt.grabbed[1]).toBe(true)

    s.respawn = true // switched on later: grabbed 6 s ago, so it's back straight away
    hunt.update(spots, away, 1 / 60)
    expect(hunt.grabbed[1]).toBe(false)

    hunt.update(spots, at(s, 1), 1 / 60)
    for (let i = 0; i < 60 * 4; i++) hunt.update(spots, away, 1 / 60) // 4 s
    expect(hunt.grabbed[1]).toBe(true)
    for (let i = 0; i < 60 * 1.1; i++) hunt.update(spots, away, 1 / 60)
    expect(hunt.grabbed[1]).toBe(false)
  })

  it('starts again with nothing grabbed when the letters are placed again', () => {
    const s = settings()
    const hunt = new LetterHunt(s)
    hunt.update(spots, at(s, 0), 1 / 60)
    hunt.reset()
    expect(hunt.grabbed).toEqual([false, false, false, false, false])
  })
})
