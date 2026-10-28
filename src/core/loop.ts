/**
 * Fixed physics timestep, independent of the screen's frame rate.
 *
 * Every frame we add the real time that passed to a bank, then run as many
 * whole physics steps as the bank pays for. Physics always moves in the same
 * small slices (1/120 s by default), so the bike handles identically on a
 * 60 Hz and a 144 Hz screen. Rendering uses `alpha` to draw the bike part-way
 * between the last two steps, so it still looks smooth.
 */

export interface FixedStepOptions {
  /** Physics steps per second. */
  stepHz: number
  /** Most steps one frame may run. After a long stall (tab in the background)
   * the rest is dropped instead of fast-forwarding the game. */
  maxStepsPerFrame: number
  /** Advances the game by exactly `dt` seconds. */
  step: (dt: number) => void
}

export class FixedStepLoop {
  /** Read live every frame, so changing the step rate applies at once. */
  private readonly options: FixedStepOptions
  private bank = 0

  constructor(options: FixedStepOptions) {
    this.options = options
  }

  advance(frameSeconds: number): void {
    const dt = this.dt
    this.bank += frameSeconds
    // Adding up frame times like 1/144 leaves rounding crumbs, so a bank a
    // hair short of a full step still pays for one.
    const almostOneStep = dt * (1 - 1e-6)
    let steps = 0
    while (this.bank >= almostOneStep) {
      if (steps === this.options.maxStepsPerFrame) {
        this.bank %= dt
        break
      }
      this.options.step(dt)
      this.bank -= dt
      steps++
    }
  }

  /** How far we are toward the next step, 0 to 1. Used to blend the drawing. */
  get alpha(): number {
    return Math.min(Math.max(this.bank / this.dt, 0), 1)
  }

  private get dt(): number {
    return 1 / Math.max(this.options.stepHz, 1)
  }
}
