import type { SettingsStore } from '../settings/store'
import type { LineSetting } from '../settings/types'
import type { Piece } from './page'

/** One debug line: a checkbox, a swatch of the line's colour, its name, and its note underneath. */
export class LineRow implements Piece {
  readonly el = document.createElement('label')

  constructor(setting: LineSetting, store: SettingsStore) {
    const s = setting
    this.el.className = 'menu-line'

    const box = document.createElement('input')
    box.type = 'checkbox'
    box.addEventListener('change', () => store.setOn(s.id, box.checked))

    const swatch = document.createElement('span')
    swatch.className = 'menu-swatch'
    if (s.color !== undefined) swatch.style.background = `#${s.color.toString(16).padStart(6, '0')}`

    const name = document.createElement('span')
    name.className = 'menu-name'
    name.textContent = s.name

    this.el.append(box, swatch, name)
    if (s.note) {
      const note = document.createElement('div')
      note.className = 'menu-note'
      note.textContent = s.note
      this.el.append(note)
    }
    const refresh = () => (box.checked = store.isOn(s.id))
    store.onChange((id) => {
      if (id === s.id) refresh()
    })
    refresh()
  }
}
