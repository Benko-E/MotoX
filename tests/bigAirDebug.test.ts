import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { MapDef } from '../src/maps/types'
import { BigAirDebug } from '../src/render/bigAirDebug'
import { labelsIn } from '../src/render/debugDraw'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt } from '../src/terrain/heightfield'
import { featureJumps } from '../src/world/jumps'

const map: MapDef = {
  size: 600,
  cellSize: 1,
  hills: { seed: 3, height: 40, wavelength: 180, octaves: 3, roughness: 0.4 },
  edge: { start: 280, rise: 0 },
  clearing: { x: 0, z: 0, radius: 20, blend: 20, calm: 0.8 },
  track: { show: false, way: 'clockwise', radius: 200, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 0, jumpHeight: 3, jumpLength: 20, jumpVary: 0, jumpSpeed: 80, landingStraight: 1 },
  bigAir: { count: 2, speed: 90, angle: 35, shaping: 0.2, width: 14, banks: 15, spread: 260 },
  spawn: { x: 0, z: 0, heading: 0 },
}
const field = generateTerrain(map)
const jumps = featureJumps(field)
const groundAt = (x: number, z: number) => heightAt(field, x, z)
const PARTS = ['runIn', 'kicker', 'landing', 'edges', 'flights', 'labels'] as const

function corners(part: THREE.Object3D): THREE.Vector3[] {
  const found: THREE.Vector3[] = []
  part.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.updateMatrixWorld()
    const positions = child.geometry.getAttribute('position')
    for (let v = 0; v < positions.count; v++) found.push(new THREE.Vector3().fromBufferAttribute(positions, v).applyMatrix4(child.matrixWorld))
  })
  return found
}
const mesh = (part: THREE.Group, name: string) => part.children.find((c) => c.name === name)!
const textOf = (part: THREE.Group, words: string) => labelsIn(part).find((l) => l.text.includes(words))
const drawn = (s = { ...structuredClone(config.bigAirDebug), show: true }) => {
  const debug = new BigAirDebug(new THREE.Scene(), groundAt, s)
  debug.show(field, map, jumps)
  debug.update()
  return debug
}
/** How far `p` is from the line through `a` and `b` (seen from above), and how far along it from `a`, metres. */
const offLine = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const fx = (b.x - a.x) / length
  const fz = (b.z - a.z) / length
  return { across: Math.abs((p.x - a.x) * -fz + (p.z - a.z) * fx), along: (p.x - a.x) * fx + (p.z - a.z) * fz, length }
}

describe('the big air debug view', () => {
  it('is hidden until switched on; then each part shows with its own checkbox', () => {
    const s = { ...structuredClone(config.bigAirDebug), show: false }
    const debug = drawn(s)
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(false)
    s.show = true
    s.edges = false
    debug.update()
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(name !== 'edges')
  })

  it('lays each part down its middle where it was shaped: run-in, kicker face, the drop under the flight, landing slope, runout', () => {
    const debug = drawn()
    expect(field.bigAirs).toHaveLength(2)
    for (const [i, air] of field.bigAirs!.entries()) {
      const spans = [
        ['runIn', `run-in ${i + 1}`, air.start, air.foot],
        ['kicker', `face ${i + 1}`, air.foot, air],
        ['kicker', `drop ${i + 1}`, air, air.landing],
        ['landing', `landing ${i + 1}`, air.landing, air.zoneEnd],
        ['landing', `runout ${i + 1}`, air.zoneEnd, air.end],
      ] as const
      for (const [part, name, a, b] of spans) {
        const found = corners(mesh(debug.part(part), name))
        expect(found.length, name).toBeGreaterThan(4)
        for (const p of found) {
          const { across, along, length } = offLine(p, a, b)
          expect(across, name).toBeLessThan(1)
          expect(along, name).toBeGreaterThan(-1)
          expect(along, name).toBeLessThan(length + 1)
        }
      }
      const lip = new THREE.Box3().setFromObject(mesh(debug.part('kicker'), `lip ${i + 1}`))
      expect(lip.max.y - lip.min.y).toBeCloseTo(air.faceHeight, 1)
    }
  })

  it('draws the edges of its floor and of its banks, either side of its middle', () => {
    const debug = drawn()
    const air = field.bigAirs![0]
    for (const [name, out] of [['floor 1', 7], ['banks 1', 7 + 15]] as const) {
      for (const p of corners(mesh(debug.part('edges'), name))) expect(Math.abs(offLine(p, air.start, air.end).across - out), name).toBeLessThan(0.5)
    }
  })

  it('draws each one\'s flight as measured at its speed, from where you take off to where you land', () => {
    const debug = drawn()
    const ours = jumps.filter((j) => j.source === 'bigAir')
    expect(ours).toHaveLength(2)
    for (const [i, jump] of ours.entries()) {
      const arc = corners(mesh(debug.part('flights'), `flight ${i + 1}`))
      const nearest = (p: { x: number; y: number; z: number }) => Math.min(...arc.map((q) => q.distanceTo(new THREE.Vector3(p.x, p.y, p.z))))
      expect(nearest(jump.flight[0])).toBeLessThan(0.5)
      expect(nearest(jump.flight.at(-1)!)).toBeLessThan(0.5)
      expect(Math.max(...arc.map((p) => p.y))).toBeGreaterThan(jump.lip.y + 3) // up over the lip
    }
  })

  it('labels each with what you get and what it was built for, by what it draws', () => {
    const labels = drawn().part('labels')
    const air = field.bigAirs![0]
    const jump = jumps.filter((j) => j.source === 'bigAir')[0]
    const top = textOf(labels, 'big air 1:')!
    expect(top.text).toContain(`${jump.airtime.toFixed(1)} s of air at 90 km/h`)
    expect(top.text).toContain(`kicker ${air.faceHeight.toFixed(1)} m tall`)
    expect(Math.hypot(top.sprite.position.x - air.x, top.sprite.position.z - air.z)).toBeLessThan(0.5)
    const planned = textOf(labels, 'built to land 1')!
    expect(Math.hypot(planned.sprite.position.x - air.landing.x, planned.sprite.position.z - air.landing.z)).toBeLessThan(0.5)
    expect(planned.text).toContain(`${air.airtime.toFixed(1)} s`)
    expect(textOf(labels, 'run-in 1')).toBeDefined()
    expect(textOf(labels, 'shaping 0.2 × hills 40 m = 8 m')).toBeDefined()
    expect(textOf(labels, 'lands 1')).toBeDefined()
  })

  it('draws nothing for a map without big air', () => {
    const debug = new BigAirDebug(new THREE.Scene(), groundAt, { ...structuredClone(config.bigAirDebug), show: true })
    const none = { ...map, bigAir: { ...map.bigAir, count: 0 } }
    debug.show(generateTerrain(none), none, [])
    for (const name of PARTS) expect(debug.part(name).children, name).toHaveLength(0)
  })
})
