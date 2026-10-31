import * as THREE from 'three'
import type { LandDebugSettings } from '../config'
import type { MapDef } from '../maps/types'
import type { Heightfield } from '../terrain/heightfield'
import { flattestSpotNear } from '../terrain/startingSpot'
import { arrow, circle, DebugView, num, post, ribbon, straightPath, type GroundAt, type Path } from './debugDraw'

/**
 * A debug view of the land, drawn on the ground, each part with its own
 * checkbox: the square where the wall at the map's edge starts to rise and the
 * very edge of the map, the spawn point facing its heading with how far round
 * it the start is looked for and the spot you really start on, a bar one hill
 * wavelength long with a post as tall as the hills, and labels naming each
 * setting with its number.
 */

type Part = 'edge' | 'spawn' | 'hills' | 'labels'
const PARTS: Part[] = ['edge', 'spawn', 'hills', 'labels']

/** The squares' points are about this far apart, so they follow the ground, metres. */
const SQUARE_STEP = 2
const EDGE_WIDTH = 0.8
const SPAWN_ARROW = 6
const START_POST = 3
/** The hill bar lies this far to the side of the start, metres. */
const BAR_ASIDE = 8
const COLORS = {
  wall: 0xff8a00,
  edge: 0xff2020,
  spawn: 0xffffff,
  search: 0xd8d8ff,
  start: 0x3fdc5a,
  hills: 0xffd23f,
}

export class LandDebug extends DebugView<Part> {
  constructor(scene: THREE.Scene, groundAt: GroundAt, settings: LandDebugSettings) {
    super(scene, PARTS, groundAt, settings)
  }

  /** Draws the land `field` was built with (`map` its settings then), the start looked for `search` metres round its spawn point. */
  show(field: Heightfield, map: MapDef, search: number): void {
    this.clear()
    const { groundAt } = this
    const half = map.size / 2

    // where the wall at the edge starts, and the very edge (a metre in, on the ground)
    if (map.edge.start < half) {
      this.add('edge', 'wall starts', ribbon(square(map.edge.start), groundAt, EDGE_WIDTH), COLORS.wall)
      this.say(`wall starts ${num(map.edge.start)} m out\n(from the middle, along x or z)`, { x: 0, z: -map.edge.start }, COLORS.wall)
    }
    this.add('edge', 'map edge', ribbon(square(half - 1), groundAt, EDGE_WIDTH), COLORS.edge)
    this.say(`map edge, ${num(half)} m out (size ${num(map.size)} m)\nthe wall rises ${num(map.edge.rise)} m by here`, { x: 0, z: -(half - 1) }, COLORS.edge)

    // the spawn point facing its heading, where the start is looked for, and where you start
    const { spawn } = map
    const heading = (spawn.heading * Math.PI) / 180
    const ahead = { x: spawn.x + Math.sin(heading), z: spawn.z - Math.cos(heading) }
    this.add('spawn', 'spawn', arrow(spawn, ahead, groundAt, SPAWN_ARROW), COLORS.spawn)
    this.say(`spawn point, heading ${num(spawn.heading)}°`, spawn, COLORS.spawn)
    this.add('spawn', 'search', ribbon(circle(spawn.x, spawn.z, search), groundAt), COLORS.search)
    this.say(`the start is the flattest ground\nwithin ${num(search)} m of the spawn point`, { x: spawn.x, z: spawn.z - search }, COLORS.search)
    const start = flattestSpotNear(field, spawn.x, spawn.z, search)
    this.add('spawn', 'start', post(start.x, start.z, START_POST, groundAt), COLORS.start)
    this.say('you start here', start, COLORS.start, START_POST + 1)

    // the size of the hills: a bar one wavelength long beside the start, a post as tall as they get at its end
    const { hills } = map
    const bar = { x: start.x - hills.wavelength / 2, z: start.z + BAR_ASIDE }
    const barEnd = { x: bar.x + hills.wavelength, z: bar.z }
    this.add('hills', 'wavelength', ribbon(straightPath(bar, barEnd, SQUARE_STEP), groundAt, EDGE_WIDTH), COLORS.hills)
    this.add('hills', 'height', post(barEnd.x, barEnd.z, hills.height, groundAt), COLORS.hills)
    this.say(
      `hills: wavelength ${num(hills.wavelength)} m (hilltop to hilltop), height ${num(hills.height)} m\noctaves ${num(hills.octaves)}, roughness ${num(hills.roughness)}, seed ${num(hills.seed)}`,
      bar,
      COLORS.hills,
    )
  }
}

/** A closed square round the middle of the map, `out` metres out along x and z. */
function square(out: number): Path {
  const corners = [
    { x: -out, z: -out },
    { x: out, z: -out },
    { x: out, z: out },
    { x: -out, z: out },
  ]
  const path = corners.flatMap((corner, i) => straightPath(corner, corners[(i + 1) % 4], SQUARE_STEP).slice(0, -1))
  return [...path, path[0]]
}
