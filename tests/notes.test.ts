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

describe('notes for a list of settings', () => {
  // like the letters: the first item written out with its comments, the rest on one line each
  const listSource = `export const config = {
  letters: {
    /** One for each letter. */
    each: [
      {
        /** The letter. */
        letter: 'M',
        /** How hard its jump should be. */
        difficulty: 0,
      },
      { letter: 'O', difficulty: 0.25 },
    ],
    /** Seconds to come back. */
    respawnAfter: 10,
  },
}
`
  const notes = readNotes(listSource)

  it('reads the comments on the first item as the notes for every item', () => {
    expect(noteFor(notes, 'letters.each.0.difficulty')).toBe('How hard its jump should be.')
    expect(noteFor(notes, 'letters.each.1.difficulty')).toBe('How hard its jump should be.')
  })

  it('the folder of each item gets the note of the list, and settings after the list are read as usual', () => {
    expect(noteFor(notes, 'letters.each.1')).toBe('One for each letter.')
    expect(noteFor(notes, 'letters.respawnAfter')).toBe('Seconds to come back.')
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
