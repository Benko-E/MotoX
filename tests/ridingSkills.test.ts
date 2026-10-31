import { describe, expect, it } from 'vitest'
import { steerOntoLine, turnBetween } from '../src/ai/riding'
import type { JumpSpot } from '../src/world/jumps'

/** A jump ridden east (toward +x), its lip at the middle. */
const east = { lip: { x: 0, y: 0, z: 0 }, heading: 90 } as JumpSpot

describe('riding skills', () => {
  it('turnBetween: the shortest way round from one heading to another', () => {
    expect(turnBetween(10, 350)).toBe(20)
    expect(turnBetween(350, 10)).toBe(-20)
  })

  it('steering onto a jump\'s line: none when on it facing its way, back toward it when off to one side', () => {
    expect(steerOntoLine({ x: -20, z: 0 }, 90, east)).toBeCloseTo(0, 6)
    expect(steerOntoLine({ x: -20, z: 2 }, 90, east)).toBeLessThan(0) // 2 m right of it (south): steer left
    expect(steerOntoLine({ x: -20, z: -2 }, 90, east)).toBeGreaterThan(0)
    expect(steerOntoLine({ x: -20, z: 0 }, 100, east)).toBeLessThan(0) // turned right of its way: steer left
    expect(steerOntoLine({ x: -20, z: 30 }, 90, east)).toBe(-1) // far off: full lock
  })
})
