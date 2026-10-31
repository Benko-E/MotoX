import type { AiRiderSettings, Config } from '../config'
import { Bike } from '../physics/bike'
import { CrashWatcher } from '../physics/crashes'
import type { PhysicsWorld } from '../physics/world'
import type { JumpSpot } from '../world/jumps'
import { Orders, type Behaviour, type Order } from './orders'
import { clamp, leanToLand, steerOntoLine, turnBetween } from './riding'

/**
 * An AI rider: the same bike as yours, in your physics world, with the same
 * crash rules and getting back up after a crash, but ridden by a brain
 * instead of a keyboard. Each physics step the brain sets the same four
 * controls your keys do (throttle, brake, steer, lean), carrying out the
 * current order. When the orders run out, his behaviour gives him more.
 */

const DEG = Math.PI / 180
/** Within this of a spot he's riding to, he's there, metres. */
const ARRIVED = 10
/** Full lock when he's this far off the way he wants to go, degrees. */
const TURN_FULL = 25
/** He checks the ground this far ahead, and won't ride up anything steeper than this while cruising (degrees). */
const LOOK = 15
const MAX_CLIMB = 25
/** Nor onto ground steeper than this whichever way it slopes (a face he'd be riding across), degrees. */
const MAX_STEEP = 35
/** Ways off his line he tries when the ground ahead is too steep, nearest first, degrees. */
const DODGE = [30, -30, 60, -60, 90, -90, 135, -135]
/** Barely moving this long with the throttle open: stuck, so he gives up on what he was doing, seconds. */
const STUCK_AFTER = 3
/** Taking a jump: he first rides to a spot this far back from the start of its run-up, metres, then follows its line. */
const APPROACH = 25
/** Already within this many metres of a jump's line, short of its lip and within this many degrees of its way, he's lined up as he is. */
const ON_LINE_NEAR = 8
const ON_LINE_TURN = 30
/** Only flying from this close to the lip (or past it) counts as the jump, not a bump on the way, metres. */
const NEAR_LIP = 10
/** He gives up on a jump when he's this far off its line, or this far past its lip without flying, metres, or after this long, seconds. */
const LOST_LINE = 15
const PAST_LIP = 30
const JUMP_TIME = 40
/** A flight this long counts as the jump, seconds; after landing he rides out for this long before the next order. */
const JUMP_FLIGHT = 0.25
const RIDE_OUT = 1
/** Riding to a spot, he gives up after this long plus three times as long as getting there straight would take, seconds. */
const RIDE_TO_SPARE = 20
/** This far outside his roam area (or off the map), he's put back on the ground halfway to the middle, metres. */
const RESCUE = 100

export class AiRider {
  readonly bike: Bike
  readonly crashes: CrashWatcher
  readonly orders = new Orders()
  /** The order he's on, and how long he's been on it, seconds. */
  private onOrder: Order | undefined
  private orderTime = 0
  private stuckFor = 0
  private pitchBefore = 0
  /** Taking a jump: lined up on its run-up yet, how long he's flown, and how long since landing, seconds. */
  private lined = false
  private flown = 0
  private landedFor = 0
  /** How long he has for the current order before giving up on it, seconds. */
  private timeLimit = Infinity

  constructor(
    physics: PhysicsWorld,
    /** The game's settings, read live: his bike is set up like yours. */
    readonly settings: Config,
    /** His own: name, job, cruise speed..., read live. */
    readonly me: AiRiderSettings,
    private readonly groundAt: (x: number, z: number) => number,
    /** Gives him orders when he has none left. */
    public behaviour: Behaviour,
  ) {
    this.bike = new Bike(physics, settings.bike, settings.advanced.bikeBody)
    this.crashes = new CrashWatcher(physics, this.bike, settings.crashes, settings.advanced.fallingOver, settings.jumps.landing)
  }

  /** Picks his controls and works out his bike for this physics step. Call before the world steps. */
  beforeStep(dt: number): void {
    const { bike, orders } = this
    this.rescueIfLost()
    const p = bike.body.translation()
    const state = { x: p.x, z: p.z, heading: bike.heading }
    this.behaviour.watch?.(orders, state, dt)
    if (!orders.current) this.behaviour.refill(orders, state)
    let order = this.follow(dt)
    // done with it: straight on to the next one
    if (order && this.finished(order, p)) {
      orders.next()
      order = this.follow(dt)
    }

    const controls = bike.controls
    const inAir = bike.wheels.every((wheel) => !wheel.onGround)
    if (order?.kind === 'takeJump') {
      if (inAir) {
        if (this.lined && lineOffset(order.jump, p).along > -NEAR_LIP) this.flown += dt
      } else if (this.flown >= JUMP_FLIGHT) this.landedFor += dt
      else this.flown = 0 // only a bump
    }
    const pitchRate = (bike.pitch - this.pitchBefore) / dt
    this.pitchBefore = bike.pitch
    controls.lean = inAir ? leanToLand(bike, this.groundAt, pitchRate) : 0
    controls.powerslide = false
    if (!order) {
      controls.throttle = controls.steer = 0
      controls.brake = 1
    } else {
      let target = this.me.cruiseSpeed / 3.6
      if (order.kind === 'takeJump' && this.lined) {
        // on the run-up: keep to its line at the jump's speed, whatever the ground
        controls.steer = steerOntoLine(p, bike.heading, order.jump)
        target = order.jump.speed / 3.6
      } else {
        let to = order.kind === 'rideTo' ? order : order.kind === 'takeJump' ? approachPoint(order.jump) : null
        if (Math.hypot(p.x, p.z) > this.area()) to = { x: 0, z: 0 } // out of his area: home first
        const wanted = to ? Math.atan2(to.x - p.x, -(to.z - p.z)) / DEG : bike.heading
        const way = order.kind === 'rideTo' && order.onLine ? wanted : this.awayFromSteep(wanted)
        controls.steer = clamp(turnBetween(way, bike.heading) / TURN_FULL, -1, 1)
      }
      controls.throttle = bike.forwardSpeed < target ? 1 : 0
      controls.brake = bike.forwardSpeed > target + 2 ? 0.3 : 0
      this.watchForStuck(dt)
    }
    bike.update(dt)
  }

