import type { Piece } from './page'

/** Height of the title bar, which must always stay on screen. */
const TITLE_HEIGHT = 32
const DEFAULT_WIDTH = 400

/**
 * Keeps a window's title bar reachable: never past the left or top edge,
 * and never so far right or down that the title bar leaves the screen.
 */
export function clampToScreen(
  x: number,
  y: number,
  w: number,
  _h: number,
  screenW: number,
  screenH: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, screenW - w)),
    y: Math.max(0, Math.min(y, screenH - TITLE_HEIGHT)),
  }
}

/** The menu's frame: dragged by its title bar, remembers where it was left. */
export class MenuWindow implements Piece {
  readonly el = document.createElement('div')
  readonly body = document.createElement('div')
  private readonly buttons = document.createElement('div')
  private readonly listeners: ((open: boolean) => void)[] = []
  private x = 16
  private y = 16

  constructor(
    title: string,
    private readonly storage: Storage | null,
    private readonly key = 'motox3.menu',
  ) {
    this.el.className = 'menu-window'
    this.el.hidden = true

    const bar = document.createElement('div')
    bar.className = 'menu-titlebar'
    const name = document.createElement('span')
    name.textContent = title
    this.buttons.className = 'menu-titlebuttons'
    bar.append(name, this.buttons)

    this.body.className = 'menu-body'
    this.el.append(bar, this.body)

    this.dragBy(bar)
    window.addEventListener('resize', () => this.moveTo(this.x, this.y, false))
    this.load()
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  add(piece: Piece): this {
    this.body.append(piece.el)
    return this
  }

  /** Adds a button to the right side of the title bar, after any already there. */
  addTitleButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', onClick)
    this.buttons.append(button)
    return button
  }

  open(): void {
    if (this.isOpen) return
    this.el.hidden = false
    this.moveTo(this.x, this.y, false) // its size is only known once shown
    for (const fn of this.listeners) fn(true)
  }

  close(): void {
    if (!this.isOpen) return
    this.el.hidden = true
    for (const fn of this.listeners) fn(false)
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  onOpenChange(fn: (open: boolean) => void): void {
    this.listeners.push(fn)
  }

  /** Places the window's top-left corner, kept on screen. */
  moveTo(x: number, y: number, save = true): void {
    const p = clampToScreen(
      x,
      y,
      this.el.offsetWidth || DEFAULT_WIDTH,
      this.el.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    )
    this.x = p.x
    this.y = p.y
    this.el.style.left = `${p.x}px`
    this.el.style.top = `${p.y}px`
    if (save) this.save()
  }

  private dragBy(handle: HTMLElement): void {
    let grab: { dx: number; dy: number } | null = null
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      grab = { dx: e.clientX - this.x, dy: e.clientY - this.y }
      handle.setPointerCapture(e.pointerId)
    })
    handle.addEventListener('pointermove', (e) => {
      if (grab) this.moveTo(e.clientX - grab.dx, e.clientY - grab.dy, false)
    })
    const drop = () => {
      if (grab) this.save()
      grab = null
    }
    handle.addEventListener('pointerup', drop)
    handle.addEventListener('pointercancel', drop)
  }

  private load(): void {
    try {
      const p = JSON.parse(this.storage?.getItem(this.key) ?? 'null')
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) this.moveTo(p.x, p.y, false)
      else this.moveTo(this.x, this.y, false)
    } catch {
      this.moveTo(this.x, this.y, false)
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify({ x: this.x, y: this.y }))
    } catch {
      // storage blocked: the position just isn't remembered
    }
  }
}
