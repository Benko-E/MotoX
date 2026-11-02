import type { Piece } from './page'

/** A heading such as "Terrain" whose contents collapse when it is clicked. */
export class Section implements Piece {
  readonly el = document.createElement('div')
  private readonly body = document.createElement('div')
  private readonly title = document.createElement('button')

  constructor(title: string) {
    this.el.className = 'menu-section'
    this.title.type = 'button'
    this.title.className = 'menu-section-title'
    this.title.textContent = title
    this.title.addEventListener('click', () => this.toggle())
    this.body.className = 'menu-section-body'
    this.el.append(this.title, this.body)
  }

  get collapsed(): boolean {
    return this.el.classList.contains('collapsed')
  }

  add(piece: Piece): this {
    this.body.append(piece.el)
    return this
  }

  toggle(): void {
    const collapse = !this.collapsed
    this.body.hidden = collapse
    this.el.classList.toggle('collapsed', collapse)
  }
}
