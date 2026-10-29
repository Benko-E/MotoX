import { describe, expect, it } from 'vitest'
import { config, configChoices } from '../src/config'
import { ANCHORS, hudUnit, placeElement } from '../src/hud/layout'
import { speedReadout } from '../src/hud/speedometer'
import { choicesFor } from '../src/ui/tunables'

const FULL_HD = { width: 1920, height: 1080 }

describe('where an element goes', () => {
  it('a corner anchor puts it in that corner, nudged in by x and y (shares of the screen height)', () => {
    // 3% of 1080 = 32.4 px in from the right and the bottom, its own bottom-right corner there
    expect(placeElement({ anchor: 'bottomRight', x: 3, y: 3 }, FULL_HD, 1)).toEqual({ x: 1920 - 32.4, y: 1080 - 32.4, alignX: 1, alignY: 1 })
    expect(placeElement({ anchor: 'topLeft', x: 3, y: 3 }, FULL_HD, 1)).toEqual({ x: 32.4, y: 32.4, alignX: 0, alignY: 0 })
  })

  it('an edge or the centre anchor puts it in the middle of that edge, or of the screen', () => {
    expect(placeElement({ anchor: 'top', x: 0, y: 4 }, FULL_HD, 1)).toMatchObject({ x: 960, alignX: 0.5, alignY: 0 })
    expect(placeElement({ anchor: 'left', x: 2, y: 0 }, FULL_HD, 1)).toMatchObject({ y: 540, alignX: 0, alignY: 0.5 })
    // centred, x moves it right and y down (negative: up)
    expect(placeElement({ anchor: 'center', x: 0, y: -18 }, FULL_HD, 1)).toEqual({ x: 960, y: 540 - 194.4, alignX: 0.5, alignY: 0.5 })
  })

  it('every anchor has a place, and they all differ', () => {
    const places = ANCHORS.map((anchor) => JSON.stringify(placeElement({ anchor, x: 0, y: 0 }, FULL_HD, 1)))
    expect(new Set(places).size).toBe(9)
  })

  it('looks the same at any resolution: nudges and sizes follow the screen height', () => {
    const small = { width: 1280, height: 720 }
    expect(placeElement({ anchor: 'bottomRight', x: 3, y: 3 }, small, 1)).toMatchObject({ x: 1280 - 21.6, y: 720 - 21.6 })
    expect(hudUnit(small, 1) / hudUnit(FULL_HD, 1)).toBeCloseTo(720 / 1080, 9)
  })

  it('a wider screen keeps the corners in the corners, with more room in the middle', () => {
    const ultrawide = { width: 3440, height: 1440 }
    expect(placeElement({ anchor: 'topRight', x: 3, y: 3 }, ultrawide, 1)).toMatchObject({ x: 3440 - 43.2, y: 43.2 })
  })

  it('hud.size makes everything bigger or smaller', () => {
    expect(hudUnit(FULL_HD, 1.5)).toBeCloseTo(hudUnit(FULL_HD, 1) * 1.5, 9)
    expect(placeElement({ anchor: 'topLeft', x: 2, y: 2 }, FULL_HD, 2)).toMatchObject({ x: 43.2, y: 43.2 })
  })
})

describe('the HUD settings', () => {
  it('every element sits at one of the 9 anchors, and the panel offers them as a dropdown', () => {
    for (const [name, element] of Object.entries(config.hud)) {
      if (typeof element !== 'object') continue
      expect(ANCHORS, name).toContain(element.anchor)
      expect(choicesFor(`hud.${name}.anchor`, configChoices)).toEqual(ANCHORS)
    }
  })
})

describe('the speedometer', () => {
  it('shows the speed in whole km/h, and fills its bar toward top speed', () => {
    expect(speedReadout(55 / 3.6, 110)).toEqual({ kmh: 55, fill: 0.5 })
    expect(speedReadout(0, 110)).toEqual({ kmh: 0, fill: 0 })
    expect(speedReadout(130 / 3.6, 110)).toMatchObject({ kmh: 130, fill: 1 }) // past top speed (downhill): full
  })
})
