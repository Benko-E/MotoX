import type { Setting } from './types'

/** The debug menu's tabs, left to right. */
export const TABS = ['Bike', 'Camera', 'Temporary'] as const

/**
 * Every setting in the debug menu, in the order it's shown. The defaults
 * here are the game's real values: when a tuned value feels right, it gets
 * pasted back in here.
 */
export const SETTINGS: Setting[] = [
  // Bike
  {
    kind: 'slider', id: 'bike.topSpeed', name: 'Top speed', tab: 'Bike', section: 'Speed',
    min: 20, max: 160, step: 1, default: 110, unit: 'km/h',
    note: 'A real 450 motocross bike tops out around 140 to 150.',
  },
  {
    kind: 'slider', id: 'bike.zeroToHundred', name: '0 to 100', tab: 'Bike', section: 'Speed',
    min: 1, max: 15, step: 0.1, default: 3, unit: 's',
    note: 'Seconds from standing to 100 km/h, holding W. A real 450 does it in about 3. Below 100 top speed, it tops out sooner.',
  },
  {
    kind: 'slider', id: 'bike.coastToStop', name: 'Coasting', tab: 'Bike', section: 'Speed',
    min: 2, max: 30, step: 0.5, default: 6, unit: 's',
    note: 'Seconds to roll from 100 km/h to a stop with nothing held (engine braking).',
  },
  {
    kind: 'slider', id: 'bike.brakeToStop', name: 'Braking', tab: 'Bike', section: 'Speed',
    min: 0.5, max: 8, step: 0.1, default: 1.5, unit: 's',
    note: 'Seconds from 100 km/h to a stop, holding S. Lower brakes harder.',
  },
  {
    kind: 'slider', id: 'bike.frontWheelLock', name: 'Front wheel lock', tab: 'Bike', section: 'Steering',
    min: 10, max: 80, step: 1, default: 60, unit: '°',
    note: 'How far the front wheel turns either way, holding A or D. Sets the tightest turn, at low speed: 45° turns in a 1.5 m circle. A real dirt bike turns about 40 to 45.',
  },
  {
    kind: 'slider', id: 'bike.grip', name: 'Grip', tab: 'Bike', section: 'Steering',
    min: 0.3, max: 8, step: 0.1, default: 3, unit: 'g',
    note: 'How hard the tyres can push sideways. Sets how wide you turn at speed: the faster, the wider. Real tyres on dirt manage about 1.',
  },
  {
    kind: 'slider', id: 'bike.maxLean', name: 'Max lean', tab: 'Bike', section: 'Lean (looks only)',
    min: 0, max: 60, step: 1, default: 40, unit: '°',
    note: 'How far the bike leans into a turn when the tyres are at their grip; gentler turns lean less. Only drawn: it does not change how the bike turns.',
  },
  {
    kind: 'line', id: 'line.forward', name: 'Forward', tab: 'Bike', section: 'Debug lines',
    default: false, color: 0x2ee66b,
    note: 'From the front wheel, the way the bike is going. Longer is faster.',
  },
  {
    kind: 'line', id: 'line.braking', name: 'Slowing down', tab: 'Bike', section: 'Debug lines',
    default: false, color: 0xff3b30,
    note: 'From the centre of mass, backwards. Longer is slowing harder (braking or coasting).',
  },
  {
    kind: 'line', id: 'line.steering', name: 'Steering', tab: 'Bike', section: 'Debug lines',
    default: false, color: 0x3aa8ff,
    note: 'From the front wheel, the way you are steering while you hold A or D. At speed the wheel itself turns less, where grip limits it.',
  },
  {
    kind: 'line', id: 'line.turnCircle', name: 'Turning circle', tab: 'Bike', section: 'Debug lines',
    default: false, color: 0xffd23a,
    note: 'On the ground, the circle the bike is riding round while it turns.',
  },
  {
    kind: 'line', id: 'line.turnReadout', name: 'Turn readout', tab: 'Bike', section: 'Debug lines',
    default: false,
    note: 'Bottom left: the turn radius, how fast the bike swings round, and whether the front wheel or grip is limiting it.',
  },

  // Camera
  {
    kind: 'slider', id: 'camera.back', name: 'Distance', tab: 'Camera', section: 'Chase camera',
    min: 1, max: 12, step: 0.1, default: 8, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.up', name: 'Height', tab: 'Camera', section: 'Chase camera',
    min: 0.3, max: 6, step: 0.1, default: 5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.lag', name: 'Swing lag', tab: 'Camera', section: 'Chase camera',
    min: 0, max: 1.5, step: 0.01, default: 0.25, unit: 's',
    note: 'How long the camera takes to swing round behind the bike after a turn. 0 is locked on.',
  },
  // Temporary: things here for trying out, not to stay
  {
    kind: 'slider', id: 'ramp.angle', name: 'Ramp angle', tab: 'Temporary', section: 'Ramp',
    min: 5, max: 60, step: 1, default: 25, unit: '°',
    note: 'How steep the run-up rises.',
  },
  {
    kind: 'slider', id: 'ramp.height', name: 'Height', tab: 'Temporary', section: 'Ramp',
    min: 0.3, max: 8, step: 0.1, default: 2, unit: 'm',
  },
  {
    kind: 'slider', id: 'ramp.width', name: 'Width', tab: 'Temporary', section: 'Ramp',
    min: 1, max: 20, step: 0.5, default: 6, unit: 'm',
  },
  {
    kind: 'slider', id: 'ramp.top', name: 'Flat top', tab: 'Temporary', section: 'Ramp',
    min: 0, max: 30, step: 0.5, default: 4, unit: 'm',
    note: 'How much flat top there is after the lip, before the back side drops. 0 is a pointy kicker.',
  },
  {
    kind: 'slider', id: 'ramp.landing', name: 'Back side angle', tab: 'Temporary', section: 'Ramp',
    min: 5, max: 60, step: 1, default: 20, unit: '°',
    note: 'How steep the back side drops: land on it for a smooth landing.',
  },
  {
    kind: 'slider', id: 'ramp.distance', name: 'Distance', tab: 'Temporary', section: 'Ramp',
    min: 5, max: 150, step: 1, default: 40, unit: 'm',
    note: 'How far ahead of the start (R) the run-up begins: more room to build speed.',
  },
  {
    kind: 'line', id: 'ramp.arcs', name: 'Flight arcs', tab: 'Temporary', section: 'Ramp',
    default: true, color: 0xff2a2a,
    note: 'Where you fly off each lip riding straight up the middle: at top speed, and 10 and 20 km/h slower, with each airtime.',
  },
]
