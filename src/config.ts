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
    /** Gravity, metres per second squared. Earth is 9.81. A bit lower makes
     * jumps floatier; much lower feels like the moon. */
    gravity: 9.81,
  },

  /** Which bike you ride. Each entry in `bikes` is a complete bike. */
  currentBike: 'dirt250',

  bikes: {
    dirt250: {
      mass: {
        /** The bike alone, kg. */
        bike: 105,
        /** The rider, kg. */
        rider: 75,
      },
      /** Where the weight of bike and rider together sits, metres, measured
       * from the middle point between the tops of the two suspensions. Higher
       * makes the bike pitch more under braking and throttle; forward puts
       * more weight on the front wheel. */
      centerOfMass: { height: 0.35, forward: -0.05 },
      /** How hard the bike is to rotate, kg·m². Higher feels heavier and lazier.
       * pitch: nose up/down. yaw: turning left/right. roll: leaning sideways. */
      inertia: { pitch: 70, yaw: 70, roll: 25 },
      /** Distance between the two wheels, metres. */
      wheelbase: 1.48,

      /** Front fork. radius: wheel radius, metres. travel: how far the
       * suspension can compress, metres. spring: stiffness, newtons per metre.
       * progression: how much stiffer it gets near the end of its travel (0 =
       * not at all, 1 = twice as stiff at the very end). bumpDamping /
       * reboundDamping: how much it resists compressing / extending, N per
       * m/s. More rebound damping stops it bouncing. */
      front: { radius: 0.36, travel: 0.3, spring: 9500, progression: 1.5, bumpDamping: 700, reboundDamping: 2400 },
      /** Rear shock, same meaning as the front. */
      rear: { radius: 0.34, travel: 0.31, spring: 10500, progression: 1.5, bumpDamping: 800, reboundDamping: 2600 },
      /** When a hard landing uses up all the travel, the rest of the hit is
       * soaked up completely (a thud, never a bounce). stiffness: how firmly
       * the wheel is then pushed back to the end of its travel, N per metre. */
      bottomOut: { stiffness: 40000 },

      tyres: {
        /** Sideways grip compared to the bike's weight. 1 = it can take a
         * sideways push as big as its weight before sliding. */
        grip: 1.1,
        /** How firmly the tyres stop sideways sliding, 0 to 1. Low feels like
         * ice, 1 is instant. */
        lateralResponse: 0.6,
        /** How much the tyres slow a freely rolling bike, compared to its weight. */
        rollingResistance: 0.015,
      },

      /** The invisible helper that keeps the bike from falling over sideways.
       * Real bikes balance by steering; this does it for you. */
      upright: {
        /** How strongly it pulls the bike back upright, N·m per radian. */
        stiffness: 3000,
        /** How much it calms the wobble, N·m per rad/s. */
        damping: 400,
        /** Its strength in the air, compared to on the ground (0 to 1). */
        airStrength: 0.5,
      },
    },
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
      /** Put the bike back upright where it is. */
      reset: ['KeyR'],
      /** Drop the bike from where the camera is (for testing). */
      dropBike: ['KeyB'],
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
export type BikeStats = Config['bikes']['dirt250']
export type WheelStats = BikeStats['front']

/** The stats of the bike being ridden. */
export function currentBike(settings: Config = config): BikeStats {
  return settings.bikes[settings.currentBike as keyof Config['bikes']]
}

/** Slider ranges for values where "0 to 4x the file value" doesn't fit. */
export const configRanges: Ranges = {
  'physics.stepHz': [30, 240, 1],
  'physics.maxStepsPerFrame': [1, 20, 1],
  'camera.fov': [30, 110, 1],
}
