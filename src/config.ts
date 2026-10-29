/**
 * Moto settings: everything that decides how the game feels.
 *
 * The easiest way to tune: press ` (the key left of 1) in the game. The panel
 * has a slider for every number here, and hovering a slider shows what it
 * does. Changes apply at once while you ride but are lost when the page
 * reloads, so when something feels good, press "copy changed values" and
 * paste it to Claude to keep it.
 *
 * Or change a number here and save: the game reloads with it.
 */
import type { Ranges } from './ui/tunables'

export const config = {
  /** The bike you ride. */
  bike: {
    /** How fast it goes, how quickly it gets there, and how quickly it stops. */
    speed: {
      /** Fastest it goes on flat ground, km/h. */
      topSpeed: 105,
      /** Seconds from standing still to 60 km/h at full throttle. Lower is punchier. */
      secondsTo60: 2.4,
      /** Seconds to stop from 60 km/h at full brake. Lower is stronger brakes. */
      secondsToStopFrom60: 1.7,
      /** How quickly it slows down with neither throttle nor brake, km/h per second. */
      coastSlowdown: 5,
    },

    /** How tight it turns, how quickly it reacts, and how far it leans. */
    turning: {
      /** Radius of the tightest turn when barely moving, metres. */
      tightestTurnSlow: 2.5,
      /** Radius of the tightest turn at top speed, metres. Bigger means wider arcs at speed. */
      tightestTurnFast: 35,
      /** How the turn widens as you speed up. 1 = evenly with speed; higher stays tight for longer and only opens up near top speed. */
      turnCurve: 1.8,
      /** Seconds the bike takes to start turning once you steer. Lower is snappier. */
      steeringResponse: 0.08,
      /** Sideways grip, as a share of the bike's weight. A turn that would need more grip than this is made wider, so the bike goes where it points instead of sliding. */
      grip: 1.5,
      /** How far the bike leans into turns at most, degrees. Only the look: it does not change how the bike turns. */
      maxLean: 35,
      /** Seconds the lean takes to follow the turn. */
      leanResponse: 0.15,
      /** How fast you can turn in the air at full steer, degrees per second. 0 = not at all. */
      airTurn: 45,
    },

    /** How soft the bike sits, how it soaks up bumps and landings, and how much it bounces. */
    suspension: {
      /** How far the front fork can compress, metres. */
      frontTravel: 0.3,
      /** How far the rear shock can compress, metres. */
      rearTravel: 0.31,
      /** How far the bike sinks in under its own weight when standing, as a share of the travel (0.3 = 30%). More is softer. */
      sag: 0.3,
      /** How much stiffer the suspension gets near the end of its travel. 0 = not at all, 1 = twice as stiff at the very end. More soaks up big landings without bottoming out. */
      stiffening: 1.5,
      /** How much it resists squeezing in. Low soaks up bumps softly, high feels harsh. */
      bumpDamping: 0.3,
      /** How much it holds back springing out again. Around 1 stops it bouncing after small bumps; a bit more also after big landings, where the springs are squeezed hardest. Lower bounces. */
      reboundDamping: 1.4,
      /** After a hard landing that used up all the travel, how firmly the wheel is pushed back out, newtons per metre. The hit itself is always soaked up: a thud, never a bounce. */
      bottomOutStiffness: 40000,
    },

    /** How heavy the bike is and where the weight sits. */
    weight: {
      /** Bike and rider together, kg. */
      total: 180,
      /** How high the weight sits, metres above the tops of the suspension. Higher pitches more under braking. */
      height: 0.35,
      /** How far forward of the middle the weight sits, metres. Forward puts more of it on the front wheel. */
      forward: -0.05,
      /** How much braking dips the nose, 0 to 1. 1 is like a real bike, where hard braking can tip it up onto the front wheel. */
      noseDive: 0.5,
    },

    /** The bike's build. These rarely need changing. */
    build: {
      /** Distance between the two wheels, metres. */
      wheelbase: 1.48,
      /** Front wheel radius, metres. */
      frontWheel: 0.36,
      /** Rear wheel radius, metres. */
      rearWheel: 0.34,
      /** How hard the bike is to rotate, kg·m². Higher is lazier. pitch: nose up and down. yaw: turning. roll: tipping sideways. */
      inertia: { pitch: 70, yaw: 70, roll: 25 },
      /** The invisible helper that keeps the bike from falling over sideways. stiffness: how hard it pulls upright. damping: how much it calms the wobble. */
      upright: { stiffness: 6000, damping: 700 },
    },
  },

  /** How jumps feel. */
  jumps: {
    /** Gravity compared to Earth. 1 = real; lower makes jumps floatier, higher makes the bike drop like a stone. */
    gravity: 1,
  },

  /** The camera behind the bike. */
  camera: {
    /** How wide the view is, degrees. Wider feels faster but stretches the edges. */
    fov: 65,
    /** How far behind the bike, metres. */
    distance: 5.5,
    /** Extra distance per metre per second of speed, so speed feels faster. */
    distancePerSpeed: 0.03,
    /** How high above the bike, metres. */
    height: 2.0,
    /** The point it looks at, metres above the bike. */
    lookHeight: 0.9,
    /** Seconds it takes to swing round behind the bike after it turns. Lower is snappier, higher is smoother. */
    turnLag: 0.3,
    /** Seconds it takes to follow the bike up and down. Higher keeps jumps and bumps from shaking the view. */
    heightLag: 0.25,
    /** Seconds it takes to catch up with the bike's position. */
    positionLag: 0.08,
  },

  /** Keys, and how quickly key presses ease in and out. */
  controls: {
    /** Which keys do what. Names are keyboard key codes: KeyW is the W key, Backquote the ` key left of 1, ShiftLeft the left Shift. They name the key's position, so they work on any keyboard layout. */
    keys: {
      throttle: ['KeyW'],
      brake: ['KeyS'],
      steerLeft: ['KeyA'],
      steerRight: ['KeyD'],
      /** Put the bike back upright where it is. */
      reset: ['KeyR'],
      /** Drop the bike from a height (for testing landings). */
      dropBike: ['KeyB'],
      /** Switch between the chase camera and the free-fly camera. */
      toggleCamera: ['KeyC'],
      togglePanel: ['Backquote'],
      flyForward: ['KeyW'],
      flyBack: ['KeyS'],
      flyLeft: ['KeyA'],
      flyRight: ['KeyD'],
      flyUp: ['KeyE'],
      flyDown: ['KeyQ'],
      flyFast: ['ShiftLeft', 'ShiftRight'],
    },
    /** Keys are only on or off, so these ease in and out. riseTime: seconds from nothing to full while the key is held. fallTime: seconds back to nothing after letting go. */
    easing: {
      throttle: { positive: 'throttle', riseTime: 0.12, fallTime: 0.1 },
      brake: { positive: 'brake', riseTime: 0.1, fallTime: 0.08 },
      steer: { negative: 'steerLeft', positive: 'steerRight', riseTime: 0.15, fallTime: 0.12 },
      flyMove: { negative: 'flyBack', positive: 'flyForward', riseTime: 0.3, fallTime: 0.25 },
      flyStrafe: { negative: 'flyLeft', positive: 'flyRight', riseTime: 0.3, fallTime: 0.25 },
      flyLift: { negative: 'flyDown', positive: 'flyUp', riseTime: 0.3, fallTime: 0.25 },
    },
  },

  /** The engine room. Rarely needs touching. */
  advanced: {
    physics: {
      /** Physics steps per second. The bike moves in slices this small however fast your screen refreshes, so it rides the same on every machine. */
      stepHz: 120,
      /** Most physics steps one frame may run. After a stall (for example the tab was in the background) it skips ahead instead of fast-forwarding. */
      maxStepsPerFrame: 8,
    },
    /** The free-fly camera (C), for looking around the map. */
    flyCamera: {
      /** Flying speed, metres per second. */
      speed: 25,
      /** Speed multiplier while Shift is held. */
      fastMultiplier: 4,
      /** How far the view turns per pixel of mouse movement. */
      mouseSensitivity: 0.0025,
    },
  },
}

