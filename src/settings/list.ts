import type { Setting } from './types'

/** The debug menu's tabs, left to right. */
export const TABS = ['Bike', 'Rider', 'Camera', 'Effects', 'Track', 'Terrain'] as const

/**
 * Every setting in the debug menu, in the order it's shown. The defaults
 * here are the game's real values: when a tuned value feels right, it gets
 * pasted back in here.
 */
export const SETTINGS: Setting[] = [
  // Bike: everything here changes how the bike rides, unless its note says "Looks only"
  {
    kind: 'slider', id: 'bike.topSpeed', name: 'Top speed', tab: 'Bike', section: 'Speed',
    min: 20, max: 160, step: 1, default: 140, unit: 'km/h',
    note: 'The fastest W takes you. Faster than this (down a hill), it slows back down to it.',
  },
  {
    kind: 'slider', id: 'bike.zeroToHundred', name: '0 to 100', tab: 'Bike', section: 'Speed',
    min: 1, max: 15, step: 0.1, default: 3, unit: 's',
    note: 'Seconds from standing to 100 km/h, holding W. The engine pulls hardest from a standstill and eases off near top speed.',
  },
  {
    kind: 'slider', id: 'bike.brakeToStop', name: 'Braking', tab: 'Bike', section: 'Speed',
    min: 0.5, max: 8, step: 0.1, default: 1.5, unit: 's',
    note: 'Seconds from 100 km/h to a stop, holding S: a steady slowdown, the same at any speed. S wins if W is held too.',
  },
  {
    kind: 'slider', id: 'bike.reverseSpeed', name: 'Reverse speed', tab: 'Bike', section: 'Speed',
    min: 1, max: 40, step: 1, default: 8, unit: 'km/h',
    note: 'Holding S from a stop, it backs up, no faster than this.',
  },
  {
    kind: 'slider', id: 'bike.coastToStop', name: 'Coasting', tab: 'Bike', section: 'Speed',
    min: 2, max: 30, step: 0.5, default: 6, unit: 's',
    note: 'Seconds to roll from 100 km/h to a stop with nothing held (engine braking).',
  },
  {
    kind: 'slider', id: 'bike.slopePull', name: 'Slope pull', tab: 'Bike', section: 'Speed',
    min: 0, max: 150, step: 5, default: 100, unit: '%',
    note: 'Worked out from the ground under the wheels: slopes slow you going up and speed you up going down. 100 is real gravity, 0 is none.',
  },
  {
    kind: 'slider', id: 'steer.slowCircle', name: 'Slow turn circle', tab: 'Bike', section: 'Steering',
    min: 1, max: 50, step: 0.5, default: 2, unit: 'm',
    note: 'Holding A or D, the radius of the circle you ride round, up to 30 km/h.',
  },
  {
    kind: 'slider', id: 'steer.fastCircle', name: 'Fast turn circle', tab: 'Bike', section: 'Steering',
    min: 5, max: 300, step: 1, default: 95, unit: 'm',
    note: 'The same at top speed. In between, it widens from the slow circle to this one.',
  },
  {
    kind: 'slider', id: 'steer.blend', name: 'Blend', tab: 'Bike', section: 'Steering',
    min: 0, max: 100, step: 5, default: 25, unit: '%',
    note: 'How the turn widens from 30 km/h to top speed. 0 widens it evenly with speed; higher keeps it tight longer and widens it late, near top speed.',
  },
  {
    kind: 'slider', id: 'steer.time', name: 'Steering speed', tab: 'Bike', section: 'Steering',
    min: 0, max: 0.5, step: 0.01, default: 0.12, unit: 's',
    note: 'How long A or D take to turn all the way, and to straighten up again when let go. 0 is instant.',
  },
  {
    kind: 'slider', id: 'bike.maxLean', name: 'Max lean', tab: 'Bike', section: 'Steering',
    min: 0, max: 60, step: 1, default: 33, unit: '°',
    note: 'Looks only. How far the bike leans into a turn: all the way at 1 g sideways, so tight, fast turns lean the most and gentle or slow ones less.',
  },
  {
    kind: 'slider', id: 'bike.travel', name: 'Suspension travel', tab: 'Bike', section: 'Handling',
    min: 0, max: 1, step: 0.05, default: 0.25, unit: 'm',
    note: 'Where the ground drops away (over a crest, off a lip), the suspension stretches this far to keep the wheels on it before the bike leaves the ground. More soaks up bigger bumps; kickers still launch you.',
  },
  {
    kind: 'slider', id: 'air.tilt', name: 'Air tilt', tab: 'Bike', section: 'Handling',
    min: 0, max: 360, step: 10, default: 160, unit: '°/s',
    note: 'In the air, the arrows tilt the bike this fast: down lifts the nose, up drops it. Let go and it holds that angle. All the way round is a flip.',
  },
  {
    kind: 'slider', id: 'air.turn', name: 'Air turn', tab: 'Bike', section: 'Handling',
    min: 0, max: 180, step: 1, default: 45, unit: '°/s',
    note: 'In the air, holding A or D turns the bike this fast; let go and it stops. Enough to line up a landing.',
  },
  {
    kind: 'slider', id: 'air.spinRate', name: 'Spin rate', tab: 'Bike', section: 'Handling',
    min: 0, max: 720, step: 10, default: 120, unit: '°/s',
    note: 'Holding A or D as you leave a jump, the bike spins this fast for as long as you keep holding it.',
  },
  {
    kind: 'slider', id: 'air.spinStop', name: 'Spin stop', tab: 'Bike', section: 'Handling',
    min: 0.05, max: 3, step: 0.05, default: 0.4, unit: 's',
    note: 'Let go of the spin and it slows to a full stop over this long. It won’t start again that jump: A or D then only turn it gently.',
  },
  {
    kind: 'slider', id: 'slide.angle', name: 'Slide angle', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 70, step: 1, default: 70, unit: '°',
    note: 'Hold Space with both wheels down to powerslide; steer and the rear swings out this far, so you slide round side-on. Let go of Space and it hooks back up. W in a slide just spins the rear wheel.',
  },
  {
    kind: 'slider', id: 'slide.kickOut', name: 'Kick-out time', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 0.6, step: 0.01, default: 0.1, unit: 's',
    note: 'How long the rear takes to swing out, and to hook back up.',
  },
  {
    kind: 'slider', id: 'slide.tighterTurn', name: 'Slide turn circle', tab: 'Bike', section: 'Powerslide',
    min: 20, max: 150, step: 5, default: 60, unit: '%',
    note: 'How big the slide’s circle is next to your normal turn at that speed: 60 is a circle 40% smaller.',
  },
  {
    kind: 'slider', id: 'slide.scrub', name: 'Speed scrub', tab: 'Bike', section: 'Powerslide',
    min: 0, max: 80, step: 1, default: 50, unit: 'km/h/s',
    note: 'Sliding loses this much speed every second, the same whatever the throttle is doing (the engine doesn’t push in a slide).',
  },
  {
    kind: 'slider', id: 'wheelie.angle', name: 'Wheelie angle', tab: 'Bike', section: 'Wheelie',
    min: 5, max: 80, step: 1, default: 35, unit: '°',
    note: 'Hold the down arrow (lean back) and W: the front comes up this far and stays there.',
  },
  {
    kind: 'slider', id: 'wheelie.liftTime', name: 'Lift time', tab: 'Bike', section: 'Wheelie',
    min: 0.05, max: 2, step: 0.01, default: 0.2, unit: 's',
    note: 'How long the front takes to come up, and to come back down.',
  },
  {
    kind: 'slider', id: 'wheelie.holdAbove', name: 'Hold above', tab: 'Bike', section: 'Wheelie',
    min: 0, max: 110, step: 1, default: 30, unit: 'km/h',
    note: 'Let go of W while still leaning back: faster than this the front stays up, slower it drops.',
  },
  {
    kind: 'slider', id: 'wheelie.accel', name: 'Acceleration', tab: 'Bike', section: 'Wheelie',
    min: 50, max: 150, step: 5, default: 120, unit: '%',
    note: 'How hard W speeds you up with the front up, next to normal. Above 100 is a boost.',
  },
  {
    kind: 'slider', id: 'wheelie.steering', name: 'Steering', tab: 'Bike', section: 'Wheelie',
    min: 0, max: 100, step: 5, default: 20, unit: '%',
    note: 'How much of your normal turn is left with the front up: 20 turns a fifth as tight (a circle 5 times as big). 0 can’t turn at all.',
  },
  {
    kind: 'slider', id: 'wheelie.bank', name: 'Bank', tab: 'Bike', section: 'Wheelie',
    min: 0, max: 50, step: 1, default: 20, unit: '°',
    note: 'Looks only. How far A or D tip the bike over on the rear wheel.',
  },
  {
    kind: 'slider', id: 'crash.minSpeed', name: 'Sideways speed', tab: 'Bike', section: 'Crash',
    min: 0, max: 60, step: 1, default: 15, unit: 'km/h',
    note: 'Landing slower than this never crashes you sideways, however you’re turned, even backwards: you just put a foot down.',
  },
  {
    kind: 'slider', id: 'crash.sideways', name: 'Sideways angle', tab: 'Bike', section: 'Crash',
    min: 10, max: 180, step: 5, default: 45, unit: '°',
    note: 'Landing faster than Sideways speed with the bike pointing more than this off the way it’s flying crashes you over sideways.',
  },
  {
    kind: 'slider', id: 'crash.noseTail', name: 'Nose/tail angle', tab: 'Bike', section: 'Crash',
    min: 10, max: 90, step: 5, default: 50, unit: '°',
    note: 'Landing more than this nose-down (over the front) or tail-down (looped out over the back), next to the ground you land on, crashes you, at any speed.',
  },
  {
    kind: 'slider', id: 'crash.getUp', name: 'Back up after', tab: 'Bike', section: 'Crash',
    min: 0.3, max: 5, step: 0.1, default: 1.5, unit: 's',
    note: 'How long you’re down after a crash. Then you’re back up right where you stopped, facing the way the bike points.',
  },
  {
    kind: 'line', id: 'line.forward', name: 'Forward', tab: 'Bike', section: 'Debug',
    default: false, color: 0x2ee66b,
    note: 'From the front wheel, the way the bike is going. Longer is faster.',
  },
  {
    kind: 'line', id: 'line.braking', name: 'Slowing down', tab: 'Bike', section: 'Debug',
    default: false, color: 0xff3b30,
    note: 'From the centre of mass, backwards. Longer is slowing harder (braking, coasting or sliding).',
  },
  {
    kind: 'line', id: 'line.steering', name: 'Steering', tab: 'Bike', section: 'Debug',
    default: false, color: 0x3aa8ff,
    note: 'From the front wheel, the way you are steering while you hold A or D.',
  },
  {
    kind: 'line', id: 'line.turnCircle', name: 'Turning circle', tab: 'Bike', section: 'Debug',
    default: true, color: 0xffd23a,
    note: 'On the ground, the circle the bike is riding round while it turns.',
  },
  {
    kind: 'line', id: 'line.turnReadout', name: 'Turn readout', tab: 'Bike', section: 'Debug',
    default: false,
    note: 'Bottom left: the turn radius, how fast the bike swings round, and whether it’s turning normally, powersliding or on a wheelie.',
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
    min: 30, max: 110, step: 1, default: 90, unit: '°',
    note: 'How wide the view is. Wider feels faster but stretches the edges. C switches views.',
  },
  {
    kind: 'slider', id: 'camera.lag', name: 'Swing lag', tab: 'Camera', section: 'All views',
    min: 0, max: 1.5, step: 0.01, default: 0.15, unit: 's',
    note: 'How long the views behind the bike take to swing round behind it after a turn. 0 is locked on.',
  },
  {
    kind: 'slider', id: 'camera.speedPull', name: 'Pull back with speed', tab: 'Camera', section: 'All views',
    min: 0, max: 50, step: 1, default: 30, unit: '%',
    note: 'How much further back the views behind the bike sit per 100 km/h, so speed feels faster.',
  },
  {
    kind: 'slider', id: 'camera.back', name: 'Distance', tab: 'Camera', section: 'Chase',
    min: 1, max: 12, step: 0.1, default: 4.7, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.up', name: 'Height', tab: 'Camera', section: 'Chase',
    min: 0.3, max: 6, step: 0.1, default: 5.5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.look', name: 'Looks at', tab: 'Camera', section: 'Chase',
    min: -1, max: 3, step: 0.05, default: 1.15, unit: 'm',
    note: 'How high above the bike the camera aims.',
  },
  {
    kind: 'slider', id: 'camera.close.back', name: 'Distance', tab: 'Camera', section: 'Close',
    min: 1, max: 12, step: 0.1, default: 1.9, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.close.up', name: 'Height', tab: 'Camera', section: 'Close',
    min: 0.3, max: 6, step: 0.1, default: 3.2, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.close.look', name: 'Looks at', tab: 'Camera', section: 'Close',
    min: -1, max: 3, step: 0.05, default: 1.25, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.high.back', name: 'Distance', tab: 'Camera', section: 'High',
    min: 1, max: 40, step: 0.5, default: 11.5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.high.up', name: 'Height', tab: 'Camera', section: 'High',
    min: 1, max: 30, step: 0.5, default: 14.5, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.high.look', name: 'Looks at', tab: 'Camera', section: 'High',
    min: -1, max: 3, step: 0.05, default: 1.85, unit: 'm',
  },
  {
    kind: 'slider', id: 'camera.helmet.fov', name: 'Field of view', tab: 'Camera', section: 'Helmet',
    min: 30, max: 120, step: 1, default: 80, unit: '°',
    note: 'Its own, usually wider than the other views, so the bars fit in.',
  },
  {
    kind: 'slider', id: 'camera.helmet.up', name: 'Eye height', tab: 'Camera', section: 'Helmet',
    min: -0.3, max: 0.8, step: 0.01, default: 0.22, unit: 'm',
    note: 'Above the rider’s head (he crouches and stands, and the camera goes with him).',
  },
  {
    kind: 'slider', id: 'camera.helmet.back', name: 'Eye back', tab: 'Camera', section: 'Helmet',
    min: -0.3, max: 1.5, step: 0.01, default: 0.47, unit: 'm',
    note: 'Behind his head (negative is in front). His helmet, chest and upper arms are hidden in this view, so the bars and his hands show.',
  },
  {
    kind: 'slider', id: 'camera.helmet.down', name: 'Look down', tab: 'Camera', section: 'Helmet',
    min: -10, max: 45, step: 1, default: 33, unit: '°',
  },
  {
    kind: 'slider', id: 'camera.helmet.lean', name: 'Lean with the bike', tab: 'Camera', section: 'Helmet',
    min: 0, max: 100, step: 5, default: 70, unit: '%',
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
    min: 1, max: 1000, step: 1, default: 8, unit: '',
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
    min: 3, max: 30, step: 0.5, default: 12, unit: 'm',
    note: 'How wide the packed dirt is, edge to edge.',
  },
  {
    kind: 'slider', id: 'track.wobble', name: 'Wobble', tab: 'Track', section: 'Track',
    min: 0, max: 45, step: 1, default: 45, unit: '%',
    note: 'How far each point of the track gets nudged off its square’s middle, as a share of the square. 0 runs dead straight through the middles. Neighbouring points lean the same way, so it sways rather than jitters.',
  },
  {
    kind: 'slider', id: 'track.rounding', name: 'Corner rounding', tab: 'Track', section: 'Track',
    min: 0, max: 100, step: 1, default: 100, unit: '%',
    note: 'How much the grid’s square corners get rounded off. 0 turns sharp at every square’s middle; more makes wider, flowing corners (and a slightly shorter lap).',
  },
  {
    kind: 'slider', id: 'track.relax', name: 'Relax', tab: 'Track', section: 'Track',
    min: 0, max: 500, step: 10, default: 160, unit: 'passes',
    note: 'The last step of all, after the jumps: smooths the whole line, softening kinks. Straights stay straight; corners pull in a little. Each pass reaches about a metre further, so it takes a lot of them to smooth a big bend.',
  },
  {
    kind: 'slider', id: 'terrain.seed', name: 'Seed', tab: 'Terrain', section: 'Hills',
    min: 1, max: 1000, step: 1, default: 8, unit: '',
    note: 'Picks which hills you get. The same seed always makes the same hills, whatever the track does.',
  },
  {
    kind: 'slider', id: 'terrain.height', name: 'Height', tab: 'Terrain', section: 'Hills',
    min: 0, max: 50, step: 0.5, default: 15, unit: 'm',
    note: 'How far up or down the ground rolls at most. 0 is flat.',
  },
  {
    kind: 'slider', id: 'terrain.width', name: 'Width', tab: 'Terrain', section: 'Hills',
    min: 10, max: 1000, step: 10, default: 80, unit: 'm',
    note: 'How far apart the big swells are, from one rise to the next.',
  },
  {
    kind: 'slider', id: 'terrain.detail', name: 'Detail', tab: 'Terrain', section: 'Hills',
    min: 0, max: 100, step: 5, default: 5, unit: '%',
    note: 'How much the smaller bumps add on top of the big swells. 0 is smooth rolling swells only.',
  },
  {
    kind: 'slider', id: 'terrain.smoothing', name: 'Smoothing', tab: 'Terrain', section: 'Track in the hills',
    min: 0, max: 100, step: 1, default: 33, unit: 'm',
    note: 'The track rises and falls with the hills, its ups and downs evened out over this far. 0 follows every bump; more makes long, gentle rolls.',
  },
  {
    kind: 'slider', id: 'terrain.camber', name: 'Camber', tab: 'Terrain', section: 'Track in the hills',
    min: 0, max: 100, step: 5, default: 80, unit: '%',
    note: 'How much of the hillside’s sideways tilt the track keeps. 0 is flat across, like a road dug into the hill; 100 leans with the ground underneath.',
  },
  {
    kind: 'slider', id: 'terrain.banks', name: 'Banks', tab: 'Terrain', section: 'Track in the hills',
    min: 0, max: 40, step: 1, default: 8, unit: 'm',
    note: 'Past the track’s edges, the ground blends back into the hills over this far. 0 is a hard step at the edge.',
  },
  {
    kind: 'line', id: 'terrain.poles', name: 'Hill tops', tab: 'Terrain', section: 'Debug',
    default: false, color: 0xff3bd4,
    note: 'A tall pole on top of each big swell, the hills Width sets the size of (not the smaller bumps Detail adds), so you can see how far apart they are.',
  },
  {
    kind: 'line', id: 'terrain.contours', name: 'Contours', tab: 'Terrain', section: 'Debug',
    default: false, color: 0xffffff,
    note: 'Lines on the ground like on a map, each at one height: white at 0 m, orange every step higher, blue every step lower. A hill shows as orange rings, a dip as blue ones; close together is steep.',
  },
  {
    kind: 'slider', id: 'contour.step', name: 'Contour every', tab: 'Terrain', section: 'Debug',
    min: 0.25, max: 10, step: 0.25, default: 1, unit: 'm',
    note: 'How many metres of height between one contour line and the next.',
  },
  {
    kind: 'slider', id: 'jump.amount', name: 'Amount', tab: 'Track', section: 'Jumps',
    min: 0, max: 20, step: 1, default: 4, unit: '',
    note: 'How many jumps it tries to place, picked at random (from the seed) from the spots they fit, one per spot. If there isn’t room for that many, it places as many as there’s room for (the Track readout shows how many fit).',
  },
  {
    kind: 'slider', id: 'jump.spacing', name: 'Spacing', tab: 'Track', section: 'Jumps',
    min: 0, max: 100, step: 5, default: 75, unit: '%',
    note: 'How evenly the jumps spread round the lap. 100 spaces them as evenly as the spots allow; 0 is pure random (they often bunch up).',
  },
  {
    kind: 'slider', id: 'jump.squares', name: 'Squares needed', tab: 'Track', section: 'Jumps',
    min: 3, max: 20, step: 1, default: 6, unit: 'squares',
    note: 'How many squares in a straight line a jump needs: run-up, face, flight and roll-out. 5 squares of 18 m fits a normal jump at top speed.',
  },
  {
    kind: 'slider', id: 'jump.height', name: 'Height', tab: 'Track', section: 'Jumps',
    min: 0.5, max: 15, step: 0.1, default: 2, unit: 'm',
    note: 'How high each kicker’s lip is. 3.6 m at 15° is a good normal jump; 15 m at 30° is ridiculous big air.',
  },
  {
    kind: 'slider', id: 'jump.angle', name: 'Angle', tab: 'Track', section: 'Jumps',
    min: 5, max: 30, step: 1, default: 10, unit: '°',
    note: 'How steep the face is. The face is as long as it takes to reach the Height (the Track readout shows it), its lip at the end of the orange square; the back drops twice as steep. On the ground it’s as wide as the track; the lip is 2 m narrower (1 m on a track under 10 m wide), so the sides are steep triangles.',
  },
  {
    kind: 'slider', id: 'split.count', name: 'Splits', tab: 'Track', section: 'Splits',
    min: 1, max: 20, step: 1, default: 4, unit: 'stretches',
    note: 'How many stretches the lap is cut into, about the same length each, from the start line round to it again. The lines between them are checkpoints, for timing a lap.',
  },
  {
    kind: 'slider', id: 'split.pull', name: 'Pull to roll-outs', tab: 'Track', section: 'Splits',
    min: 0, max: 100, step: 5, default: 100, unit: '%',
    note: 'How far a split may move off its even place to land in the middle of a jump’s roll-out (flat, straight and clear), as a share of half a stretch. 0 keeps them evenly spaced. Each roll-out takes one split at most; with no jumps, they just stay even.',
  },
  {
    kind: 'line', id: 'split.lines', name: 'Splits', tab: 'Track', section: 'Debug',
    default: true, color: 0xffffff,
    note: 'A line across the track at each split, the start line green.',
  },
  {
    kind: 'line', id: 'jump.spots', name: 'Jump spots', tab: 'Track', section: 'Debug',
    default: false,
    note: 'The placed jumps, square by square: run-up yellow, face orange, flight red, roll-out blue. The track runs dead straight through the yellow, orange and blue. Every other square a jump would fit is faint white.',
  },
  {
    kind: 'line', id: 'track.grid', name: 'Grid', tab: 'Track', section: 'Debug',
    default: false, color: 0xffffff,
    note: 'The grid’s squares on the ground, the ones the loop runs through filled in (the first one green). Best seen from above: fly up in Free roam (C).',
  },
  {
    kind: 'line', id: 'track.path', name: 'Loop', tab: 'Track', section: 'Debug',
    default: false, color: 0xff3bd4,
    note: 'The loop through the squares’ middles, in riding order.',
  },
  {
    kind: 'line', id: 'track.centre', name: 'Spline', tab: 'Track', section: 'Debug',
    default: false, color: 0x3ad6ff,
    note: 'The smooth line the track follows, down its middle, with a ring round its tightest corner.',
  },
  {
    kind: 'line', id: 'track.info', name: 'Track readout', tab: 'Track', section: 'Debug',
    default: false,
    note: 'Top left: how long a lap is, the tightest corner’s radius, how many jumps there are room for, and how many splits landed on roll-outs.',
  },
]
