import type { Config } from '../config'
import { Bike } from '../physics/bike'
import { CrashWatcher } from '../physics/crashes'
import type { PhysicsWorld } from '../physics/world'
import { Orders, type Behaviour, type Order } from './orders'
import { clamp, leanToLand, turnBetween } from './riding'

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

export class AiRider {
  readonly bike: Bike
  readonly crashes: CrashWatcher
  readonly orders = new Orders()
  /** The order he's on, and how long he's been on it, seconds. */
  private onOrder: Order | undefined
  private orderTime = 0
  private stuckFor = 0
  private pitchBefore = 0

  constructor(
    physics: PhysicsWorld,
    /** The game's settings, read live: his bike is set up like yours. */
    readonly settings: Config,
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
    const p = bike.body.translation()
    if (!orders.current) this.behaviour.refill(orders, { x: p.x, z: p.z, heading: bike.heading })
    let order = this.follow(dt)
    // done with it: straight on to the next one
    if (order && this.finished(order, p)) {
      orders.next()
      order = this.follow(dt)
    }

    const controls = bike.controls
    const inAir = bike.wheels.every((wheel) => !wheel.onGround)
    const pitchRate = (bike.pitch - this.pitchBefore) / dt
    this.pitchBefore = bike.pitch
    controls.lean = inAir ? leanToLand(bike, this.groundAt, pitchRate) : 0
    controls.powerslide = false
    if (!order) {
      controls.throttle = controls.steer = 0
      controls.brake = 1
    } else {
      const wanted = order.kind === 'rideTo' ? Math.atan2(order.x - p.x, -(order.z - p.z)) / DEG : bike.heading
      controls.steer = clamp(turnBetween(this.awayFromSteep(wanted), bike.heading) / TURN_FULL, -1, 1)
      const target = this.settings.ai.cruiseSpeed / 3.6
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
    }
    this.orderTime += dt
    return order
  }

  private finished(order: Order, p: { x: number; z: number }): boolean {
    if (order.kind === 'rideTo') return Math.hypot(order.x - p.x, order.z - p.z) < ARRIVED
    return this.orderTime >= order.seconds
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

  /** Stuck (throttle open, going nowhere): give up on this order. */
  private watchForStuck(dt: number): void {
    const { bike } = this
    this.stuckFor = !this.crashes.crashed && bike.controls.throttle > 0 && Math.abs(bike.forwardSpeed) < 1 ? this.stuckFor + dt : 0
    if (this.stuckFor >= STUCK_AFTER) this.orders.next()
  }
}
