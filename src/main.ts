import * as THREE from 'three'
import { BikeModel, WHEELBASE, WHEEL_RADIUS } from './bike/bikeModel'
import { CameraRig, VIEW_NAMES } from './camera/cameraRig'
import { RiderMotion } from './bike/riderMotion'
import { RideLines } from './debug/rideLines'
import { JumpMarks } from './debug/jumpMarks'
import { SplitLines } from './debug/splitLines'
import { TrackGrid } from './debug/trackGrid'
import { GroundEffects } from './effects/groundEffects'
import { MIN_AIRTIME, Ride, type Input, type Tuning } from './ride'
import { SETTINGS, TABS } from './settings/list'
import type { LineSetting } from './settings/types'
import { SettingsStore } from './settings/store'
import { buildMenu } from './ui/buildMenu'
import { layOut, squareCentre } from './track/layout'
import { findJumpSpots, jumpRoom, placeJumps, straightSquares } from './track/jumpSpots'
import { Kickers } from './track/kickers'
import { KickerView } from './track/kickerView'
import { LapTimer, type LapEvent } from './track/lapTimer'
import { placeSplits } from './track/splits'
import { Track } from './track/track'
import { TrackView } from './track/trackView'
import { Terrain } from './world/terrain'
import { TerrainView } from './world/terrainView'

/** Seconds the bike takes to lean over into a turn, and back up. */
const LEAN_TIME = 0.15
/** Seconds the bike takes to pitch to a new slope, or to the way it's flying. */
const PITCH_TIME = 0.06
/** Seconds the camera's name stays on screen after C switches it. */
const VIEW_NAME_SHOWN = 1.5
/** Seconds the airtime stays on screen after landing. */
const AIRTIME_SHOWN = 3
/** Seconds the bike takes to fall over in a crash. */
const FALL_TIME = 0.45
/** Seconds a split or lap time stays on screen. */
const LAP_FLASH_SHOWN = 3
const DEG = Math.PI / 180

/** The browser's storage, or none where it's blocked (settings then last only this visit). */
let storage: Storage | null = null
try {
  storage = localStorage
} catch {
  // private window or blocked site data
}
const store = new SettingsStore(SETTINGS, storage)
buildMenu(SETTINGS, TABS, store, storage)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.getElementById('app')!.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9cc3e6)
scene.fog = new THREE.Fog(0x9cc3e6, 80, 400)
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000)

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5a40, 1.4))
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 60 })
scene.add(sun, sun.target)

// The ground: dirt with a faint grid, so you can see yourself moving.
const tile = document.createElement('canvas')
tile.width = tile.height = 256
const paint = tile.getContext('2d')!
paint.fillStyle = '#a8834f'
paint.fillRect(0, 0, 256, 256)
for (let i = 0; i < 1400; i++) {
  paint.fillStyle = Math.random() < 0.5 ? 'rgba(80,55,25,0.18)' : 'rgba(230,200,150,0.15)'
  paint.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4)
}
paint.strokeStyle = 'rgba(60,40,20,0.35)'
paint.lineWidth = 3
paint.strokeRect(0, 0, 256, 256)
const dirt = new THREE.CanvasTexture(tile)
dirt.wrapS = dirt.wrapT = THREE.RepeatWrapping
dirt.colorSpace = THREE.SRGBColorSpace
dirt.anisotropy = renderer.capabilities.getMaxAnisotropy()
const dirtMaterial = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 })
const terrainView = new TerrainView(scene, dirtMaterial)

/** The hills, with the track laid in, and the kickers on the jumps: built with the track. */
let terrain: Terrain
let kickers: Kickers
/** How high the hills are at (x, z), under the kickers. */
const hillsAt = (x: number, z: number) => terrain.heightAt(x, z)
/** How high the ground is at (x, z): the hills, and the kickers on them. */
const groundAt = (x: number, z: number) => terrain.heightAt(x, z) + kickers.heightAt(x, z)

