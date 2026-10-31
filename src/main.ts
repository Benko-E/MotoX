import * as THREE from 'three'
import { config, configChoices, configRanges, EARTH_GRAVITY, TRACK_WAYS } from './config'
import configSource from './config.ts?raw'
import { Input } from './core/input'
import { FixedStepLoop } from './core/loop'
import { freeride } from './maps/freeride'
import { mapRanges } from './maps/ranges'
import mapTypesSource from './maps/types.ts?raw'
import { Bike } from './physics/bike'
import { CrashWatcher } from './physics/crashes'
import { initPhysics, PhysicsWorld } from './physics/world'
import { AiRider } from './ai/aiRider'
import { FollowTrack, FreeRoam, PickBehaviour } from './ai/orders'
import { BikeView } from './render/bikeView'
import { GREEN } from './render/livery'
import { NameTag, riderName } from './render/nameTag'
import { GroundEffects } from './render/groundEffects'
import { HelmetCamera } from './render/helmetCamera'
import { JumpLanes } from './render/jumpLanes'
import { TrackDebug } from './render/trackDebug'
import { ClearingDebug } from './render/clearingDebug'
import { LandDebug } from './render/landDebug'
import { BigAirDebug } from './render/bigAirDebug'
import { LetterLanes } from './render/letterLanes'
import { LetterView } from './render/letterView'
import { nextCameraMode } from './render/cameraViews'
import { ChaseCamera } from './render/chaseCamera'
import { FlyCamera } from './render/flyCamera'
import { createScene } from './render/scene'
import { TerrainView } from './render/terrainView'
import { generateTerrain } from './terrain/generate'
import { heightAt } from './terrain/heightfield'
import { flattestSpotNear } from './terrain/startingSpot'
import { Hud } from './hud/hud'
import { LetterRow } from './hud/letterRow'
import { Speedometer } from './hud/speedometer'
import { HelpTimer } from './ui/helpCard'
import { readNotes } from './ui/notes'
import { GhostRider, type GhostRide } from './world/ghostRider'
import { LetterHunt } from './world/letterHunt'
import { featureJumps, type JumpSpot } from './world/jumps'
import { placeLettersGradually, sliceTurn, type LetterSpot, type Ride } from './world/letterSpots'
import { createTuningPanel, type PanelSection } from './ui/tuningPanel'

/** With the free-fly camera, B drops the bike this far ahead of the camera. */
const DROP_AHEAD = 6
/** With the chase camera, B lifts the bike this high and lets go. */
const DROP_HEIGHT = 6
/** The bike starts on the flattest ground within this far of the map's spawn point, metres. */
const SPAWN_SEARCH = 60

await initPhysics()

const map = freeride
const view = createScene(document.getElementById('app')!, config)
/** The readout of numbers, shown with the tuning panel. */
const readoutBox = document.getElementById('hud')!
const banner = document.getElementById('banner')!
/** A short note after a sloppy landing, and how long it has left on screen, seconds. */
const landingNote = document.getElementById('landing')!
const LANDING_NOTE_TIME = 1.5
let landingNoteLeft = 0
let landingsSeen = 0
/** The controls card at the start: up until you press a key, gone a few seconds into riding. */
const help = document.getElementById('help')!
/** What's on screen while you ride: placed by config.hud. */
const hud = new Hud(document.body, config.hud)
hud.add('speed', new Speedometer())
hud.add('letters', new LetterRow(config.letters))
const helpTimer = new HelpTimer(6, 1.5)
const input = new Input(config.controls, window)

const physics = new PhysicsWorld()
const terrainView = new TerrainView(view.scene, view.renderer)
let field = generateTerrain(map, config.jumps.gravity * EARTH_GRAVITY)
const groundAt = (x: number, z: number) => heightAt(field, x, z)

const bike = new Bike(physics, config.bike, config.advanced.bikeBody)
const crashes = new CrashWatcher(physics, bike, config.crashes, config.advanced.fallingOver, config.jumps.landing)
const bikeView = new BikeView(view.scene, bike)
const groundEffects = new GroundEffects(
  view.scene,
  bike,
  bikeView,
  config.effects,
  (x, z) => physics.groundHeightAt(x, z, bike.body) ?? groundAt(x, z),
  () => config.jumps.gravity * EARTH_GRAVITY,
)

