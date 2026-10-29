import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { BikeView } from '../src/render/bikeView'
import { DirtSpray } from '../src/render/dirtSpray'
import { GroundEffects } from '../src/render/groundEffects'
import { tyreScrub } from '../src/render/scrub'
import { shadowOpacity } from '../src/render/tyreShadows'
import { TyreTracks } from '../src/render/tyreTracks'
import { flat, setup } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const KMH = 1 / 3.6
const UP = new THREE.Vector3(0, 1, 0)
const AHEAD = new THREE.Vector3(0, 0, -1)
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const settings = () => structuredClone(config.effects)

function cruise(bike: Bike, target: number) {
  const speed = bike.forwardSpeed
  bike.controls.throttle = clamp((target - speed) / 2, 0, 1)
  bike.controls.brake = clamp((speed - target - 1) / 2, 0, 1)
}

/** A bike rolling at `kmh` on a big flat, with its drawing and ground effects, stepped like the game. */
function riding(kmh: number) {
  const { bike, run: runPhysics, physics } = setup(flat(600))
  const scene = new THREE.Scene()
  const view = new BikeView(scene, bike)
  const effects = new GroundEffects(scene, bike, view, settings(), (x, z) => physics.groundHeightAt(x, z, bike.body) ?? 0, () => 9.81)
  /** Like the game: physics steps, then a drawn frame at 60 fps. */
  const run = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
      runPhysics(1 / 60, each)
      view.update(1, 1 / 60)
      effects.update(1 / 60)
    }
  }
  bike.placeOnGround(0, 250, 0)
  run(4, () => cruise(bike, kmh * KMH))
  return { bike, view, effects, run }
}

describe('how hard a tyre scrubs the dirt', () => {
  it('just rolling, even through a turn, is no scrub at all', () => {
    const { bike, run } = riding(50)
    expect(tyreScrub(bike, 0, 25).amount).toBeLessThan(0.05)
    expect(tyreScrub(bike, 1, 25).amount).toBeLessThan(0.05)
    bike.controls.steer = 1
    run(1, () => cruise(bike, 50 * KMH))
    expect(tyreScrub(bike, 0, 25).amount).toBeLessThan(0.1)
    expect(tyreScrub(bike, 1, 25).amount).toBeLessThan(0.1)
  })

  it('a powerslide scrubs the rear flat out, sideways', () => {
    const { bike, run } = riding(50)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    run(1, () => cruise(bike, 50 * KMH))
    const rear = tyreScrub(bike, 1, 25)
    expect(rear.amount).toBeGreaterThan(0.9)
    expect(Math.abs(rear.sideways)).toBeGreaterThan(4)
  })

  it('full throttle from a standstill spins the rear up, until wheelspinUntil', () => {
    const { bike, run } = riding(0)
    bike.controls.throttle = 1
    run(1 / 30)
    expect(tyreScrub(bike, 1, 25).spin).toBeGreaterThan(0.8)
    expect(tyreScrub(bike, 0, 25).spin).toBe(0) // the front isn't driven
    run(1.5)
    expect(bike.speed / KMH).toBeGreaterThan(25)
    expect(tyreScrub(bike, 1, 25).spin).toBe(0)
  })

  it('hard braking skids, the rear more than the front', () => {
    const { bike, run } = riding(50)
    bike.controls.throttle = 0
    bike.controls.brake = 1
    run(0.2)
    const front = tyreScrub(bike, 0, 25).skid
    const rear = tyreScrub(bike, 1, 25).skid
    expect(rear).toBeGreaterThan(0.8)
    expect(front).toBeGreaterThan(0.1)
    expect(front).toBeLessThan(rear)
  })

  it('a tyre in the air scrubs nothing', () => {
    const { bike, run } = riding(0)
    bike.placeOnGround(0, 0, 0, 5)
    bike.controls.throttle = 1
    run(0.2)
    expect(tyreScrub(bike, 1, 25).amount).toBe(0)
  })
})

