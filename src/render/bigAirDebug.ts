import * as THREE from 'three'
import type { BigAirDebugSettings } from '../config'
import type { MapDef } from '../maps/types'
import type { Heightfield } from '../terrain/heightfield'
import type { JumpSpot } from '../world/jumps'
import { arc, arrow, DebugView, debugMesh, groundRing, LABEL_LIFT, num, post, ribbon, straightPath, type GroundAt } from './debugDraw'

/**
 * A debug view of the big air jumps, drawn on the ground, each part with its
 * own checkbox: down each one's middle its level run-in, its kicker's face
 * with a post at the lip as tall as the kicker, the drop under the flight, the
 * landing slope with a ring where it was built to put you down, and the
 * runout back to level; the edges of its floor and banks; its flight as
 * measured; and labels naming each setting with its number.
 */

type Part = 'runIn' | 'kicker' | 'landing' | 'edges' | 'flights' | 'labels'
const PARTS: Part[] = ['runIn', 'kicker', 'landing', 'edges', 'flights', 'labels']

const MIDDLE_WIDTH = 1.2
const TOUCHDOWN_RING = 3
const COLORS = {
  runIn: 0x3fdc5a,
  face: 0xff8a00,
  drop: 0xff2020,
  landing: 0xffd23f,
  runout: 0x9b6bff,
  floor: 0xffffff,
  banks: 0x3fb8ff,
  flight: 0xff4fd8,
}

export class BigAirDebug extends DebugView<Part> {
  constructor(scene: THREE.Scene, groundAt: GroundAt, settings: BigAirDebugSettings) {
    super(scene, PARTS, groundAt, settings)
  }

  /** Draws the big air `field` was built with (`map` its settings then), and the flight off each (`jumps`, as measured); none if it has none. */
  show(field: Heightfield, map: MapDef, jumps: readonly JumpSpot[]): void {
    this.clear()
    const { groundAt } = this
    const flights = jumps.filter((j) => j.source === 'bigAir')
    const { width, banks, shaping } = map.bigAir
    const along = (a: { x: number; z: number }, b: { x: number; z: number }) => ribbon(straightPath(a, b), groundAt, MIDDLE_WIDTH)
    const metres = (a: { x: number; z: number }, b: { x: number; z: number }) => num(Math.hypot(b.x - a.x, b.z - a.z))

    for (const [i, air] of (field.bigAirs ?? []).entries()) {
      const n = i + 1
      // down its middle, in the order you ride it
      this.add('runIn', `run-in ${n}`, along(air.start, air.foot), COLORS.runIn)
      this.add('runIn', `way ${n}`, arrow(air.start, air.foot, groundAt, 4), COLORS.runIn)
      this.say(`run-in ${n}: ${metres(air.start, air.foot)} m, level and straight`, air.start, COLORS.runIn)
      this.add('kicker', `face ${n}`, along(air.foot, air), COLORS.face)
      this.add('kicker', `lip ${n}`, post(air.x, air.z, air.faceHeight, groundAt), COLORS.drop)
      this.add('kicker', `drop ${n}`, along(air, air.landing), COLORS.drop)
      const flight = flights[i]
      this.say(
        `big air ${n}: ${(flight?.airtime ?? 0).toFixed(1)} s of air at ${num(air.speed)} km/h\nkicker ${air.faceHeight.toFixed(1)} m tall, ${num(air.angle)}° lip`,
        air,
        COLORS.face,
        air.faceHeight + LABEL_LIFT,
      )
      this.add('landing', `landing ${n}`, along(air.landing, air.zoneEnd), COLORS.landing)
      this.add('landing', `touchdown ${n}`, groundRing(air.landing.x, air.landing.z, TOUCHDOWN_RING, groundAt), COLORS.landing)
      this.add('landing', `runout ${n}`, along(air.zoneEnd, air.end), COLORS.runout)
      this.say(
        `built to land ${n} here: ${air.airtime.toFixed(1)} s of air (a flight a little lower comes down sooner)\n${metres(air, air.landing)} m out, ${num(air.landingDrop)} m below the lip, on a ${num(air.landingAngle)}° slope`,
        air.landing,
        COLORS.landing,
      )
      this.say(`runout ${n}: level again here`, air.runoutEnd, COLORS.runout)

      // the edges of its floor and of its banks, either side
      const length = Math.hypot(air.end.x - air.start.x, air.end.z - air.start.z)
      const rx = -(air.end.z - air.start.z) / length
      const rz = (air.end.x - air.start.x) / length
      const side = (p: { x: number; z: number }, out: number) => ({ x: p.x + rx * out, z: p.z + rz * out })
      for (const [name, out, color] of [[`floor ${n}`, width / 2, COLORS.floor], [`banks ${n}`, width / 2 + banks, COLORS.banks]] as const) {
        // both sides, together under one name
        const both = new THREE.Group()
        both.name = name
        for (const s of [-1, 1]) both.add(debugMesh(name, ribbon(straightPath(side(air.start, s * out), side(air.end, s * out)), groundAt), color))
        this.part('edges').add(both)
      }
      this.say(
        `big air ${n}: width ${num(width)} m, banks ${num(banks)} m\nlanding hill shaped up to ${num(air.moved)} m (shaping ${num(shaping)} × hills ${num(map.hills.height)} m = ${num(shaping * map.hills.height)} m)`,
        side(air.foot, width / 2 + banks),
        COLORS.banks,
      )

      // its flight as measured, and where you land
      if (!flight || flight.flight.length < 2) continue
      this.add('flights', `flight ${n}`, arc(flight.flight), COLORS.flight)
      this.add('flights', `lands ${n}`, groundRing(flight.landing.x, flight.landing.z, TOUCHDOWN_RING * 0.7, groundAt), COLORS.flight)
      const far = Math.hypot(flight.landing.x - flight.lip.x, flight.landing.z - flight.lip.z)
      this.say(`lands ${n}: ${flight.airtime.toFixed(1)} s in the air at ${num(flight.speed)} km/h\n${num(far)} m past the lip`, flight.landing, COLORS.flight)
    }
  }
}
