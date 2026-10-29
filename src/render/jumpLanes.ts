import * as THREE from 'three'
import type { JumpGuideSettings } from '../config'
import type { JumpSpot } from '../world/jumpFinder'

/**
 * Lanes marking good jumps: a ribbon with arrows laid on the ground up each
 * run-up to its lip, and a ring where you'd land. Only the best few near you
 * show, ahead of you and pointing your way, fading in and out as that
 * changes. No collision: they're only drawn.
 */

const LANE_WIDTH = 2.6
/** Lifted this far off the ground so they don't flicker into it, metres. */
const LIFT = 0.06
const COLOR = 0xff2d9b
/** Seconds a lane takes to fade in or out. */
const FADE = 0.4
/** Seconds between picking which lanes to show. */
const REPICK = 0.25
/** A run-up starting this close counts as ahead whichever way you face, metres; and how far ahead, either side, degrees. */
const CLOSE = 20
const AHEAD = 75
/** A jump counts as pointing your way within this many degrees of where you're heading. */
const YOUR_WAY = 60
/** Riding up a lane: this far off its line still counts as on it, metres. */
const ON_LANE = 15
const LANDING_RING = [2.2, 2.9]
const DEG = Math.PI / 180

/**
 * Which jumps to mark for a bike at `at` heading `heading` (compass degrees):
 * the best few within reach, ahead, pointing much its way, the ones it's
 * heading straight at first. One it's already riding up (in `shown`) stays
 * until it's past the lip.
 */
export function pickLanes(
  jumps: readonly JumpSpot[],
  at: { x: number; z: number },
  heading: number,
  settings: JumpGuideSettings,
  shown: ReadonlySet<number>,
): number[] {
  const riding: number[] = []
  const ahead: number[] = []
  const relevance = new Map<number, number>()
  jumps.forEach((jump, i) => {
    if (jump.score < settings.minScore) return
    const dx = Math.sin(jump.heading * DEG)
    const dz = -Math.cos(jump.heading * DEG)
    const fromLip = { x: at.x - jump.lip.x, z: at.z - jump.lip.z }
    const pastLip = fromLip.x * dx + fromLip.z * dz
    const offLine = Math.abs(fromLip.x * -dz + fromLip.z * dx)
    if (shown.has(i) && pastLip < 0 && offLine < ON_LANE) {
      riding.push(i)
      return
    }
    const start = jump.runUp[0]
    const toStart = Math.hypot(start.x - at.x, start.z - at.z)
    if (toStart > settings.showWithin) return
    const facing = Math.abs(turnBetween(Math.atan2(start.x - at.x, -(start.z - at.z)) / DEG, heading))
    if (toStart > CLOSE && facing > AHEAD) return
    const turn = Math.abs(turnBetween(jump.heading, heading))
    if (turn > YOUR_WAY) return
    // what you're heading straight at comes first: a good jump off to the side counts for less
    relevance.set(i, jump.score * Math.cos(Math.min(facing, AHEAD) * DEG) * Math.cos(turn * DEG))
    ahead.push(i)
  })
  ahead.sort((a, b) => relevance.get(b)! - relevance.get(a)!)
  return [...riding, ...ahead].slice(0, Math.max(settings.lanes, riding.length))
}

type Marker = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

export class JumpLanes {
  private lanes: Marker[] = []
  private rings: Marker[] = []
  private shown = new Set<number>()
  private untilRepick = 0
  private readonly group = new THREE.Group()
  private readonly arrows = arrowTexture()

  constructor(
    scene: THREE.Scene,
    private jumps: readonly JumpSpot[],
    private readonly groundAt: (x: number, z: number) => number,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: JumpGuideSettings,
  ) {
    scene.add(this.group)
    this.build()
  }

  /** The lane drawn for jump `i`. */
  lane(i: number): Marker {
    return this.lanes[i]
  }