describe('tyre tracks', () => {
  /** Rolls one wheel `metres` along -z in small steps, scrubbing by `scrub`. */
  function roll(tracks: TyreTracks, from: number, metres: number, scrub = 0) {
    for (let z = from; z >= from - metres; z -= 0.05) {
      tracks.touch(0, new THREE.Vector3(0, 0, z), UP, scrub)
    }
  }

  it('rolling lays a faint track behind the tyre, piece by piece', () => {
    const tracks = new TyreTracks(settings().tyreTracks)
    roll(tracks, 0, 10)
    const pieces = tracks.pieces(0)
    expect(pieces.length).toBeGreaterThan(20)
    expect(pieces.every((piece) => piece.darkness === config.effects.tyreTracks.rolling)).toBe(true)
    expect(pieces.at(-1)!.end.z).toBeLessThan(-9.5) // right up to where the tyre is
  })

  it('a sliding, skidding or spinning tyre lays a darker track', () => {
    const tracks = new TyreTracks(settings().tyreTracks)
    roll(tracks, 0, 3, 1)
    expect(tracks.pieces(0).at(-1)!.darkness).toBeCloseTo(config.effects.tyreTracks.skidding, 5)
  })

  it('leaves a gap where the tyre was in the air', () => {
    const tracks = new TyreTracks(settings().tyreTracks)
    roll(tracks, 0, 3)
    tracks.touch(0, null, UP, 0) // a little hop
    roll(tracks, -5, 3) // landed 2 m on
    const spansGap = tracks.pieces(0).some((piece) => piece.start.z > -3.5 && piece.end.z < -4.5)
    expect(spansGap).toBe(false)
  })

  it('fades away over lasts seconds, then is gone', () => {
    const tracks = new TyreTracks(settings().tyreTracks)
    roll(tracks, 0, 3)
    const piece = tracks.pieces(0)[0]
    const fresh = tracks.opacity(piece)
    tracks.update(config.effects.tyreTracks.lasts / 2)
    expect(tracks.opacity(piece)).toBeCloseTo(fresh / 2, 5)
    tracks.update(config.effects.tyreTracks.lasts / 2 + 0.1)
    expect(tracks.pieces(0).length).toBe(0)
  })

  it('draws every piece with its own darkness, fading', () => {
    const tracks = new TyreTracks(settings().tyreTracks)
    roll(tracks, 0, 1, 1)
    tracks.update(1)
    const colors = tracks.mesh.geometry.getAttribute('color')
    const piece = tracks.pieces(0).at(-1)!
    expect(colors.getW(piece.slot * 4)).toBeCloseTo(tracks.opacity(piece), 5)
    expect(tracks.opacity(piece)).toBeGreaterThan(0)
  })

  it('keeps a limited number of pieces: the oldest go first', () => {
    const tracks = new TyreTracks(settings().tyreTracks)
    roll(tracks, 0, 2000)
    const pieces = tracks.pieces(0)
    expect(pieces.length).toBeLessThanOrEqual(TyreTracks.MAX_PIECES)
    expect(pieces.at(-1)!.end.z).toBeLessThan(-1999) // the newest is still there
  })

  it('turned off, lays nothing', () => {
    const off = settings().tyreTracks
    off.enabled = false
    const tracks = new TyreTracks(off)
    roll(tracks, 0, 10, 1)
    expect(tracks.pieces(0).length).toBe(0)
  })
})

