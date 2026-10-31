import * as THREE from 'three'
import type { TrackDebugSettings } from '../config'
import type { MapDef } from '../maps/types'
import type { Heightfield } from '../terrain/heightfield'

/**
 * A debug view of the track, drawn on the ground: the line down its middle,
 * the edges of its floor and of its banks, and its kickers (face, drop and a
 * post at the lip). Each part has its own checkbox. Only drawn: no collision.
 */

type Part = 'middle' | 'floor' | 'banks' | 'kickers'
type Path = readonly { x: number; z: number }[]

/** Lifted this far off the ground so they don't flicker into it, metres. */
const LIFT = 0.08
const LINE_WIDTH = 0.35
const KICKER_WIDTH = 1.2
const POST = { width: 0.3, height: 3 }
const COLORS = { middle: 0xffffff, floor: 0xffd23f, banks: 0x3fb8ff, face: 0xff8a00, drop: 0xff2020, lip: 0xff2020 }

export class TrackDebug {
  private readonly parts = new Map<Part, THREE.Group>()

  constructor(
    scene: THREE.Scene,
    private readonly groundAt: (x: number, z: number) => number,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: TrackDebugSettings,
  ) {
    for (const name of ['middle', 'floor', 'banks', 'kickers'] as const) {
      const group = new THREE.Group()
      group.name = name
      group.visible = false
      scene.add(group)
      this.parts.set(name, group)
    }
  }

  /** One part's drawing. */
  part(name: Part): THREE.Group {
    return this.parts.get(name)!
  }

  /** Draws the track `field` was built with (`track` its settings then); none if it has none. */
  show(field: Heightfield, track: MapDef['track']): void {
    for (const group of this.parts.values()) {
      for (const child of group.children) disposeMesh(child as THREE.Mesh)
      group.clear()
    }
    const line = field.trackLine
    if (!line?.length) return
    const add = (part: Part, name: string, geometry: THREE.BufferGeometry, color: number) => {
      const mesh = new THREE.Mesh(geometry, debugMaterial(color))
      mesh.name = name
      mesh.renderOrder = 4
      this.part(part).add(mesh)
    }
    add('middle', 'middle', ribbon([...line, line[0]], this.groundAt, LINE_WIDTH), COLORS.middle)
    for (const side of [-1, 1]) {
      add('floor', side < 0 ? 'left' : 'right', ribbon(offset(line, (side * track.width) / 2), this.groundAt, LINE_WIDTH), COLORS.floor)
      add('banks', side < 0 ? 'left' : 'right', ribbon(offset(line, side * (track.width / 2 + track.banks)), this.groundAt, LINE_WIDTH), COLORS.banks)
    }
    const indexOf = (p: { x: number; z: number }) => line.findIndex((q) => q.x === p.x && q.z === p.z)
    for (const [i, jump] of (field.trackJumps ?? []).entries()) {
      const lip = indexOf(jump)
      add('kickers', `face ${i + 1}`, ribbon(between(line, indexOf(jump.foot), lip), this.groundAt, KICKER_WIDTH), COLORS.face)
      add('kickers', `drop ${i + 1}`, ribbon(between(line, lip, indexOf(jump.end)), this.groundAt, KICKER_WIDTH), COLORS.drop)
      const post = new THREE.BoxGeometry(POST.width, POST.height, POST.width)
      post.translate(jump.x, this.groundAt(jump.x, jump.z) + POST.height / 2, jump.z)
      add('kickers', `lip ${i + 1}`, post, COLORS.lip)
    }
  }

  /** Call once a frame (or after a setting changes): shows the parts switched on. */
  update(): void {
    const { settings } = this
    for (const [name, group] of this.parts) group.visible = settings.show && settings[name]
  }
}

/** The line's points from `from` to `to`, the short way round the loop. */
function between(line: Path, from: number, to: number): Path {
  const n = line.length
  const step = (to - from + n) % n <= n / 2 ? 1 : -1
  const path = [line[from]]
  for (let k = from; k !== to; ) {
    k = (k + step + n) % n
    path.push(line[k])
  }
  return path
}

/** The loop moved `by` metres to its right (negative: left) all the way round, closed. */
function offset(line: Path, by: number): Path {
  const n = line.length
  const moved = line.map((p, k) => {
    const before = line[(k - 1 + n) % n]
    const after = line[(k + 1) % n]
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1
    // right of the way the line runs: its direction turned a quarter clockwise
    return { x: p.x - ((after.z - before.z) / length) * by, z: p.z + ((after.x - before.x) / length) * by }
  })
  return [...moved, moved[0]]
}

/** A flat strip `width` wide along `path`, lying on the ground. */
function ribbon(path: Path, groundAt: (x: number, z: number) => number, width: number): THREE.BufferGeometry {
  const positions: number[] = []
  path.forEach((point, i) => {
    const before = path[Math.max(i - 1, 0)]
    const after = path[Math.min(i + 1, path.length - 1)]
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1
    const ax = ((after.z - before.z) / length) * (width / 2)
    const az = (-(after.x - before.x) / length) * (width / 2)
    for (const side of [-1, 1]) {
      const x = point.x + ax * side
      const z = point.z + az * side
      positions.push(x, groundAt(x, z) + LIFT, z)
    }
  })
  const index: number[] = []
  for (let i = 0; i < path.length - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}

function debugMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  ;(mesh.material as THREE.Material).dispose()
}
