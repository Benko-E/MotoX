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
import { placeSplits } from './track/splits'
import { Track } from './track/track'
import { TrackView } from './track/trackView'

/** Seconds the bike takes to lean over into a turn, and back up. */
const LEAN_TIME = 0.15
/** Seconds the bike takes to pitch to a new slope, or to the way it's flying. */
const PITCH_TIME = 0.06
/** Seconds the camera's name stays on screen after C switches it. */
const VIEW_NAME_SHOWN = 1.5
/** Seconds the airtime stays on screen after landing. */
const AIRTIME_SHOWN = 3
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

// The ground: flat dirt with a faint grid, so you can see yourself moving.
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
dirt.repeat.set(500, 500) // one tile every 4 m
dirt.colorSpace = THREE.SRGBColorSpace
dirt.anisotropy = renderer.capabilities.getMaxAnisotropy()
const dirtMaterial = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 })
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), dirtMaterial)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

/** How high the ground is at (x, z): flat everywhere, for now. */
const groundAt = (_x: number, _z: number) => 0

// The track: laid out on a grid from the Track tab's seed, a spline drawn
// through it, and a strip of packed dirt along that. Flat for now.
const lineColor = (id: string) => SETTINGS.find((s): s is LineSetting => s.id === id)!.color!
const trackGrid = new TrackGrid(scene, lineColor('track.grid'), lineColor('track.path'), lineColor('track.centre'))
const trackView = new TrackView(scene, renderer.capabilities.getMaxAnisotropy())
const trackInfo = document.getElementById('trackInfo')!
const jumpMarks = new JumpMarks(scene)
const splitLines = new SplitLines(scene, lineColor('split.lines'))
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
  trackGrid.build(layout, track)
  trackView.build(track)
  jumpMarks.build(layout, spots, jumps)
  // the lap cut into stretches, the splits drawn to the middle of the jumps' roll-outs where they're near
  const rollOuts = jumps.map(({ at }) => {
    const { x, z } = squareCentre(layout, layout.squares[at[at.length - 1]])
    return track.nearest(x, z)
  })
  const splits = placeSplits(track, store.get('split.count'), rollOuts, store.get('split.pull') / 100)
  splitLines.build(track, splits)
  const onRollOuts = splits.filter((at) => rollOuts.includes(at)).length
  for (const cone of cones) cone.visible = track.distanceTo(cone.position.x, cone.position.z) > track.shape.width / 2 + 2
  trackInfo.textContent = `lap ${Math.round(track.length)} m\ntightest corner ${track.tightest.radius.toFixed(1)} m\njumps ${jumps.length} (room for ${jumpRoom(spots, need)})
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
  else if (id.startsWith('track.') || id.startsWith('jump.') || id.startsWith('split.')) layOutTrack()
})

const bike = new BikeModel()
scene.add(bike.root)
const ride = new Ride()
/** Back to the start of the track, standing still. */
const toStart = () => Object.assign(ride, { ...track.start(), y: 0, vy: 0, speed: 0, airborne: false })
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
/** Seconds since the last landing, for how long the airtime stays up. */
let sinceLanding = Infinity
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
  }
  const wasAirborne = ride.airborne
  ride.step(input, tune, dt, WHEEL_RADIUS, groundAt)
  pitch +=(ride.pitch - pitch) * (1 - Math.exp(-dt / PITCH_TIME))
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
  renderer.render(scene, camera)
})
