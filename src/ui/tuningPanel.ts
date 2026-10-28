import { Pane, type ButtonApi, type FolderApi } from 'tweakpane'
import { changedValues, collectTunables, rangeFor, type Ranges } from './tunables'

export interface PanelSection {
  title: string
  /** The live settings object. Sliders write straight into it. */
  target: object
  ranges: Ranges
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
 * gets a slider and every on/off value a checkbox, grouped like the file.
 */
export function createTuningPanel(sections: PanelSection[], graphs?: PanelGraphs) {
  const pane = new Pane({ title: 'Tuning   ( ` hides this )' })
  const wrapper = pane.element.parentElement as HTMLElement
  wrapper.style.width = '320px'
  wrapper.style.maxHeight = 'calc(100vh - 16px)'
  wrapper.style.overflowY = 'auto'
  pane.hidden = true

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
    const folders = new Map<string, FolderApi>([['', pane.addFolder({ title: section.title, expanded: false })]])
    const folderFor = (path: string): FolderApi => {
      const existing = folders.get(path)
      if (existing) return existing
      const dot = path.lastIndexOf('.')
      const name = path.slice(dot + 1)
      const folder = folderFor(dot < 0 ? '' : path.slice(0, dot)).addFolder({
        title: /^\d+$/.test(name) ? `#${Number(name) + 1}` : name,
        expanded: false,
      })
      folders.set(path, folder)
      return folder
    }

    for (const { owner, key, path } of collectTunables(section.target)) {
      const dot = path.lastIndexOf('.')
      const value = owner[key]
      const slider = typeof value === 'number' ? rangeFor(path, value, section.ranges) : {}
      folderFor(dot < 0 ? '' : path.slice(0, dot))
        .addBinding(owner, key, { label: key, ...slider })
        .on('change', (event) => section.onChange?.(path, event.last))
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

function flash(button: ButtonApi, message: string) {
  const original = button.title
  button.title = message
  setTimeout(() => (button.title = original), 1800)
}

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], root)
}
