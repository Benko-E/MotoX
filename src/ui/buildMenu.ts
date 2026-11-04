import type { SettingsStore } from '../settings/store'
import type { Setting } from '../settings/types'
import './menu.css'
import { copyText } from './clipboard'
import { LineRow } from './lineRow'
import { SliderRow } from './sliderRow'
import { Tabs } from './tabs'
import { MenuWindow } from './window'

/** The key that shows and hides the debug menu (` , left of 1). */
const MENU_KEY = 'Backquote'

/**
 * Builds the debug menu from the settings list: one tab per name in `tabs`,
 * and inside each a row of smaller tabs, one per distinct section name
 * within it, rows in list order. Both remember which was picked last.
 * ` shows and hides it.
 */
export function buildMenu(settings: Setting[], tabs: readonly string[], store: SettingsStore, storage: Storage | null): MenuWindow {
  const menu = new MenuWindow('MotoX debug', storage)

  // Copies the settings changed from their defaults, debug lines too, to paste back to Claude.
  let restoreLabel: ReturnType<typeof setTimeout> | undefined
  const copyButton = menu.addTitleButton('Copy changes', async () => {
    const changed = { ...store.changedFromDefaults(), ...store.linesChangedFromDefaults() }
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

  // a tab per name, and inside each a smaller tab per section, in list order
  const tabSet = new Tabs(tabs, { storage, key: 'motox3.menu.tab' })
  menu.add(tabSet)
  for (const tab of tabs) {
    const inTab = settings.filter((s) => s.tab === tab)
    const sections = [...new Set(inTab.map((s) => s.section))]
    const sectionTabs = new Tabs(sections, { storage, key: `motox3.menu.tab.${tab}` }, true)
    tabSet.page(tab).add(sectionTabs)
    for (const s of inTab) sectionTabs.page(s.section).add(s.kind === 'slider' ? new SliderRow(s, store) : new LineRow(s, store))
  }

  document.addEventListener('keydown', (e) => {
    if (e.code !== MENU_KEY || e.repeat) return
    e.preventDefault() // don't type ` into a focused number box
    menu.toggle()
  })
  document.body.append(menu.el)
  return menu
}