  /** A new set of jumps (the map changed). */
  replace(jumps: readonly JumpSpot[]): void {
    for (const marker of [...this.lanes, ...this.rings]) {
      marker.geometry.dispose()
      marker.material.dispose()
    }
    this.group.clear()
    this.jumps = jumps
    this.shown = new Set()
    this.build()
  }

  /** Call once a frame with where the bike is and its compass heading. */
  update(at: { x: number; z: number }, heading: number, dt: number): void {
    this.untilRepick -= dt
    if (this.untilRepick <= 0) {
      this.untilRepick = REPICK
      this.shown = this.settings.show ? new Set(pickLanes(this.jumps, at, heading, this.settings, this.shown)) : new Set()
    }
    const ease = 1 - Math.exp(-dt / FADE)
    this.lanes.forEach((lane, i) => {
      const to = this.shown.has(i) ? 1 : 0
      const opacity = lane.material.opacity + (to - lane.material.opacity) * ease
      lane.material.opacity = opacity < 0.005 && to === 0 ? 0 : opacity
      lane.visible = lane.material.opacity > 0
      this.rings[i].material.opacity = lane.material.opacity * 0.8
      this.rings[i].visible = lane.visible
    })
  }

  private build(): void {
    this.lanes = this.jumps.map((jump) => this.marker(laneShape(jump.runUp, this.groundAt), this.arrows))
    this.rings = this.jumps.map((jump) => this.marker(ringShape(jump.landing, this.groundAt), null))
  }

  private marker(geometry: THREE.BufferGeometry, map: THREE.Texture | null): Marker {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: COLOR,
        map,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -6,
      }),
    )
    mesh.visible = false
    mesh.renderOrder = 3
    this.group.add(mesh)
    return mesh
  }
}

/** A ribbon along the run-up, lying on the ground across its width too, the arrows repeating along it. */
function laneShape(path: readonly { x: number; z: number }[], groundAt: (x: number, z: number) => number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  let along = 0
  path.forEach((point, i) => {
    const before = path[Math.max(i - 1, 0)]
    const after = path[Math.min(i + 1, path.length - 1)]
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1
    // across the lane, flat: the way it runs turned a quarter
    const ax = ((after.z - before.z) / length) * (LANE_WIDTH / 2)
    const az = (-(after.x - before.x) / length) * (LANE_WIDTH / 2)
    if (i > 0) along += Math.hypot(point.x - path[i - 1].x, point.z - path[i - 1].z)
    for (const side of [-1, 1]) {
      const x = point.x + ax * side
      const z = point.z + az * side
      positions.push(x, groundAt(x, z) + LIFT, z)
      uvs.push(side < 0 ? 0 : 1, along / LANE_WIDTH)
    }
  })
  const index: number[] = []
  for (let i = 0; i < path.length - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  return geometry
}

/** A ring lying on the ground around where you'd land. */
function ringShape(at: { x: number; z: number }, groundAt: (x: number, z: number) => number): THREE.BufferGeometry {
  const steps = 40
  const positions: number[] = []
  for (let k = 0; k <= steps; k++) {
    const angle = (k / steps) * Math.PI * 2
    for (const r of LANDING_RING) {
      const x = at.x + Math.cos(angle) * r
      const z = at.z + Math.sin(angle) * r
      positions.push(x, groundAt(x, z) + LIFT, z)
    }
  }
  const index: number[] = []
  for (let k = 0; k < steps; k++) index.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}

/** Arrows pointing along the lane (up the texture), with solid edges and a faint fill between. */
function arrowTexture(): THREE.DataTexture {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const tip = 0.72 - Math.abs(u - 0.5) * 0.9 // a ^ shape
      const arrow = Math.abs(v - tip) < 0.07 && Math.abs(u - 0.5) < 0.36
      const edge = u < 0.07 || u > 0.93
      const alpha = arrow || edge ? 235 : 45
      data.set([255, 255, 255, alpha], (y * size + x) * 4)
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

/** The way from heading `b` to heading `a`, -180 to 180 degrees. */
function turnBetween(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}
