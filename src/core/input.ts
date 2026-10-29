/**
 * The one small input layer. Game code asks about actions ("throttle",
 * "leanBack") and axes ("steer"), never about raw keys; which keys do what
 * lives in config.controls.keys.
 *
 * Keyboard keys are only on or off, so axes ease in and out: holding a key
 * moves the axis toward full over `riseTime` seconds, and letting go eases it
 * back to 0 over `fallTime` seconds.
 */

export interface AxisDef {
  /** Action that pushes the axis toward -1 (optional: some axes only go 0 to 1). */
  negative?: string
  /** Action that pushes the axis toward +1. */
  positive: string
  /** Seconds to go from 0 to full while the key is held. */
  riseTime: number
  /** Seconds to go from full back to 0 after letting go. */
  fallTime: number
}

export interface InputConfig {
  /** Action name -> the keys that trigger it (KeyboardEvent.code values). */
  keys: Record<string, string[]>
  /** Axis name -> the two actions that push it and how it eases. */
  easing: Record<string, AxisDef>
}

/**
 * Moves `value` toward `target` over `dt` seconds. Heading back toward 0
 * (letting go, easing off, or the first half of a reversal) goes at the fall
 * rate; heading away from 0 goes at the rise rate.
 */
export function rampToward(
  value: number,
  target: number,
  riseTime: number,
  fallTime: number,
  dt: number,
): number {
  let timeLeft = dt
  if (timeLeft <= 0) return value

  const headingToZero =
    value !== 0 && (Math.sign(target) !== Math.sign(value) || Math.abs(target) < Math.abs(value))
  if (headingToZero) {
    const stop = Math.sign(target) === Math.sign(value) ? target : 0
    const distance = Math.abs(value - stop)
    const reach = fallTime > 0 ? timeLeft / fallTime : Infinity
    if (reach < distance) return value - Math.sign(value) * reach
    timeLeft -= distance * fallTime
    value = stop
  }

  const distance = Math.abs(target - value)
  const reach = riseTime > 0 ? timeLeft / riseTime : Infinity
  if (reach >= distance) return target
  return value + Math.sign(target - value) * reach
}

export class Input {
  /** Read live every update, so tuning-panel changes apply at once. */
  readonly config: InputConfig
  private readonly heldKeys = new Set<string>()
  private readonly axisValues = new Map<string, number>()
  private readonly pressCallbacks = new Map<string, Array<() => void>>()

  constructor(config: InputConfig, target: EventTarget) {
    this.config = config

    target.addEventListener('keydown', (event) => {
      const e = event as KeyboardEvent
      if (isTextField(e.target)) return
      if (this.isBound(e.code)) e.preventDefault?.() // stop arrow keys scrolling the page
      if (e.repeat) return
      this.heldKeys.add(e.code)
      for (const [action, codes] of Object.entries(this.config.keys)) {
        if (codes.includes(e.code)) this.pressCallbacks.get(action)?.forEach((fn) => fn())
      }
    })
    target.addEventListener('keyup', (event) => {
      this.heldKeys.delete((event as KeyboardEvent).code)
    })
    // Alt-tabbing away while holding a key never delivers its keyup.
    target.addEventListener('blur', () => this.heldKeys.clear())
  }

  /** Whether any key bound to `action` is held right now. */
  isDown(action: string): boolean {
    const codes = this.config.keys[action]
    return codes !== undefined && codes.some((code) => this.heldKeys.has(code))
  }

  /** The eased value of an axis, -1 to 1. */
  axis(name: string): number {
    return this.axisValues.get(name) ?? 0
  }

  /** Calls `callback` the moment a key for `action` goes down (not on key repeat). */
  onPress(action: string, callback: () => void): void {
    const list = this.pressCallbacks.get(action) ?? []
    list.push(callback)
    this.pressCallbacks.set(action, list)
  }

  /** Advances every axis by `dt` seconds. Called once per physics step. */
  update(dt: number): void {
    for (const [name, def] of Object.entries(this.config.easing)) {
      const target =
        (this.isDown(def.positive) ? 1 : 0) - (def.negative && this.isDown(def.negative) ? 1 : 0)
      this.axisValues.set(name, rampToward(this.axis(name), target, def.riseTime, def.fallTime, dt))
    }
  }

  private isBound(code: string): boolean {
    return Object.values(this.config.keys).some((codes) => codes.includes(code))
  }
}

function isTextField(target: EventTarget | null): boolean {
  const tag = (target as { tagName?: string } | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
