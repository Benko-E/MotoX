/** Anything that can go inside a menu window, page, section or tab. */
export interface Piece {
  el: HTMLElement
}

/** One setting's line in the menu. */
export interface Row extends Piece {
  setNote(text: string): void
}

/** A tab's content. Scrolls on its own when it is taller than the window. */
export class Page implements Piece {
  readonly el = document.createElement('div')

  constructor() {
    this.el.className = 'menu-page'
  }

  add(piece: Piece): this {
    this.el.append(piece.el)
    return this
  }
}
