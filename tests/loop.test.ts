import { describe, expect, it } from 'vitest'
import { FixedStepLoop } from '../src/core/loop'

/** Feeds `frames` equal frames of `1 / fps` seconds into a fresh loop. */
function runFrames(fps: number, frames: number, onStep: (dt: number) => void) {
  const loop = new FixedStepLoop({ stepHz: 120, maxStepsPerFrame: 8, step: onStep })
  for (let i = 0; i < frames; i++) loop.advance(1 / fps)
  return loop
}

describe('FixedStepLoop', () => {
  it('runs 120 physics steps per second on a 60 Hz and a 144 Hz screen alike', () => {
    let at60 = 0
    let at144 = 0
    runFrames(60, 60, () => at60++)
    runFrames(144, 144, () => at144++)
    expect(at60).toBe(120)
    expect(at144).toBe(120)
  })

  it('gives the same physics result regardless of screen refresh rate', () => {
    // A ball falling under g = -10 for one second, stepped at 120 Hz with
    // semi-implicit Euler. By hand: y = -10 * dt^2 * N(N+1)/2 with N = 120,
    // dt = 1/120, which is -5.041666...
    function fall(fps: number) {
      let y = 0
      let v = 0
      runFrames(fps, fps, (dt) => {
        v += -10 * dt
        y += v * dt
      })
      return y
    }
    expect(fall(60)).toBeCloseTo(-5.0416667, 6)
    expect(fall(144)).toBeCloseTo(-5.0416667, 6)
  })

  it('reports how far it is toward the next step, for smooth rendering', () => {
    const loop = new FixedStepLoop({ stepHz: 120, maxStepsPerFrame: 8, step: () => {} })
    loop.advance(1.5 / 120)
    expect(loop.alpha).toBeCloseTo(0.5, 6)
  })

  it('picks up a new step rate at once, so the tuning panel can change it', () => {
    let steps = 0
    const options = { stepHz: 120, maxStepsPerFrame: 8, step: () => steps++ }
    const loop = new FixedStepLoop(options)
    options.stepHz = 60
    for (let i = 0; i < 60; i++) loop.advance(1 / 60)
    expect(steps).toBe(60)
  })

  it('after a long stall runs at most maxStepsPerFrame and drops the backlog', () => {
    let steps = 0
    const loop = new FixedStepLoop({ stepHz: 120, maxStepsPerFrame: 8, step: () => steps++ })
    loop.advance(2) // e.g. the tab was in the background for 2 seconds
    expect(steps).toBe(8)
    loop.advance(1 / 120) // the next normal frame must not try to catch up
    expect(steps).toBe(9)
    expect(loop.alpha).toBeLessThan(1)
  })
})
