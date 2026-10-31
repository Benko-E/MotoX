import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { freeride } from '../src/maps/freeride'
import { initPhysics } from '../src/physics/world'
import { generateTerrain } from '../src/terrain/generate'
import type { Heightfield } from '../src/terrain/heightfield'
import { GhostRider } from '../src/world/ghostRider'
import { featureJumps } from '../src/world/jumps'

beforeAll(async () => {
  await initPhysics()
})

/** How much of a track's floor the ground at (x, z) is, 0 to 1. */
const trackAt = (field: Heightfield, x: number, z: number) => {
  const n = field.samples
  const ix = Math.round((x + field.size / 2) / field.cellSize)
  const iz = Math.round((z + field.size / 2) / field.cellSize)
  return field.track![iz * n + ix]
}

describe('the track jumps, ridden by the ghost', () => {
  it('ridden along the track at a good lick, every kicker puts you back down on the track, on every seed tried', { timeout: 60_000 }, () => {
    const misses: string[] = []
    let flown = 0
    for (const seed of [1337, 1, 42, 99]) {
      const map = structuredClone(freeride)
      map.hills.seed = seed
      const field = generateTerrain(map)
      const ghost = new GhostRider(field, structuredClone(config))
      // the track's kickers as the map registered them: along its own line, at the speed they're built for
      for (const spot of featureJumps(field)) {
        const ride = ghost.ride(spot)
        // and the jump's own measure of its flight agrees with the ride
        if (ride.landed) expect(Math.abs(spot.airtime - ride.airtime), `seed ${seed}`).toBeLessThan(0.35)
        const down = ride.flight.at(-1)
        if (!down || ride.reason === 'never took off') continue // a kicker on a downhill may barely lift you: still on the line
        flown++
        const landed = trackAt(field, down.x, down.z)
        if (!ride.landed || landed < 0.5) misses.push(`seed ${seed}: ${ride.landed ? `landed ${landed.toFixed(2)} on the track` : ride.reason}`)
      }
      ghost.dispose()
    }
    expect(misses, misses.join("; ")).toEqual([])
    expect(flown).toBeGreaterThanOrEqual(12) // and most of them really throw you
  })
})
