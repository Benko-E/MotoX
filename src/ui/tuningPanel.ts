import { Pane, type ButtonApi, type FolderApi } from 'tweakpane'
import { humanize, noteFor, type Notes } from './notes'
import { changedValues, collectTunables, rangeFor, type Ranges } from './tunables'

export interface PanelSection {
  title: string
  /** The live settings object. Sliders write straight into it. */
  target: object
  /** Where `target` sits in its settings file ("bike"), for looking up ranges and notes. '' for the whole file. */
  path: string
  ranges: Ranges
  /** Hover help for each setting, by its full path in the file. */
  notes: Notes
  /** Match notes on the setting's last name only (for lists, like a map's jumps). */
  notesByName?: boolean
  /** Folders (full paths, like "bike.speed") that start open. Everything else starts closed. */
  open?: string[]
  /** Called after a value changes. `last` is true once a slider drag ends. */
  onChange?: (path: string, last: boolean) => void
}

/** Live values drawn as scrolling graphs at the top of the panel. */
export interface PanelGraphs {
  title: string
  /** An object whose properties (usually getters) are read every frame. */
  source: Record<string, number>
  min: number
  max: number
}

/**
 * The tuning panel, built from the settings objects themselves: every number
 * gets a slider and every on/off value a checkbox, grouped like the file, and
 * hovering any of them shows the explanation written above it in the file.
 */
export function createTuningPanel(sections: PanelSection[], graphs?: PanelGraphs) {
  const pane = new Pane({ title: 'Tuning   ( ` hides this )' })
  const wrapper = pane.element.parentElement as HTMLElement
  wrapper.style.width = '320px'
  wrapper.style.maxHeight = 'calc(100vh - 16px)'
  wrapper.style.overflowY = 'auto'
  pane.hidden = true
  pane.element.dataset.ownScroll = '' // the scroll wheel scrolls the panel, not the camera zoom

  const fileValues = sections.map((section) => structuredClone(section.target))

  const copy = pane.addButton({ title: 'Copy changed values' })
  copy.on('click', async () => {
    const changed: Record<string, unknown> = {}
    sections.forEach((section, i) => {
      const diff = changedValues(fileValues[i], section.target)
      if (diff !== undefined) changed[section.title] = diff
    })
    if (Object.keys(changed).length === 0) return flash(copy, 'Nothing changed yet')
    const text = JSON.stringify(changed, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      flash(copy, 'Copied! Paste it to Claude')
    } catch {
      console.log(text)
      flash(copy, 'Copy blocked: see the browser console')
    }
  })

  pane.addButton({ title: 'Reset to file values' }).on('click', () => {
    sections.forEach((section, i) => {
      for (const { owner, key, path } of collectTunables(section.target)) owner[key] = valueAt(fileValues[i], path)
      section.onChange?.('', true)
    })
    pane.refresh()
  })

  if (graphs) {
    const folder = pane.addFolder({ title: graphs.title })
    for (const key of Object.keys(graphs.source)) {
      folder.addBinding(graphs.source, key, {
        readonly: true,
        view: 'graph',
        min: graphs.min,
        max: graphs.max,
        interval: 16,
        bufferSize: 200, // about 3 seconds of history
      })
    }
  }

  for (const section of sections) {
    const inFile = (path: string) => [section.path, path].filter(Boolean).join('.')
    const help = (path: string) => noteFor(section.notes, inFile(path), { lastNameOnly: section.notesByName })
    const isOpen = (path: string) => section.open?.includes(inFile(path)) ?? false

    const top = pane.addFolder({ title: section.title, expanded: isOpen('') })
    hover(top.element, help(''))
    const folders = new Map<string, FolderApi>([['', top]])
    const folderFor = (path: string): FolderApi => {
      const existing = folders.get(path)
      if (existing) return existing
      const dot = path.lastIndexOf('.')
      const name = path.slice(dot + 1)
      const folder = folderFor(dot < 0 ? '' : path.slice(0, dot)).addFolder({
        title: /^\d+$/.test(name) ? `#${Number(name) + 1}` : humanize(name),
        expanded: isOpen(path),
      })
      hover(folder.element, help(path))
      folders.set(path, folder)
      return folder
    }

    for (const { owner, key, path } of collectTunables(section.target)) {
      const dot = path.lastIndexOf('.')
      const value = owner[key]
      const slider = typeof value === 'number' ? rangeFor(inFile(path), value, section.ranges) : {}
      const binding = folderFor(dot < 0 ? '' : path.slice(0, dot)).addBinding(owner, key, {
        label: humanize(key),
        ...slider,
      })
      hover(binding.element, help(path))
      binding.on('change', (event) => section.onChange?.(path, event.last))
    }
  }

  return {
    /** Shows or hides the panel. Returns true if it is now showing. */
    toggle(): boolean {
      pane.hidden = !pane.hidden
      return !pane.hidden
    },
  }
}

/** Shows `text` as the browser's tooltip when hovering `element` (only its title row, for folders). */
function hover(element: HTMLElement, text: string | undefined) {
  if (!text) return
  const titleRow = element.querySelector(':scope > .tp-fldv_b') as HTMLElement | null
  ;(titleRow ?? element).title = text
}

function flash(button: ButtonApi, message: string) {
  const original = button.title
  button.title = message
  setTimeout(() => (button.title = original), 1800)
}

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], root)
}
