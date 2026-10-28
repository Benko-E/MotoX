import type { RampDef } from '../maps/types'
import { backLength, faceLength, headingAxes, jumpHeightAt } from './profile'

/** Points along the curved take-off face and the back slope. */
const FACE_SEGMENTS = 16
const BACK_SEGMENTS = 12
/** The sides reach this far below the base, so uneven ground never shows a gap. */
const SKIRT = 1

/**
 * A ramp as a triangle mesh in world space: the riding surface plus two side
 * walls. Plain arrays, no Three.js, so physics can use the same shape later.
 */
export function buildRampMesh(def: RampDef, baseY: number) {
  const face = faceLength(def)
  const back = backLength(def)
  const profile: number[] = []
  for (let i = 0; i <= FACE_SEGMENTS; i++) profile.push(-face + (face * i) / FACE_SEGMENTS)
  for (let i = 0; i <= BACK_SEGMENTS; i++) profile.push(def.deckLength + (back * i) / BACK_SEGMENTS)

  const { forward, right } = headingAxes(def.heading)
  const halfWidth = def.width / 2
  const positions: number[] = []
  const indices: number[] = []
  const point = (u: number, v: number, y: number) => {
    positions.push(def.x + forward.x * u + right.x * v, y, def.z + forward.z * u + right.z * v)
    return positions.length / 3 - 1
  }

  // Riding surface: a left and right vertex at every profile point.
  const top = profile.map((u) => {
    const y = baseY + jumpHeightAt(def, u)
    return [point(u, -halfWidth, y), point(u, halfWidth, y)]
  })
  for (let i = 0; i + 1 < top.length; i++) {
    const [a, b] = top[i]
    const [c, d] = top[i + 1]
    indices.push(a, b, c, b, d, c)
  }

  // Side walls, wound so they face outward.
  for (const side of [-1, 1]) {
    const wall = profile.map((u) => [
      point(u, side * halfWidth, baseY + jumpHeightAt(def, u)),
      point(u, side * halfWidth, baseY - SKIRT),
    ])
    for (let i = 0; i + 1 < wall.length; i++) {
      const [t0, b0] = wall[i]
      const [t1, b1] = wall[i + 1]
      if (side < 0) indices.push(t0, t1, b0, t1, b1, b0)
      else indices.push(t0, b0, t1, t1, b0, b1)
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}
