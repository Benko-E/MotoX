import { describe, expect, it } from 'vitest'
import {
  brakeDeceleration,
  dampingRate,
  driveAcceleration,
  launchAcceleration,
  springRate,
  turnRadiusAt,
} from '../src/physics/bikeTuning'

const speed = { topSpeed: 100, secondsTo60: 2.5, secondsToStopFrom60: 2, coastSlowdown: 5 }

describe('speed settings', () => {
  it('reaches 60 km/h in secondsTo60 when following the throttle curve', () => {
    // step through the curve by hand, independent of how launchAcceleration works it out
    let v = 0
    let t = 0
    const dt = 0.0005
    while (v < 60 / 3.6 && t < 10) {
      v += driveAcceleration(speed, v) * dt
      t += dt
    }
    expect(t).toBeCloseTo(2.5, 2)
  })

  it('pulls hardest from a standstill and not at all at top speed', () => {
    expect(driveAcceleration(speed, 0)).toBeCloseTo(launchAcceleration(speed), 9)
    expect(driveAcceleration(speed, 100 / 3.6)).toBe(0)
    expect(driveAcceleration(speed, 120 / 3.6)).toBe(0)
  })

  it('brakes hard enough to stop from 60 km/h in secondsToStopFrom60', () => {
    expect(brakeDeceleration(speed)).toBeCloseTo(60 / 3.6 / 2, 9) // 8.33 m/s²
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
