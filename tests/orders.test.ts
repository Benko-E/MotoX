import { describe, expect, it } from 'vitest'
import { Orders, Wander } from '../src/ai/orders'

describe('the orders list', () => {
  it('carries out one order at a time, in the order given', () => {
    const orders = new Orders()
    orders.add({ kind: 'rideTo', x: 10, z: 0 })
    orders.add({ kind: 'cruise', seconds: 5 })
    expect(orders.current).toEqual({ kind: 'rideTo', x: 10, z: 0 })
    orders.next()
    expect(orders.current).toEqual({ kind: 'cruise', seconds: 5 })
    orders.next()
    expect(orders.current).toBeUndefined()
  })

  it('an urgent order jumps the queue, and the rest follow after it', () => {
    const orders = new Orders()
    orders.add({ kind: 'cruise', seconds: 5 })
    orders.addFirst({ kind: 'rideTo', x: 1, z: 2 })
    expect(orders.current).toEqual({ kind: 'rideTo', x: 1, z: 2 })
    orders.next()
    expect(orders.current).toEqual({ kind: 'cruise', seconds: 5 })
  })

  it('can be cleared, for whoever takes over', () => {
    const orders = new Orders()
    orders.add({ kind: 'cruise', seconds: 5 })
    orders.clear()
    expect(orders.current).toBeUndefined()
  })
})

describe('wandering', () => {
  it('when the list runs dry: ride to a spot within the roam radius, then cruise a while', () => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const wander = new Wander({ roamRadius: 200 }, random)
    for (let i = 0; i < 50; i++) {
      const orders = new Orders()
      wander.refill(orders, { x: 0, z: 0, heading: 0 })
      const first = orders.current!
      expect(first.kind).toBe('rideTo')
      if (first.kind === 'rideTo') expect(Math.hypot(first.x, first.z)).toBeLessThanOrEqual(200)
      orders.next()
      expect(orders.current?.kind).toBe('cruise')
    }
  })
})
