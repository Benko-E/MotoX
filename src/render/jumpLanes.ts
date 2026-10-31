import * as THREE from 'three'
import type { JumpGuideSettings } from '../config'
import type { JumpSpot } from '../world/jumps'

/**
 * A debug view of the jumps the map's features built: a ribbon with arrows
 * laid on the ground up each run-up to its lip, and a ring where you'd land.
 * All of them show while it's switched on. No collision: only drawn.
 */

const LANE_WIDTH = 2.6
/** Lifted this far off the ground so they don't flicker into it, metres. */
const LIFT = 0.06
const COLOR = 0xff2d9b
/** Seconds a lane takes to fade in or out. */
const FADE = 0.4
const LANDING_RING = [2.2, 2.9]

export type Marker = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

export class JumpLanes {
  private lanes: Marker[] = []
  private rings: Marker[] = []
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
    this.build()
  }

  /** Call once a frame: they fade in when the debug view is switched on, and out when it's off. */
  update(dt: number): void {
    this.lanes.forEach((lane, i) => fadeMarker(lane, this.rings[i], this.settings.show, dt))
  }

  private build(): void {
    this.lanes = this.jumps.map((jump) => laneMarker(this.group, laneShape(jump.runUp, this.groundAt), COLOR, this.arrows))
    this.rings = this.jumps.map((jump) => laneMarker(this.group, ringShape(jump.landing, this.groundAt), COLOR, null))
  }
}

/** A lane or ring mesh, see-through and starting hidden, added to `group`. */
export function laneMarker(group: THREE.Group, geometry: THREE.BufferGeometry, color: number, map: THREE.Texture | null): Marker {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
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
  group.add(mesh)
  return mesh
}

/** Fades a lane and its ring a frame further in (`on`) or out. */
export function fadeMarker(lane: Marker, ring: Marker, on: boolean, dt: number): void {
  const ease = 1 - Math.exp(-dt / FADE)
  const to = on ? 1 : 0
  const opacity = lane.material.opacity + (to - lane.material.opacity) * ease
  lane.material.opacity = opacity < 0.005 && to === 0 ? 0 : opacity
  lane.visible = lane.material.opacity > 0
  ring.material.opacity = lane.material.opacity * 0.8
  ring.visible = lane.visible
}

/** A ribbon along the run-up, lying on the ground across its width too, the arrows repeating along it. */
export function laneShape(path: readonly { x: number; z: number }[], groundAt: (x: number, z: number) => number): THREE.BufferGeometry {
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
export function ringShape(at: { x: number; z: number }, groundAt: (x: number, z: number) => number): THREE.BufferGeometry {
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
export function arrowTexture(): THREE.DataTexture {
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
