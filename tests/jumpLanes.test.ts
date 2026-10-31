import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { JumpLanes } from '../src/render/jumpLanes'
import { heightAt } from '../src/terrain/heightfield'
import type { JumpSpot } from '../src/world/jumps'
import { DEG, ground } from './physicsSetup'

/** The jump guide, switched on (it's a debug view, off by default). */
const settings = () => ({ ...structuredClone(config.jumpGuide), show: true })

/** A made-up jump: its run-up goes 30 m along `heading` to the lip at (x, z). */
function jump(x: number, z: number, heading: number): JumpSpot {
  const dx = Math.sin(heading * DEG)
  const dz = -Math.cos(heading * DEG)
  const runUp = Array.from({ length: 21 }, (_, i) => ({ x: x - dx * (30 - i * 1.5), y: 0, z: z - dz * (30 - i * 1.5) }))
  return {
    lip: { x, y: 0, z },
    heading,
    runUp,
    speed: 70,
    airtime: 2,
    landing: { x: x + dx * 30, y: 0, z: z + dz * 30 },
    source: 'track',
    kind: 'fast',
  }
}


describe('the lanes drawn', () => {
  it('every jump a feature built gets one, lying on the ground up its run-up, fading in when switched on', () => {
    const field = ground((x) => Math.max(0, x) * Math.tan(15 * DEG), 300)
    const spot = jump(30, 0, 90)
    spot.runUp = spot.runUp.map((p) => ({ ...p, y: heightAt(field, p.x, p.z) }))
    const scene = new THREE.Scene()
    const lanes = new JumpLanes(scene, [spot], (x, z) => heightAt(field, x, z), settings())
    const lane = lanes.lane(0)
    const positions = lane.geometry.getAttribute('position')
    for (let v = 0; v < positions.count; v++) {
      const y = positions.getY(v)
      expect(y - heightAt(field, positions.getX(v), positions.getZ(v))).toBeGreaterThan(0)
      expect(y - heightAt(field, positions.getX(v), positions.getZ(v))).toBeLessThan(0.2)
    }
    expect(lane.material.opacity).toBe(0)
    for (let i = 0; i < 60; i++) lanes.update(1 / 60)
    expect(lane.material.opacity).toBeGreaterThan(0.8)
  })

  it('turned off, shows nothing', () => {
    const s = settings()
    s.show = false
    const lanes = new JumpLanes(new THREE.Scene(), [jump(30, 0, 90)], () => 0, s)
    for (let i = 0; i < 60; i++) lanes.update(1 / 60)
    expect(lanes.lane(0).material.opacity).toBe(0)
  })
})
