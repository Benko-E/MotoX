import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { MapDef } from '../src/maps/types'
import { labelsIn } from '../src/render/debugDraw'
import { TrackDebug } from '../src/render/trackDebug'
import { generateTerrain } from '../src/terrain/generate'
import { heightAt, type Heightfield } from '../src/terrain/heightfield'
import { featureJumps } from '../src/world/jumps'

/** A loop track 90 m out on flat ground, with two kickers. */
const track: MapDef['track'] = { show: true, way: 'clockwise', radius: 90, winding: 0, width: 8, banks: 10, flatness: 1, smoothing: 40, jumps: 2, jumpHeight: 3, jumpLength: 20, jumpVary: 0, jumpSpeed: 80, landingStraight: 1 }
const map: MapDef = {
  size: 300,
  cellSize: 1,
  hills: { seed: 1, height: 0, wavelength: 40, octaves: 3, roughness: 0.5 },
  edge: { start: 150, rise: 0 },
  clearing: { x: 0, z: 0, radius: 15, blend: 10, calm: 0 },
  track,
  spawn: { x: 0, z: 0, heading: 0 },
}
const field = generateTerrain(map)
const groundAt = (x: number, z: number) => heightAt(field, x, z)
const middle = { x: 0, z: 0 }
/** Switched on, every part with it. */
const settings = () => ({ ...structuredClone(config.trackDebug), show: true })
const PARTS = ['middle', 'floor', 'banks', 'ring', 'kickers', 'straights', 'flights', 'labels'] as const

function drawn(s = settings(), on: Heightfield = field, t: MapDef['track'] = track) {
  const scene = new THREE.Scene()
  const debug = new TrackDebug(scene, groundAt, s)
  debug.show(on, t, middle, featureJumps(on))
  debug.update()
  return { scene, debug }
}
/** Every corner of every mesh in a part (or one object). */
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
/** How far a point is from the track's middle line, across the ground. */
const offLine = (p: { x: number; z: number }, on: Heightfield = field) => Math.min(...on.trackLine!.map((q) => Math.hypot(p.x - q.x, p.z - q.z)))
const fromMiddle = (p: { x: number; z: number }) => Math.hypot(p.x - middle.x, p.z - middle.z)
/** The label whose text has `words` in it. */
const labelWith = (debug: TrackDebug, words: string) => labelsIn(debug.part('labels')).find((l) => l.text.includes(words))

