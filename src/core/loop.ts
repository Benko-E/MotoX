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
  private readonly dt: number
  private readonly maxSteps: number
  private readonly step: (dt: number) => void
  private bank = 0

  constructor(options: FixedStepOptions) {
    this.dt = 1 / options.stepHz
    this.maxSteps = options.maxStepsPerFrame
    this.step = options.step
  }

  advance(frameSeconds: number): void {
    this.bank += frameSeconds
    // Adding up frame times like 1/144 leaves rounding crumbs, so a bank a
    // hair short of a full step still pays for one.
    const almostOneStep = this.dt * (1 - 1e-6)
    let steps = 0
    while (this.bank >= almostOneStep) {
      if (steps === this.maxSteps) {
        this.bank %= this.dt
        break
      }
      this.step(this.dt)
      this.bank -= this.dt
      steps++
    }
  }

  /** How far we are toward the next step, 0 to 1. Used to blend the drawing. */
  get alpha(): number {
    return Math.min(Math.max(this.bank / this.dt, 0), 1)
  }
}
