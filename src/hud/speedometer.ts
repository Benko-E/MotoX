import type { HudElement, HudState } from './hud'

/** What the speedometer shows: whole km/h, and how full its bar is toward top speed (0 to 1). */
export function speedReadout(speed: number, topSpeed: number): { kmh: number; fill: number } {
  const kmh = Math.round(speed * 3.6)
  return { kmh, fill: Math.min(Math.max(kmh / Math.max(topSpeed, 1), 0), 1) }
}

/** A big km/h number with a bar under it that fills toward top speed. */
export class Speedometer implements HudElement {
  readonly element = document.createElement('div')
  private readonly number = document.createElement('span')
  private readonly bar = document.createElement('div')
  private shown = ''

  constructor() {
    this.element.className = 'hud-speed'
    const unit = document.createElement('span')
    unit.className = 'hud-speed-unit'
    unit.textContent = 'km/h'
    this.number.className = 'hud-speed-number'
    const track = document.createElement('div')
    track.className = 'hud-speed-track'
    this.bar.className = 'hud-speed-bar'
    track.appendChild(this.bar)
    const reading = document.createElement('div')
    reading.append(this.number, unit)
    this.element.append(reading, track)
  }

  update(state: HudState): void {
    const { kmh, fill } = speedReadout(state.speed, state.topSpeed)
    const text = String(kmh)
    if (text !== this.shown) this.number.textContent = this.shown = text
    this.bar.style.width = `${fill * 100}%`
  }
}
