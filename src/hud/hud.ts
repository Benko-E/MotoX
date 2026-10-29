import { hudUnit, placeElement, type Placement } from './layout'

/** The numbers the HUD shows, handed to every element each frame. */
export interface HudState {
  /** The bike's speed, m/s. */
  speed: number
  /** Its top speed, km/h. */
  topSpeed: number
}

/** One element of the HUD: a box on the page that's given the latest numbers each frame. */
export interface HudElement {
  readonly element: HTMLElement
  update(state: HudState, dt: number): void
}

export interface HudSettings {
  /** Everything bigger or smaller, 1 = normal. */
  size: number
  [name: string]: number | (Placement & { show: boolean })
}

/**
 * The HUD: a layer of page elements over the 3D view. Each element sits in a
 * slot placed by its entry in the settings (anchor and nudge, read live, so
 * moving one in the tuning panel moves it straight away), and is sized in HUD
 * units: 1% of the screen height times hud.size, the layer's font size. Inside
 * its slot an element shows and hides itself as it likes.
 */
export class Hud {
  readonly layer: HTMLElement
  private readonly slots = new Map<string, { slot: HTMLElement; piece: HudElement }>()
  private placedFor = ''

  constructor(
    container: HTMLElement,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: HudSettings,
  ) {
    this.layer = document.createElement('div')
    this.layer.className = 'hud-layer'
    container.appendChild(this.layer)
  }

  /** Adds an element, placed by `settings[name]`. */
  add(name: string, piece: HudElement): void {
    const slot = document.createElement('div')
    slot.className = `hud-slot hud-${name}`
    slot.appendChild(piece.element)
    this.layer.appendChild(slot)
    this.slots.set(name, { slot, piece })
    this.placedFor = ''
  }

  /** Call once a frame. */
  update(state: HudState, dt: number): void {
    this.place()
    for (const { piece } of this.slots.values()) piece.update(state, dt)
  }

  /** Puts every slot where its settings say, when the settings or the window size changed. */
  private place(): void {
    const screen = { width: window.innerWidth, height: window.innerHeight }
    const key = JSON.stringify([this.settings, screen.width, screen.height])
    if (key === this.placedFor) return
    this.placedFor = key
    this.layer.style.fontSize = `${hudUnit(screen, this.settings.size)}px`
    for (const [name, { slot }] of this.slots) {
      const placement = this.settings[name]
      if (typeof placement !== 'object') continue
      slot.style.display = placement.show ? '' : 'none'
      const at = placeElement(placement, screen, this.settings.size)
      slot.style.left = `${at.x}px`
      slot.style.top = `${at.y}px`
      slot.style.transform = `translate(${-at.alignX * 100}%, ${-at.alignY * 100}%)`
    }
  }
}