/** The jumps the map's features built (the track's kickers), and a debug view of them. */
let jumps: JumpSpot[] = []
const jumpLanes = new JumpLanes(view.scene, jumps, groundAt, config.jumpGuide)
/** The track's debug view: its lines, kickers, straights and flights drawn on the ground, and labels saying what each is. */
const trackDebug = new TrackDebug(view.scene, groundAt, config.trackDebug)
/** The clearing's debug view: its middle, radius, real edge and blend. */
const clearingDebug = new ClearingDebug(view.scene, groundAt, config.clearingDebug)
/** The land's debug view: the edge wall, the spawn point and start, and the size of the hills. */
const landDebug = new LandDebug(view.scene, groundAt, config.landDebug)
/** The big air's debug view: each one's run-in, kicker, landing, edges and flight. */
const bigAirDebug = new BigAirDebug(view.scene, groundAt, config.bigAirDebug)
/** Each frame the letters' ghost rides get this long to work on, milliseconds. */
const LETTER_BUDGET = 5

/** The letters M O T O X over jumps the ghost bike has ridden (only while they're shown). */
let letterSpots: LetterSpot[] = []
const letterView = new LetterView(view.scene, config.letters)
const letterLanes = new LetterLanes(view.scene, groundAt, config.letters)
/** Which of them you've grabbed. */
const hunt = new LetterHunt(config.letters)
let letterSearch: Generator<void, LetterSpot[]> | null = null
let ghost: GhostRider | null = null
/** Every ride the ghost has done on this map, so handing the letters out again needn't ride them again. */
let ghostRides = new Map<JumpSpot, GhostRide>()
const rideOnce: Ride = (jump) => {
  const done = ghostRides.get(jump)
  if (done) return done
  return (function* () {
    const ride = yield* ghost!.rideGradually(jump)
    ghostRides.set(jump, ride)
    return ride
  })()
}

/** Hands the letters out again (a new map, or their settings changed), if they're shown. */
function placeLetters() {
  if (!config.letters.show) return
  letterSearch = placeLettersGradually(
    jumps,
    {
      spread: config.letters.spread,
      turn: sliceTurn(map.hills.seed, config.letters.each.length),
      letters: config.letters.each.map(({ difficulty, along, grabSize, airGap }) => ({ difficulty, along, grabSize, airGap })),
      groundAt,
    },
    rideOnce,
  )
}

function rebuildTerrain() {
  field = generateTerrain(map, config.jumps.gravity * EARTH_GRAVITY)
  terrainView.show(field)
  physics.setGround(field)
  jumps = featureJumps(field, config.jumps.gravity * EARTH_GRAVITY)
  jumpLanes.replace(jumps)
  trackDebug.show(field, map.track, map.clearing, jumps)
  clearingDebug.show(field, map.clearing)
  landDebug.show(field, map, SPAWN_SEARCH)
  bigAirDebug.show(field, map, jumps)
  ghost?.dispose()
  ghost = new GhostRider(field, config)
  ghostRides = new Map()
  letterSearch = null
  letterSpots = []
  letterView.show(letterSpots)
  letterLanes.show(letterSpots)
  hunt.reset()
  placeLetters()
}
rebuildTerrain()
const start = flattestSpotNear(field, map.spawn.x, map.spawn.z, SPAWN_SEARCH)
bike.placeOnGround(start.x, start.z, map.spawn.heading)

const fly = new FlyCamera(view.renderer.domElement, config, groundAt)
const startGround = groundAt(start.x, start.z)
fly.place(
  { x: start.x + 4, y: startGround + 2, z: start.z + 5 },
  { x: start.x, y: startGround + 0.5, z: start.z },
)