describe('the track debug view', () => {
  it('is hidden until switched on; then each part shows with its own checkbox, live', () => {
    const s = settings()
    s.show = false
    const { debug } = drawn(s)
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(false)
    s.show = true
    s.banks = false
    s.flights = false
    debug.update()
    for (const name of PARTS) expect(debug.part(name).visible, name).toBe(name !== 'banks' && name !== 'flights')
  })

  it('draws its middle line lying on the ground, all the way round', () => {
    const { debug } = drawn()
    const points = corners(debug.part('middle').children.find((c) => c.name === 'middle')!)
    for (const p of points) {
      expect(p.y - groundAt(p.x, p.z)).toBeGreaterThan(0)
      expect(p.y - groundAt(p.x, p.z)).toBeLessThan(0.3)
      expect(offLine(p)).toBeLessThan(0.5)
    }
    const bearings = new Set(points.map((p) => Math.round((Math.atan2(p.x, -p.z) * 180) / Math.PI / 30)))
    expect(bearings.size).toBeGreaterThanOrEqual(12) // round every twelfth of the loop
  })

  it('arrows along the middle line point the way the track is ridden', () => {
    for (const way of ['clockwise', 'counterclockwise'] as const) {
      const t = { ...track, way }
      const on = generateTerrain({ ...map, track: t })
      const { debug } = drawn(settings(), on, t)
      const arrows = debug.part('middle').children.filter((c) => c.name.startsWith('way '))
      expect(arrows.length, way).toBeGreaterThan(10)
      for (const arrow of arrows) {
        const [tip, ...base] = corners(arrow)
        const back = base[0].clone().add(base[1]).multiplyScalar(0.5)
        // seen from above, the loop is ridden clockwise when it turns right round the middle: tip ahead of base that way
        const turning = Math.sign((back.x - middle.x) * (tip.z - back.z) - (back.z - middle.z) * (tip.x - back.x))
        expect(turning, way).toBe(way === 'clockwise' ? 1 : -1)
        expect(offLine(tip, on), way).toBeLessThan(1)
      }
    }
  })

  it('marks the edges of its floor half its width out, and of its banks that far again', () => {
    const { debug } = drawn()
    for (const p of corners(debug.part('floor'))) expect(Math.abs(offLine(p) - track.width / 2), JSON.stringify(p)).toBeLessThan(0.6)
    // (on the inside of a sharp corner, where a straight meets the curve, an edge pushed out that far comes nearer another stretch of the line)
    const banks = corners(debug.part('banks')).map((p) => Math.abs(offLine(p) - (track.width / 2 + track.banks)))
    expect(banks.filter((off) => off < 0.6).length).toBeGreaterThan(banks.length * 0.95)
    expect(Math.max(...banks)).toBeLessThan(2)
  })

  it('rings the radius it runs round, and how far its winding lets it wander in and out', () => {
    const wound = { ...track, winding: 0.2 }
    const on = generateTerrain({ ...map, track: wound })
    const { debug } = drawn(settings(), on, wound)
    const ring = debug.part('ring')
    for (const [name, r] of [['radius', 90], ['wander in', 90 * 0.8], ['wander out', 90 * 1.2]] as const) {
      const points = corners(ring.getObjectByName(name)!)
      expect(points.length, name).toBeGreaterThan(100)
      for (const p of points) expect(Math.abs(fromMiddle(p) - r), name).toBeLessThan(0.5)
    }
    // and the line really does stay between them
    for (const p of on.trackLine!) {
      expect(fromMiddle(p)).toBeGreaterThan(90 * 0.8 - 1)
      expect(fromMiddle(p)).toBeLessThan(90 * 1.2 + 1)
    }
  })

  it('marks each kicker: its face and its drop along the line, and a post at its lip as tall as it was built', () => {
    const { debug } = drawn()
    const kickers = debug.part('kickers')
    for (const [i, jump] of field.trackJumps!.entries()) {
      const box = new THREE.Box3().setFromObject(kickers.getObjectByName(`lip ${i + 1}`)!)
      expect(Math.hypot(box.getCenter(new THREE.Vector3()).x - jump.x, box.getCenter(new THREE.Vector3()).z - jump.z)).toBeLessThan(0.5)
      expect(Math.abs(box.min.y - groundAt(jump.x, jump.z))).toBeLessThan(0.1)
      expect(box.max.y - box.min.y).toBeCloseTo(jump.height, 1)
      // the face runs from the foot to the lip, the drop on to the end
      const face = corners(kickers.getObjectByName(`face ${i + 1}`)!)
      expect(Math.min(...face.map((p) => Math.hypot(p.x - jump.foot.x, p.z - jump.foot.z)))).toBeLessThan(1.5)
      expect(Math.min(...face.map((p) => Math.hypot(p.x - jump.x, p.z - jump.z)))).toBeLessThan(1.5)
      expect(face.reduce((far, p) => Math.max(far, Math.hypot(p.x - jump.foot.x, p.z - jump.foot.z)), 0)).toBeLessThan(track.jumpLength) // not round the loop the long way
      const drop = corners(kickers.getObjectByName(`drop ${i + 1}`)!)
      expect(Math.min(...drop.map((p) => Math.hypot(p.x - jump.end.x, p.z - jump.end.z)))).toBeLessThan(1.5)
    }
  })

  it('draws the straight round each kicker: fully straight from its start to its end, easing in and out either side', () => {
    const { debug } = drawn()
    const straights = debug.part('straights')
    for (const [i, jump] of field.trackJumps!.entries()) {
      const { easeFrom, from, to, easeTo } = jump.straight!
      const full = corners(straights.getObjectByName(`straight ${i + 1}`)!)
      for (const p of full) expect(offLine(p)).toBeLessThan(0.6)
      const near = (points: THREE.Vector3[], q: { x: number; z: number }) => Math.min(...points.map((p) => Math.hypot(p.x - q.x, p.z - q.z)))
      expect(near(full, from)).toBeLessThan(1.5)
      expect(near(full, to)).toBeLessThan(1.5)
      expect(near(full, jump)).toBeLessThan(1.5) // past the lip
      expect(near(corners(straights.getObjectByName(`ease in ${i + 1}`)!), easeFrom)).toBeLessThan(1.5)
      expect(near(corners(straights.getObjectByName(`ease out ${i + 1}`)!), easeTo)).toBeLessThan(1.5)
    }
  })

  it('draws each kicker\'s flight at the speed it was built for, up off the lip and down to a ring where you land', () => {
    const { debug } = drawn()
    const flights = debug.part('flights')
    for (const [i, jump] of featureJumps(field).entries()) {
      const arc = corners(flights.getObjectByName(`flight ${i + 1}`)!)
      expect(Math.min(...arc.map((p) => Math.hypot(p.x - jump.lip.x, p.z - jump.lip.z)))).toBeLessThan(1)
      expect(Math.min(...arc.map((p) => Math.hypot(p.x - jump.landing.x, p.z - jump.landing.z)))).toBeLessThan(1)
      expect(Math.max(...arc.map((p) => p.y))).toBeGreaterThan(jump.lip.y + 1)
      const ring = new THREE.Box3().setFromObject(flights.getObjectByName(`landing ${i + 1}`)!).getCenter(new THREE.Vector3())
      expect(Math.hypot(ring.x - jump.landing.x, ring.z - jump.landing.z)).toBeLessThan(0.5)
    }
  })

  it('labels what each setting is, with its number, next to the line it draws', () => {
    const { debug } = drawn()
    const at = (words: string) => {
      const label = labelWith(debug, words)
      expect(label, words).toBeDefined()
      return label!.sprite.position
    }
    expect(Math.abs(fromMiddle(at('radius 90 m')) - 90)).toBeLessThan(3)
    expect(Math.abs(fromMiddle(at('winding 0')) - 90)).toBeLessThan(3) // no winding: on the radius
    expect(offLine(at('width 8 m'))).toBeLessThan(8)
    expect(offLine(at('banks 10 m'))).toBeLessThan(18)
    expect(offLine(at('ridden clockwise'))).toBeLessThan(3)
    for (const [i, jump] of field.trackJumps!.entries()) {
      const kicker = labelsIn(debug.part('labels')).find((l) => l.text.includes(`kicker ${i + 1}`))!
      expect(kicker.text).toContain('length 20 m')
      expect(kicker.text).toContain('height 3 m')
      expect(Math.hypot(kicker.sprite.position.x - jump.x, kicker.sprite.position.z - jump.z)).toBeLessThan(2)
      const straight = labelsIn(debug.part('labels')).find((l) => l.text.includes(`landing straight ${i + 1}`))!
      expect(straight.text).toContain('1 × 20 m')
      expect(Math.hypot(straight.sprite.position.x - jump.straight!.to.x, straight.sprite.position.z - jump.straight!.to.z)).toBeLessThan(2)
    }
    for (const [i, jump] of featureJumps(field).entries()) {
      const flight = labelsIn(debug.part('labels')).find((l) => l.text.includes(`lands ${i + 1}`))!
      expect(flight.text).toContain('80 km/h')
      expect(Math.hypot(flight.sprite.position.x - jump.landing.x, flight.sprite.position.z - jump.landing.z)).toBeLessThan(2)
    }
  })

  it('keeps its labels the same size on screen, near or far: they grow in step with the distance to the camera', () => {
    const { debug } = drawn()
    const label = labelWith(debug, 'radius 90 m')!
    const sizeFrom = (distance: number) => {
      debug.update(label.sprite.position.clone().add(new THREE.Vector3(0, 0, distance)))
      return label.sprite.scale.y / distance
    }
    const near = sizeFrom(5)
    expect(sizeFrom(10)).toBeCloseTo(near, 6)
    expect(sizeFrom(400)).toBeCloseTo(near, 6)
  })

  it('a rebuilt map replaces it, and a map with no track draws nothing', () => {
    const { scene, debug } = drawn()
    const before = scene.children.length
    debug.show(field, track, middle, featureJumps(field))
    expect(scene.children.length).toBe(before)
    debug.show(generateTerrain({ ...map, track: { ...track, show: false } }), track, middle, [])
    for (const name of PARTS) expect(corners(debug.part(name)), name).toHaveLength(0)
    expect(labelsIn(debug.part('labels'))).toHaveLength(0)
  })
})
