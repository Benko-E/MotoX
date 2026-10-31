import { Pane, type ButtonApi, type FolderApi } from 'tweakpane'
import { humanize, noteFor, type Notes } from './notes'
import { changesToCopy, choicesFor, collectTunables, folderTitle, isHidden, rangeFor, type Choices, type Ranges } from './tunables'

export interface PanelSection {
  title: string
  /** The folders it sits in, outermost first, by title ("map", "features"); none for the top. A later section can sit in an earlier one's folder. */
  place?: string[]
  /** Which settings file it's from ("config", "map"), for copying changed values. */
  file: string
  /** The live settings object. Sliders write straight into it. */
  target: object
  /** Where `target` sits in its settings file ("bike"), for looking up ranges and notes. '' for the whole file. */
  path: string
  /** Names in `target` that other sections show instead. */
  exclude?: string[]
  /** Shown only while this says so (on top of the settings' own show switches and job choices). */
  shownWhen?: () => boolean
  ranges: Ranges
  /** Lists to pick text settings from (dropdowns), by path in the file. */
  choices?: Choices
  /** Hover help for each setting, by its full path in the file. */
  notes: Notes
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
 * Sections sit in group folders, everything starting closed but what's asked
 * for; settings that do nothing right now (switched off, or for another job)
 * are hidden until they would.
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
    const changed = changesToCopy(
      sections.map((section, i) => ({ file: section.file, path: section.path, before: fileValues[i], now: section.target, exclude: section.exclude })),
    )
    if (!changed) return flash(copy, 'Nothing changed yet')
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
      for (const { owner, key, path } of tunablesOf(section)) owner[key] = valueAt(fileValues[i], path)
      section.onChange?.('', true)
    })
    pane.refresh()
    showWhatMatters()
  })

  if (graphs) {
    const folder = pane.addFolder({ title: graphs.title, expanded: false })
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

  // the group folders, by their titles joined with /
  const places = new Map<string, FolderApi>()
  const placeFor = (titles: string[]): Pane | FolderApi => {
    if (titles.length === 0) return pane
    const key = titles.join('/')
    const existing = places.get(key)
    if (existing) return existing
    const folder = placeFor(titles.slice(0, -1)).addFolder({ title: titles[titles.length - 1], expanded: false })
    places.set(key, folder)
    return folder
  }
  // everything that can be hidden, and when
  const hideable: { item: { hidden: boolean }; hidden: () => boolean }[] = []
  const showWhatMatters = () => {
    for (const { item, hidden } of hideable) item.hidden = hidden()
  }

  for (const section of sections) {
    const inFile = (path: string) => [section.path, path].filter(Boolean).join('.')
    const help = (path: string) => noteFor(section.notes, inFile(path))
    const isOpen = (path: string) => section.open?.includes(inFile(path)) ?? false
    const hiddenAt = (path: string) => isHidden(section.target, path, section.choices ?? {}, section.path)

    const place = section.place ?? []
    const top = placeFor(place).addFolder({ title: section.title, expanded: isOpen('') })
    places.set([...place, section.title].join('/'), top)
    hover(top.element, help(''))
    if (section.shownWhen) hideable.push({ item: top, hidden: () => !section.shownWhen!() })
    const folders = new Map<string, FolderApi>([['', top]])
    const folderFor = (path: string): FolderApi => {
      const existing = folders.get(path)
      if (existing) return existing
      const dot = path.lastIndexOf('.')
      const name = path.slice(dot + 1)
      const folder = folderFor(dot < 0 ? '' : path.slice(0, dot)).addFolder({
        title: folderTitle(name, valueAt(section.target, path)),
        expanded: isOpen(path),
      })
      hover(folder.element, help(path))
      hideable.push({ item: folder, hidden: () => hiddenAt(path) })
      folders.set(path, folder)
      return folder
    }

    const listFor = (path: string) => choicesFor(inFile(path), section.choices ?? {})
    for (const { owner, key, path } of tunablesOf(section)) {
      const dot = path.lastIndexOf('.')
      const value = owner[key]
      const slider = typeof value === 'number' ? rangeFor(inFile(path), value, section.ranges) : {}
      const list = listFor(path)
      const dropdown = list ? { options: Object.fromEntries(list.map((choice) => [humanize(choice), choice])) } : {}
      const binding = folderFor(dot < 0 ? '' : path.slice(0, dot)).addBinding(owner, key, {
        label: humanize(key),
        ...slider,
        ...dropdown,
      })
      hover(binding.element, help(path))
      hideable.push({ item: binding, hidden: () => hiddenAt(path) })
      binding.on('change', (event) => {
        section.onChange?.(path, event.last)
        showWhatMatters()
      })
    }
  }
  showWhatMatters()

  return {
    /** Shows or hides the panel. Returns true if it is now showing. */
    toggle(): boolean {
      pane.hidden = !pane.hidden
      return !pane.hidden
    },
  }
}

/** The settings a section shows: numbers, switches and settings picked from a list, less what another section shows. */
function tunablesOf(section: PanelSection) {
  const inFile = (path: string) => [section.path, path].filter(Boolean).join('.')
  return collectTunables(section.target, '', (path) => choicesFor(inFile(path), section.choices ?? {}) !== undefined).filter(
    ({ path }) => !section.exclude?.includes(path.split('.')[0]),
  )
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
