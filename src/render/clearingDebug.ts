import * as THREE from 'three'
import type { ClearingDebugSettings } from '../config'
import type { MapDef } from '../maps/types'
import type { Heightfield } from '../terrain/heightfield'
import { circle, DebugView, num, post, ribbon, type GroundAt } from './debugDraw'

/**
 * A debug view of the clearing, drawn on the ground, each part with its own
 * checkbox: a post at its middle, its radius, its calm edge as it really
 * wanders round that, where its blend back into the hills ends, and labels
 * naming each setting with its number.
 */

type Part = 'middle' | 'radius' | 'edge' | 'blend' | 'labels'
const PARTS: Part[] = ['middle', 'radius', 'edge', 'blend', 'labels']

/** How far its edge wanders in or out of its radius, as a share of it (as the generator builds it). */
const RAGGED = 0.2
const MIDDLE_POST = 4
const COLORS = {
  middle: 0xffffff,
  radius: 0xd8d8ff,
  edge: 0xffffff,
  blend: 0x3fb8ff,
}

export class ClearingDebug extends DebugView<Part> {
  constructor(scene: THREE.Scene, groundAt: GroundAt, settings: ClearingDebugSettings) {
    super(scene, PARTS, groundAt, settings)
  }

  /** Draws the clearing `field` was built with (`clearing` its settings then); none if it has none. */
  show(field: Heightfield, clearing: MapDef['clearing']): void {
    this.clear()
    const edge = field.clearingEdge
    if (clearing.radius <= 0 || !edge?.length) return
    const { groundAt } = this
    const { x, z, radius, blend } = clearing

    this.add('middle', 'middle', post(x, z, MIDDLE_POST, groundAt), COLORS.middle)
    this.say(`clearing middle\ncalm ${num(clearing.calm)} (0 leaves the hills as they are, 1 makes it level)`, { x, z }, COLORS.middle, MIDDLE_POST + 1)

    this.add('radius', 'radius', ribbon(circle(x, z, radius), groundAt), COLORS.radius)
    this.say(`radius ${num(radius)} m\nits edge wanders up to ${num(radius * RAGGED)} m in or out of it`, { x, z: z - radius }, COLORS.radius)

    const loop = [...edge, edge[0]]
    this.add('edge', 'edge', ribbon(loop, groundAt), COLORS.edge)
    const east = edge.reduce((best, p) => (p.x > best.x ? p : best))
    this.say('calm edge, as it really runs', east, COLORS.edge)

    // its blend: each point of its edge pushed straight out from its middle
    const pushed = loop.map((p) => {
      const out = Math.hypot(p.x - x, p.z - z) || 1
      return { x: p.x + ((p.x - x) / out) * blend, z: p.z + ((p.z - z) / out) * blend }
    })
    this.add('blend', 'blend', ribbon(pushed, groundAt), COLORS.blend)
    const south = pushed.reduce((best, p) => (p.z > best.z ? p : best))
    this.say(`blend ${num(blend)} m: back into the hills by here`, south, COLORS.blend)
  }
}