// The track: laid out on a grid from the Track tab's seed, a spline drawn
// through it, the hills from the Terrain tab with the track laid into them,
// and packed dirt painted onto the ground along it.
const lineColor = (id: string) => SETTINGS.find((s): s is LineSetting => s.id === id)!.color!
const trackGrid = new TrackGrid(scene, lineColor('track.grid'), lineColor('track.path'), lineColor('track.centre'))
const trackView = new TrackView(dirtMaterial, renderer.capabilities.getMaxAnisotropy())
const kickerView = new KickerView(scene, renderer.capabilities.getMaxAnisotropy())
const trackInfo = document.getElementById('trackInfo')!
const jumpMarks = new JumpMarks(scene)
const splitLines = new SplitLines(scene, lineColor('split.lines'))
const lapTimer = new LapTimer()
const cones: THREE.Mesh[] = []
let track: Track
const layOutTrack = () => {
  const layout = layOut({
    seed: store.get('track.seed'),
    wide: store.get('track.wide'),
    deep: store.get('track.deep'),
    square: store.get('track.square'),
    bites: store.get('track.bites'),
    deepen: store.get('track.deepen') / 100,
    widest: store.get('track.widest'),
  })
  // walk the loop for spots a jump fits, place some, and straighten the track under them
  const need = store.get('jump.squares')
  const spots = findJumpSpots(layout, need)
  const jumps = placeJumps(spots, store.get('jump.amount'), need, store.get('track.seed'), store.get('jump.spacing') / 100, layout.squares.length)
  track = new Track(
    layout,
    { width: store.get('track.width'), wobble: store.get('track.wobble') / 100, rounding: store.get('track.rounding') / 100, relax: store.get('track.relax') },
    straightSquares(jumps),
  )
  terrain = new Terrain(
    { seed: store.get('terrain.seed'), height: store.get('terrain.height'), width: store.get('terrain.width'), detail: store.get('terrain.detail') / 100 },
    track,
    { smoothing: store.get('terrain.smoothing'), camber: store.get('terrain.camber') / 100, banks: store.get('terrain.banks') },
  )
  terrainView.build(terrain)
  trackGrid.build(layout, track, hillsAt)
  trackView.build(track)
  kickers = Kickers.onJumps(layout, track, jumps, { height: store.get('jump.height'), angle: store.get('jump.angle') * DEG, width: store.get('track.width') })
  kickerView.build(kickers, hillsAt)
  jumpMarks.build(layout, spots, jumps, hillsAt)
  // the lap cut into stretches, the splits drawn to the middle of the jumps' roll-outs where they're near
  const rollOuts = jumps.map(({ at }) => {
    const { x, z } = squareCentre(layout, layout.squares[at[at.length - 1]])
    return track.nearest(x, z)
  })
  const splits = placeSplits(track, store.get('split.count'), rollOuts, store.get('split.pull') / 100)
  splitLines.build(track, splits, hillsAt)
  lapTimer.setGates(track, splits)
  const onRollOuts = splits.filter((at) => rollOuts.includes(at)).length
  for (const cone of cones) {
    cone.visible = track.distanceTo(cone.position.x, cone.position.z) > track.shape.width / 2 + 2
    cone.position.y = groundAt(cone.position.x, cone.position.z)
  }
  trackInfo.textContent = `lap ${Math.round(track.length)} m\ntightest corner ${track.tightest.radius.toFixed(1)} m\njumps ${jumps.length} (room for ${jumpRoom(spots, need)})
kicker face ${kickers.face.toFixed(1)} m, back ${kickers.back.toFixed(1)} m
splits ${splits.length} (${onRollOuts} on roll-outs)`
}
const showTrack = () => {
  trackGrid.showGrid = store.isOn('track.grid')
  trackGrid.showPath = store.isOn('track.path')
  trackGrid.showCentre = store.isOn('track.centre')
  trackInfo.hidden = !store.isOn('track.info')
  jumpMarks.visible = store.isOn('jump.spots')
  splitLines.visible = store.isOn('split.lines')
}

