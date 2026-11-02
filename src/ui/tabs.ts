import { Page, type Piece } from './page'

/**
 * A row of tab buttons with one page each. A page can hold another Tabs,
 * which gives tabs within tabs.
 */
export class Tabs implements Piece {
  readonly el = document.createElement('div')
  private readonly pages = new Map<string, Page>()
  private readonly buttons = new Map<string, HTMLButtonElement>()
  private current = ''

  constructor(names: readonly string[]) {
    this.el.className = 'menu-tabs'
    const bar = document.createElement('div')
    bar.className = 'menu-tabbar'
    this.el.append(bar)

    for (const name of names) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = name
      button.addEventListener('click', () => this.select(name))
      bar.append(button)
      this.buttons.set(name, button)

      const page = new Page()
      this.el.append(page.el)
      this.pages.set(name, page)
    }
    if (names.length > 0) this.select(names[0])
  }

  get selected(): string {
    return this.current
  }

  page(name: string): Page {
    const page = this.pages.get(name)
    if (!page) throw new Error(`No tab "${name}"`)
    return page
  }

  select(name: string): void {
    this.page(name)
    this.current = name
    for (const [n, page] of this.pages) page.el.hidden = n !== name
    for (const [n, button] of this.buttons) button.classList.toggle('selected', n === name)
  }
}
