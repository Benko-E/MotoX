import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { MapDef } from '../src/maps/types'
import { TrackDebug } from '../src/render/trackDebug'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'

/** A loop track 90 m out on flat ground, with two kickers. */
const track: MapDef['track'] = { show: true, way: 'counterclockwise', radius: 90, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 2, jumpHeight: 3, jumpLength: 20, jumpVary: 0, jumpSpeed: 80, landingStraight: 1 }
const map: MapDef = {
  size: 260,
  cellSize: 1,
  hills: { seed: 1, height: 0, wavelength: 40, octaves: 3, roughness: 0.5 },
  edge: { start: 130, rise: 0 },
  clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0 },
  track,
  spawn: { x: 0, z: 0, heading: 0 },
}
const field = generateTerrain(map)
const groundAt = (x: number, z: number) => heightAt(field, x, z)
/** Switched on, every part with it. */
const settings = () => ({ ...structuredClone(config.trackDebug), show: true })

function drawn(s = settings(), on: Heightfield = field) {
  const scene = new THREE.Scene()
  const debug = new TrackDebug(scene, groundAt, s)
  debug.show(on, track)
  debug.update()
  return { scene, debug }
}
/** Every corner of every mesh in a part. */
function corners(part: THREE.Object3D): THREE.Vector3[] {
  const found: THREE.Vector3[] = []
  part.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const positions = child.geometry.getAttribute('position')
    for (let v = 0; v < positions.count; v++) found.push(new THREE.Vector3().fromBufferAttribute(positions, v).applyMatrix4(child.matrixWorld))
  })
  return found
}
/** How far a point is from the track's middle line, across the ground. */
const offLine = (p: THREE.Vector3) => Math.min(...field.trackLine!.map((q) => Math.hypot(p.x - q.x, p.z - q.z)))

describe('the track debug view', () => {
  it('is hidden until switched on; then each part shows with its own checkbox, live', () => {
    const s = settings()
    s.show = false
    const { debug } = drawn(s)
    for (const name of ['middle', 'floor', 'banks', 'kickers'] as const) expect(debug.part(name).visible).toBe(false)
    s.show = true
    s.banks = false
    debug.update()
    expect(debug.part('middle').visible).toBe(true)
    expect(debug.part('floor').visible).toBe(true)
    expect(debug.part('banks').visible).toBe(false)
    expect(debug.part('kickers').visible).toBe(true)
  })

  it('draws its middle line lying on the ground, all the way round', () => {
    const { debug } = drawn()
    const points = corners(debug.part('middle'))
    for (const p of points) {
      expect(p.y - groundAt(p.x, p.z)).toBeGreaterThan(0)
      expect(p.y - groundAt(p.x, p.z)).toBeLessThan(0.3)
      expect(offLine(p)).toBeLessThan(0.5)
    }
    const bearings = new Set(points.map((p) => Math.round((Math.atan2(p.x, -p.z) * 180) / Math.PI / 30)))
    expect(bearings.size).toBeGreaterThanOrEqual(12) // round every twelfth of the loop
  })

  it('marks the edges of its floor half its width out, and of its banks that far again', () => {
    const { debug } = drawn()
    for (const p of corners(debug.part('floor'))) expect(Math.abs(offLine(p) - track.width / 2), JSON.stringify(p)).toBeLessThan(0.6)
    // (on the inside of a sharp corner, where a straight meets the curve, an edge pushed out that far comes nearer another stretch of the line)
    const banks = corners(debug.part('banks')).map((p) => Math.abs(offLine(p) - (track.width / 2 + track.banks)))
    expect(banks.filter((off) => off < 0.6).length).toBeGreaterThan(banks.length * 0.95)
    expect(Math.max(...banks)).toBeLessThan(2)
  })

  it('marks each kicker: its face and its drop along the line, and a post standing at its lip', () => {
    const { debug } = drawn()
    const kickers = debug.part('kickers')
    expect(kickers.getObjectByName('face 1')).toBeDefined()
    expect(kickers.getObjectByName('drop 2')).toBeDefined()
    for (const [i, jump] of field.trackJumps!.entries()) {
      const post = kickers.getObjectByName(`lip ${i + 1}`)!
      const box = new THREE.Box3().setFromObject(post)
      expect(Math.hypot(box.getCenter(new THREE.Vector3()).x - jump.x, box.getCenter(new THREE.Vector3()).z - jump.z)).toBeLessThan(0.5)
      expect(box.min.y).toBeLessThan(groundAt(jump.x, jump.z) + 0.1)
      expect(box.max.y).toBeGreaterThan(groundAt(jump.x, jump.z) + 2)
      // the face runs from the foot to the lip
      const face = corners(kickers.getObjectByName(`face ${i + 1}`)!)
      expect(Math.min(...face.map((p) => Math.hypot(p.x - jump.foot.x, p.z - jump.foot.z)))).toBeLessThan(1.5)
      expect(Math.min(...face.map((p) => Math.hypot(p.x - jump.x, p.z - jump.z)))).toBeLessThan(1.5)
      const length = face.reduce((far, p) => Math.max(far, Math.hypot(p.x - jump.foot.x, p.z - jump.foot.z)), 0)
      expect(length).toBeLessThan(track.jumpLength) // just the face, not round the loop the long way
    }
  })

  it('a rebuilt map replaces it, and a map with no track draws nothing', () => {
    const { scene, debug } = drawn()
    const before = scene.children.length
    debug.show(field, track)
    expect(scene.children.length).toBe(before)
    debug.show(generateTerrain({ ...map, track: { ...track, show: false } }), track)
    expect(corners(debug.part('middle'))).toHaveLength(0)
  })
})
