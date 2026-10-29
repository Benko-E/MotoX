/**
 * The controls card shown when the game starts. It stays up until you press a
 * key, so there's time to read it, then fades away a few seconds into riding
 * and doesn't come back (the key list is also in the readout, under `).
 */
export class HelpTimer {
  /** How much of the card shows, 0 (gone) to 1. */
  shown = 1
  private ridingFor = -1

  constructor(
    /** Seconds it stays after you first press a key. */
    private readonly showFor: number,
    /** Seconds it then takes to fade away. */
    private readonly fadeFor: number,
  ) {}

  /** Moves on by `dt` seconds; `pressing` is whether any key is held. Returns how much of the card shows. */
  update(dt: number, pressing: boolean): number {
    if (this.ridingFor < 0 && pressing) this.ridingFor = 0
    if (this.ridingFor >= 0) this.ridingFor += dt
    const fading = (this.ridingFor - this.showFor) / Math.max(this.fadeFor, 1e-6)
    this.shown = this.ridingFor < 0 ? 1 : Math.min(Math.max(1 - fading, 0), 1)
    return this.shown
  }
}