/** The AI riders: bikes like yours, ridden by the computer, starting near you, one for each in config.ai.riders, each doing their job. */
const riderNames = () => config.ai.riders.map((me) => me.name)
const riders: AiRider[] = []
const riderViews: BikeView[] = []
/** Their tyre tracks, dirt and tyre shadows, like yours, and their names over their heads. */
const riderEffects: GroundEffects[] = []
const nameTags: NameTag[] = []
for (const [i, me] of config.ai.riders.entries()) {
  const roam = new FreeRoam(me.freeRoam, () => jumps)
  const follow = new FollowTrack(() => map.track.way, () => field.trackLine, () => jumps)
  const rider = new AiRider(physics, config, me, groundAt, new PickBehaviour(() => (me.job === 'followTrack' ? follow : roam)))
  rider.bike.placeOnGround(start.x + 8 * (i + 1), start.z + 6, map.spawn.heading)
  riders.push(rider)
  const riderView = new BikeView(view.scene, rider.bike, GREEN)
  riderViews.push(riderView)
  nameTags.push(new NameTag(view.scene, riderName(i, riderNames())))
  riderEffects.push(
    new GroundEffects(
      view.scene,
      rider.bike,
      riderView,
      config.effects,
      (x, z) => physics.groundHeightAt(x, z, rider.bike.body) ?? groundAt(x, z),
      () => config.jumps.gravity * EARTH_GRAVITY,
    ),
  )
}
/** Who the camera watches: 0 you, 1 the first AI rider, and so on. */
let watched = 0
const watchedBike = () => (watched === 0 ? bike : riders[watched - 1].bike)
const watchedView = () => (watched === 0 ? bikeView : riderViews[watched - 1])

const chase = new ChaseCamera(config, groundAt)
const helmet = new HelmetCamera()
/** Which camera is showing: a chase view (config.camera.views), 'helmet', or 'fly'. C goes round them. */
let cameraMode = 'chase'
/** Flying the free camera: the keys fly it instead of riding. */
let flying = false

// The panel, in groups: your bike first (open), then the riding rules, the
// map with a folder per feature (its settings, and its debug view if it has
// one: new features go there), the AI riders, the screen and the rest.
// Hovering a slider shows the comment written above it in the file.
const configNotes = readNotes(configSource)
const mapNotes = readNotes(mapTypesSource)
type ConfigPart = keyof typeof config
const fromConfig = (name: ConfigPart, place: string[] = [], extra: Partial<PanelSection> = {}): PanelSection => ({
  title: name,
  place,
  file: 'config',
  target: config[name],
  path: name,
  ranges: configRanges,
  choices: configChoices,
  notes: configNotes,
  open: ['bike', 'bike.speed', 'bike.turning'],
  ...extra,
})
// Rebuilding the whole map takes a moment, so wait until the slider is let go.
const rebuildMap = (_path: string, last: boolean) => {
  if (!last) return
  rebuildTerrain()
  crashes.recover()
  for (const rider of riders) {
    rider.orders.clear() // his jumps were on the old map
    rider.crashes.recover()
  }
}
const fromMap = (title: string, part: 'clearing' | 'track' | 'bigAir' | '', place: string[], extra: Partial<PanelSection> = {}): PanelSection => ({
  title,
  place,
  file: 'map',
  target: part ? map[part] : map,
  path: part,
  ranges: mapRanges,
  choices: { 'track.way': TRACK_WAYS },
  notes: mapNotes,
  onChange: rebuildMap,
  ...extra,
})
const sections: PanelSection[] = [
  fromConfig('bike'),
  // big air is shaped for the gravity it's jumped under
  fromConfig('jumps', ['riding rules'], { onChange: (path, last) => path === 'gravity' && rebuildMap(path, last) }),
  fromConfig('crashes', ['riding rules']),
  fromMap('land', '', ['map'], { exclude: ['clearing', 'track', 'bigAir'] }),
  fromConfig('landDebug', ['map', 'land'], { title: 'debug: land lines' }),
  fromMap('clearing', 'clearing', ['map', 'features']),
  fromConfig('clearingDebug', ['map', 'features', 'clearing'], { title: 'debug: clearing lines' }),
  fromMap('track', 'track', ['map', 'features']),
  fromConfig('trackDebug', ['map', 'features', 'track'], { title: 'debug: track lines', shownWhen: () => map.track.show }),
  fromConfig('jumpGuide', ['map', 'features', 'track'], { title: 'debug: kicker lanes', shownWhen: () => map.track.show }),
  fromMap('big air', 'bigAir', ['map', 'features']),
  fromConfig('bigAirDebug', ['map', 'features', 'big air'], { title: 'debug: big air lines', shownWhen: () => map.bigAir.count > 0 }),
  fromConfig('letters', ['map', 'features'], {
    title: 'letters (off until big air)',
    // these decide which jumps the letters go on (a letter that needs air only fits a jump that floats it high enough)
    onChange: (path, last) => {
      if (last && (path === '' || path === 'show' || path === 'spread' || /\.(difficulty|along|grabSize|airGap)$/.test(path))) placeLetters()
    },
  }),
  fromConfig('ai', [], { title: 'AI riders', target: config.ai.riders, path: 'ai.riders' }), // a folder each
  fromConfig('camera', ['screen']),
  fromConfig('hud', ['screen']),
  fromConfig('effects', ['screen']),
  fromConfig('controls'),
  fromConfig('advanced'),
]
// anything added to config.ts and not placed above still shows, at the end
for (const name of Object.keys(config) as ConfigPart[]) if (!sections.some((section) => section.file === 'config' && section.path.split('.')[0] === name)) sections.push(fromConfig(name))
const panel = createTuningPanel(sections, {
    title: 'suspension (live, 0 = fully out, 1 = fully in)',
    source: {
      get front() {
        return bike.wheels[0].compressionRatio
      },
      get rear() {
        return bike.wheels[1].compressionRatio
      },
    },
    min: 0,
    max: 1,
})
input.onPress('togglePanel', () => {
  // The readout of numbers comes and goes with the panel. Opening them gives
  // the mouse back, so the sliders can be used straight away.
  const open = panel.toggle()
  readoutBox.hidden = !open
  if (open) document.exitPointerLock()
})

