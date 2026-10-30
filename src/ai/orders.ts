/**
 * What an AI rider has been told to do: a list of plain orders, carried out
 * one at a time. The riding only ever does the current order and doesn't care
 * who gave it. Behaviours (like wandering, and later free roam, a race or a
 * letter hunt) refill the list when it runs dry, or push an urgent order to
 * the front; anything can give him orders the same way.
 */

export type Order =
  /** Ride to a spot on the map. */
  | { kind: 'rideTo'; x: number; z: number }
  /** Ride on at an easy speed for a while, wherever the ground lets him. */
  | { kind: 'cruise'; seconds: number }

/** Where a rider is, for a behaviour deciding what he does next. Heading in compass degrees. */
export interface RiderState {
  x: number
  z: number
  heading: number
}

/** Something that gives a rider orders when he has none left. */
export interface Behaviour {
  refill(orders: Orders, rider: RiderState): void
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
