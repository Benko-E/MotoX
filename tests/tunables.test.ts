import { describe, expect, it } from 'vitest'
import { changedValues, collectTunables, rangeFor } from '../src/ui/tunables'

describe('rangeFor', () => {
  it('lets a slider go from 0 to 4x the file value by default', () => {
    expect(rangeFor('flyCamera.speed', 25, {})).toMatchObject({ min: 0, max: 100 })
  })

  it('goes both ways for negative values, and 0 to 1 for zero', () => {
    expect(rangeFor('a.b', -10, {})).toMatchObject({ min: -40, max: 40 })
    expect(rangeFor('a.b', 0, {})).toMatchObject({ min: 0, max: 1 })
  })

  it('uses a range from the ranges list, including * for any list entry', () => {
    const ranges = { 'camera.fov': [30, 110, 1] as [number, number, number], 'lips.*.heading': [0, 360, 1] as [number, number, number] }
    expect(rangeFor('camera.fov', 65, ranges)).toEqual({ min: 30, max: 110, step: 1 })
    expect(rangeFor('lips.3.heading', 45, ranges)).toEqual({ min: 0, max: 360, step: 1 })
  })

  it('picks a step that gives the slider at least 100 positions', () => {
    const { min, max, step } = rangeFor('a', 0.25, {})
    expect((max - min) / step).toBeGreaterThanOrEqual(100)
  })
})

describe('collectTunables', () => {
  it('finds every number and switch, including inside lists, and skips key names', () => {
    const settings = {
      input: { bindings: { throttle: ['KeyW'] }, axes: { steer: { positive: 'right', riseTime: 0.2 } } },
      fog: true,
      lips: [{ height: 2 }, { height: 3 }],
    }
    expect(collectTunables(settings).map((t) => t.path)).toEqual([
      'input.axes.steer.riseTime',
      'fog',
      'lips.0.height',
      'lips.1.height',
    ])
  })
})

describe('changedValues', () => {
  const defaults = { hills: { height: 14, seed: 1 }, lips: [{ height: 2 }, { height: 3 }], name: 'x' }

  it('returns nothing when nothing changed', () => {
    expect(changedValues(defaults, structuredClone(defaults))).toBeUndefined()
  })

  it('returns only the values that changed', () => {
    const current = structuredClone(defaults)
    current.hills.height = 20
    expect(changedValues(defaults, current)).toEqual({ hills: { height: 20 } })
  })

  it('keeps list positions, with null for entries that did not change', () => {
    const current = structuredClone(defaults)
    current.lips[1].height = 4
    expect(changedValues(defaults, current)).toEqual({ lips: [null, { height: 4 }] })
  })
})
