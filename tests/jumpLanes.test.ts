import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { JumpLanes, pickLanes } from '../src/render/jumpLanes'
import { heightAt } from '../src/terrain/heightfield'
import type { JumpSpot } from '../src/world/jumpFinder'
import { DEG, ground } from './physicsSetup'

const settings = () => structuredClone(config.jumpGuide)
/** A score good enough to be shown, whatever the setting is. */
const good = config.jumpGuide.minScore + 0.5

/** A made-up jump: its run-up goes 30 m along `heading` to the lip at (x, z). */
function jump(x: number, z: number, heading: number, score: number): JumpSpot {
  const dx = Math.sin(heading * DEG)
  const dz = -Math.cos(heading * DEG)
  const runUp = Array.from({ length: 21 }, (_, i) => ({ x: x - dx * (30 - i * 1.5), y: 0, z: z - dz * (30 - i * 1.5) }))
  return {
    lip: { x, y: 0, z },
    heading,
    runUp,
    lipAngle: 20,
    speed: 70,
    airtime: 2,
    landing: { x: x + dx * 30, y: 0, z: z + dz * 30 },
    score,
  }
}

const here = { x: 0, z: 0 }
const northward = 0 // the bike heads toward -z

describe('which jumps get marked', () => {
  it('ones ahead of you, pointing much your way, within range', () => {
    const jumps = [
      jump(0, -100, 0, good), // ahead, same way: yes
      jump(0, 100, 0, good), // behind you
      jump(0, -100, 180, good), // ahead, but you'd ride it the other way
      jump(0, -(settings().showWithin + 100), 0, good), // too far
    ]
    expect(pickLanes(jumps, here, northward, settings(), new Set())).toEqual([0])
  })

  it('only good enough ones, and only the best few at once', () => {
    const s = settings()
    // all straight ahead, one behind the other, so only how good they are decides
    const jumps = Array.from({ length: 12 }, (_, i) => jump(0, -40 - i * 12, 0, 1 + i * 0.2))
    jumps.push(jump(0, -60, 0, s.minScore - 0.1)) // not good enough
    const picked = pickLanes(jumps, here, northward, s, new Set())
    expect(picked.length).toBe(s.lanes)
    expect(picked).not.toContain(12)
    const scores = picked.map((i) => jumps[i].score)
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(Math.max(...jumps.filter((_, i) => !picked.includes(i) && i !== 12).map((j) => j.score)))
  })

  it('the jump you are heading straight at is shown before a better one off to the side', () => {
    // the fourteenth tuning session: a better jump up on the left was marked, not the one straight ahead
    const s = settings()
    s.lanes = 1
    const jumps = [jump(-120, -100, 0, s.minScore + 1.2), jump(0, -110, 0, s.minScore + 0.4)] // a better one 50 degrees left, and one dead ahead
    expect(pickLanes(jumps, here, northward, s, new Set())).toEqual([1])
  })

  it('leaves out a jump that has a letter lane of its own, so the two never lie on top of each other', () => {
    const jumps = [jump(0, -100, 0, good), jump(20, -150, 0, good)]
    expect(pickLanes(jumps, here, northward, settings(), new Set(), new Set([jumps[0]]))).toEqual([1])
  })

  it('a jump on the track ahead is always marked, first, however low it scores', () => {
    const s = settings()
    s.lanes = 1
    const kicker = jump(0, -110, 0, s.minScore - 1) // too low to show on its own
    const big = jump(10, -90, 0, s.minScore + 2)
    expect(pickLanes([big, kicker], here, northward, s, new Set(), new Set(), new Set([kicker]))).toEqual([1])
    expect(pickLanes([big, kicker], here, northward, s, new Set(), new Set(), new Set())).toEqual([0]) // not on the track: the big one
  })

  it('a lane you are riding up stays marked until you have passed its lip', () => {
    // its lip 5 m ahead: you're near the top of the run-up, which started 25 m behind you
    const jumps = [jump(0, -5, 0, good)]
    expect(pickLanes(jumps, here, northward, settings(), new Set())).toEqual([]) // not one you were riding
    expect(pickLanes(jumps, here, northward, settings(), new Set([0]))).toEqual([0]) // one you were
    expect(pickLanes(jumps, { x: 0, z: -10 }, northward, settings(), new Set([0]))).toEqual([]) // past the lip
  })
})

describe('the lanes drawn', () => {
  it('lie on the ground, follow it up the run-up, and fade in when picked', () => {
    const field = ground((x) => Math.max(0, x) * Math.tan(15 * DEG), 300)
    const spot = jump(30, 0, 90, good)
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
    for (let i = 0; i < 60; i++) lanes.update({ x: 0, z: 0 }, 90, 1 / 60) // riding toward it
    expect(lane.material.opacity).toBeGreaterThan(0.8)
  })

  it('turned off, shows nothing', () => {
    const s = settings()
    s.show = false
    const lanes = new JumpLanes(new THREE.Scene(), [jump(30, 0, 90, good)], () => 0, s)
    for (let i = 0; i < 60; i++) lanes.update({ x: 0, z: 0 }, 90, 1 / 60)
    expect(lanes.lane(0).material.opacity).toBe(0)
  })
})
