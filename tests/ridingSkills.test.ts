import { describe, expect, it } from 'vitest'
import { cornerSpeed, crestSpeed, hopSpeed, speedToMake, steerOntoLine, turnBetween, windUpSpeed } from '../src/ai/riding'
import { config } from '../src/config'
import { turnRadiusAt } from '../src/physics/bikeTuning'
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

  it('the fastest a bend can be taken: where the bike turns just that tight', () => {
    const { turning, speed } = config.bike
    for (const radius of [3, 8, 15]) expect(turnRadiusAt(turning, speed, cornerSpeed(radius, turning, speed))).toBeCloseTo(radius, 6)
    expect(cornerSpeed(1000, turning, speed)).toBeCloseTo(speed.topSpeed / 3.6, 6) // a straight: flat out
    expect(cornerSpeed(turning.tightestTurnSlow / 2, turning, speed)).toBe(0) // too tight for the bike at all
  })

  it('the speed to ride at now: slow enough to brake down to each speed ahead in time, else flat out', () => {
    expect(speedToMake([], 4)).toBe(Infinity)
    // 20 m/s needed 50 m on, braking at 4 m/s²: v² = 20² + 2 * 4 * 50
    expect(speedToMake([{ distance: 50, speed: 20 }], 4)).toBeCloseTo(Math.sqrt(800), 9)
    // the one that needs braking soonest wins, near or far
    expect(speedToMake([{ distance: 50, speed: 20 }, { distance: 200, speed: 5 }], 4)).toBeCloseTo(Math.sqrt(800), 9)
    expect(speedToMake([{ distance: 50, speed: 20 }, { distance: 60, speed: 5 }], 4)).toBeCloseTo(Math.sqrt(25 + 480), 9)
    expect(speedToMake([{ distance: 0, speed: 12 }, { distance: 10, speed: 30 }], 4)).toBeCloseTo(12, 9)
  })

  it('winding up for a kicker: faster the further below its lip, by what the climb costs', () => {
    const jump = { lip: { x: 0, y: 5, z: 0 }, speed: 72 } as JumpSpot
    expect(windUpSpeed(jump, 5, 9.81)).toBeCloseTo(20, 9) // at the lip: its speed
    expect(windUpSpeed(jump, 0, 9.81)).toBeCloseTo(Math.sqrt(400 + 2 * 9.81 * 5), 9) // 5 m below
    expect(windUpSpeed(jump, 8, 9.81)).toBeCloseTo(20, 9) // above it: no less
  })

  it('the fastest over a crest without being thrown off it: where it falls away as fast as gravity pulls you down', () => {
    expect(crestSpeed(0, 0, 10, 9.81)).toBe(Infinity) // level
    expect(crestSpeed(0.1, 0.1, 10, 9.81)).toBe(Infinity) // a steady slope
    expect(crestSpeed(-0.2, 0.2, 10, 9.81)).toBe(Infinity) // a dip
    // over the top of a crest 20 m round, its slope turning 0.5 radians in 10 m: v² = g * 20
    expect(crestSpeed(0.25, -0.25, 10, 9.81)).toBeCloseTo(Math.sqrt(9.81 * 20), 9)
    // on a slope, gravity holds you down less (cos of the slope)
    expect(crestSpeed(-0.25, -0.75, 10, 9.81)).toBeCloseTo(Math.sqrt(9.81 * Math.cos(0.5) * 20), 9)
  })

  it('the fastest off a crest for a hop no longer than wanted: the more the ground drops away, the slower', () => {
    expect(hopSpeed(0.1, 0.1, 0.5, 9.81)).toBe(Infinity) // it doesn't drop away
    expect(hopSpeed(0, 0.2, 0.5, 9.81)).toBe(Infinity) // a dip
    // leaving level ground for a 0.6 radian drop: up for t = 2 v sin(drop) / (g cos(slope landed on))
    const v = hopSpeed(0, -0.6, 0.5, 9.81)
    expect((2 * v * Math.sin(0.6)) / (9.81 * Math.cos(0.6))).toBeCloseTo(0.5, 9)
    expect(hopSpeed(0, -0.1, 0.5, 9.81)).toBeGreaterThan(4 * v) // a little bump: a lot faster
  })
})
