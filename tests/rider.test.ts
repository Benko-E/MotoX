import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { RiderMotion } from '../src/render/riderMotion'
import { config } from '../src/config'
import { HEAD_BACK, HEAD_FORWARD, HEAD_SITTING } from '../src/physics/crashes'
import { BARS } from '../src/render/bikeView'
import { FOREARM, GRIPS, riderPose, SHIN, THIGH, UPPER_ARM, type RiderShape } from '../src/render/riderView'
import { flat, setup } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
function cruise(bike: Bike, target: number) {
  const speed = bike.forwardSpeed
  bike.controls.throttle = clamp((target - speed) / 2, 0, 1)
  bike.controls.brake = clamp((speed - target - 1) / 2, 0, 1)
}

/** A bike and its rider's motion, stepped like the game: physics, then a drawn frame at 60 fps. */
function riding() {
  const { bike, run: runPhysics } = setup(flat(600))
  const motion = new RiderMotion()
  const run = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      runPhysics(1 / 60, each)
      motion.update(bike, 1 / 60)
    }
  }
  return { bike, motion, run }
}

/** Rolling along at `kmh`. */
function rolling(kmh: number) {
  const world = riding()
  world.bike.placeOnGround(0, 250, 0)
  world.run(4, () => cruise(world.bike, kmh * KMH))
  return world
}

describe('what the rider does', () => {
  it('sits when slow and stands on the pegs at speed', () => {
    expect(rolling(10).motion.standing).toBeLessThan(0.1)
    expect(rolling(50).motion.standing).toBeGreaterThan(0.9)
  })

  it('stands up in the air', () => {
    const { bike, motion, run } = riding()
    bike.placeOnGround(0, 250, 0, 8)
    run(0.6)
    expect(bike.wheels.some((wheel) => wheel.onGround)).toBe(false)
    expect(motion.standing).toBeGreaterThan(0.8)
  })

  it('soaks up a hard landing deeper than a soft one, then comes back up', () => {
    const deepest = (height: number) => {
      const { bike, motion, run } = riding()
      bike.placeOnGround(0, 250, 0, height)
      let most = 0
      run(3, () => (most = Math.max(most, motion.absorb)))
      return { most, after: motion.absorb }
    }
    const soft = deepest(0.4)
    const hard = deepest(5)
    expect(hard.most).toBeGreaterThan(0.6)
    expect(soft.most).toBeLessThan(hard.most / 2)
    expect(hard.after).toBeLessThan(0.05) // back up by now
  })

  it('puts the inside foot out in a powerslide', () => {
    for (const steer of [1, -1]) {
      const { bike, motion, run } = rolling(50)
      bike.controls.steer = steer
      bike.controls.powerslide = true
      run(0.8, () => cruise(bike, 50 * KMH))
      expect(motion.legOut * steer).toBeGreaterThan(0.8) // right turn: right foot out
    }
  })

  it('puts the inside foot out in a tight slow turn, but not in a fast sweeping one', () => {
    const slow = rolling(25)
    slow.bike.controls.steer = 1
    slow.run(1, () => cruise(slow.bike, 25 * KMH))
    expect(slow.motion.legOut).toBeGreaterThan(0.5)

    const fast = rolling(90)
    fast.bike.controls.steer = 1
    fast.run(1, () => cruise(fast.bike, 90 * KMH))
    expect(Math.abs(fast.motion.legOut)).toBeLessThan(0.1)
  })

  it('keeps both feet on the pegs riding straight and in the air', () => {
    expect(Math.abs(rolling(50).motion.legOut)).toBeLessThan(0.05)
    const { bike, motion, run } = rolling(25)
    bike.controls.steer = 1
    run(1, () => cruise(bike, 25 * KMH))
    bike.body.setTranslation({ ...bike.body.translation(), y: 10 }, true) // up into the air
    run(0.6)
    expect(Math.abs(motion.legOut)).toBeLessThan(0.1)
  })
})

