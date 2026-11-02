import type { SettingsStore } from '../settings/store'
import type { Setting } from '../settings/types'
import './menu.css'
import { copyText } from './clipboard'
import { LineRow } from './lineRow'
import { Section } from './section'
import { SliderRow } from './sliderRow'
import { Tabs } from './tabs'
import { MenuWindow } from './window'

/** The key that shows and hides the debug menu (` , left of 1). */
const MENU_KEY = 'Backquote'

/**
 * Builds the debug menu from the settings list: one tab per name in `tabs`,
 * one section per distinct section name within a tab, rows in list order.
 * ` shows and hides it.
 */
export function buildMenu(settings: Setting[], tabs: readonly string[], store: SettingsStore, storage: Storage | null): MenuWindow {
  const menu = new MenuWindow('MotoX debug', storage)

  // Copies the settings changed from their defaults, to paste back to Claude.
  let restoreLabel: ReturnType<typeof setTimeout> | undefined
  const copyButton = menu.addTitleButton('Copy changes', async () => {
    const changed = store.changedFromDefaults()
    const count = Object.keys(changed).length
    let label = count === 0 ? 'No changes' : `Copied ${count}`
    try {
      await copyText(JSON.stringify(changed, null, 2))
    } catch {
      label = 'Copy failed'
    }
    copyButton.textContent = label
    clearTimeout(restoreLabel) // a quick second click keeps its own label up
    restoreLabel = setTimeout(() => (copyButton.textContent = 'Copy changes'), 1500)
  })
  menu.addTitleButton('Reset all', () => store.resetAll())

  const tabSet = new Tabs(tabs)
  menu.add(tabSet)

  const sections = new Map<string, Section>()
  for (const s of settings) {
    const key = `${s.tab}/${s.section}`
    let section = sections.get(key)
    if (!section) {
      section = new Section(s.section)
      tabSet.page(s.tab).add(section)
      sections.set(key, section)
    }
    section.add(s.kind === 'slider' ? new SliderRow(s, store) : new LineRow(s, store))
  }

  document.addEventListener('keydown', (e) => {
    if (e.code !== MENU_KEY || e.repeat) return
    e.preventDefault() // don't type ` into a focused number box
    menu.toggle()
  })
  document.body.append(menu.el)
  return menu
}
