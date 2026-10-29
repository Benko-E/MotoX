import { heightAt, type Heightfield } from './heightfield'

/** How far apart the spots tried are, metres. */
const STEP = 2
/** Steepness is measured about a bike's length either way, metres. */
const REACH = 3
/** The eight ways steepness is measured: along x, along z and both diagonals, each way. */
const WAYS = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 4), z: Math.sin((i * Math.PI) / 4) }))

/**
 * The flattest ground within `within` metres of (x, z), for the bike to start
 * on: the map is all hills, so the spot it names may well be on a slope. If
 * nowhere is flatter, (x, z) itself.
 */
export function flattestSpotNear(field: Heightfield, x: number, z: number, within: number): { x: number; z: number } {
  let best = { x, z }
  let flattest = steepnessAt(field, x, z)
  for (let dz = -within; dz <= within; dz += STEP) {
    for (let dx = -within; dx <= within; dx += STEP) {
      if (Math.hypot(dx, dz) > within) continue
      const steepness = steepnessAt(field, x + dx, z + dz)
      if (steepness < flattest) {
        flattest = steepness
        best = { x: x + dx, z: z + dz }
      }
    }
  }
  return best
}

/** The steepest the ground gets within REACH of (x, z), as rise over run. */
function steepnessAt(field: Heightfield, x: number, z: number): number {
  const here = heightAt(field, x, z)
  let steepest = 0
  for (const way of WAYS) {
    const there = heightAt(field, x + way.x * REACH, z + way.z * REACH)
    steepest = Math.max(steepest, Math.abs(there - here) / REACH)
  }
  return steepest
}
