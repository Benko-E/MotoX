import * as THREE from 'three'
import { config, configRanges, EARTH_GRAVITY } from './config'
import configSource from './config.ts?raw'
import { Input } from './core/input'
import { FixedStepLoop } from './core/loop'
import { freeride } from './maps/freeride'
import { mapRanges } from './maps/ranges'
import mapTypesSource from './maps/types.ts?raw'
import { Bike } from './physics/bike'
import { CrashWatcher } from './physics/crashes'
import { initPhysics, PhysicsWorld } from './physics/world'
import { BikeView } from './render/bikeView'
import { ChaseCamera } from './render/chaseCamera'
import { FlyCamera } from './render/flyCamera'
import { createScene } from './render/scene'
import { TerrainView } from './render/terrainView'
import { generateTerrain } from './terrain/generate'
import { heightAt } from './terrain/heightfield'
import { readNotes } from './ui/notes'
import { createTuningPanel, type PanelSection } from './ui/tuningPanel'

/** With the free-fly camera, B drops the bike this far ahead of the camera. */
const DROP_AHEAD = 6
/** With the chase camera, B lifts the bike this high and lets go. */
const DROP_HEIGHT = 6

await initPhysics()

const map = freeride
const view = createScene(document.getElementById('app')!, config)
const hud = document.getElementById('hud')!
const banner = document.getElementById('banner')!
const input = new Input(config.controls, window)

const physics = new PhysicsWorld()
const terrainView = new TerrainView(view.scene, view.renderer)
let terrain = generateTerrain(map)
const groundAt = (x: number, z: number) => heightAt(terrain.field, x, z)

const bike = new Bike(physics, config.bike, config.advanced.bikeBody)
const crashes = new CrashWatcher(physics, bike, config.crashes)
const bikeView = new BikeView(view.scene, bike)

function rebuildTerrain() {
  terrain = generateTerrain(map)
  terrainView.show(terrain.field, terrain.ramps, map)
  physics.setGround(terrain.field, terrain.ramps)
}
rebuildTerrain()
bike.placeOnGround(map.spawn.x, map.spawn.z, map.spawn.heading)

const fly = new FlyCamera(view.renderer.domElement, config, groundAt)
const spawnGround = groundAt(map.spawn.x, map.spawn.z)
fly.place(
  { x: map.spawn.x + 4, y: spawnGround + 2, z: map.spawn.z + 5 },
  { x: map.spawn.x, y: spawnGround + 0.5, z: map.spawn.z },
)

const chase = new ChaseCamera(config, groundAt)
/** Which camera is showing: the chase camera behind the bike, or the free-fly one. */
let flying = false

// The panel: one folder per part of config.ts, the bike's feel open at the top,
// then the map. Hovering a slider shows the comment written above it in the file.
const configNotes = readNotes(configSource)
const sections: PanelSection[] = Object.entries(config).map(([name, target]) => ({
  title: name,
  target,
  path: name,
  ranges: configRanges,
  notes: configNotes,
  open: ['bike', 'bike.speed', 'bike.turning', 'jumps'],
}))
sections.push({
  title: 'map',
  target: map,
  path: '',
  ranges: mapRanges,
  notes: readNotes(mapTypesSource),
  notesByName: true,
  // Rebuilding the whole map takes a moment, so wait until the slider is let go.
  onChange: (_path, last) => {
    if (!last) return
    rebuildTerrain()
    crashes.recover()
  },
})
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
  // Opening the panel gives the mouse back, so its sliders can be used straight away.
  if (panel.toggle()) document.exitPointerLock()
})

// Keys that act on the bike are handled at the start of the next physics step.
let resetPressed = false
let dropPressed = false
input.onPress('reset', () => (resetPressed = true))
input.onPress('dropBike', () => (dropPressed = true))
input.onPress('toggleCamera', () => {
  flying = !flying
  if (flying) {
    // start flying from exactly where the chase camera is, looking the same way
    const ahead = view.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(view.camera.position)
    fly.place(view.camera.position, ahead)
  } else chase.snap()
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
    bike.update(dt)
    physics.step(dt, config.jumps.gravity * EARTH_GRAVITY)
    bike.record()
    crashes.step(dt)
    if (flying) fly.step(dt, input)
    stepsThisSecond++
  },
})

// For measuring and debugging from the browser console: `moto.bike`, `moto.config`, ...
Object.assign(window, {
  moto: {
    ...{ config, map, view, fly, chase, bike, crashes, physics, input, rebuildTerrain },
    terrain: () => terrain,
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

/** Moves the game on by one screen frame of `frameTime` seconds and draws it. */
function showFrame(frameTime: number) {
  loop.advance(frameTime)
  bikeView.update(loop.alpha, frameTime)
  if (flying) fly.apply(view.camera, loop.alpha)
  else chase.update(view.camera, Math.min(frameTime, 0.1), bikeView.position, bikeView.heading, bike.speed)
  view.camera.getWorldDirection(lookPoint).multiplyScalar(20).add(view.camera.position)
  view.focusShadows(lookPoint)
  view.render()
  hud.textContent = readout().join('\n')
  banner.style.display = crashes.crashed ? 'block' : 'none'
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
        'free-fly camera (C: back to the bike)',
        'W A S D fly   E / Q up / down   Shift fast',
        'click  look with the mouse (Esc stops), or drag',
        'B   drop the bike ahead of the camera',
      ]
    : [
        'W throttle   S brake   A / D steer   ↑ / ↓ lean forward / back',
        'in the air: lean to spin   ↓ + throttle: wheelie   ↑ + brake: stoppie',
        'C free-fly camera',
        'R   bike upright again   B   drop the bike from 6 m',
      ]
  return [
    'Moto · step 6 (crashes)',
    rates,
    '',
    `speed     ${(bike.speed * 3.6).toFixed(1).padStart(5)} km/h`,
    `throttle  ${bar(throttle)}   brake ${bar(brake, 5)}`,
    `steer     ${steering}  tightest turn here ${bike.turnRadius.toFixed(1)} m`,
    `lean      ${sides(bike.controls.lean)}  (back | forward)`,
    wheel('front', 0),
    wheel('rear ', 1),
    `airtime   ${air}   last jump ${bike.lastAirtime.toFixed(2)} s   crashes ${crashes.count}`,
    `lean ${degrees(bike.lean)}   pitch ${degrees(bike.pitch)}   rear slide ${bike.slide.toFixed(2)} m/s`,
    '',
    ...keys,
    '`   tuning panel (hover a slider to see what it does)',
  ]
}

requestAnimationFrame(frame)
