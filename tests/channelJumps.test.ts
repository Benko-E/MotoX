import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { freeride } from '../src/maps/freeride'
import { initPhysics } from '../src/physics/world'
import { generateTerrain } from '../src/terrain/generate'
import type { Heightfield } from '../src/terrain/heightfield'
import { GhostRider } from '../src/world/ghostRider'
import { judgeJump } from '../src/world/jumpFinder'

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
  it('land you back on the track, on every seed tried', { timeout: 60_000 }, () => {
    const landings: string[] = []
    let onTrack = 0
    let ridden = 0
    for (const seed of [1337, 1, 42, 99]) {
      const map = structuredClone(freeride)
      map.hills.seed = seed
      const field = generateTerrain(map)
      const ghost = new GhostRider(field, structuredClone(config))
      for (const lip of field.trackJumps!) {
        // the jump as the finder judges it, ridden the way the track runs (the finder's own search only tries 16 ways round)
        const back = (lip.heading * Math.PI) / 180
        const spot = judgeJump(field, lip.x - Math.sin(back) * 2, lip.z + Math.cos(back) * 2, lip.heading)
        if (typeof spot === 'string') {
          landings.push(`seed ${seed}: not a jump: ${spot}`)
          continue
        }
        const ride = ghost.ride(spot)
        ridden++
        const down = ride.flight.at(-1)
        const landed = down ? trackAt(field, down.x, down.z) : 0
        if (ride.landed && landed >= 0.5) onTrack++
        else landings.push(`seed ${seed}: ${ride.landed ? `landed ${landed.toFixed(2)} on the track` : ride.reason}`)
      }
      ghost.dispose()
    }
    expect(landings, landings.join('; ')).toEqual([])
    expect(onTrack).toBe(ridden)
  })
})
