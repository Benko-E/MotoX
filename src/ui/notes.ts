/**
 * The tuning panel's hover help: the plain-English comments written above
 * each setting in a settings file, read straight out of the file's text, so
 * the explanation lives in one place and the panel can't drift from it.
 */

/** Setting path ("bike.speed.topSpeed") -> its comment. */
export type Notes = Record<string, string>

/**
 * Reads the `/** ... *\/` comment above each `name:` in `source`. The file is
 * expected to be laid out one setting per line (or one small `{ ... }` group
 * per line), the way the settings files are. In a list written over several
 * lines, the comments on its first item count for every item.
 */
export function readNotes(source: string): Notes {
  const notes: Notes = {}
  const path: string[] = [] // names of the open `{` groups and `[` lists; '' for ones that aren't settings
  let comment: string[] | null = null
  let pending = ''

  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (comment !== null || line.startsWith('/**')) {
      comment ??= []
      const text = line.replace(/^\/\*\*/, '').replace(/\*\/$/, '').replace(/^\*/, '').trim()
      if (text) comment.push(text)
      if (line.endsWith('*/')) {
        pending = comment.join(' ')
        comment = null
      }
      continue
    }

    const named = line.match(/^(\w+)\s*:/)
    if (named) {
      const name = [...path.filter(Boolean), named[1]].join('.')
      if (pending) notes[name] = pending
      pending = ''
      if (line.endsWith('{') || line.endsWith('[')) path.push(named[1])
      continue
    }
    if (line.startsWith('}') || line.startsWith(']')) path.pop()
    else if (line.endsWith('{')) path.push('')
    if (line) pending = '' // a comment only belongs to the very next line
  }
  return notes
}

/**
 * The note for a setting: its own, else its group's (for settings written
 * on one line like `inertia: { pitch: 70, yaw: 70 }`), but no further up. An
 * item in a list shares the note of that setting on every item
 * ("letters.each.3.along" -> "letters.each.along"). With `lastNameOnly`,
 * matches on the final name alone ("jumps.3.height" -> "height").
 */
export function noteFor(notes: Notes, path: string, options: { lastNameOnly?: boolean } = {}): string | undefined {
  const parts = path.split('.')
  if (options.lastNameOnly) return notes[parts[parts.length - 1]]
  const inAnyItem = parts.filter((part) => !/^\d+$/.test(part)).join('.')
  return notes[path] ?? notes[parts.slice(0, -1).join('.')] ?? notes[inAnyItem]
}

/** "secondsTo60" -> "seconds to 60". */
export function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .toLowerCase()
}