// Keys that act on the bike are handled at the start of the next physics step.
let resetPressed = false
let dropPressed = false
input.onPress('reset', () => (resetPressed = true))
input.onPress('dropBike', () => (dropPressed = true))
for (let i = 0; i < 4; i++) {
  input.onPress(`watch${i + 1}`, () => {
    if (i > riders.length || i === watched) return
    watched = i
    chase.snap()
    helmet.snap()
  })
}
input.onPress('toggleCamera', () => {
  cameraMode = nextCameraMode(config, cameraMode)
  flying = cameraMode === 'fly'
  if (flying) {
    // start flying from exactly where the camera is, looking the same way
    const ahead = view.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(view.camera.position)
    fly.place(view.camera.position, ahead)
  } else if (cameraMode === 'helmet') helmet.snap()
  else {
    chase.view = cameraMode
    chase.snap()
  }
})

const loop = new FixedStepLoop({
  get stepHz() {
    return config.advanced.physics.stepHz
  },
  get maxStepsPerFrame() {
    return config.advanced.physics.maxStepsPerFrame
  },
  step(dt) {
    input.update(dt)
    if (resetPressed) crashes.recover() // back upright, and out of a crash straight away
    if (dropPressed && crashes.crashed) crashes.recover()
    if (dropPressed && flying) {
      const at = fly.pointAhead(DROP_AHEAD)
      bike.place(at.x, Math.max(at.y, groundAt(at.x, at.z) + 1.5), at.z, fly.heading)
    } else if (dropPressed) {
      const at = bike.body.translation()
      bike.place(at.x, at.y + DROP_HEIGHT, at.z, bike.heading)
    }
    resetPressed = dropPressed = false

    // The same keys fly the camera or ride the bike, depending on which camera is showing.
    bike.controls.throttle = flying ? 0 : input.axis('throttle')
    bike.controls.brake = flying ? 0 : input.axis('brake')
    bike.controls.steer = flying ? 0 : input.axis('steer')
    bike.controls.lean = flying ? 0 : input.axis('lean')
    bike.controls.powerslide = !flying && input.isDown('powerslide')
    bike.update(dt)
    for (const rider of riders) rider.beforeStep(dt)
    physics.step(dt, config.jumps.gravity * EARTH_GRAVITY)
    bike.record()
    crashes.step(dt)
    for (const rider of riders) rider.afterStep(dt)
    if (flying) fly.step(dt, input)
    stepsThisSecond++
  },
})

// For measuring and debugging from the browser console: `moto.bike`, `moto.config`, ...
Object.assign(window, {
  moto: {
    ...{ config, map, view, fly, chase, bike, crashes, physics, input, rebuildTerrain, riders },
    terrain: () => field,
    jumps: () => jumps,
    letters: () => letterSpots,
    hunt,
    simulate: (seconds: number, fps?: number) => simulate(seconds, fps),
  },
})