// Cones scattered about, something to ride round (none on the track).
const cone = new THREE.ConeGeometry(0.25, 0.7, 12).translate(0, 0.35, 0)
const orange = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })
for (let i = 0; i < 120; i++) {
  const mesh = new THREE.Mesh(cone, orange)
  const r = 8 + Math.random() * 150
  const a = Math.random() * Math.PI * 2
  mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
  if (Math.abs(mesh.position.x) < 12 && mesh.position.z < 0) continue
  mesh.castShadow = true
  scene.add(mesh)
  cones.push(mesh)
}
layOutTrack()
showTrack()
store.onChange((id) => {
  if (id === 'track.grid' || id === 'track.path' || id === 'track.centre' || id === 'track.info' || id === 'jump.spots' || id === 'split.lines') showTrack()
  else if (['track.', 'jump.', 'split.', 'terrain.'].some((tab) => id.startsWith(tab))) layOutTrack()
})

const bike = new BikeModel()
scene.add(bike.root)
const ride = new Ride()
/** Back to the start of the track, standing still. */
const toStart = () => {
  const start = track.start()
  Object.assign(ride, { ...start, y: groundAt(start.x, start.z), vy: 0, speed: 0, airborne: false, crash: null, airYaw: 0 })
  lapTimer.reset()
}
toStart()
const lines = new RideLines(scene, SETTINGS, store)
const riderMotion = new RiderMotion({
  get sitBelow() { return store.get('rider.sitBelow') },
  get standAbove() { return store.get('rider.standAbove') },
  get standTime() { return store.get('rider.standTime') },
  get hardestLanding() { return store.get('rider.hardestLanding') },
  get crouchDepth() { return store.get('rider.crouchDepth') / 100 },
  get soakDown() { return store.get('rider.soakDown') },
  get soakBack() { return store.get('rider.soakBack') },
  get shiftFull() { return store.get('rider.shiftFull') },
  get leanBack() { return store.get('rider.leanBack') / 100 },
  get leanForward() { return store.get('rider.leanForward') / 100 },
  get shiftTime() { return store.get('rider.shiftTime') },
  get footOutBelow() { return store.get('rider.footOutBelow') },
  get footOutFrom() { return store.get('rider.footOutFrom') / 100 },
  get headTurn() { return store.get('rider.headTurn') },
})
const effects = new GroundEffects(
  scene,
  {
    get lasts() { return store.get('effects.trackLasts') },
    get width() { return store.get('effects.trackWidth') },
    get rolling() { return store.get('effects.trackRolling') },
    get skidding() { return store.get('effects.trackScrubbing') },
  },
  {
    get amount() { return store.get('effects.dirtAmount') },
    get throw() { return store.get('effects.dirtThrow') },
    get size() { return store.get('effects.dirtSize') },
  },
  {
    get wheelspinUntil() { return store.get('effects.wheelspinUntil') },
    get carving() { return store.get('effects.carving') },
  },
  groundAt,
)
/** The rear axle, from the middle of the bike on the ground: what a wheelie pivots about. */
const REAR_AXLE = new THREE.Vector3(0, WHEEL_RADIUS, WHEELBASE / 2)
const axleLift = new THREE.Vector3()
const axleRest = new THREE.Vector3()
const restTilt = new THREE.Euler()
/** How far the bike is drawn leaning, radians (positive = right). Only drawn: the riding ignores it. */
let lean = 0
/** How far the bike is drawn pitched nose up, radians: follows the ride's pitch, smoothed. */
let pitch = 0

const rig = new CameraRig(camera, store, renderer.domElement)
const viewName = document.getElementById('view')!
/** Seconds since C last switched the camera, for how long its name stays up. */
let sinceSwitch = Infinity
const switchView = () => {
  const view = rig.next()
  viewName.textContent = VIEW_NAMES[view]
  sinceSwitch = 0
  if (view === 'free') Object.assign(input, LET_GO)
}

