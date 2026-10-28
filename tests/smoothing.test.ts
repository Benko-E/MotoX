import { describe, expect, it } from 'vitest'
import { smoothAngleToward, smoothToward } from '../src/core/smoothing'

describe('smoothToward', () => {
  it('ends up in the same place after one second on a 60 Hz and a 144 Hz screen', () => {
    let at60 = 0
    let at144 = 0
    for (let i = 0; i < 60; i++) at60 = smoothToward(at60, 10, 0.3, 1 / 60)
    for (let i = 0; i < 144; i++) at144 = smoothToward(at144, 10, 0.3, 1 / 144)
    expect(at60).toBeCloseTo(at144, 9)
  })

  it('covers about 63% of the way in one lag time', () => {
    expect(smoothToward(0, 10, 0.5, 0.5)).toBeCloseTo(10 * (1 - Math.exp(-1)), 9) // 6.32
  })

  it('jumps straight there with no lag', () => {
    expect(smoothToward(0, 10, 0, 1 / 60)).toBe(10)
  })
})

describe('smoothAngleToward', () => {
  it('turns the short way round, through 0 rather than through 180', () => {
    // from 350 toward 10 degrees, halfway after ln(2) lag times
    const half = smoothAngleToward(350, 10, 1, Math.LN2)
    expect(((half % 360) + 360) % 360).toBeCloseTo(0, 6)
  })
})
