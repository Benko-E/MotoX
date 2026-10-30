import type { LetterSettings } from '../config'
import type { HudElement, HudState } from './hud'

/**
 * The letters you're hunting, in a row: M O T O X, grey until you grab one,
 * then gold. Plain for now; the flashy version waits for a UI pass.
 */

/** What the row shows: each letter, and whether you have it. */
export function letterRow(settings: LetterSettings, grabbed: readonly boolean[]): { char: string; lit: boolean }[] {
  return settings.each.map((each, i) => ({ char: each.letter, lit: grabbed[i] ?? false }))
}

export class LetterRow implements HudElement {
  readonly element = document.createElement('div')
  private shown = ''

  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: LetterSettings,
  ) {
    this.element.className = 'hud-letter-row'
  }

  update(state: HudState): void {
    this.element.style.display = this.settings.show ? '' : 'none'
    const row = letterRow(this.settings, state.letters)
    const key = JSON.stringify(row)
    if (key === this.shown) return
    this.shown = key
    this.element.replaceChildren(
      ...row.map(({ char, lit }) => {
        const letter = document.createElement('span')
        letter.className = lit ? 'hud-letter lit' : 'hud-letter'
        letter.textContent = char
        return letter
      }),
    )
  }
}