// Counts what happened over the last second, so the readout can show that
// physics runs at a steady rate whatever the screen does.
let stepsThisSecond = 0
let framesThisSecond = 0
let secondStartedAt = performance.now()
let rates = ''
let lastFrameAt = performance.now()
const lookPoint = new THREE.Vector3()
const headAt = new THREE.Vector3()
const bikeForward = new THREE.Vector3()

/** Moves the game on by one screen frame of `frameTime` seconds and draws it. */
function showFrame(frameTime: number) {
  loop.advance(frameTime)
  bikeView.update(loop.alpha, frameTime)
  riderViews.forEach((riderView, i) => {
    riderView.update(loop.alpha, frameTime)
    nameTags[i].update(riderView.headPosition(headAt))
  })
  groundEffects.update(Math.min(frameTime, 0.1))
  for (const effects of riderEffects) effects.update(Math.min(frameTime, 0.1))
  if (letterSearch) {
    const until = performance.now() + LETTER_BUDGET
    let step = letterSearch.next()
    while (!step.done && performance.now() < until) step = letterSearch.next()
    if (step.done) {
      letterSpots = step.value
      letterView.show(letterSpots)
      letterLanes.show(letterSpots)
      hunt.reset()
      letterSearch = null
    }
  }
  hunt.update(letterSpots, bike.body.translation(), Math.min(frameTime, 0.1))
  letterView.update(Math.min(frameTime, 0.1), hunt.grabbed)
  letterLanes.update(hunt.grabbed, Math.min(frameTime, 0.1))
  jumpLanes.update(Math.min(frameTime, 0.1))
  trackDebug.update(view.camera.position)
  clearingDebug.update(view.camera.position)
  landDebug.update(view.camera.position)
  bigAirDebug.update(view.camera.position)
  hud.update({ speed: watchedBike().speed, topSpeed: config.bike.speed.topSpeed, letters: hunt.grabbed }, frameTime) // the speed of whoever you watch
  const wheelClicks = input.takeWheel()
  if (wheelClicks && !flying && cameraMode !== 'helmet') chase.zoomBy(wheelClicks)
  if (flying) fly.apply(view.camera, loop.alpha)
  else if (cameraMode === 'helmet') {
    helmet.update(view.camera, Math.min(frameTime, 0.1), watchedView().headPosition(headAt), watchedView().forward(bikeForward))
  } else chase.update(view.camera, Math.min(frameTime, 0.1), watchedView().position, watchedView().heading, watchedBike().speed)
  view.camera.getWorldDirection(lookPoint).multiplyScalar(20).add(view.camera.position)
  view.focusShadows(lookPoint)
  view.render()
  if (!readoutBox.hidden) readoutBox.textContent = readout().join('\n')
  if (help.style.display !== 'none') {
    help.style.opacity = String(helpTimer.update(frameTime, input.anyHeld))
    if (helpTimer.shown === 0) help.style.display = 'none'
  }
  banner.style.display = crashes.crashed ? 'block' : 'none'
  if (crashes.landings !== landingsSeen) {
    landingsSeen = crashes.landings
    const last = crashes.lastLanding
    if (last && last.sloppiness > 0) {
      landingNote.innerHTML = `SLOPPY LANDING<small>−${last.speedLost.toFixed(0)} km/h</small>`
      landingNoteLeft = LANDING_NOTE_TIME
    }
  }
  landingNoteLeft = Math.max(landingNoteLeft - frameTime, 0)
  landingNote.style.display = landingNoteLeft > 0 ? 'block' : 'none'
  landingNote.style.opacity = String(Math.min(landingNoteLeft / 0.4, 1)) // fades out over the last 0.4 s
  if (crashes.crashed) {
    banner.innerHTML = `CRASH: ${crashes.reason}<small>back up in ${Math.max(crashes.timeLeft, 0).toFixed(1)} s, or press R</small>`
  }
}

/**
 * For testing from the console: runs `seconds` of game time right now, as
 * `fps` frames, whether or not the window is visible (hidden pages get no
 * animation frames). Keys held via dispatched events still count.
 */
function simulate(seconds: number, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) showFrame(1 / fps)
}

