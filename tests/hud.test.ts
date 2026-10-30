import { describe, expect, it } from 'vitest'
import { config, configChoices } from '../src/config'
import { ANCHORS, hudUnit, placeElement } from '../src/hud/layout'
import { letterRow } from '../src/hud/letterRow'
import { dialScale, followNeedle, needleAngle } from '../src/hud/speedometer'
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

describe('the letter row', () => {
  it('shows every letter, lit once you have it and grey until then, whatever the order', () => {
    // grabbed M and T, not the first O
    expect(letterRow(config.letters, [true, false, true, false, false])).toEqual([
      { char: 'M', lit: true },
      { char: 'O', lit: false },
      { char: 'T', lit: true },
      { char: 'O', lit: false },
      { char: 'X', lit: false },
    ])
  })

  it('sits in the top left by default', () => {
    expect(config.hud.letters).toMatchObject({ show: true, anchor: 'topLeft' })
  })
})

describe('the speedometer dial', () => {
  it('runs from 0 to a little past top speed, a number every 10 km/h', () => {
    expect(dialScale(110)).toEqual({ max: 120, numbers: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] })
    expect(dialScale(95).max).toBe(110)
  })

  it('the needle points lower left at 0, straight up halfway, lower right at the end of the scale', () => {
    expect(needleAngle(0, 120)).toBe(-120)
    expect(needleAngle(60, 120)).toBe(0)
    expect(needleAngle(120, 120)).toBe(120)
    expect(needleAngle(200, 120)).toBe(120) // never past the end
  })

  it('the needle swings smoothly to the speed instead of jumping', () => {
    const first = followNeedle(-120, 0, 1 / 60)
    expect(first).toBeGreaterThan(-120)
    expect(first).toBeLessThan(-60)
    let needle = -120
    for (let i = 0; i < 30; i++) needle = followNeedle(needle, 0, 1 / 60)
    expect(Math.abs(needle)).toBeLessThan(1)
  })
})
