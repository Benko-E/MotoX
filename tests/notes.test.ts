import { describe, expect, it } from 'vitest'
import { humanize, noteFor, readNotes } from '../src/ui/notes'

const source = `/**
 * File header: not about any one setting.
 */
import type { Ranges } from './ui/tunables'

export const config = {
  /** The bike you ride. */
  bike: {
    speed: {
      /** Fastest it goes, km/h. */
      topSpeed: 105,
      /** Seconds from standing still to 60 km/h.
       * Lower is punchier. */
      secondsTo60: 2.4,
      noNote: 3,
    },
    /** How hard it is to rotate. */
    inertia: { pitch: 70, yaw: 70 },
  },
}

export const ranges = {
  'bike.speed.topSpeed': [40, 200, 1],
}
`

describe('readNotes', () => {
  const notes = readNotes(source)

  it('finds the comment above each setting, by its full name', () => {
    expect(notes['bike']).toBe('The bike you ride.')
    expect(notes['bike.speed.topSpeed']).toBe('Fastest it goes, km/h.')
  })

  it('joins comments that run over several lines', () => {
    expect(notes['bike.speed.secondsTo60']).toBe('Seconds from standing still to 60 km/h. Lower is punchier.')
  })

  it('does not hand a comment to the wrong setting', () => {
    expect(notes['bike.speed.noNote']).toBeUndefined()
    expect(notes['bike.speed']).toBeUndefined() // the file header isn't speed's note
  })
})

describe('noteFor', () => {
  const notes = readNotes(source)

  it("falls back to the parent's note for settings written on one line", () => {
    expect(noteFor(notes, 'bike.inertia.pitch')).toBe('How hard it is to rotate.')
  })

  it('borrows from the parent only, not from further up', () => {
    expect(noteFor(notes, 'bike.speed.noNote')).toBeUndefined() // not "The bike you ride."
  })

  it('can match on the last name alone, for lists like a map\'s jumps', () => {
    const shapes = { lipAngle: 'Steepness at the top.' }
    expect(noteFor(shapes, 'lips.3.lipAngle', { lastNameOnly: true })).toBe('Steepness at the top.')
  })
})

describe('humanize', () => {
  it('turns a setting name into words', () => {
    expect(humanize('topSpeed')).toBe('top speed')
    expect(humanize('secondsTo60')).toBe('seconds to 60')
    expect(humanize('fov')).toBe('fov')
  })
})
