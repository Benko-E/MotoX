/**
 * What an AI rider has been told to do: a list of plain orders, carried out
 * one at a time. The riding only ever does the current order and doesn't care
 * who gave it. Behaviours (like wandering, and later free roam, a race or a
 * letter hunt) refill the list when it runs dry, or push an urgent order to
 * the front; anything can give him orders the same way.
 */

import type { JumpSpot } from '../world/jumpFinder'
import { turnBetween } from './riding'

export type Order =
  /** Ride to a spot on the map; with `onLine`, straight there over whatever's in the way (a track's jumps, say), not round steep ground. */
  | { kind: 'rideTo'; x: number; z: number; onLine?: boolean }
  /** Ride on at an easy speed for a while, wherever the ground lets him. */
  | { kind: 'cruise'; seconds: number }
  /** Get lined up on a jump's run-up, hit it at its speed, fly, land and ride out. */
  | { kind: 'takeJump'; jump: JumpSpot }

/** Where a rider is, for a behaviour deciding what he does next. Heading in compass degrees. */
export interface RiderState {
  x: number
  z: number
  heading: number
}

/** Something that gives a rider orders: when he has none left, and (if it likes) as he goes along. */
export interface Behaviour {
  refill(orders: Orders, rider: RiderState): void
  /** Called every physics step, `dt` seconds apart, to add or push orders on the way. */
  watch?(orders: Orders, rider: RiderState, dt: number): void
  /** How far from the middle he may go, metres, if not his roam radius. */
  area?(): number | undefined
}

export class Orders {
  private readonly list: Order[] = []

  /** The order being carried out, if any. */
  get current(): Order | undefined {
    return this.list[0]
  }

  /** Adds an order after the others. */
  add(order: Order): void {
    this.list.push(order)
  }

  /** An urgent order: done next, before the rest. */
  addFirst(order: Order): void {
    this.list.unshift(order)
  }

  /** The current order is done (or given up): on to the next. */
  next(): void {
    this.list.shift()
  }

  clear(): void {
    this.list.length = 0
  }
}

/** Seconds of cruising between one spot and the next while wandering: from the first to the second. */
const CRUISE_FOR = [3, 7]

/** The simplest behaviour: ride to a random spot within the roam radius, cruise a bit, and again. */
export class Wander implements Behaviour {
  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: { roamRadius: number },
    private readonly random: () => number = Math.random,
  ) {}

  refill(orders: Orders, _rider?: RiderState): void {
    // evenly over the round area, not bunched in the middle
    const distance = Math.sqrt(this.random()) * this.settings.roamRadius
    const bearing = this.random() * Math.PI * 2
    orders.add({ kind: 'rideTo', x: Math.sin(bearing) * distance, z: -Math.cos(bearing) * distance })
    orders.add({ kind: 'cruise', seconds: CRUISE_FOR[0] + this.random() * (CRUISE_FOR[1] - CRUISE_FOR[0]) })
  }
}

export interface FreeRoamSettings {
  roamRadius: number
  lookAhead: number
  lookWide: number
  jumpAppetite: number
  jumpCooldown: number
}

const DEG = Math.PI / 180
/** A jump counts as pointing his way when its run-up is within this many degrees of his heading. */
const YOUR_WAY = 45
/** A run-up starting closer than this is too close to line up for, metres. */
const TOO_CLOSE = 15

/**
 * Relaxed free riding: he rides off to the quarter of the map he's been to
 * least (within the roam radius), cruises a bit, and so on round the map.
 * Now and then, when a jump comes into view ahead of him pointing his way,
 * he goes for it: he makes up his mind once per jump, with the appetite as
 * the chance, and after a jump he cruises a while before going for another.
 */
