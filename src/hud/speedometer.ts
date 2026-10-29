import type { HudElement, HudState } from './hud'

/**
 * A speedometer dial, Motocross Madness style: a dark gauge with white ticks
 * and a number every 10 km/h from 0 at the lower left, over the top, to a
 * little past top speed at the lower right, and a red needle. Drawn as
 * vector graphics, so it's sharp at any screen size.
 */

/** The needle swings from this far left of straight up (at 0) to this far right (at the end of the scale), degrees. */
const SWEEP = 120
/** Seconds the needle takes to swing to the speed: a touch of lag, like a real gauge. */
const NEEDLE_LAG = 0.08
const SVG = 'http://www.w3.org/2000/svg'
/** The drawing's own coordinates: the pivot sits in the middle, a little below centre. */
const WIDTH = 200
const HEIGHT = 150
const PIVOT = { x: 100, y: 98 }

/** The scale for a bike with this top speed, km/h: at least 10 past it, up to a round 10, a number every 10. */
export function dialScale(topSpeed: number): { max: number; numbers: number[] } {
  const max = Math.ceil((topSpeed + 10) / 10) * 10
  return { max, numbers: Array.from({ length: max / 10 + 1 }, (_, i) => i * 10) }
}

/** Where the needle points at `kmh` on a scale to `max`, degrees right of straight up. */
export function needleAngle(kmh: number, max: number): number {
  const share = Math.min(Math.max(kmh / max, 0), 1)
  return -SWEEP + 2 * SWEEP * share
}

/** The needle `dt` seconds on, swinging from `angle` toward `to`. */
export function followNeedle(angle: number, to: number, dt: number): number {
  return angle + (to - angle) * (1 - Math.exp(-dt / NEEDLE_LAG))
}

export class Speedometer implements HudElement {
  readonly element = document.createElement('div')
  private readonly svg = document.createElementNS(SVG, 'svg')
  private readonly scale = document.createElementNS(SVG, 'g')
  private readonly needle = document.createElementNS(SVG, 'g')
  private scaleFor = NaN
  private angle = -SWEEP

  constructor() {
    this.element.className = 'hud-speed'
    this.svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
    this.svg.setAttribute('class', 'hud-speed-dial')

    // the housing: rounded on top, flat along the bottom, with a lighter rim
    const r = 92
    this.shape('path', {
      d: `M ${PIVOT.x - r} ${HEIGHT} L ${PIVOT.x - r} ${PIVOT.y} A ${r} ${r} 0 0 1 ${PIVOT.x + r} ${PIVOT.y} L ${PIVOT.x + r} ${HEIGHT} Z`,
      class: 'hud-speed-housing',
    })
    this.svg.appendChild(this.scale)

    const label = this.shape('text', { x: PIVOT.x, y: PIVOT.y + 30, class: 'hud-speed-unit' })
    label.textContent = 'km/h'

    // the needle: a red pointer from just behind the pivot out to the ticks, on a dark hub
    const pointer = this.shape('polygon', { points: `${PIVOT.x - 2.5},${PIVOT.y + 12} ${PIVOT.x + 2.5},${PIVOT.y + 12} ${PIVOT.x + 1},${PIVOT.y - 76} ${PIVOT.x - 1},${PIVOT.y - 76}`, class: 'hud-speed-needle' })
    this.needle.appendChild(pointer)
    this.svg.appendChild(this.needle)
    this.shape('circle', { cx: PIVOT.x, cy: PIVOT.y, r: 9, class: 'hud-speed-hub' })
    this.element.appendChild(this.svg)
  }

  update(state: HudState, dt: number): void {
    const { max } = dialScale(state.topSpeed)
    if (max !== this.scaleFor) this.drawScale(state.topSpeed)
    this.angle = followNeedle(this.angle, needleAngle(state.speed * 3.6, max), dt)
    this.needle.setAttribute('transform', `rotate(${this.angle.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`)
  }

  /** The ticks and numbers, for a bike with this top speed. */
  private drawScale(topSpeed: number): void {
    const { max, numbers } = dialScale(topSpeed)
    this.scaleFor = max
    this.scale.replaceChildren()
    const at = (kmh: number, radius: number) => {
      const angle = (needleAngle(kmh, max) * Math.PI) / 180
      return { x: PIVOT.x + Math.sin(angle) * radius, y: PIVOT.y - Math.cos(angle) * radius }
    }
    for (let kmh = 0; kmh <= max; kmh += 5) {
      const major = kmh % 10 === 0
      const from = at(kmh, major ? 70 : 74)
      const to = at(kmh, 82)
      this.shape('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: major ? 'hud-speed-tick major' : 'hud-speed-tick' }, this.scale)
    }
    for (const kmh of numbers) {
      const place = at(kmh, 57)
      const number = this.shape('text', { x: place.x, y: place.y + 5, class: 'hud-speed-number' }, this.scale)
      number.textContent = String(kmh)
    }
  }

  private shape(tag: string, attributes: Record<string, string | number>, parent: Element = this.svg): SVGElement {
    const element = document.createElementNS(SVG, tag)
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
    parent.appendChild(element)
    return element
  }
}
