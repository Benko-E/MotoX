import type { LineSetting, Setting, SliderSetting } from './types'

type Saved = { values: Record<string, number>; lines: Record<string, boolean> }

/**
 * Holds every setting's current value. Tells listeners the moment anything
 * changes and saves to the browser so a reload keeps it.
 */
export class SettingsStore {
  private readonly byId = new Map<string, Setting>()
  private readonly values = new Map<string, number>()
  private readonly lines = new Map<string, boolean>()
  private readonly listeners = new Set<(id: string) => void>()

  constructor(
    list: Setting[],
    private readonly storage: Storage | null,
    private readonly storageKey = 'motox3.settings',
  ) {
    for (const s of list) {
      this.byId.set(s.id, s)
      if (s.kind === 'slider') this.values.set(s.id, s.default)
      else this.lines.set(s.id, s.default)
    }
    this.load()
  }

  /** A slider's value. */
  get(id: string): number {
    this.slider(id)
    return this.values.get(id)!
  }

  set(id: string, value: number): void {
    const s = this.slider(id)
    if (!Number.isFinite(value)) return
    this.values.set(id, clamp(s, value))
    this.changed(id)
  }

  /** Whether a debug line is shown. */
  isOn(id: string): boolean {
    this.line(id)
    return this.lines.get(id)!
  }

  setOn(id: string, on: boolean): void {
    this.line(id)
    this.lines.set(id, on)
    this.changed(id)
  }

  reset(id: string): void {
    const s = this.setting(id)
    if (s.kind === 'slider') this.values.set(id, s.default)
    else this.lines.set(id, s.default)
    this.changed(id)
  }

  resetAll(): void {
    for (const id of this.byId.keys()) this.reset(id)
  }

  /** Every slider whose value differs from its default. */
  changedFromDefaults(): Record<string, number> {
    const changed: Record<string, number> = {}
    for (const [id, v] of this.values) {
      if (v !== this.slider(id).default) changed[id] = v
    }
    return changed
  }

  /** Calls `fn` with the setting's id on every change. Returns an unsubscribe. */
  onChange(fn: (id: string) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private setting(id: string): Setting {
    const s = this.byId.get(id)
    if (!s) throw new Error(`Unknown setting "${id}"`)
    return s
  }

  private slider(id: string): SliderSetting {
    const s = this.setting(id)
    if (s.kind !== 'slider') throw new Error(`"${id}" is not a slider`)
    return s
  }

  private line(id: string): LineSetting {
    const s = this.setting(id)
    if (s.kind !== 'line') throw new Error(`"${id}" is not a debug line`)
    return s
  }

  private changed(id: string): void {
    this.save()
    for (const fn of this.listeners) fn(id)
  }

  private load(): void {
    let saved: Partial<Saved>
    try {
      saved = JSON.parse(this.storage?.getItem(this.storageKey) ?? '{}')
    } catch {
      return // broken data: keep the defaults
    }
    for (const [id, s] of this.byId) {
      if (s.kind === 'slider') {
        const v = saved?.values?.[id]
        if (typeof v === 'number' && Number.isFinite(v)) this.values.set(id, clamp(s, v))
      } else {
        const on = saved?.lines?.[id]
        if (typeof on === 'boolean') this.lines.set(id, on)
      }
    }
  }

  private save(): void {
    const saved: Saved = { values: Object.fromEntries(this.values), lines: Object.fromEntries(this.lines) }
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(saved))
    } catch {
      // storage full or blocked: settings still work for this visit
    }
  }
}

function clamp(s: SliderSetting, value: number): number {
  return Math.min(s.max, Math.max(s.min, value))
}
