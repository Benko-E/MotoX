/**
 * The tuning panel's logic, kept apart from the panel itself so it can be
 * tested: which values get sliders, how far each slider goes, and which
 * values changed since the game loaded.
 */

import { humanize } from './notes'

/** Slider ranges by path: [min, max, step?]. A `*` matches any list position. */
export type Ranges = Record<string, [number, number, number?]>
/** Lists to pick text settings from (a dropdown), by path; `*` matches any name. */
export type Choices = Record<string, readonly string[]>

export interface Tunable {
  /** Dotted path from the root, e.g. "hills.height" or "lips.2.heading". */
  path: string
  /** The object holding the value, and its key there. Writing owner[key] changes the live setting. */
  owner: Record<string, unknown>
  key: string
}

/** How far a slider goes. Without an entry in `ranges`: 0 to 4x the file value. */
/** A folder's title in the panel: the setting's name in words, or for an item in a list its first text ("M"), else its number. */
export function folderTitle(key: string, value: unknown): string {
  if (!/^\d+$/.test(key)) return humanize(key)
  const text = value !== null && typeof value === 'object' ? Object.values(value).find((v) => typeof v === 'string') : undefined
  return typeof text === 'string' ? text : `#${Number(key) + 1}`
}

export function rangeFor(path: string, value: number, ranges: Ranges) {
  const listed = ranges[path] ?? Object.entries(ranges).find(([pattern]) => matches(pattern, path))?.[1]
  let min: number
  let max: number
  if (listed) [min, max] = listed
  else if (value > 0) [min, max] = [0, value * 4]
  else if (value < 0) [min, max] = [value * 4, -value * 4]
  else [min, max] = [0, 1]
  const step = listed?.[2] ?? 10 ** Math.floor(Math.log10((max - min) / 100))
  return { min, max, step }
}

/** The list a text setting is picked from, or undefined if it isn't one. */
export function choicesFor(path: string, choices: Choices): readonly string[] | undefined {
  return choices[path] ?? Object.entries(choices).find(([pattern]) => matches(pattern, path))?.[1]
}

/**
 * Whether the setting (or folder) at `path` under `root` does nothing right
 * now, so the panel hides it: a group whose `show` switch is off hides
 * everything in it but the switch, and a setting picked from a list (a
 * rider's job) hides the groups beside it named after the other choices.
 * `prefix` is where `root` sits in its file, for looking up the choices.
 */
export function isHidden(root: object, path: string, choices: Choices, prefix = ''): boolean {
  const keys = path.split('.')
  let at: unknown = root
  for (let i = 0; i < keys.length; i++) {
    if (at === null || typeof at !== 'object') return false
    const owner = at as Record<string, unknown>
    const key = keys[i]
    if (key !== 'show' && owner.show === false) return true
    const here = [prefix, ...keys.slice(0, i)].filter(Boolean).join('.')
    for (const [name, value] of Object.entries(owner)) {
      const list = typeof value === 'string' ? choicesFor(here ? `${here}.${name}` : name, choices) : undefined
      if (list?.includes(key) && value !== key) return true
    }
    at = owner[key]
  }
  return false
}

/**
 * Every number and on/off switch under `root`, in file order. Text (like key
 * names) is skipped, except where `keepText` says to (settings picked from a list).
 */
export function collectTunables(root: object, prefix = '', keepText?: (path: string) => boolean): Tunable[] {
  const found: Tunable[] = []
  const owner = root as Record<string, unknown>
  for (const [key, value] of Object.entries(owner)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'number' || typeof value === 'boolean') found.push({ path, owner, key })
    else if (typeof value === 'string' && keepText?.(path)) found.push({ path, owner, key })
    else if (value !== null && typeof value === 'object') found.push(...collectTunables(value, path, keepText))
  }
  return found
}

/**
 * Only the values in `current` that differ from `defaults`, in the same
 * shape. Lists keep their positions, with null for entries that didn't
 * change. Returns undefined when nothing changed.
 */
export function changedValues(defaults: unknown, current: unknown): unknown {
  if (Array.isArray(defaults) && Array.isArray(current)) {
    const entries = current.map((value, i) => changedValues(defaults[i], value) ?? null)
    return entries.some((entry) => entry !== null) ? entries : undefined
  }
  if (isPlainObject(defaults) && isPlainObject(current)) {
    const changed: Record<string, unknown> = {}
    for (const key of Object.keys(current)) {
      const diff = changedValues(defaults[key], current[key])
      if (diff !== undefined) changed[key] = diff
    }
    return Object.keys(changed).length > 0 ? changed : undefined
  }
  return Object.is(defaults, current) ? undefined : current
}

/** A part of a settings file shown in the panel: its values as loaded and now. `exclude` names what another part shows. */
export interface PanelPart {
  file: string
  path: string
  before: unknown
  now: unknown
  exclude?: string[]
}

/** Every part's changed values, gathered by file at each part's place in it ({ config: { bike: ... }, map: ... }). Undefined when nothing changed. */
export function changesToCopy(parts: PanelPart[]): Record<string, unknown> | undefined {
  const out: Record<string, Record<string, unknown>> = {}
  for (const part of parts) {
    let diff = changedValues(part.before, part.now)
    if (diff && isPlainObject(diff) && part.exclude) {
      diff = Object.fromEntries(Object.entries(diff).filter(([key]) => !part.exclude!.includes(key)))
      if (Object.keys(diff as object).length === 0) diff = undefined
    }
    if (diff === undefined) continue
    let at = (out[part.file] ??= {})
    const keys = part.path ? part.path.split('.') : []
    for (const key of keys.slice(0, -1)) at = (at[key] ??= {}) as Record<string, unknown>
    if (keys.length) at[keys[keys.length - 1]] = diff
    else Object.assign(at, diff)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Whether a dotted path fits a pattern in which `*` stands for any one name or list position. */
function matches(pattern: string, path: string): boolean {
  const want = pattern.split('.')
  const have = path.split('.')
  return want.length === have.length && want.every((part, i) => part === '*' || part === have[i])
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
