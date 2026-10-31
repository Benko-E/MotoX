import { describe, expect, it } from 'vitest'
import { changedValues, changesToCopy, choicesFor, collectTunables, folderTitle, isHidden, rangeFor } from '../src/ui/tunables'

describe('choices', () => {
  it('text settings get a dropdown only where there is a list of choices for them', () => {
    const choices = { 'hud.*.anchor': ['top', 'bottom'] }
    expect(choicesFor('hud.speed.anchor', choices)).toEqual(['top', 'bottom'])
    expect(choicesFor('controls.keys.throttle', choices)).toBeUndefined()
  })

  it('collects text values only where asked, such as an anchor', () => {
    const paths = collectTunables({ size: 1, name: 'x', speed: { anchor: 'top' } }, '', (path) => path.endsWith('anchor')).map((t) => t.path)
    expect(paths).toEqual(['size', 'speed.anchor'])
  })
})

describe('folderTitle', () => {
  it('names a folder after its setting, and an item in a list after its first text, or its number', () => {
    expect(folderTitle('bikeBody', {})).toBe('bike body')
    expect(folderTitle('0', { letter: 'M', difficulty: 0 })).toBe('M')
    expect(folderTitle('2', { height: 3 })).toBe('#3')
  })
})

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

  it('lets * stand for any name too, such as any bike', () => {
    const ranges = { 'bikes.*.brakes.frontShare': [0, 1, 0.01] as [number, number, number] }
    expect(rangeFor('bikes.dirt250.brakes.frontShare', 0.65, ranges)).toEqual({ min: 0, max: 1, step: 0.01 })
    expect(rangeFor('bikes.dirt250.brakes.force', 1150, ranges)).toMatchObject({ min: 0, max: 4600 })
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

describe('settings that do nothing right now are hidden', () => {
  const choices = { 'riders.*.job': ['roam', 'track'] }
  const settings = {
    track: { show: false, width: 8, debug: { lanes: true } },
    hud: { show: true, size: 1 },
    riders: [{ name: 'Helga', job: 'track', speed: 45, roam: { radius: 300 }, track: {} }],
  }

  it('with its show switch off, the rest of that group (and everything in it) is hidden, but not the switch', () => {
    expect(isHidden(settings, 'track.show', choices)).toBe(false)
    expect(isHidden(settings, 'track.width', choices)).toBe(true)
    expect(isHidden(settings, 'track.debug.lanes', choices)).toBe(true)
    expect(isHidden(settings, 'track.debug', choices)).toBe(true) // the folder too
    expect(isHidden(settings, 'hud.size', choices)).toBe(false)
  })

  it('a job picked from a list shows only that job\'s settings', () => {
    expect(isHidden(settings, 'riders.0.roam.radius', choices)).toBe(true)
    expect(isHidden(settings, 'riders.0.roam', choices)).toBe(true)
    expect(isHidden(settings, 'riders.0.speed', choices)).toBe(false)
    expect(isHidden(settings, 'riders.0.job', choices)).toBe(false)
    settings.riders[0].job = 'roam'
    expect(isHidden(settings, 'riders.0.roam.radius', choices)).toBe(false)
  })

  it('works on a part of a file, with the part\'s place in the file for the choices', () => {
    expect(isHidden(settings.riders, '0.roam.radius', choices, 'riders')).toBe(false)
    expect(isHidden(settings.track, 'width', choices, 'track')).toBe(true)
  })
})

describe('copying changed values', () => {
  it('gathers each part\'s changes into its file, at its place there, leaving out what a part leaves to another', () => {
    const parts = [
      { file: 'config', path: 'bike', before: { speed: 1, grip: 2 }, now: { speed: 2, grip: 2 } },
      { file: 'map', path: '', before: { size: 1, channel: { width: 1 } }, now: { size: 1, channel: { width: 3 } }, exclude: ['channel'] },
      { file: 'map', path: 'channel', before: { width: 1, show: true }, now: { width: 3, show: true } },
      { file: 'config', path: 'ai.riders', before: [{ speed: 1 }], now: [{ speed: 1 }] },
    ]
    expect(changesToCopy(parts)).toEqual({ config: { bike: { speed: 2 } }, map: { channel: { width: 3 } } })
  })

  it('nothing changed: nothing to copy', () => {
    expect(changesToCopy([{ file: 'config', path: 'bike', before: { speed: 1 }, now: { speed: 1 } }])).toBeUndefined()
  })
})
