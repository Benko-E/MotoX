import * as THREE from 'three'
import type { EffectSettings } from '../config'

/**
 * The tracks the tyres leave in the dirt: a ribbon laid on the ground behind
 * each tyre, a piece at a time. Faint where the tyre just rolled, darker where
 * it slid, skidded or spun, and fading away over `lasts` seconds.
 */

/** A new piece is laid each time the tyre has moved this far, metres. */
const SPACING = 0.2
/** Moving further than this between two touches isn't rolling (a reset, a teleport): start afresh, metres. */
const TOO_FAR = 3
/** Lifted this far off the ground so the track doesn't flicker into it, metres. */
const LIFT = 0.015
const COLOR = new THREE.Color(0x2b1d10)

export interface TrackPiece {
  /** Middle of the track where the piece starts and ends. */
  start: THREE.Vector3
  end: THREE.Vector3
  /** How dark it was laid, 0 to 1. */
  darkness: number
  /** Seconds since it was laid. */
  age: number
  /** Where it's drawn in the mesh. */
  slot: number
}

interface Trail {
  pieces: TrackPiece[]
  /** Where the last piece ended, or null after leaving the ground. */
  last: THREE.Vector3 | null
  /** Its two edges, once a piece has been laid from there. */
  lastLeft: THREE.Vector3
  lastRight: THREE.Vector3
  hasEdges: boolean
  /** The hardest scrub since the last piece was laid. */
  scrub: number
}

export class TyreTracks {
  /** Most pieces kept per tyre (at 0.2 m each, 300 m of track). */
  static readonly MAX_PIECES = 1500
  readonly mesh: THREE.Mesh
  private readonly trails: Trail[]
  private readonly positions: Float32Array
  private readonly colors: Float32Array
  private readonly freeSlots: number[][]
  private laid = false

  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: EffectSettings['tyreTracks'],
    wheels = 2,
  ) {
    const slots = TyreTracks.MAX_PIECES * wheels
    this.positions = new Float32Array(slots * 4 * 3)
    this.colors = new Float32Array(slots * 4 * 4)
    const index = new Uint32Array(slots * 6)
    for (let s = 0; s < slots; s++) index.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 2, s * 4 + 1, s * 4 + 3], s * 6)
    for (let v = 0; v < slots * 4; v++) this.colors.set([COLOR.r, COLOR.g, COLOR.b, 0], v * 4)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage))
    geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    )
    this.mesh.frustumCulled = false // it's spread all over the map
    this.mesh.renderOrder = 1 // over the ground, under everything else that's see-through
    this.trails = Array.from({ length: wheels }, () => ({
      pieces: [],
      last: null,
      lastLeft: new THREE.Vector3(),
      lastRight: new THREE.Vector3(),
      hasEdges: false,
      scrub: 0,
    }))
    this.freeSlots = Array.from({ length: wheels }, (_, w) =>
      Array.from({ length: TyreTracks.MAX_PIECES }, (_, k) => w * TyreTracks.MAX_PIECES + TyreTracks.MAX_PIECES - 1 - k),
    )
  }

  /**
   * Tells the tracks where tyre `wheel` touches the ground this frame (null
   * when it's in the air), which way is up out of the ground there, and how
   * hard it's scrubbing (0 to 1).
   */
  touch(wheel: number, at: THREE.Vector3 | null, normal: THREE.Vector3, scrub: number): void {
    const trail = this.trails[wheel]
    if (!at || !this.settings.enabled) {
      trail.last = null
      return
    }
    trail.scrub = Math.max(trail.scrub, scrub)
    if (!trail.last || trail.last.distanceTo(at) > TOO_FAR) {
      trail.last = at.clone()
      trail.hasEdges = false
      trail.scrub = scrub
      return
    }
    if (trail.last.distanceTo(at) < SPACING) return

    // The track is as wide across the way it's laid, whichever way the tyre
    // points (sliding sideways too).
    const across = new THREE.Vector3().subVectors(at, trail.last).cross(normal).normalize().multiplyScalar(this.settings.width / 2)
    const edges = (centre: THREE.Vector3, left: THREE.Vector3, right: THREE.Vector3) => {
      const lifted = centre.clone().addScaledVector(normal, LIFT)
      left.copy(lifted).sub(across)
      right.copy(lifted).add(across)
    }
    if (!trail.hasEdges) edges(trail.last, trail.lastLeft, trail.lastRight)

    const { rolling, skidding } = this.settings
    const piece: TrackPiece = {
      start: trail.last.clone(),
      end: at.clone(),
      darkness: rolling + (skidding - rolling) * trail.scrub,
      age: 0,
      slot: this.takeSlot(wheel),
    }
    trail.pieces.push(piece)
    const left = new THREE.Vector3()
    const right = new THREE.Vector3()
    edges(at, left, right)
    this.writeCorners(piece.slot, trail.lastLeft, trail.lastRight, left, right)
    trail.last.copy(at)
    trail.lastLeft.copy(left)
    trail.lastRight.copy(right)
    trail.hasEdges = true
    trail.scrub = scrub
  }

  /** Ages and fades every piece; call once a frame. */
  update(dt: number): void {
    for (let w = 0; w < this.trails.length; w++) {
      const trail = this.trails[w]
      for (const piece of trail.pieces) piece.age += dt
      while (trail.pieces.length > 0 && this.opacity(trail.pieces[0]) <= 0) this.drop(w)
      for (const piece of trail.pieces) {
        const alpha = this.opacity(piece)
        for (let v = 0; v < 4; v++) this.colors[(piece.slot * 4 + v) * 4 + 3] = alpha
      }
    }
    const geometry = this.mesh.geometry
    geometry.getAttribute('color').needsUpdate = true
    if (this.laid) geometry.getAttribute('position').needsUpdate = true
    this.laid = false
  }

  /** The pieces of track tyre `wheel` has laid, oldest first. */
  pieces(wheel: number): readonly TrackPiece[] {
    return this.trails[wheel].pieces
  }

  /** How see-through a piece is drawn right now, 0 (gone) to 1. */
  opacity(piece: TrackPiece): number {
    return Math.max(piece.darkness * (1 - piece.age / Math.max(this.settings.lasts, 1e-6)), 0)
  }

  private takeSlot(wheel: number): number {
    if (this.freeSlots[wheel].length === 0) this.drop(wheel) // full: the oldest makes way
    return this.freeSlots[wheel].pop()!
  }

  private drop(wheel: number): void {
    const piece = this.trails[wheel].pieces.shift()!
    for (let v = 0; v < 4; v++) this.colors[(piece.slot * 4 + v) * 4 + 3] = 0
    this.freeSlots[wheel].push(piece.slot)
  }

  private writeCorners(slot: number, ...corners: THREE.Vector3[]): void {
    corners.forEach((corner, v) => this.positions.set([corner.x, corner.y, corner.z], (slot * 4 + v) * 3))
    this.laid = true
  }
}
