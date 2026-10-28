import { config } from './config'
import { FixedStepLoop } from './core/loop'
import { createScene } from './render/scene'

const view = createScene(document.getElementById('app')!, config)
const hud = document.getElementById('hud')!

// Counts what happened over the last second, so the readout can show that
// physics runs at a steady rate whatever the screen does.
let stepsThisSecond = 0
let framesThisSecond = 0
let secondStartedAt = performance.now()

const loop = new FixedStepLoop({
  stepHz: config.physics.stepHz,
  maxStepsPerFrame: config.physics.maxStepsPerFrame,
  step: () => {
    stepsThisSecond++
  },
})

let lastFrameAt = performance.now()

function frame(now: number) {
  loop.advance((now - lastFrameAt) / 1000)
  lastFrameAt = now
  view.render()

  framesThisSecond++
  if (now - secondStartedAt >= 1000) {
    const seconds = (now - secondStartedAt) / 1000
    hud.textContent =
      `Moto · step 1\n` +
      `screen  ${Math.round(framesThisSecond / seconds)} fps\n` +
      `physics ${Math.round(stepsThisSecond / seconds)} steps/s`
    stepsThisSecond = 0
    framesThisSecond = 0
    secondStartedAt = now
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
