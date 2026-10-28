import * as THREE from 'three'
import { config, configRanges } from './config'
import { Input } from './core/input'
import { FixedStepLoop } from './core/loop'
import { freeride } from './maps/freeride'
import { mapRanges } from './maps/ranges'
import { FlyCamera } from './render/flyCamera'
import { createScene } from './render/scene'
import { TerrainView } from './render/terrainView'
import { generateTerrain } from './terrain/generate'
import { heightAt } from './terrain/heightfield'
import { createTuningPanel } from './ui/tuningPanel'

const map = freeride
const view = createScene(document.getElementById('app')!, config)
const hud = document.getElementById('hud')!
const input = new Input(config.input, window)

const terrainView = new TerrainView(view.scene, view.renderer)
let terrain = generateTerrain(map)
function rebuildTerrain() {
  terrain = generateTerrain(map)
  terrainView.show(terrain.field, terrain.ramps, map)
  view.scaleBox.position.set(map.flatArea.x, heightAt(terrain.field, map.flatArea.x, map.flatArea.z) + 0.6, map.flatArea.z)
}
rebuildTerrain()
const groundAt = (x: number, z: number) => heightAt(terrain.field, x, z)

const fly = new FlyCamera(view.renderer.domElement, config, groundAt)
fly.place(new THREE.Vector3(40, 14, 40), new THREE.Vector3(-40, 0, 0))

const panel = createTuningPanel([
  { title: 'config', target: config, ranges: configRanges },
  {
    title: 'map',
    target: map,
    ranges: mapRanges,
    // Rebuilding the whole map takes a moment, so wait until the slider is let go.
    onChange: (_path, last) => last && rebuildTerrain(),
  },
])
input.onPress('togglePanel', () => panel.toggle())

// For measuring and debugging from the browser console: `moto.config`, `moto.map`, ...
Object.assign(window, { moto: { config, map, view, fly, terrain: () => terrain, rebuildTerrain } })

const loop = new FixedStepLoop({
  get stepHz() {
    return config.physics.stepHz
  },
  get maxStepsPerFrame() {
    return config.physics.maxStepsPerFrame
  },
  step(dt) {
    input.update(dt)
    fly.step(dt, input)
    stepsThisSecond++
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

function frame(now: number) {
  loop.advance((now - lastFrameAt) / 1000)
  lastFrameAt = now
  fly.apply(view.camera, loop.alpha)
  view.camera.getWorldDirection(lookPoint).multiplyScalar(30).add(view.camera.position)
  view.focusShadows(lookPoint)
  view.render()

  framesThisSecond++
  if (now - secondStartedAt >= 1000) {
    const seconds = (now - secondStartedAt) / 1000
    rates = `screen  ${Math.round(framesThisSecond / seconds)} fps   physics ${Math.round(stepsThisSecond / seconds)} steps/s`
    stepsThisSecond = 0
    framesThisSecond = 0
    secondStartedAt = now
  }
  const { x, y, z } = view.camera.position
  hud.textContent = [
    'Moto · step 2',
    rates,
    `camera  x ${x.toFixed(0)}  z ${z.toFixed(0)}  ${(y - groundAt(x, z)).toFixed(1)} m up`,
    '',
    'click     look with the mouse (Esc stops), or drag',
    'W A S D   fly        E / Q  up / down',
    'Shift     fast       `      tuning panel',
  ].join('\n')

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
