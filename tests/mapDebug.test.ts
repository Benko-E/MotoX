import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { MapDef } from '../src/maps/types'
import { ClearingDebug } from '../src/render/clearingDebug'
import { labelsIn } from '../src/render/debugDraw'
import { LandDebug } from '../src/render/landDebug'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt } from '../src/terrain/heightfield'
import { flattestSpotNear } from '../src/terrain/startingSpot'

const map: MapDef = {
  size: 240,
  cellSize: 1,
  hills: { seed: 4, height: 6, wavelength: 50, octaves: 3, roughness: 0.5 },
  edge: { start: 90, rise: 20 },
  clearing: { x: 10, z: -5, radius: 30, blend: 15, calm: 0.8 },
  track: { show: false, way: 'clockwise', radius: 90, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 0, jumpHeight: 3, jumpLength: 20, jumpVary: 0, jumpSpeed: 80, landingStraight: 1 },
  bigAir: { count: 0, speed: 90, angle: 35, shaping: 0.2, width: 14, banks: 15, spread: 300 },
  spawn: { x: 20, z: 15, heading: 90 },
}
const field = generateTerrain(map)
const groundAt = (x: number, z: number) => heightAt(field, x, z)

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

describe('the clearing debug view', () => {
  const PARTS = ['middle', 'radius', 'edge', 'blend', 'labels'] as const
  const drawn = (s = { ...structuredClone(config.clearingDebug), show: true }) => {
    const debug = new ClearingDebug(new THREE.Scene(), groundAt, s)
    debug.show(field, map.clearing)
    debug.update()
    return debug
  }
  const fromMiddle = (p: { x: number; z: number }) => Math.hypot(p.x - 10, p.z + 5)

  it('is hidden until switched on; then each part shows with its own checkbox', () => {
    const s = { ...structuredClone(config.clearingDebug), show: false }
    const debug = drawn(s)
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(false)
    s.show = true
    s.blend = false
    debug.update()
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(name !== 'blend')
  })

  it('marks its middle, rings its radius, and draws its calm edge as it really wanders round that', () => {
    const debug = drawn()
    const middle = new THREE.Box3().setFromObject(mesh(debug.part('middle'), 'middle')).getCenter(new THREE.Vector3())
    expect(fromMiddle(middle)).toBeLessThan(0.3)
    for (const p of corners(mesh(debug.part('radius'), 'radius'))) expect(Math.abs(fromMiddle(p) - 30)).toBeLessThan(0.5)
    const edge = field.clearingEdge!
    for (const p of corners(mesh(debug.part('edge'), 'edge'))) expect(Math.min(...edge.map((q) => Math.hypot(p.x - q.x, p.z - q.z)))).toBeLessThan(1.5)
  })

  it('draws where its blend back into the hills ends: blend metres out past its calm edge, all the way round', () => {
    const debug = drawn()
    const edge = field.clearingEdge!
    const edgeOut = (p: { x: number; z: number }) => {
      // the calm edge's distance out at this bearing
      const bearing = Math.atan2(p.x - 10, -(p.z + 5))
      let best = edge[0]
      for (const q of edge) {
        const b = Math.atan2(q.x - 10, -(q.z + 5))
        if (Math.abs(Math.atan2(Math.sin(b - bearing), Math.cos(b - bearing))) < Math.abs(Math.atan2(Math.sin(Math.atan2(best.x - 10, -(best.z + 5)) - bearing), Math.cos(Math.atan2(best.x - 10, -(best.z + 5)) - bearing)))) best = q
      }
      return fromMiddle(best)
    }
    for (const p of corners(mesh(debug.part('blend'), 'blend'))) expect(Math.abs(fromMiddle(p) - (edgeOut(p) + 15))).toBeLessThan(1.5)
  })

  it('labels each setting with its number, by what it draws', () => {
    const labels = drawn().part('labels')
    expect(Math.abs(Math.hypot(textOf(labels, 'radius 30 m')!.sprite.position.x - 10, textOf(labels, 'radius 30 m')!.sprite.position.z + 5) - 30)).toBeLessThan(2)
    expect(textOf(labels, 'radius 30 m')!.text).toContain('6 m') // how far its edge may wander: 20%
    expect(textOf(labels, 'blend 15 m')).toBeDefined()
    expect(textOf(labels, 'calm 0.8')).toBeDefined()
    expect(textOf(labels, 'clearing middle')).toBeDefined()
  })

  it('draws nothing for a map without a clearing', () => {
    const debug = new ClearingDebug(new THREE.Scene(), groundAt, { ...structuredClone(config.clearingDebug), show: true })
    debug.show(generateTerrain({ ...map, clearing: { ...map.clearing, radius: 0 } }), { ...map.clearing, radius: 0 })
    for (const name of PARTS) expect(corners(debug.part(name)), name).toHaveLength(0)
    expect(labelsIn(debug.part('labels'))).toHaveLength(0)
  })
})

