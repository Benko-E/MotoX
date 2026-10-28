import * as THREE from 'three'
import { config, configRanges, currentBike } from './config'
import { Input } from './core/input'
import { FixedStepLoop } from './core/loop'
import { freeride } from './maps/freeride'
import { mapRanges } from './maps/ranges'
import { Bike } from './physics/bike'
import { initPhysics, PhysicsWorld } from './physics/world'
import { BikeView } from './render/bikeView'
import { FlyCamera } from './render/flyCamera'
import { createScene } from './render/scene'
import { TerrainView } from './render/terrainView'
import { generateTerrain } from './terrain/generate'
import { heightAt } from './terrain/heightfield'
import { createTuningPanel } from './ui/tuningPanel'

/** B drops the bike this far ahead of the camera. */
const DROP_AHEAD = 6

await initPhysics()

const map = freeride
const view = createScene(document.getElementById('app')!, config)
const hud = document.getElementById('hud')!
const input = new Input(config.input, window)

const physics = new PhysicsWorld()
const terrainView = new TerrainView(view.scene, view.renderer)
let terrain = generateTerrain(map)
const groundAt = (x: number, z: number) => heightAt(terrain.field, x, z)

const bike = new Bike(physics, currentBike())
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

const panel = createTuningPanel(
  [
    { title: 'config', target: config, ranges: configRanges },
    {
      title: 'map',
      target: map,
      ranges: mapRanges,
      // Rebuilding the whole map takes a moment, so wait until the slider is let go.
      onChange: (_path, last) => {
        if (!last) return
        rebuildTerrain()
        bike.resetUpright()
      },
    },
  ],
  {
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
  },
)
input.onPress('togglePanel', () => {
  // Opening the panel gives the mouse back, so its sliders can be used straight away.
  if (panel.toggle()) document.exitPointerLock()
})

// Keys that act on the bike are handled at the start of the next physics step.
let resetPressed = false
let dropPressed = false
input.onPress('reset', () => (resetPressed = true))
input.onPress('dropBike', () => (dropPressed = true))

const loop = new FixedStepLoop({
  get stepHz() {
    return config.physics.stepHz
  },
  get maxStepsPerFrame() {
    return config.physics.maxStepsPerFrame
  },
  step(dt) {
    input.update(dt)
    if (resetPressed) bike.resetUpright()
    if (dropPressed) {
      const at = fly.pointAhead(DROP_AHEAD)
      bike.place(at.x, Math.max(at.y, groundAt(at.x, at.z) + 1.5), at.z, fly.heading)
    }
    resetPressed = dropPressed = false

    bike.update(dt)
    physics.step(dt, config.physics.gravity)
    bike.record()
    fly.step(dt, input)
    stepsThisSecond++
  },
})

// For measuring and debugging from the browser console: `moto.bike`, `moto.config`, ...
Object.assign(window, { moto: { config, map, view, fly, bike, physics, terrain: () => terrain, rebuildTerrain } })

// Counts what happened over the last second, so the readout can show that
// physics runs at a steady rate whatever the screen does.
let stepsThisSecond = 0
let framesThisSecond = 0
let secondStartedAt = performance.now()
let rates = ''
let lastFrameAt = performance.now()
const lookPoint = new THREE.Vector3()

function frame(now: number) {
  loop.advance((now - lastFrameAt) / 1000)
  lastFrameAt = now
  bikeView.update(loop.alpha)
  fly.apply(view.camera, loop.alpha)
  view.camera.getWorldDirection(lookPoint).multiplyScalar(20).add(view.camera.position)
  view.focusShadows(lookPoint)
  view.render()

  framesThisSecond++
  if (now - secondStartedAt >= 1000) {
    const seconds = (now - secondStartedAt) / 1000
    rates = `screen ${Math.round(framesThisSecond / seconds)} fps   physics ${Math.round(stepsThisSecond / seconds)} steps/s`
    stepsThisSecond = 0
    framesThisSecond = 0
    secondStartedAt = now
  }
  hud.textContent = readout().join('\n')

  requestAnimationFrame(frame)
}

function readout(): string[] {
  const degrees = (radians: number) => `${((radians * 180) / Math.PI).toFixed(1)}°`.padStart(6)
  const wheel = (name: string, i: number) => {
    const w = bike.wheels[i]
    const bar = '▮'.repeat(Math.round(w.compressionRatio * 10)).padEnd(10, '▯')
    return `${name}  ${w.onGround ? 'ground' : 'air   '}  ${bar} ${(w.compressionRatio * 100).toFixed(0).padStart(3)}%`
  }
  const air = bike.airtime > 0 ? `${bike.airtime.toFixed(2)} s` : 'on the ground'
  return [
    'Moto · step 3',
    rates,
    '',
    `speed     ${(bike.speed * 3.6).toFixed(1).padStart(5)} km/h`,
    wheel('front', 0),
    wheel('rear ', 1),
    `airtime   ${air}   last jump ${bike.lastAirtime.toFixed(2)} s`,
    `lean ${degrees(bike.roll)}   pitch ${degrees(bike.pitch)}`,
    '',
    'R   bike upright again',
    'B   drop the bike ahead of the camera',
    'click  look with the mouse (Esc stops), or drag',
    'W A S D fly   E / Q up / down   Shift fast',
    '`   tuning panel',
  ]
}

requestAnimationFrame(frame)
