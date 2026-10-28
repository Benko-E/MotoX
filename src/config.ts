/**
 * Moto tuning: every value that affects how the game feels lives in this file.
 *
 * Change a number, save, and the game in your browser reloads with it. Or
 * press ` (backtick) in the game for the tuning panel: it has a slider for
 * every number here. Panel changes are lost on reload, so use its "copy
 * changed values" button and paste the result to Claude to keep them.
 *
 * Each later step adds its own section (bike, suspension, steering, lean,
 * camera follow, crashes).
 */
import type { Ranges } from './ui/tunables'

export const config = {
  physics: {
    /** Physics steps per second. The bike is simulated in slices this small no
     * matter how fast your screen refreshes, so it handles the same on every
     * machine. Higher is more precise but costs more CPU. */
    stepHz: 120,
    /** Most physics steps one frame may run. If the game stalls (for example
     * the tab was in the background), it skips ahead instead of
     * fast-forwarding through everything it missed. */
    maxStepsPerFrame: 8,
  },

  camera: {
    /** Field of view in degrees. Wider feels faster but distorts the edges. */
    fov: 65,
  },

  /** The free-fly camera, for looking around the map. */
  flyCamera: {
    /** Flying speed, metres per second. */
    speed: 25,
    /** Speed multiplier while Shift is held. */
    fastMultiplier: 4,
    /** How far the view turns per pixel of mouse movement. */
    mouseSensitivity: 0.0025,
  },

  input: {
    /** Which keys do what. Names are KeyboardEvent codes: KeyW is the W key,
     * Backquote the ` key left of 1, ShiftLeft the left Shift. They name the
     * key's position, so they work the same on any keyboard layout. */
    bindings: {
      togglePanel: ['Backquote'],
      flyForward: ['KeyW'],
      flyBack: ['KeyS'],
      flyLeft: ['KeyA'],
      flyRight: ['KeyD'],
      flyUp: ['KeyE'],
      flyDown: ['KeyQ'],
      flyFast: ['ShiftLeft', 'ShiftRight'],
    },
    /** Keys are on/off, so these ease in and out. riseTime: seconds from 0
     * to full while held. fallTime: seconds back to 0 after letting go. */
    axes: {
      flyMove: { negative: 'flyBack', positive: 'flyForward', riseTime: 0.3, fallTime: 0.25 },
      flyStrafe: { negative: 'flyLeft', positive: 'flyRight', riseTime: 0.3, fallTime: 0.25 },
      flyLift: { negative: 'flyDown', positive: 'flyUp', riseTime: 0.3, fallTime: 0.25 },
    },
  },
}

export type Config = typeof config

/** Slider ranges for values where "0 to 4x the file value" doesn't fit. */
export const configRanges: Ranges = {
  'physics.stepHz': [30, 240, 1],
  'physics.maxStepsPerFrame': [1, 20, 1],
  'camera.fov': [30, 110, 1],
}