/** Nothing held. */
const LET_GO: Input = { throttle: false, brake: false, left: false, right: false, slide: false, leanBack: false, leanForward: false }
const input: Input = { ...LET_GO }
const KEYS: Record<string, keyof Input> = { KeyW: 'throttle', KeyS: 'brake', KeyA: 'left', KeyD: 'right', Space: 'slide', ArrowDown: 'leanBack', ArrowUp: 'leanForward' }
const setKey = (event: KeyboardEvent, down: boolean) => {
  if (down && event.target instanceof HTMLInputElement) return // typing a number in the menu
  if (down && event.code === 'KeyC' && !event.repeat) switchView()
  const key = rig.flying ? undefined : KEYS[event.code] // flying free, the keys fly the camera
  if (rig.flying && KEYS[event.code]) event.preventDefault()
  if (key) input[key] = down
  if (key) event.preventDefault() // Space mustn't press a focused menu button
  if (down && key) document.getElementById('help')!.hidden = true
  if (down && event.code === 'KeyR' && !rig.flying) toStart()
}
addEventListener('keydown', (event) => setKey(event, true))
addEventListener('keyup', (event) => setKey(event, false))
addEventListener('blur', () => Object.assign(input, LET_GO))

const resize = () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const hud = document.getElementById('hud')!
const airtime = document.getElementById('airtime')!
const lap = document.getElementById('lap')!
const lapBest = document.getElementById('lapBest')!
const lapFlash = document.getElementById('lapFlash')!
/** Seconds since the last split or lap, for how long its time stays up. */
let sinceLapEvent = Infinity
/** A lap time as m:ss.cc. */
const clockTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`
const showLapEvent = (event: LapEvent) => {
  if (event.kind === 'start') return
  sinceLapEvent = 0
  lapFlash.classList.toggle('best', event.kind === 'lap' && event.best)
  lapFlash.textContent =
    event.kind === 'split' ? `split ${event.split}/${event.of}  ${clockTime(event.time)}` : `lap ${clockTime(event.time)}${event.best ? '  best!' : ''}`
}
/** Seconds since the last landing, for how long the airtime stays up. */
let sinceLanding = Infinity
const fallen = new THREE.Box3()
/**
 * Draws the bike (and the rider on it) going down in a crash: over onto its
 * side, or flipped over the front or back, faster as it goes, like falling.
 * Lifted so its lowest point rests on the ground, whichever way up it ends.
 */
const fallOver = (crash: NonNullable<Ride['crash']>) => {
  const t = Math.min(crash.time / FALL_TIME, 1) ** 2
  const side = crash.way === 'left' ? -1 : crash.way === 'right' ? 1 : 0
  const over = crash.way === 'front' ? -1 : crash.way === 'back' ? 1 : 0
  // from how it was leaning, over onto its side
  const roll = side ? lean + ((side * Math.PI) / 2 - lean) * t : lean
  bike.root.rotation.set(pitch + over * Math.PI * t, -ride.bodyHeading, -roll, 'YZX')
  bike.root.position.set(ride.bodyX, ride.y, ride.bodyZ)
  bike.root.updateMatrixWorld(true)
  fallen.setFromObject(bike.root)
  bike.root.position.y += Math.max(ride.y - fallen.min.y, 0)
}
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1)
  const tune: Tuning = {
    topSpeed: store.get('bike.topSpeed'),
    zeroToHundred: store.get('bike.zeroToHundred'),
    coastToStop: store.get('bike.coastToStop'),
    brakeToStop: store.get('bike.brakeToStop'),
    frontWheelLock: store.get('bike.frontWheelLock'),
    grip: store.get('bike.grip'),
    slopePull: store.get('bike.slopePull') / 100,
    slideAngle: store.get('slide.angle'),
    kickOut: store.get('slide.kickOut'),
    hookUp: store.get('slide.hookUp'),
    slideCircle: store.get('slide.tighterTurn') / 100,
    slideScrub: store.get('slide.scrub'),
    slideMinSpeed: store.get('slide.minSpeed'),
    liftTime: store.get('wheelie.liftTime'),
    dropTime: store.get('wheelie.dropTime'),
    wheelieAccel: store.get('wheelie.accel') / 100,
    wheelieTurn: store.get('wheelie.turnCircle'),
    wheelieHold: store.get('wheelie.holdAbove'),
    wheelieAngle: store.get('wheelie.angle'),
    sideLimit: store.get('crash.sideways'),
    sideMinSpeed: store.get('crash.minSpeed'),
    noseTailLimit: store.get('crash.noseTail'),
    lipSpin: store.get('air.lipSpin'),
    airTurn: store.get('air.turn'),
    airSpinUp: store.get('air.spinUp'),
    airSpinStop: store.get('air.spinStop'),
    tiltRate: store.get('air.tilt'),
    getUp: store.get('crash.getUp'),
    travel: store.get('bike.travel'),
  }
  const wasAirborne = ride.airborne
  ride.step(input, tune, dt, WHEEL_RADIUS, groundAt)
  // the short way round, so landing a flip doesn't unwind it
  pitch += Math.atan2(Math.sin(ride.pitch - pitch), Math.cos(ride.pitch - pitch)) * (1 - Math.exp(-dt / PITCH_TIME))
  // Lean into turns, more the harder the tyres are pushing sideways: all
  // the way to Max lean when they're at their grip.
  const sideways = Math.abs(ride.speed * ride.turnRate * DEG) / (store.get('bike.grip') * 9.81)
  const turnLean = Math.sign(ride.turnRate) * Math.min(sideways, 1) * store.get('bike.maxLean') * DEG
  // up on the rear wheel, A/D bank it over instead, as far as Bank says
  const bank = ride.steering * store.get('wheelie.bank') * DEG
  const leanTarget = turnLean + (bank - turnLean) * ride.wheelie
  lean += (leanTarget - lean) * (1 - Math.exp(-dt / LEAN_TIME))
  // Turned, then leaned over about where the tyres touch the ground, then
  // pitched: along the slope, plus a wheelie's lift. So a wheelie banks over
  // whole, like tipping a unicycle, rather than twisting about its own length.
  const lift = ride.wheelie * store.get('wheelie.angle') * DEG
  bike.root.rotation.set(pitch + lift, -ride.bodyHeading, -lean, 'YZX')
  // the wheelie pivots about the rear axle, so the rear tyre stays on the ground
  const axleLifted = axleLift.copy(REAR_AXLE).applyEuler(bike.root.rotation)
  const axleDown = axleRest.copy(REAR_AXLE).applyEuler(restTilt.set(pitch, -ride.bodyHeading, -lean, 'YZX'))
  bike.root.position.set(ride.bodyX, ride.y, ride.bodyZ).add(axleDown).sub(axleLifted)
  if (ride.crash) fallOver(ride.crash)
  effects.update(ride, input, dt)
  riderMotion.update(ride, dt)
  bike.update(ride.wheelAngle, ride.spin, effects.rearWheelspin, riderMotion)
  lines.update(ride)

  rig.update(ride, bike, dt)
  sinceSwitch += dt
  viewName.hidden = sinceSwitch > VIEW_NAME_SHOWN

  sun.position.set(ride.x + 10, ride.y + 20, ride.z + 6)
  sun.target.position.set(ride.x, ride.y, ride.z)

  // Airtime: ticks up in the middle of the screen while in the air, and
  // stays up a few seconds after landing to show how long the jump was.
  const jumped = wasAirborne && !ride.airborne && ride.airtime >= MIN_AIRTIME
  sinceLanding = jumped ? 0 : sinceLanding + dt
  const flying = ride.airborne && ride.airtime >= MIN_AIRTIME
  airtime.hidden = !flying && sinceLanding > AIRTIME_SHOWN
  airtime.classList.toggle('landed', !flying)
  if (flying || jumped) airtime.textContent = `${ride.airtime.toFixed(2)} s`
  hud.textContent = `${Math.round(Math.abs(ride.speed) * 3.6)} km/h`

  // Lap time: runs from crossing the start line; each split's time and each lap's flash up under it.
  const lapEvent = lapTimer.update(ride.x, ride.z, dt)
  if (lapEvent) showLapEvent(lapEvent)
  sinceLapEvent += dt
  lapFlash.hidden = sinceLapEvent > LAP_FLASH_SHOWN
  lap.textContent = clockTime(lapTimer.time)
  lapBest.hidden = !Number.isFinite(lapTimer.best)
  if (!lapBest.hidden) lapBest.textContent = `best ${clockTime(lapTimer.best)}`
  renderer.render(scene, camera)
})
