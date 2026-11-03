import type { Setting } from './types'

/** The debug menu's tabs, left to right. */
export const TABS = ['Bike', 'Rider', 'Camera', 'Effects', 'Track', 'Temporary'] as const

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
    note: 'Seconds from standing to 100 km/h, holding W. A real 450 does it in about 3. The engine bites hardest from a standstill and runs out of push near top speed.',
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
    kind: 'slider', id: 'bike.slopePull', name: 'Slope pull', tab: 'Bike', section: 'Speed',
    min: 0, max: 150, step: 5, default: 100, unit: '%',
    note: 'How hard slopes pull the bike back going up and push it on going down. 100 is real gravity, 0 is none.',
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
    kind: 'slider', id: 'slide.angle', name: 'Slide angle', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 70, step: 1, default: 50, unit: '°',
    note: 'Hold Space and steer: how far the rear swings out at full steering, so you slide round side-on.',
  },
  {
    kind: 'slider', id: 'slide.kickOut', name: 'Kick-out time', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 0.6, step: 0.01, default: 0.07, unit: 's',
    note: 'How long the rear takes to swing out once you press Space.',
  },
  {
    kind: 'slider', id: 'slide.hookUp', name: 'Hook-up time', tab: 'Bike', section: 'Powerslide',
    min: 0.05, max: 1.5, step: 0.01, default: 0.2, unit: 's',
    note: 'How long the rear takes to hook back up after you let go.',
  },
  {
    kind: 'slider', id: 'slide.tighterTurn', name: 'Slide turn circle', tab: 'Bike', section: 'Powerslide',
    min: 20, max: 150, step: 5, default: 60, unit: '%',
    note: 'How big the slide turns compared to your normal turn at that speed: 60 is a circle 40% smaller.',
  },
  {
    kind: 'slider', id: 'slide.scrub', name: 'Speed scrub', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 80, step: 1, default: 45, unit: 'km/h/s',
    note: 'How much speed sliding scrubs off at full steering. The throttle earns some back.',
  },
  {
    kind: 'slider', id: 'slide.minSpeed', name: 'Slowest slide', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 60, step: 1, default: 15, unit: 'km/h',
    note: 'Slower than this, Space does nothing.',
  },
  {
    kind: 'slider', id: 'wheelie.angle', name: 'Wheelie angle', tab: 'Bike', section: 'Wheelie',
    min: 5, max: 80, step: 1, default: 35, unit: '°',
    note: 'Hold the down arrow (lean back) and W: the front comes up this far and stays there.',
  },
  {
    kind: 'slider', id: 'wheelie.liftTime', name: 'Lift time', tab: 'Bike', section: 'Wheelie',
    min: 0.05, max: 2, step: 0.01, default: 0.2, unit: 's',
  },
  {
    kind: 'slider', id: 'wheelie.dropTime', name: 'Drop time', tab: 'Bike', section: 'Wheelie',
    min: 0.05, max: 2, step: 0.01, default: 0.2, unit: 's',
  },
  {
    kind: 'slider', id: 'wheelie.holdAbove', name: 'Hold above', tab: 'Bike', section: 'Wheelie',
    min: 0, max: 110, step: 1, default: 30, unit: 'km/h',
    note: 'Let go of W while still leaning back: faster than this the front stays up, slower it drops.',
  },
  {
    kind: 'slider', id: 'wheelie.accel', name: 'Acceleration', tab: 'Bike', section: 'Wheelie',
    min: 50, max: 150, step: 5, default: 120, unit: '%',
    note: 'Speeding up with the front up, next to normal. Real bikes do no better (the rear wheel drives either way); above 100 is an arcade boost.',
  },
  {
    kind: 'slider', id: 'wheelie.turnCircle', name: 'Turn circle', tab: 'Bike', section: 'Wheelie',
    min: 5, max: 100, step: 1, default: 40, unit: 'm',
    note: 'The front wheel can\u2019t steer in the air: A/D bank the bike and it turns, no tighter than this.',
  },
  {
    kind: 'slider', id: 'wheelie.bank', name: 'Bank', tab: 'Bike', section: 'Wheelie',
    min: 0, max: 50, step: 1, default: 20, unit: '°',
    note: 'How far A/D tip the bike over on the rear wheel. Only looks.',
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

  // Rider: only looks, never how the bike rides
  {
    kind: 'slider', id: 'rider.sitBelow', name: 'Sits below', tab: 'Rider', section: 'Standing',
    min: 0, max: 80, step: 1, default: 15, unit: 'km/h',
    note: 'Slower than this he sits down. In the air he always stands.',
  },
  {
    kind: 'slider', id: 'rider.standAbove', name: 'Stands above', tab: 'Rider', section: 'Standing',
    min: 0, max: 120, step: 1, default: 35, unit: 'km/h',
    note: 'Faster than this he stands right up on the pegs; in between, part way.',
  },
  {
    kind: 'slider', id: 'rider.standTime', name: 'Stand-up time', tab: 'Rider', section: 'Standing',
    min: 0, max: 1.5, step: 0.01, default: 0.3, unit: 's',
    note: 'How long he takes to stand up or sit down.',
  },
  {
    kind: 'slider', id: 'rider.hardestLanding', name: 'Hardest landing', tab: 'Rider', section: 'Landing soak',
    min: 1, max: 30, step: 0.5, default: 9, unit: 'm/s',
    note: 'Hitting the ground this fast (straight into it) crouches him all the way; softer landings crouch less. Landing along a down slope barely counts.',
  },
  {
    kind: 'slider', id: 'rider.crouchDepth', name: 'Crouch depth', tab: 'Rider', section: 'Landing soak',
    min: 0, max: 150, step: 5, default: 100, unit: '%',
    note: 'How deep "all the way" is. 0 turns the landing crouch off.',
  },
  {
    kind: 'slider', id: 'rider.soakDown', name: 'Crouch time', tab: 'Rider', section: 'Landing soak',
    min: 0, max: 0.5, step: 0.01, default: 0.05, unit: 's',
    note: 'How quickly he sinks into the crouch when he lands.',
  },
  {
    kind: 'slider', id: 'rider.soakBack', name: 'Spring-back time', tab: 'Rider', section: 'Landing soak',
    min: 0.05, max: 2, step: 0.05, default: 0.3, unit: 's',
    note: 'How long he takes to come back up out of it.',
  },
  {
    kind: 'slider', id: 'rider.shiftFull', name: 'Full shift at', tab: 'Rider', section: 'Weight shift',
    min: 1, max: 30, step: 0.5, default: 10, unit: 'm/s²',
    note: 'Speeding up or slowing down this hard shifts his weight all the way. 10 is about 1 g; your bike pulls about 15 off the line, brakes about 18.',
  },
  {
    kind: 'slider', id: 'rider.leanBack', name: 'Lean back', tab: 'Rider', section: 'Weight shift',
    min: 0, max: 100, step: 5, default: 60, unit: '%',
    note: 'How far he leans back speeding up (and riding downhill), at most.',
  },
  {
    kind: 'slider', id: 'rider.leanForward', name: 'Lean forward', tab: 'Rider', section: 'Weight shift',
    min: 0, max: 100, step: 5, default: 80, unit: '%',
    note: 'How far he leans forward over the bars slowing down (braking, climbing), at most.',
  },
  {
    kind: 'slider', id: 'rider.shiftTime', name: 'Shift time', tab: 'Rider', section: 'Weight shift',
    min: 0, max: 1, step: 0.01, default: 0.2, unit: 's',
  },
  {
    kind: 'slider', id: 'rider.footOutBelow', name: 'Foot out below', tab: 'Rider', section: 'Foot out',
    min: 0, max: 100, step: 1, default: 40, unit: 'km/h',
    note: 'In turns slower than this he puts the inside foot out (it goes back on the peg by 10 km/h faster).',
  },
  {
    kind: 'slider', id: 'rider.footOutFrom', name: 'From steering', tab: 'Rider', section: 'Foot out',
    min: 0, max: 95, step: 5, default: 20, unit: '%',
    note: 'Only steering harder than this (a share of full A or D): all the way out at full steering.',
  },
  {
    kind: 'slider', id: 'rider.headTurn', name: 'Head turn', tab: 'Rider', section: 'Looking',
    min: 0, max: 60, step: 1, default: 40, unit: '°',
    note: 'How far he turns his head to look into a turn at full steering. His shoulders already twist with the bars.',
  },

  // Camera
  {
    kind: 'slider', id: 'camera.fov', name: 'Field of view', tab: 'Camera', section: 'All views',
    min: 30, max: 110, step: 1, default: 65, unit: '°',
    note: 'How wide the view is. Wider feels faster but stretches the edges. C switches views.',
  },
  {
    kind: 'slider', id: 'camera.lag', name: 'Swing lag', tab: 'Camera', section: 'All views',
    min: 0, max: 1.5, step: 0.01, default: 0.25, unit: 's',
    note: 'How long the views behind the bike take to swing round behind it after a turn. 0 is locked on.',
  },
  {
    kind: 'slider', id: 'camera.speedPull', name: 'Pull back with speed', tab: 'Camera', section: 'All views',
    min: 0, max: 50, step: 1, default: 0, unit: '%',
    note: 'How much further back the views behind the bike sit per 100 km/h, so speed feels faster.',
  },
  {
    kind: 'slider', id: 'camera.back', name: 'Distance', tab: 'Camera', section: 'Chase camera',
    min: 1, max: 12, step: 0.1, default: 12, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.up', name: 'Height', tab: 'Camera', section: 'Chase camera',
    min: 0.3, max: 6, step: 0.1, default: 5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.look', name: 'Looks at', tab: 'Camera', section: 'Chase camera',
    min: -1, max: 3, step: 0.05, default: 0.5, unit: 'm',
    note: 'How high above the bike the camera aims.',
  },
  {
    kind: 'slider', id: 'camera.close.back', name: 'Distance', tab: 'Camera', section: 'Close camera',
    min: 1, max: 12, step: 0.1, default: 3.4, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.close.up', name: 'Height', tab: 'Camera', section: 'Close camera',
    min: 0.3, max: 6, step: 0.1, default: 3.5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.close.look', name: 'Looks at', tab: 'Camera', section: 'Close camera',
    min: -1, max: 3, step: 0.05, default: 1.5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.high.back', name: 'Distance', tab: 'Camera', section: 'High camera',
    min: 1, max: 40, step: 0.5, default: 20, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.high.up', name: 'Height', tab: 'Camera', section: 'High camera',
    min: 1, max: 30, step: 0.5, default: 15.5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.high.look', name: 'Looks at', tab: 'Camera', section: 'High camera',
    min: -1, max: 3, step: 0.05, default: -0.3, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.helmet.fov', name: 'Field of view', tab: 'Camera', section: 'Helmet camera',
    min: 30, max: 120, step: 1, default: 80, unit: '°',
    note: 'Its own, usually wider than the other views, so the bars fit in.',
  },
  {
    kind: 'slider', id: 'camera.helmet.up', name: 'Eye height', tab: 'Camera', section: 'Helmet camera',
    min: -0.3, max: 0.8, step: 0.01, default: 0.1, unit: 'm',
    note: 'Above the rider’s head (he crouches and stands, and the camera goes with him).',
  },
  {
    kind: 'slider', id: 'camera.helmet.back', name: 'Eye back', tab: 'Camera', section: 'Helmet camera',
    min: -0.3, max: 1.5, step: 0.01, default: 0.25, unit: 'm',
    note: 'Behind his head (negative is in front). His helmet, chest and upper arms are hidden in this view, so the bars and his hands show.',
  },
  {
    kind: 'slider', id: 'camera.helmet.down', name: 'Look down', tab: 'Camera', section: 'Helmet camera',
    min: -10, max: 45, step: 1, default: 15, unit: '°',
  },
  {
    kind: 'slider', id: 'camera.helmet.lean', name: 'Lean with the bike', tab: 'Camera', section: 'Helmet camera',
    min: 0, max: 100, step: 5, default: 50, unit: '%',
    note: '100 tips the horizon all the way with the bike, 0 keeps it level.',
  },
  {
    kind: 'slider', id: 'camera.flySpeed', name: 'Speed', tab: 'Camera', section: 'Free roam',
    min: 2, max: 100, step: 1, default: 25, unit: 'm/s',
    note: 'W A S D fly, Space up, Q down, hold the right mouse button to look around. The bike waits.',
  },
  {
    kind: 'slider', id: 'camera.flyFast', name: 'Shift speeds up', tab: 'Camera', section: 'Free roam',
    min: 1, max: 10, step: 0.5, default: 4, unit: '×',
  },
  {
    kind: 'slider', id: 'camera.flyLook', name: 'Mouse look', tab: 'Camera', section: 'Free roam',
    min: 0.02, max: 0.5, step: 0.01, default: 0.15, unit: '°/px',
  },
  // Effects: only looks, never how the bike rides
  {
    kind: 'slider', id: 'effects.wheelspinUntil', name: 'Wheelspin until', tab: 'Effects', section: 'Dirt',
    min: 0, max: 80, step: 1, default: 25, unit: 'km/h',
    note: 'Below this speed, W spins the rear tyre up in the dirt: it throws dirt back and leaves a dark track. The slower, the harder.',
  },
  {
    kind: 'slider', id: 'effects.carving', name: 'Carving', tab: 'Effects', section: 'Dirt',
    min: 0, max: 1, step: 0.05, default: 0.5, unit: '',
    note: 'How hard the tyres scrub turning at the grip limit, flinging dirt to the outside of the turn. 0 is none.',
  },
  {
    kind: 'slider', id: 'effects.dirtAmount', name: 'Amount', tab: 'Effects', section: 'Dirt',
    min: 0, max: 300, step: 1, default: 80, unit: '/s',
    note: 'Clods thrown per second by a tyre scrubbing flat out.',
  },
  {
    kind: 'slider', id: 'effects.dirtThrow', name: 'Throw', tab: 'Effects', section: 'Dirt',
    min: 0, max: 15, step: 0.1, default: 5, unit: 'm/s',
  },
  {
    kind: 'slider', id: 'effects.dirtSize', name: 'Clod size', tab: 'Effects', section: 'Dirt',
    min: 0.02, max: 0.2, step: 0.01, default: 0.07, unit: 'm',
  },
  {
    kind: 'slider', id: 'effects.trackLasts', name: 'Lasts', tab: 'Effects', section: 'Tyre tracks',
    min: 1, max: 120, step: 1, default: 30, unit: 's',
    note: 'Seconds a track takes to fade away.',
  },
  {
    kind: 'slider', id: 'effects.trackWidth', name: 'Width', tab: 'Effects', section: 'Tyre tracks',
    min: 0.05, max: 0.4, step: 0.01, default: 0.14, unit: 'm',
  },
  {
    kind: 'slider', id: 'effects.trackRolling', name: 'Rolling', tab: 'Effects', section: 'Tyre tracks',
    min: 0, max: 1, step: 0.01, default: 0.15, unit: '',
    note: 'How dark the track is where the tyre just rolls, 0 (none) to 1 (black).',
  },
  {
    kind: 'slider', id: 'effects.trackScrubbing', name: 'Scrubbing', tab: 'Effects', section: 'Tyre tracks',
    min: 0, max: 1, step: 0.01, default: 0.6, unit: '',
    note: 'How dark it gets where the tyre spins, skids or carves.',
  },

  // Track
  {
    kind: 'slider', id: 'track.seed', name: 'Seed', tab: 'Track', section: 'Layout',
    min: 1, max: 1000, step: 1, default: 1, unit: '',
    note: 'Picks which loop you get. The same seed always lays out the same loop.',
  },
  {
    kind: 'slider', id: 'track.wide', name: 'Grid width', tab: 'Track', section: 'Layout',
    min: 6, max: 60, step: 1, default: 30, unit: 'squares',
    note: 'How many squares wide the grid is (along x). The loop starts as a ring round it.',
  },
  {
    kind: 'slider', id: 'track.deep', name: 'Grid depth', tab: 'Track', section: 'Layout',
    min: 6, max: 60, step: 1, default: 14, unit: 'squares',
    note: 'How many squares deep the grid is (along z).',
  },
  {
    kind: 'slider', id: 'track.square', name: 'Square size', tab: 'Track', section: 'Layout',
    min: 5, max: 60, step: 1, default: 18, unit: 'm',
    note: 'How big each square is. Two bits of track side by side always have at least a square of grass between.',
  },
  {
    kind: 'slider', id: 'track.bites', name: 'Bites', tab: 'Track', section: 'Layout',
    min: 0, max: 300, step: 1, default: 20, unit: '',
    note: 'How many times a straight bit of the ring gets pushed in (or out) a square. 0 is a plain ring.',
  },
  {
    kind: 'slider', id: 'track.deepen', name: 'Deep bites', tab: 'Track', section: 'Layout',
    min: 0, max: 100, step: 1, default: 75, unit: '%',
    note: 'The chance each push carries on pushing the last bit further in. High makes a few deep bites, low lots of shallow wobbles.',
  },
  {
    kind: 'slider', id: 'track.widest', name: 'Widest bite', tab: 'Track', section: 'Layout',
    min: 3, max: 20, step: 1, default: 16, unit: 'squares',
    note: 'How wide a pushed bit can be. Each one is between 3 and this.',
  },
  {
    kind: 'slider', id: 'track.width', name: 'Track width', tab: 'Track', section: 'Track',
    min: 3, max: 30, step: 0.5, default: 8, unit: 'm',
    note: 'How wide the packed dirt is, edge to edge.',
  },
  {
    kind: 'slider', id: 'track.wobble', name: 'Wobble', tab: 'Track', section: 'Track',
    min: 0, max: 45, step: 1, default: 25, unit: '%',
    note: 'How far each point of the track gets nudged off its square’s middle, as a share of the square. 0 runs dead straight through the middles. Neighbouring points lean the same way, so it sways rather than jitters.',
  },
  {
    kind: 'slider', id: 'track.rounding', name: 'Corner rounding', tab: 'Track', section: 'Track',
    min: 0, max: 100, step: 1, default: 75, unit: '%',
    note: 'How much the grid’s square corners get rounded off. 0 turns sharp at every square’s middle; more makes wider, flowing corners (and a slightly shorter lap).',
  },
  {
    kind: 'line', id: 'track.grid', name: 'Grid', tab: 'Track', section: 'Debug lines',
    default: false, color: 0xffffff,
    note: 'The grid’s squares on the ground, the ones the loop runs through filled in (the first one green). Best seen from above: fly up in Free roam (C).',
  },
  {
    kind: 'line', id: 'track.path', name: 'Loop', tab: 'Track', section: 'Debug lines',
    default: false, color: 0xff3bd4,
    note: 'The loop through the squares’ middles, in riding order.',
  },
  {
    kind: 'line', id: 'track.centre', name: 'Spline', tab: 'Track', section: 'Debug lines',
    default: false, color: 0x3ad6ff,
    note: 'The smooth line the track follows, down its middle, with a ring round its tightest corner.',
  },
  {
    kind: 'line', id: 'track.info', name: 'Track readout', tab: 'Track', section: 'Debug lines',
    default: false,
    note: 'Top left: how long a lap is, and the tightest corner’s radius.',
  },

  // Temporary: things here for trying out, not to stay
  {
    kind: 'slider', id: 'ramp.angle', name: 'Ramp angle', tab: 'Temporary', section: 'Ramp',
    min: 5, max: 60, step: 1, default: 15, unit: '°',
    note: 'How steep the run-up rises.',
  },
  {
    kind: 'slider', id: 'ramp.height', name: 'Height', tab: 'Temporary', section: 'Ramp',
    min: 0.3, max: 60, step: 0.1, default: 3.6, unit: 'm',
  },
  {
    kind: 'slider', id: 'ramp.width', name: 'Width', tab: 'Temporary', section: 'Ramp',
    min: 1, max: 40, step: 0.5, default: 6, unit: 'm',
  },
  {
    kind: 'slider', id: 'ramp.top', name: 'Flat top', tab: 'Temporary', section: 'Ramp',
    min: 0, max: 60, step: 0.5, default: 12, unit: 'm',
    note: 'How much flat top there is after the lip, before the back side drops. 0 is a pointy kicker.',
  },
  {
    kind: 'slider', id: 'ramp.landing', name: 'Back side angle', tab: 'Temporary', section: 'Ramp',
    min: 5, max: 60, step: 1, default: 45, unit: '°',
    note: 'How steep the back side drops: land on it for a smooth landing.',
  },
  {
    kind: 'slider', id: 'ramp.distance', name: 'Distance', tab: 'Temporary', section: 'Ramp',
    min: 5, max: 150, step: 1, default: 33, unit: 'm',
    note: 'How far ahead of the start (R) the run-up begins: more room to build speed.',
  },
  {
    kind: 'line', id: 'ramp.arcs', name: 'Flight arcs', tab: 'Temporary', section: 'Ramp',
    default: true, color: 0xff2a2a,
    note: 'Where you fly off each lip riding straight up the middle: at top speed, and 10 and 20 km/h slower, with each airtime.',
  },
]
