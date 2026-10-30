import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { freeride } from '../src/maps/freeride'
import { initPhysics } from '../src/physics/world'
import { generateTerrain } from '../src/terrain/generate'
import type { Heightfield } from '../src/terrain/heightfield'
import { GhostRider } from '../src/world/ghostRider'
import type { JumpSpot } from '../src/world/jumpFinder'

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

describe('the channel jumps, ridden by the ghost', () => {
  it('ridden along the track at a good lick, every kicker puts you back down on the track, on every seed tried', { timeout: 60_000 }, () => {
    const misses: string[] = []
    let flown = 0
    for (const seed of [1337, 1, 42, 99]) {
      const map = structuredClone(freeride)
      map.hills.seed = seed
      const field = generateTerrain(map)
      const ghost = new GhostRider(field, structuredClone(config))
      const line = field.trackLine!
      for (const lip of field.trackJumps!) {
        // the track's own line into the kicker (it runs clockwise, the way the jumps face): 30 m of run-up to its lip
        let at = 0
        for (let i = 1; i < line.length; i++) if (Math.hypot(line[i].x - lip.x, line[i].z - lip.z) < Math.hypot(line[at].x - lip.x, line[at].z - lip.z)) at = i
        const runUp = Array.from({ length: 31 }, (_, i) => line[(at - 30 + i + line.length) % line.length]).map((p) => ({ x: p.x, y: 0, z: p.z }))
        const spot: JumpSpot = { lip: { x: lip.x, y: 0, z: lip.z }, heading: lip.heading, runUp, lipAngle: 0, speed: 80, airtime: 2, landing: { x: lip.x, y: 0, z: lip.z }, score: 0 }
        const ride = ghost.ride(spot)
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
