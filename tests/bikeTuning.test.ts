import { describe, expect, it } from 'vitest'
import {
  brakeDeceleration,
  dampingRate,
  airDrag,
  engineAcceleration,
  engineBraking,
  springRate,
  tyreGrip,
  turnRadiusAt,
} from '../src/physics/bikeTuning'

const speed = { topSpeed: 100, secondsTo60: 2.5, secondsToStopFrom60: 2, coastSlowdown: 5, hills: 1 }

describe('speed settings', () => {
  it('reaches 60 km/h in secondsTo60 at full throttle on the flat: the engine pulling, the air holding it back', () => {
    // step through it by hand, independent of how the engine's strength is worked out
    let v = 0
    let t = 0
    const dt = 0.0005
    while (v < 60 / 3.6 && t < 10) {
      v += (engineAcceleration(speed, v) - airDrag(speed, v)) * dt
      t += dt
    }
    expect(t).toBeCloseTo(2.5, 2)
  })

  it('levels off at topSpeed on the flat, where the air holds back as hard as the engine pulls', () => {
    const top = 100 / 3.6
    expect(engineAcceleration(speed, top)).toBeCloseTo(airDrag(speed, top), 9)
    expect(engineAcceleration(speed, top * 0.9)).toBeGreaterThan(airDrag(speed, top * 0.9))
    expect(engineAcceleration(speed, top * 1.1)).toBeLessThan(airDrag(speed, top * 1.1))
  })

  it('has an engine of limited power: past a third of top speed, twice as fast pulls half as hard', () => {
    // so a climb, which needs more pull, costs speed, the way it does on a real bike
    const top = 100 / 3.6
    for (const v of [top / 2, top * 0.6, top * 0.9]) expect(engineAcceleration(speed, v * 1.1) * v * 1.1).toBeCloseTo(engineAcceleration(speed, v) * v, 9)
    // below that the tyre can only grip so hard: the same pull all the way from a standstill
    expect(engineAcceleration(speed, 0)).toBeCloseTo(engineAcceleration(speed, top / 4), 9)
    expect(engineAcceleration(speed, 0)).toBeGreaterThan(engineAcceleration(speed, top / 2))
  })

  it('lets go: the air and the engine braking slow it by coastSlowdown at 60 km/h', () => {
    const sixty = 60 / 3.6
    expect(airDrag(speed, sixty) + engineBraking(speed)).toBeCloseTo(5 / 3.6, 9)
    // the air holds back harder the faster you go
    expect(airDrag(speed, 2 * sixty)).toBeCloseTo(4 * airDrag(speed, sixty), 9)
  })

  it('brakes hard enough to stop from 60 km/h in secondsToStopFrom60', () => {
    expect(brakeDeceleration(speed)).toBeCloseTo(60 / 3.6 / 2, 9) // 8.33 m/s²
  })
})

describe('tyre grip', () => {
  it('pushes fully rolling straight, less and less as it slides, and not at all side-on', () => {
    expect(tyreGrip(10, 0)).toBe(1)
    expect(tyreGrip(10, 10)).toBeCloseTo(0.5, 9)
    expect(tyreGrip(0.001, 10)).toBeCloseTo(0, 5)
  })

  it('barely moving, a little drift is no slide: it grips (or it could never pull away)', () => {
    expect(tyreGrip(-0.011, -0.034)).toBeGreaterThan(0.99)
    expect(tyreGrip(0, 0.2)).toBeGreaterThan(0.95)
  })
})

describe('turning settings', () => {
  const turning = { tightestTurnSlow: 2, tightestTurnFast: 42, turnCurve: 2 }

  it('turns tightest when slow and widest at top speed, along the curve in between', () => {
    expect(turnRadiusAt(turning, speed, 0)).toBe(2)
    expect(turnRadiusAt(turning, speed, 100 / 3.6)).toBeCloseTo(42, 9)
    expect(turnRadiusAt(turning, speed, 50 / 3.6)).toBeCloseTo(12, 9) // 2 + 40 * 0.5^2
    expect(turnRadiusAt(turning, speed, -50 / 3.6)).toBeCloseTo(12, 9) // the same rolling backward
    expect(turnRadiusAt(turning, speed, 150 / 3.6)).toBeCloseTo(42, 9) // no wider past top speed
  })
})

describe('suspension settings', () => {
  it('picks a spring that sinks in by `sag` of the travel under the bike\'s weight', () => {
    const load = 900
    const k = springRate(load, 0.3, 0.3, 1.5)
    const squeeze = 0.3 * 0.3
    // the progressive spring's force at that squeeze, as the bike works it out
    expect(k * squeeze * (1 + 1.5 * 0.3 ** 2)).toBeCloseTo(load, 6)
  })

  it('gives "1" of bounce control exactly the damping that stops a bounce without overshoot', () => {
    // critical damping for a spring k carrying mass m is 2 * sqrt(k * m)
    expect(dampingRate(1, 10000, 981, 9.81)).toBeCloseTo(2 * Math.sqrt(10000 * 100), 6)
    expect(dampingRate(0.5, 10000, 981, 9.81)).toBeCloseTo(Math.sqrt(10000 * 100), 6)
  })
})
