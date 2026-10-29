import { describe, expect, it } from 'vitest'
import { HelpTimer } from '../src/ui/helpCard'

const DT = 1 / 60
/** Runs the timer for `seconds`, with a key held or not. */
function run(timer: HelpTimer, seconds: number, pressing: boolean) {
  let shown = timer.shown
  for (let t = 0; t < seconds - 1e-9; t += DT) shown = timer.update(DT, pressing)
  return shown
}

describe('the controls card', () => {
  it('stays up for as long as you like until you press a key', () => {
    const timer = new HelpTimer(6, 1.5)
    expect(run(timer, 60, false)).toBe(1)
  })

  it('fades away a while after you start riding, and stays gone', () => {
    const timer = new HelpTimer(6, 1.5)
    run(timer, 0.2, true) // started riding
    expect(run(timer, 5.5, false)).toBe(1) // still up
    const fading = run(timer, 1, false)
    expect(fading).toBeGreaterThan(0)
    expect(fading).toBeLessThan(1)
    expect(run(timer, 1, false)).toBe(0) // gone
    expect(run(timer, 5, true)).toBe(0) // and doesn't come back
  })
})
