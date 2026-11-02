import type { SettingsStore } from '../settings/store'
import type { SliderSetting } from '../settings/types'
import type { Piece } from './page'

/** One number setting: name, slider, number box, unit, reset button, and its note underneath. */
export class SliderRow implements Piece {
  readonly el = document.createElement('div')
  private readonly range = document.createElement('input')
  private readonly box = document.createElement('input')

  constructor(
    private readonly setting: SliderSetting,
    private readonly store: SettingsStore,
  ) {
    const s = setting
    this.el.className = 'menu-row'

    const name = document.createElement('span')
    name.className = 'menu-name'
    name.textContent = s.name

    for (const input of [this.range, this.box]) {
      input.min = String(s.min)
      input.max = String(s.max)
      input.step = String(s.step)
    }
    this.range.type = 'range'
    this.range.className = 'menu-range'
    this.range.addEventListener('input', () => store.set(s.id, Number(this.range.value)))

    this.box.type = 'number'
    this.box.className = 'menu-number'
    this.box.addEventListener('change', () => {
      store.set(s.id, parseFloat(this.box.value))
      this.refresh()
    })
    this.box.addEventListener('blur', () => this.refresh())
    this.box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.box.blur()
    })

    const unit = document.createElement('span')
    unit.className = 'menu-unit'
    unit.textContent = s.unit

    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'menu-reset'
    reset.title = `Reset to ${s.default} ${s.unit}`
    reset.textContent = '↺'
    reset.addEventListener('click', () => store.reset(s.id))

    this.el.append(name, this.range, this.box, unit, reset)
    if (s.note) {
      const note = document.createElement('div')
      note.className = 'menu-note'
      note.textContent = s.note
      this.el.append(note)
    }
    store.onChange((id) => {
      if (id === s.id) this.refresh()
    })
    this.refresh()
  }

  /** Shows the store's value. */
  private refresh(): void {
    const value = String(this.store.get(this.setting.id))
    this.range.value = value
    this.box.value = value
  }
}