describe('the rider drawn', () => {
  // the middle of the handlebar in the bike's space (the front end sits half a wheelbase ahead),
  // and the grips with the bars turned `bars` degrees about it
  const barsAt = BARS.clone().add(new THREE.Vector3(0, 0, -config.bike.build.wheelbase / 2))
  const gripsTurned = (bars: number) =>
    GRIPS.map((grip) => grip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (-bars * Math.PI) / 180).add(barsAt))
  const grips = gripsTurned(0)
  const shape = (changes: Partial<RiderShape> = {}): RiderShape => ({ lean: 0, squash: 0, standing: 0, absorb: 0, legOut: 0, bars: 0, ...changes })

  it('standing lifts the hips, and soaking up a landing drops them', () => {
    const sitting = riderPose(shape(), grips).hips.y
    const standing = riderPose(shape({ standing: 1 }), grips).hips.y
    const absorbing = riderPose(shape({ standing: 1, absorb: 1 }), grips).hips.y
    expect(standing).toBeGreaterThan(sitting + 0.1)
    expect(absorbing).toBeLessThan(standing - 0.15)
  })

  it('bends at the knees and elbows instead of stretching, and the hands stay on the grips', () => {
    for (const changes of [{}, { standing: 1 }, { standing: 1, absorb: 1 }, { lean: 1 }, { legOut: 1 }]) {
      const pose = riderPose(shape(changes), grips)
      for (const side of [0, 1]) {
        expect(pose.knees[side].distanceTo(pose.hipJoints[side])).toBeCloseTo(THIGH, 3)
        expect(pose.feet[side].distanceTo(pose.knees[side])).toBeLessThan(SHIN + 0.01)
        expect(pose.elbows[side].distanceTo(pose.shoulders[side])).toBeCloseTo(UPPER_ARM, 3)
        expect(pose.hands[side].distanceTo(pose.elbows[side])).toBeLessThan(FOREARM + 0.06)
        expect(pose.hands[side].distanceTo(grips[side])).toBeLessThan(1e-9)
      }
    }
  })

  it('leaning back or with the bars turned all the way, he leans and twists to keep hold: the arms never visibly stretch', () => {
    // the bars turned in a wheelie stretched the arms into long thin lines
    for (const changes of [{ lean: -1 }, { bars: 65 }, { bars: -65 }, { lean: -1, bars: 65 }]) {
      const turned = gripsTurned(changes.bars ?? 0)
      const pose = riderPose(shape(changes), turned)
      for (const side of [0, 1]) {
        expect(pose.hands[side].distanceTo(pose.elbows[side])).toBeLessThan(FOREARM * 1.05) // at most 5% longer
        expect(pose.hands[side].distanceTo(turned[side])).toBeLessThan(1e-9)
      }
    }
  })

  it('with a foot out, that foot is out to the side, forward and down; the other stays on its peg', () => {
    const onPegs = riderPose(shape(), grips)
    const rightOut = riderPose(shape({ legOut: 1 }), grips)
    expect(rightOut.feet[1].x).toBeGreaterThan(onPegs.feet[1].x + 0.15) // out to the right
    expect(rightOut.feet[1].z).toBeLessThan(onPegs.feet[1].z - 0.2) // forward
    expect(rightOut.feet[1].y).toBeLessThan(onPegs.feet[1].y) // down toward the ground
    expect(rightOut.feet[0].distanceTo(onPegs.feet[0])).toBeLessThan(1e-9)
  })

  it('the head is drawn where the crash check looks for it, sitting and leaning back or forward', () => {
    // with the bike resting on its suspension
    for (const [lean, head] of [[0, HEAD_SITTING], [-1, HEAD_BACK], [1, HEAD_FORWARD]] as const) {
      expect(riderPose(shape({ squash: 0.3, lean }), grips).head.distanceTo(new THREE.Vector3(head.x, head.y, head.z))).toBeLessThan(0.03)
    }
  })
})