export type Config = typeof config
export type BikeStats = Config['bike']

/** Earth's gravity, m/s². */
export const EARTH_GRAVITY = 9.81

/** The sliders' ranges. A * matches any name or list position in that place. */
export const configRanges: Ranges = {
  'bike.speed.topSpeed': [40, 200, 1],
  'bike.speed.secondsTo60': [0.5, 10, 0.1],
  'bike.speed.secondsToStopFrom60': [0.5, 6, 0.1],
  'bike.speed.coastSlowdown': [0, 30, 0.5],
  'bike.turning.tightestTurnSlow': [0.5, 15, 0.1],
  'bike.turning.tightestTurnFast': [5, 150, 1],
  'bike.turning.turnCurve': [0.5, 4, 0.05],
  'bike.turning.steeringResponse': [0, 0.5, 0.01],
  'bike.turning.grip': [0.3, 3, 0.05],
  'bike.turning.maxLean': [0, 60, 1],
  'bike.turning.leanResponse': [0, 0.6, 0.01],
  'bike.turning.airTurn': [0, 180, 1],
  'bike.suspension.frontTravel': [0.1, 0.5, 0.01],
  'bike.suspension.rearTravel': [0.1, 0.5, 0.01],
  'bike.suspension.sag': [0.05, 0.7, 0.01],
  'bike.suspension.stiffening': [0, 4, 0.05],
  'bike.suspension.bumpDamping': [0, 2, 0.01],
  'bike.suspension.reboundDamping': [0, 3, 0.01],
  'bike.suspension.bottomOutStiffness': [0, 200000, 1000],
  'bike.weight.total': [60, 400, 1],
  'bike.weight.height': [0, 1, 0.01],
  'bike.weight.forward': [-0.5, 0.5, 0.01],
  'bike.weight.noseDive': [0, 1, 0.01],
  'bike.build.wheelbase': [1, 2, 0.01],
  'bike.build.frontWheel': [0.2, 0.5, 0.01],
  'bike.build.rearWheel': [0.2, 0.5, 0.01],
  'jumps.gravity': [0.3, 2, 0.01],
  'camera.fov': [30, 110, 1],
  'controls.easing.*.riseTime': [0, 1, 0.01],
  'controls.easing.*.fallTime': [0, 1, 0.01],
  'advanced.physics.stepHz': [30, 240, 1],
  'advanced.physics.maxStepsPerFrame': [1, 20, 1],
}