function frame(now: number) {
  const frameTime = (now - lastFrameAt) / 1000
  lastFrameAt = now
  showFrame(frameTime)

  framesThisSecond++
  if (now - secondStartedAt >= 1000) {
    const seconds = (now - secondStartedAt) / 1000
    rates = `screen ${Math.round(framesThisSecond / seconds)} fps   physics ${Math.round(stepsThisSecond / seconds)} steps/s`
    stepsThisSecond = 0
    framesThisSecond = 0
    secondStartedAt = now
  }

  requestAnimationFrame(frame)
}

/** What an AI rider is doing, for the readout. */
function orderText(rider: AiRider): string {
  const order = rider.orders.current
  const speed = `${(rider.bike.speed * 3.6).toFixed(0)} km/h`
  if (rider.crashes.crashed) return `crashed (${rider.crashes.reason}), ${speed}`
  if (!order) return `no orders, ${speed}`
  if (order.kind === 'rideTo') return `riding to ${order.x.toFixed(0)}, ${order.z.toFixed(0)}, ${speed}`
  if (order.kind === 'takeJump') return `going for a jump (${order.jump.airtime.toFixed(1)} s of air), ${speed}`
  return `cruising, ${speed}`
}

/** How the last landing went, for the readout. */
function landingReadout(): string {
  const last = crashes.lastLanding
  if (!last) return 'none yet'
  if (last.sloppiness === 0) return 'clean'
  return `sloppy ${(last.sloppiness * 100).toFixed(0)}%   cost ${last.speedLost.toFixed(0)} km/h`
}

function readout(): string[] {
  const degrees = (radians: number) => `${((radians * 180) / Math.PI).toFixed(1)}°`.padStart(6)
  const bar = (amount: number, length = 10) => '▮'.repeat(Math.round(amount * length)).padEnd(length, '▯')
  const wheel = (name: string, i: number) => {
    const w = bike.wheels[i]
    const state = w.bottomedOut ? 'BOTTOM' : w.onGround ? 'ground' : 'air   '
    return `${name}  ${state}  ${bar(w.compressionRatio)} ${(w.compressionRatio * 100).toFixed(0).padStart(3)}%`
  }
  const { throttle, brake, steer } = bike.controls
  const sides = (amount: number) =>
    amount < 0 ? bar(-amount, 5).split('').reverse().join('') + '|▯▯▯▯▯' : '▯▯▯▯▯|' + bar(amount, 5)
  const steering = sides(steer)
  const air = bike.airtime > 0 ? `${bike.airtime.toFixed(2)} s` : 'on the ground'
  const keys = flying
    ? [
        'free-fly camera (C: back to the chase view)',
        'W A S D fly   E / Q up / down   Shift fast',
        'click  look with the mouse (Esc stops), or drag',
        'B   drop the bike ahead of the camera',
      ]
    : [
        'W throttle   S brake   A / D steer   ↑ / ↓ lean forward / back',
        'Space + steer: powerslide (hold, or tap to kick the rear out)',
        'in the air: lean to spin   ↓ + throttle: wheelie   ↑ + brake: stoppie',
        `C camera views (now: ${cameraMode})   scroll wheel: zoom`,
        'R   bike upright again   B   drop the bike from 6 m',
        `1 2 watch you or the AI rider (now: ${watched === 0 ? 'you' : riderName(watched - 1, riderNames())})`,
      ]
  return [
    'MotoX · readout (` hides it)',
    rates,
    '',
    `speed     ${(bike.speed * 3.6).toFixed(1).padStart(5)} km/h`,
    ...riders.map((rider, i) => `${riderName(i, riderNames()).padEnd(10)}${orderText(rider)}`),
    `throttle  ${bar(throttle)}   brake ${bar(brake, 5)}`,
    `steer     ${steering}  tightest turn here ${bike.turnRadius.toFixed(1)} m`,
    `lean      ${sides(bike.controls.lean)}  (back | forward)`,
    `powerslide ${bar(bike.powersliding, 5)}  rear out ${degrees(Math.abs(bike.slideAngle))}`,
    wheel('front', 0),
    wheel('rear ', 1),
    `airtime   ${air}   last jump ${bike.lastAirtime.toFixed(2)} s   crashes ${crashes.count}`,
    `landing   ${landingReadout()}`,
    `lean ${degrees(bike.lean)}   pitch ${degrees(bike.pitch)}   rear slide ${bike.slide.toFixed(2)} m/s`,
    '',
    ...keys,
    '`   settings and this readout (hover a slider to see what it does)',
  ]
}

requestAnimationFrame(frame)
