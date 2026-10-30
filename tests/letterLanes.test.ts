import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { LetterLanes } from '../src/render/letterLanes'
import { heightAt } from '../src/terrain/heightfield'
import type { JumpSpot } from '../src/world/jumpFinder'
import type { LetterSpot } from '../src/world/letterSpots'
import { DEG, ground } from './physicsSetup'

const settings = () => structuredClone(config.letters)
const field = ground((x) => Math.max(0, x) * Math.tan(15 * DEG), 300)
const groundAt = (x: number, z: number) => heightAt(field, x, z)
const none = [false, false, false, false, false]

/** Letter `letter`'s jump: a run-up along +x to a lip at x = 30, z = 20 * letter; the ghost landed at x = 70. */
function spot(letter: number): LetterSpot {
  const z = letter * 20
  const runUp = Array.from({ length: 21 }, (_, i) => ({ x: i * 1.5, y: groundAt(i * 1.5, z), z }))
  const flight = [{ x: 31, y: 10, z }, { x: 50, y: 14, z }, { x: 70, y: 1, z }]
  return { letter, slice: letter, jump: { runUp, lip: runUp.at(-1)! } as JumpSpot, flight, difficulty: letter / 4 }
}
const spots = [0, 1, 2, 3, 4].map(spot)
const settle = (lanes: LetterLanes, grabbed = none) => {
  for (let i = 0; i < 120; i++) lanes.update(grabbed, 1 / 60)
}

describe('gold lanes for the letters', () => {
  it('mark the run-up of a letter whose show run-up is on, in gold, lying on the ground, wherever you are', () => {
    const lanes = new LetterLanes(new THREE.Scene(), groundAt, settings())
    lanes.show(spots)
    settle(lanes)
    const lane = lanes.lane(0)!
    expect(lane.material.opacity).toBeGreaterThan(0.8)
    expect(lane.material.color.getHex()).toBe(0xffc21a)
    const positions = lane.geometry.getAttribute('position')
    for (let v = 0; v < positions.count; v++) {
      const above = positions.getY(v) - groundAt(positions.getX(v), positions.getZ(v))
      expect(above).toBeGreaterThan(0)
      expect(above).toBeLessThan(0.2)
    }
  })

  it('only for the letters with show run-up on: M alone at first', () => {
    const lanes = new LetterLanes(new THREE.Scene(), groundAt, settings())
    lanes.show(spots)
    settle(lanes)
    expect([0, 1, 2, 3, 4].map((i) => lanes.lane(i)!.visible)).toEqual([true, false, false, false, false])
  })

  it('the checkbox works live', () => {
    const s = settings()
    const lanes = new LetterLanes(new THREE.Scene(), groundAt, s)
    lanes.show(spots)
    s.each[4].showRunUp = true
    settle(lanes)
    expect(lanes.lane(4)!.visible).toBe(true)
  })

  it('fades out once you grab the letter, and back in when it comes back', () => {
    const lanes = new LetterLanes(new THREE.Scene(), groundAt, settings())
    lanes.show(spots)
    settle(lanes, [true, false, false, false, false])
    expect(lanes.lane(0)!.visible).toBe(false)
    settle(lanes)
    expect(lanes.lane(0)!.visible).toBe(true)
  })

  it('hide with the letters', () => {
    const s = settings()
    s.show = false
    const lanes = new LetterLanes(new THREE.Scene(), groundAt, s)
    lanes.show(spots)
    settle(lanes)
    expect(lanes.lane(0)!.visible).toBe(false)
  })

  it('ring the spot where the ghost really landed', () => {
    const lanes = new LetterLanes(new THREE.Scene(), groundAt, settings())
    lanes.show(spots)
    const ring = lanes.ring(0)!
    ring.geometry.computeBoundingBox()
    const middle = ring.geometry.boundingBox!.getCenter(new THREE.Vector3())
    expect(middle.x).toBeCloseTo(70, 1)
    expect(middle.z).toBeCloseTo(0, 1)
  })
})
