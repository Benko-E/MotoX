import * as THREE from 'three'
import { BikeModel, WHEEL_RADIUS } from './bike/bikeModel'
import { RideLines } from './debug/rideLines'
import { Ride, type Input, type Tuning } from './ride'
import { SETTINGS, TABS } from './settings/list'
import { SettingsStore } from './settings/store'
import { buildMenu } from './ui/buildMenu'

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
scene.fog = new THREE.Fog(0x9cc3e6, 60, 220)
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500)

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
dirt.repeat.set(100, 100) // one tile every 4 m
dirt.colorSpace = THREE.SRGBColorSpace
dirt.anisotropy = renderer.capabilities.getMaxAnisotropy()
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// Cones scattered about, something to ride round.
const cone = new THREE.ConeGeometry(0.25, 0.7, 12).translate(0, 0.35, 0)
const orange = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })
for (let i = 0; i < 120; i++) {
  const mesh = new THREE.Mesh(cone, orange)
  const r = 8 + Math.random() * 150
  const a = Math.random() * Math.PI * 2
  mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
  mesh.castShadow = true
  scene.add(mesh)
}

const bike = new BikeModel()
scene.add(bike.root)
const ride = new Ride()
const lines = new RideLines(scene, SETTINGS, store)

const input: Input = { throttle: false, brake: false, left: false, right: false }
const KEYS: Record<string, keyof Input> = { KeyW: 'throttle', KeyS: 'brake', KeyA: 'left', KeyD: 'right' }
const setKey = (event: KeyboardEvent, down: boolean) => {
  if (down && event.target instanceof HTMLInputElement) return // typing a number in the menu
  const key = KEYS[event.code]
  if (key) input[key] = down
  if (down && key) document.getElementById('help')!.hidden = true
  if (down && event.code === 'KeyR') Object.assign(ride, { x: 0, z: 0, heading: 0, speed: 0 })
}
addEventListener('keydown', (event) => setKey(event, true))
addEventListener('keyup', (event) => setKey(event, false))
addEventListener('blur', () => Object.assign(input, { throttle: false, brake: false, left: false, right: false }))

const resize = () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

const hud = document.getElementById('hud')!
/** Which way the camera looks from, radians; it swings round after the bike's heading. */
let cameraHeading = 0
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
  }
  ride.step(input, tune, dt, WHEEL_RADIUS)
  bike.root.position.set(ride.x, 0, ride.z)
  bike.root.rotation.y = -ride.heading
  bike.update(ride.wheelAngle, ride.spin)
  lines.update(ride)

  const lag = store.get('camera.lag')
  cameraHeading = lag > 0 ? cameraHeading + (ride.heading - cameraHeading) * (1 - Math.exp(-dt / lag)) : ride.heading
  const back = store.get('camera.back')
  camera.position.set(ride.x - Math.sin(cameraHeading) * back, store.get('camera.up'), ride.z + Math.cos(cameraHeading) * back)
  camera.lookAt(ride.x, 0.9, ride.z)

  sun.position.set(ride.x + 10, 20, ride.z + 6)
  sun.target.position.set(ride.x, 0, ride.z)
  hud.textContent = `${Math.round(Math.abs(ride.speed) * 3.6)} km/h`
  renderer.render(scene, camera)
})