describe('every debug view', () => {
  it('is drawn through the fog: its lines and labels stay clear from high up or far off', () => {
    const scene = new THREE.Scene()
    const clearing = new ClearingDebug(scene, groundAt, { ...structuredClone(config.clearingDebug), show: true })
    clearing.show(field, map.clearing)
    const land = new LandDebug(scene, groundAt, { ...structuredClone(config.landDebug), show: true })
    land.show(field, map, 25)
    let drawn = 0
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return
      drawn++
      expect((child.material as THREE.Material & { fog: boolean }).fog, child.name).toBe(false)
    })
    expect(drawn).toBeGreaterThan(10)
  })
})

describe('the land debug view', () => {
  const PARTS = ['edge', 'spawn', 'hills', 'labels'] as const
  const SEARCH = 25
  const drawn = (s = { ...structuredClone(config.landDebug), show: true }) => {
    const debug = new LandDebug(new THREE.Scene(), groundAt, s)
    debug.show(field, map, SEARCH)
    debug.update()
    return debug
  }
  const out = (p: { x: number; z: number }) => Math.max(Math.abs(p.x), Math.abs(p.z))

  it('is hidden until switched on; then each part shows with its own checkbox', () => {
    const s = { ...structuredClone(config.landDebug), show: false }
    const debug = drawn(s)
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(false)
    s.show = true
    s.hills = false
    debug.update()
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(name !== 'hills')
  })

  it('draws the square where the wall at the edge starts to rise, and the very edge of the map', () => {
    const debug = drawn()
    const starts = corners(mesh(debug.part('edge'), 'wall starts'))
    expect(starts.length).toBeGreaterThan(40)
    for (const p of starts) expect(Math.abs(out(p) - 90)).toBeLessThan(0.5)
    for (const side of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(starts.some((p) => p.x * side[0] + p.z * side[1] > 89)).toBe(true) // all four sides
    for (const p of corners(mesh(debug.part('edge'), 'map edge'))) expect(Math.abs(out(p) - 119)).toBeLessThan(1.5)
  })

  it('shows the spawn point facing its heading, how far round it the start is looked for, and the spot you really start on', () => {
    const debug = drawn()
    const [tip, a, b] = corners(mesh(debug.part('spawn'), 'spawn'))
    const back = a.clone().add(b).multiplyScalar(0.5)
    expect(tip.x - back.x).toBeGreaterThan(1) // heading 90: east, toward +x
    expect(Math.abs(tip.z - back.z)).toBeLessThan(0.1)
    for (const p of corners(mesh(debug.part('spawn'), 'search'))) expect(Math.abs(Math.hypot(p.x - 20, p.z - 15) - SEARCH)).toBeLessThan(0.5)
    const start = flattestSpotNear(field, 20, 15, SEARCH)
    const post = new THREE.Box3().setFromObject(mesh(debug.part('spawn'), 'start')).getCenter(new THREE.Vector3())
    expect(Math.hypot(post.x - start.x, post.z - start.z)).toBeLessThan(0.3)
  })

  it('lays a bar one hill wavelength long by the start, to show the size of the hills', () => {
    const debug = drawn()
    const bar = corners(mesh(debug.part('hills'), 'wavelength'))
    const xs = bar.map((p) => p.x)
    const zs = bar.map((p) => p.z)
    expect(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))).toBeCloseTo(50, -0.5)
  })

  it('labels each setting with its number, by what it draws', () => {
    const labels = drawn().part('labels')
    expect(out(textOf(labels, 'wall starts 90 m')!.sprite.position)).toBeCloseTo(90, -0.5)
    expect(textOf(labels, 'rises 20 m')).toBeDefined()
    expect(textOf(labels, 'spawn')!.text).toContain('90°')
    expect(textOf(labels, `within ${SEARCH} m`)).toBeDefined()
    expect(textOf(labels, 'wavelength 50 m')!.text).toContain('height 6 m')
  })
})