  /** Records where his bike got to and judges crashes. Call after the world steps. */
  afterStep(dt: number): void {
    this.bike.record()
    this.crashes.step(dt)
  }

  /** The current order, keeping count of how long he's been on it. */
  private follow(dt: number): Order | undefined {
    const order = this.orders.current
    if (order !== this.onOrder) {
      this.onOrder = order
      this.orderTime = 0
      this.stuckFor = 0
      this.lined = false
      this.flown = this.landedFor = 0
      const p = this.bike.body.translation()
      this.timeLimit =
        order?.kind === 'rideTo' ? RIDE_TO_SPARE + (3 * Math.hypot(order.x - p.x, order.z - p.z)) / (this.me.cruiseSpeed / 3.6) : Infinity
    }
    this.orderTime += dt
    return order
  }

  private finished(order: Order, p: { x: number; z: number }): boolean {
    if (order.kind === 'rideTo') return Math.hypot(order.x - p.x, order.z - p.z) < ARRIVED || this.orderTime > this.timeLimit
    if (order.kind === 'cruise') return this.orderTime >= order.seconds
    const { jump } = order
    if (!this.lined) {
      const at = approachPoint(jump)
      this.lined = Math.hypot(at.x - p.x, at.z - p.z) < ARRIVED || this.onLine(jump, p)
    }
    if (this.landedFor >= RIDE_OUT) return true // done it
    // given up: lost the line, rode past without flying, or too long at it
    const { along, across } = lineOffset(jump, p)
    const flew = this.flown >= JUMP_FLIGHT
    if (this.lined && !flew && Math.abs(across) > LOST_LINE) return true
    if (!flew && along > PAST_LIP) return true
    return this.orderTime > JUMP_TIME
  }

  /** Whether he's on a jump's line already, between where he'd line up and its lip, facing up it. */
  private onLine(jump: JumpSpot, p: { x: number; z: number }): boolean {
    const { along, across } = lineOffset(jump, p)
    const runUp = Math.hypot(jump.runUp[0].x - jump.lip.x, jump.runUp[0].z - jump.lip.z)
    return along < 0 && along > -(runUp + APPROACH) && Math.abs(across) < ON_LINE_NEAR && Math.abs(turnBetween(this.bike.heading, jump.heading)) < ON_LINE_TURN
  }

  /** `heading`, or the nearest way off it where the ground ahead is fit to ride. */
  private awayFromSteep(heading: number): number {
    for (const off of [0, ...DODGE]) {
      if (this.rideable(heading + off)) return heading + off
    }
    return heading + 180
  }

  /** Whether the ground LOOK metres ahead toward `heading` is fit to cruise onto: not climbing too steeply, and not a steep face to ride across. */
  private rideable(heading: number): boolean {
    const g = this.groundAt
    const p = this.bike.body.translation()
    const x = p.x + Math.sin(heading * DEG) * LOOK
    const z = p.z - Math.cos(heading * DEG) * LOOK
    const climb = Math.atan((g(x, z) - g(p.x, p.z)) / LOOK) / DEG
    const steepest = Math.atan(Math.hypot(g(x + 1, z) - g(x - 1, z), g(x, z + 1) - g(x, z - 1)) / 2) / DEG
    return climb <= MAX_CLIMB && steepest <= MAX_STEEP
  }

  /** Far outside his area (over the edge wall, or thrown off the map): back on the ground halfway to the middle, starting afresh. */
  private rescueIfLost(): void {
    const p = this.bike.body.translation()
    const out = Math.hypot(p.x, p.z)
    if (out <= this.area() + RESCUE) return
    const back = this.area() / 2 / out
    this.bike.placeOnGround(p.x * back, p.z * back, Math.atan2(-p.x, p.z) / DEG)
    this.crashes.recover()
    this.orders.clear()
  }

  /** How far from the middle he may go: his behaviour's say, else his roam radius, metres. */
  private area(): number {
    return this.behaviour.area?.() ?? this.me.freeRoam.roamRadius
  }

  /** Stuck (throttle open, going nowhere): give up on this order. */
  private watchForStuck(dt: number): void {
    const { bike } = this
    this.stuckFor = !this.crashes.crashed && bike.controls.throttle > 0 && Math.abs(bike.forwardSpeed) < 1 ? this.stuckFor + dt : 0
    if (this.stuckFor >= STUCK_AFTER) this.orders.next()
  }
}

/** Where he heads first to take a jump: APPROACH metres back from the start of its run-up, on its line. */
function approachPoint(jump: JumpSpot): { x: number; z: number } {
  const start = jump.runUp[0]
  return { x: start.x - Math.sin(jump.heading * DEG) * APPROACH, z: start.z + Math.cos(jump.heading * DEG) * APPROACH }
}

/** Where `p` is next to a jump's line: metres past its lip (negative: before it), and to the right of the line. */
function lineOffset(jump: JumpSpot, p: { x: number; z: number }): { along: number; across: number } {
  const fx = Math.sin(jump.heading * DEG)
  const fz = -Math.cos(jump.heading * DEG)
  const dx = p.x - jump.lip.x
  const dz = p.z - jump.lip.z
  return { along: dx * fx + dz * fz, across: dx * -fz + dz * fx }
}
