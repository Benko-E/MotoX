import { describe, expect, it } from 'vitest'
import { Input, rampToward, type InputConfig } from '../src/core/input'

/** A keyboard event as the browser sends it. Node has no KeyboardEvent. */
function key(type: 'keydown' | 'keyup', code: string, repeat = false) {
  return Object.assign(new Event(type), { code, repeat })
}

function makeInput(config?: Partial<InputConfig>) {
  const target = new EventTarget()
  const input = new Input(
    {
      keys: { throttle: ['KeyW', 'ArrowUp'], left: ['KeyA'], right: ['KeyD'], panel: ['Backquote'] },
      easing: { steer: { negative: 'left', positive: 'right', riseTime: 0.2, fallTime: 0.1 } },
      ...config,
    },
    target,
  )
  return { input, target }
}

describe('rampToward', () => {
  it('eases from 0 up to full over riseTime', () => {
    expect(rampToward(0, 1, 0.2, 0.1, 0.1)).toBeCloseTo(0.5, 9)
    expect(rampToward(0.5, 1, 0.2, 0.1, 0.1)).toBeCloseTo(1, 9)
    expect(rampToward(0.9, 1, 0.2, 0.1, 0.5)).toBe(1) // never overshoots
  })

  it('eases back to 0 over fallTime when the key is released', () => {
    expect(rampToward(1, 0, 0.2, 0.1, 0.05)).toBeCloseTo(0.5, 9)
    expect(rampToward(0.5, 0, 0.2, 0.1, 0.05)).toBeCloseTo(0, 9)
    expect(rampToward(0.2, 0, 0.2, 0.1, 0.5)).toBe(0) // never overshoots
  })

  it('passes through 0 when reversing: falls first, then rises the other way', () => {
    // 0.1 s to fall from 1 to 0, then 0.1 s of rising at 0.2 s per full range
    expect(rampToward(1, -1, 0.2, 0.1, 0.2)).toBeCloseTo(-0.5, 9)
    expect(rampToward(-0.25, 1, 0.2, 0.1, 0.025)).toBeCloseTo(0, 9)
  })

  it('snaps instantly when a time is 0', () => {
    expect(rampToward(0, 1, 0, 0.1, 1 / 120)).toBe(1)
    expect(rampToward(1, 0, 0.2, 0, 1 / 120)).toBe(0)
  })
})

describe('Input', () => {
  it('reports an action as held while one of its keys is down', () => {
    const { input, target } = makeInput()
    target.dispatchEvent(key('keydown', 'KeyW'))
    expect(input.isDown('throttle')).toBe(true)
    target.dispatchEvent(key('keyup', 'KeyW'))
    expect(input.isDown('throttle')).toBe(false)
  })

  it('keeps an action held while any of its keys is still down', () => {
    const { input, target } = makeInput()
    target.dispatchEvent(key('keydown', 'KeyW'))
    target.dispatchEvent(key('keydown', 'ArrowUp'))
    target.dispatchEvent(key('keyup', 'KeyW'))
    expect(input.isDown('throttle')).toBe(true)
  })

  it('releases every key when the window loses focus, so nothing gets stuck', () => {
    const { input, target } = makeInput()
    target.dispatchEvent(key('keydown', 'KeyW'))
    target.dispatchEvent(new Event('blur'))
    expect(input.isDown('throttle')).toBe(false)
  })

  it('ramps an axis from its two actions', () => {
    const { input, target } = makeInput()
    target.dispatchEvent(key('keydown', 'KeyD'))
    input.update(0.1)
    expect(input.axis('steer')).toBeCloseTo(0.5, 9)
    target.dispatchEvent(key('keyup', 'KeyD'))
    target.dispatchEvent(key('keydown', 'KeyA'))
    input.update(0.2)
    expect(input.axis('steer')).toBeCloseTo(-0.75, 9)
  })

  it('reads ramp times live from the config, so the tuning panel applies at once', () => {
    const { input, target } = makeInput()
    target.dispatchEvent(key('keydown', 'KeyD'))
    input.config.easing.steer.riseTime = 0.4
    input.update(0.1)
    expect(input.axis('steer')).toBeCloseTo(0.25, 9)
  })

  it('fires a press callback once per press, ignoring key repeat', () => {
    const { input, target } = makeInput()
    let presses = 0
    input.onPress('panel', () => presses++)
    target.dispatchEvent(key('keydown', 'Backquote'))
    target.dispatchEvent(key('keydown', 'Backquote', true))
    target.dispatchEvent(key('keyup', 'Backquote'))
    target.dispatchEvent(key('keydown', 'Backquote'))
    expect(presses).toBe(2)
  })

  it('ignores keys typed into a text field', () => {
    // A tuning-panel number box: typing "w" there must not move anything.
    const field = Object.assign(new EventTarget(), { tagName: 'INPUT' })
    const input = new Input({ keys: { throttle: ['KeyW'] }, easing: {} }, field)
    field.dispatchEvent(key('keydown', 'KeyW'))
    expect(input.isDown('throttle')).toBe(false)
  })

  it('knows whether any key it uses is held', () => {
    const { input, target } = makeInput()
    expect(input.anyHeld).toBe(false)
    target.dispatchEvent(key('keydown', 'KeyF')) // not one of ours
    expect(input.anyHeld).toBe(false)
    target.dispatchEvent(key('keydown', 'KeyA'))
    expect(input.anyHeld).toBe(true)
    target.dispatchEvent(key('keyup', 'KeyA'))
    expect(input.anyHeld).toBe(false)
  })

  it('adds up scroll wheel clicks (away from you counts out) until they are taken', () => {
    const { input, target } = makeInput()
    const wheel = (deltaY: number) => Object.assign(new Event('wheel'), { deltaY })
    target.dispatchEvent(wheel(120))
    target.dispatchEvent(wheel(120))
    target.dispatchEvent(wheel(-120))
    expect(input.takeWheel()).toBe(1)
    expect(input.takeWheel()).toBe(0) // taken
  })

  it('ignores the scroll wheel over something that scrolls itself, like the tuning panel', () => {
    const panel = Object.assign(new EventTarget(), { closest: (selector: string) => (selector === '[data-own-scroll]' ? panel : null) })
    const input = new Input({ keys: {}, easing: {} }, panel)
    panel.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: 120 }))
    expect(input.takeWheel()).toBe(0)
  })

  it('stops the browser using a bound key itself, pressed or released', () => {
    // Space would scroll the page, or press a tuning-panel button left focused (on release)
    const { target } = makeInput({ keys: { powerslide: ['Space'] }, easing: {} })
    for (const type of ['keydown', 'keyup'] as const) {
      const event = Object.assign(new Event(type, { cancelable: true }), { code: 'Space', repeat: false })
      target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
  })
})