describe('dirt thrown up', () => {
  const DT = 1 / 60
  /** A spray with fixed randomness, on flat ground at 0. */
  const spray = (changes?: (s: typeof config.effects.dirt) => void) => {
    const dirt = settings().dirt
    changes?.(dirt)
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    return new DirtSpray(dirt, () => 0, () => 9.81, random)
  }
  const still = new THREE.Vector3()

  it('a tyre just rolling throws nothing', () => {
    const dirt = spray()
    for (let i = 0; i < 60; i++) dirt.throwFrom(still, AHEAD, still, 0, DT)
    expect(dirt.thrown).toBe(0)
  })

  it('flat out it throws about amount clods a second', () => {
    const dirt = spray()
    for (let i = 0; i < 60; i++) {
      dirt.throwFrom(still, AHEAD, still, 1, DT)
      dirt.update(DT)
    }
    expect(dirt.thrown).toBeGreaterThan(config.effects.dirt.amount - 2)
    expect(dirt.thrown).toBeLessThan(config.effects.dirt.amount + 2)
  })

  it('clods fly the way they are thrown, then fall and stop on the ground', () => {
    const dirt = spray()
    dirt.throwFrom(still, AHEAD, still, 1, 0.1)
    let highest = 0
    for (let i = 0; i < 30; i++) {
      dirt.update(DT)
      highest = Math.max(highest, ...dirt.clods.map((clod) => clod.position.y))
    }
    expect(highest).toBeGreaterThan(0.1) // up into the air
    for (const clod of dirt.clods) {
      expect(clod.position.z).toBeLessThan(-0.2) // thrown along -z
      expect(clod.position.y).toBeGreaterThanOrEqual(0) // never under the ground
    }
  })

  it('clods are gone after a couple of seconds', () => {
    const dirt = spray()
    dirt.throwFrom(still, AHEAD, still, 1, 0.5)
    for (let i = 0; i < 150; i++) dirt.update(DT)
    expect(dirt.clods.length).toBe(0)
  })

  it('turned off, throws nothing', () => {
    const dirt = spray((s) => (s.enabled = false))
    for (let i = 0; i < 60; i++) dirt.throwFrom(still, AHEAD, still, 1, DT)
    expect(dirt.thrown).toBe(0)
  })
})

describe('the shadow under each tyre', () => {
  it('is as dark as tyreShadow on the ground, and fades out as the tyre lifts off', () => {
    expect(shadowOpacity(0, 0.5)).toBeCloseTo(0.5, 5)
    expect(shadowOpacity(0.5, 0.5)).toBeLessThan(0.5)
    expect(shadowOpacity(0.5, 0.5)).toBeGreaterThan(shadowOpacity(1, 0.5))
    expect(shadowOpacity(3, 0.5)).toBe(0)
  })
})

describe('on a real ride', () => {
  it('rolling straight leaves faint tracks under both tyres and throws no dirt', () => {
    const { effects, run, bike } = riding(50)
    const before = effects.dirt.thrown // getting going from a standstill spins the rear up
    run(1, () => cruise(bike, 50 * KMH))
    expect(effects.tracks.pieces(0).length).toBeGreaterThan(10)
    expect(effects.tracks.pieces(1).length).toBeGreaterThan(10)
    expect(effects.tracks.pieces(1).at(-1)!.darkness).toBeLessThan(config.effects.tyreTracks.rolling + 0.05)
    expect(effects.dirt.thrown - before).toBe(0)
  })

  it('a powerslide leaves a dark track under the rear and throws dirt', () => {
    const { effects, run, bike } = riding(50)
    bike.controls.steer = 1
    bike.controls.powerslide = true
    const before = effects.dirt.thrown
    run(1, () => cruise(bike, 50 * KMH))
    expect(effects.tracks.pieces(1).at(-1)!.darkness).toBeGreaterThan(config.effects.tyreTracks.skidding * 0.9)
    expect(effects.dirt.thrown - before).toBeGreaterThan(config.effects.dirt.amount * 0.5)
  })

  it('the tracks are laid where the drawn tyres touch the ground', () => {
    const { effects, view, run, bike } = riding(30)
    run(0.5, () => cruise(bike, 30 * KMH))
    for (const i of [0, 1]) {
      const touching = view.contactPoint(i, new THREE.Vector3())
      expect(effects.tracks.pieces(i).at(-1)!.end.distanceTo(touching)).toBeLessThan(0.3)
    }
  })
})
