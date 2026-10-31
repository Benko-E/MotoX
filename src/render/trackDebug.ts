import * as THREE from 'three'
import type { TrackDebugSettings } from '../config'
import type { MapDef } from '../maps/types'
import type { Heightfield } from '../terrain/heightfield'
import type { JumpSpot } from '../world/jumps'
import { arc, arrow, between, circle, DebugView, groundRing, LABEL_LIFT, num, offset, post, ribbon, type GroundAt } from './debugDraw'

/**
 * A debug view of the track, drawn on the ground, each part with its own
 * checkbox: the line down its middle with arrows the way it's ridden, the
 * edges of its floor and of its banks, the radius it runs round and how far
 * its winding lets it wander, its kickers (face, drop and a post as tall as
 * each was built), the straight round each kicker, the flight off each at the
 * speed it was built for, and labels naming each setting with its number.
 */

type Part = 'middle' | 'floor' | 'banks' | 'ring' | 'kickers' | 'straights' | 'flights' | 'labels'
const PARTS: Part[] = ['middle', 'floor', 'banks', 'ring', 'kickers', 'straights', 'flights', 'labels']

const KICKER_WIDTH = 1.2
const STRAIGHT_WIDTH = 0.9
/** An arrow along the middle line every this many of its points (about a metre apart). */
const ARROW_EVERY = 30
const LANDING_RING = 2.5
const COLORS = {
  middle: 0xffffff,
  floor: 0xffd23f,
  banks: 0x3fb8ff,
  radius: 0xd8d8ff,
  wander: 0xb47cff,
  face: 0xff8a00,
  drop: 0xff2020,
  lip: 0xff2020,
  straight: 0x3fdc5a,
  ease: 0x1f8a3a,
  flight: 0xff4fd8,
}

export class TrackDebug extends DebugView<Part> {
  constructor(scene: THREE.Scene, groundAt: GroundAt, settings: TrackDebugSettings) {
    super(scene, PARTS, groundAt, settings)
  }

  /**
   * Draws the track `field` was built with (`track` its settings then, run
   * round `middle`), and the flights off its kickers (`jumps`, as measured);
   * none if it has none.
   */
  show(field: Heightfield, track: MapDef['track'], middle: { x: number; z: number }, jumps: readonly JumpSpot[]): void {
    this.clear()
    const line = field.trackLine
    if (!line?.length) return
    const { groundAt } = this
    const n = line.length
    const add = this.add.bind(this)
    const say = this.say.bind(this)
    const way = track.way === 'counterclockwise' ? -1 : 1

    // the middle, and arrows along it the way it's ridden (the line runs clockwise)
    add('middle', 'middle', ribbon([...line, line[0]], groundAt), COLORS.middle)
    for (let k = 0, count = 1; k < n; k += ARROW_EVERY, count++) add('middle', `way ${count}`, arrow(line[k], line[(k + way * 3 + n) % n], groundAt), COLORS.middle)
    say(`ridden ${track.way}\nfloor: flatness ${num(track.flatness)}, smoothing ${num(track.smoothing)} m`, line[Math.floor((n * 3) / 8)], COLORS.middle)

    // its floor and its banks, either side
    for (const side of [-1, 1]) {
      add('floor', side < 0 ? 'left' : 'right', ribbon(offset(line, (side * track.width) / 2), groundAt), COLORS.floor)
      add('banks', side < 0 ? 'left' : 'right', ribbon(offset(line, side * (track.width / 2 + track.banks)), groundAt), COLORS.banks)
    }
    const labelled = Math.floor(n / 8)
    say(`floor: width ${num(track.width)} m`, offset(line, track.width / 2)[labelled], COLORS.floor)
    say(`banks ${num(track.banks)} m`, offset(line, track.width / 2 + track.banks)[labelled], COLORS.banks)

    // the radius it runs round, and how far its winding lets it wander in and out
    const r = track.radius
    add('ring', 'radius', ribbon(circle(middle.x, middle.z, r), groundAt), COLORS.radius)
    add('ring', 'wander in', ribbon(circle(middle.x, middle.z, r * (1 - track.winding)), groundAt), COLORS.wander)
    add('ring', 'wander out', ribbon(circle(middle.x, middle.z, r * (1 + track.winding)), groundAt), COLORS.wander)
    say(`track radius ${num(r)} m`, { x: middle.x, z: middle.z - r }, COLORS.radius)
    say(`winding ${num(track.winding)}: wanders up to\n${num(track.winding * r)} m in or out from the radius`, { x: middle.x, z: middle.z - r * (1 + track.winding) }, COLORS.wander)

    // each kicker: its face and drop along the line, a post as tall as it was built, and the straight round it
    const indexOf = (p: { x: number; z: number }) => line.findIndex((q) => q.x === p.x && q.z === p.z)
    for (const [i, jump] of (field.trackJumps ?? []).entries()) {
      const lip = indexOf(jump)
      add('kickers', `face ${i + 1}`, ribbon(between(line, indexOf(jump.foot), lip), groundAt, KICKER_WIDTH), COLORS.face)
      add('kickers', `drop ${i + 1}`, ribbon(between(line, lip, indexOf(jump.end)), groundAt, KICKER_WIDTH), COLORS.drop)
      add('kickers', `lip ${i + 1}`, post(jump.x, jump.z, jump.height, groundAt), COLORS.lip)
      say(
        `kicker ${i + 1}: height ${num(jump.height)} m, length ${num(jump.length)} m\n(face ${num(jump.length * 0.7)} m, drop ${num(jump.length * 0.3)} m)`,
        jump,
        COLORS.face,
        jump.height + LABEL_LIFT,
      )
      const straight = jump.straight
      if (!straight) continue
      const [easeFrom, from, to, easeTo] = [straight.easeFrom, straight.from, straight.to, straight.easeTo].map(indexOf)
      add('straights', `ease in ${i + 1}`, ribbon(between(line, easeFrom, from), groundAt, STRAIGHT_WIDTH), COLORS.ease)
      add('straights', `straight ${i + 1}`, ribbon(between(line, from, to), groundAt, STRAIGHT_WIDTH), COLORS.straight)
      add('straights', `ease out ${i + 1}`, ribbon(between(line, to, easeTo), groundAt, STRAIGHT_WIDTH), COLORS.ease)
      say(
        `landing straight ${i + 1}: ${num(track.landingStraight)} × ${num(jump.length)} m\n= ${num(track.landingStraight * jump.length)} m past the lip, then eases back into the curve`,
        straight.to,
        COLORS.straight,
      )
      say(`straight ${i + 1} starts here\n(eases in from the curve before it)`, straight.from, COLORS.straight)
    }

    // the flight off each kicker at the speed it was built for, and where you land
    for (const [i, jump] of jumps.filter((j) => j.source === 'track').entries()) {
      if (jump.flight.length < 2) continue
      add('flights', `flight ${i + 1}`, arc(jump.flight), COLORS.flight)
      add('flights', `landing ${i + 1}`, groundRing(jump.landing.x, jump.landing.z, LANDING_RING, groundAt), COLORS.flight)
      const far = Math.hypot(jump.landing.x - jump.lip.x, jump.landing.z - jump.lip.z)
      say(`lands ${i + 1}: at ${num(jump.speed)} km/h (jump speed)\n${num(jump.airtime)} s in the air, ${num(far)} m past the lip`, jump.landing, COLORS.flight)
    }
  }
}