export class FreeRoam implements Behaviour {
  private readonly visits = [0, 0, 0, 0]
  private readonly considered = new Set<JumpSpot>()
  private sinceJump = Infinity

  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: FreeRoamSettings,
    /** The jumps on the map (they change when the map does). */
    private readonly jumps: () => readonly JumpSpot[],
    private readonly random: () => number = Math.random,
  ) {}

  refill(orders: Orders, _rider?: RiderState): void {
    // quarters: 0 north-west, 1 north-east, 2 south-west, 3 south-east
    const quarter = this.visits.indexOf(Math.min(...this.visits))
    this.visits[quarter]++
    const distance = Math.sqrt(this.random()) * this.settings.roamRadius
    const angle = this.random() * (Math.PI / 2)
    const x = (quarter & 1 ? 1 : -1) * Math.sin(angle) * distance
    const z = (quarter & 2 ? 1 : -1) * Math.cos(angle) * distance
    orders.add({ kind: 'rideTo', x, z })
    orders.add({ kind: 'cruise', seconds: CRUISE_FOR[0] + this.random() * (CRUISE_FOR[1] - CRUISE_FOR[0]) })
  }

  watch(orders: Orders, rider: RiderState, dt: number): void {
    const { settings } = this
    if (orders.current?.kind === 'takeJump') {
      this.sinceJump = 0
      return
    }
    this.sinceJump += dt
    if (this.sinceJump < settings.jumpCooldown) return
    const spotted = this.jumpAhead(rider)
    if (!spotted) return
    this.considered.add(spotted)
    if (this.random() >= settings.jumpAppetite) return
    orders.addFirst({ kind: 'takeJump', jump: spotted })
    this.sinceJump = 0
  }

  /** The nearest jump he hasn't made up his mind about yet whose run-up starts in view ahead, pointing his way. */
  private jumpAhead(rider: RiderState): JumpSpot | null {
    const { settings } = this
    let nearest: JumpSpot | null = null
    let nearestDistance = Infinity
    for (const jump of this.jumps()) {
      if (this.considered.has(jump)) continue
      const start = jump.runUp[0]
      const distance = Math.hypot(start.x - rider.x, start.z - rider.z)
      if (distance > settings.lookAhead || distance < TOO_CLOSE || distance >= nearestDistance) continue
      const bearing = Math.atan2(start.x - rider.x, -(start.z - rider.z)) / DEG
      if (Math.abs(turnBetween(bearing, rider.heading)) > settings.lookWide) continue
      if (Math.abs(turnBetween(jump.heading, rider.heading)) > YOUR_WAY) continue
      if (Math.hypot(jump.landing.x, jump.landing.z) > settings.roamRadius) continue // it would throw him out of his area
      nearest = jump
      nearestDistance = distance
    }
    return nearest
  }
}

/** Following the track, he rides to a point this far on along it each time, metres. */
const TRACK_AHEAD = 25

/**
 * Riding round the track: to a point a little further along it, the way he's
 * set to go, and again. Away from the track, that takes him to it first.
 */
export class FollowTrack implements Behaviour {
  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: { trackWay: string },
    /** The track's line, its points about a metre apart going round clockwise; none if the map has no track. */
    private readonly line: () => readonly { x: number; z: number }[] | undefined,
  ) {}

  refill(orders: Orders, rider: RiderState): void {
    const line = this.line()
    if (!line?.length) {
      orders.add({ kind: 'cruise', seconds: CRUISE_FOR[0] })
      return
    }
    let nearest = 0
    for (let i = 1; i < line.length; i++) {
      if (Math.hypot(line[i].x - rider.x, line[i].z - rider.z) < Math.hypot(line[nearest].x - rider.x, line[nearest].z - rider.z)) nearest = i
    }
    const step = this.settings.trackWay === 'counterclockwise' ? -1 : 1
    let at = nearest
    for (let gone = 0; gone < TRACK_AHEAD && Math.abs(at - nearest) < line.length; ) {
      const next = (((at + step) % line.length) + line.length) % line.length
      gone += Math.hypot(line[next].x - line[at].x, line[next].z - line[at].z)
      at = next
      if (at === nearest) break
    }
    orders.add({ kind: 'rideTo', x: line[at].x, z: line[at].z, onLine: true })
  }

  area(): number {
    const line = this.line() ?? []
    return line.reduce((far, p) => Math.max(far, Math.hypot(p.x, p.z)), 0) + TRACK_AHEAD
  }
}

/** Whichever behaviour is chosen right now; when the choice changes he drops his orders and starts on the new one. */
export class PickBehaviour implements Behaviour {
  private last: Behaviour | null = null

  constructor(private readonly chosen: () => Behaviour) {}

  refill(orders: Orders, rider: RiderState): void {
    this.switchIfChanged(orders)
    this.chosen().refill(orders, rider)
  }

  watch(orders: Orders, rider: RiderState, dt: number): void {
    this.switchIfChanged(orders)
    this.chosen().watch?.(orders, rider, dt)
  }

  area(): number | undefined {
    return this.chosen().area?.()
  }

  private switchIfChanged(orders: Orders): void {
    const now = this.chosen()
    if (this.last && now !== this.last) orders.clear()
    this.last = now
  }
}
