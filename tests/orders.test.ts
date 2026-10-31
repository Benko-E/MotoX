import { describe, expect, it } from 'vitest'
import { Orders } from '../src/ai/orders'

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

  it('a change of plan: one order instead of all the rest', () => {
    const orders = new Orders()
    orders.add({ kind: 'cruise', seconds: 5 })
    orders.add({ kind: 'cruise', seconds: 9 })
    orders.instead({ kind: 'rideTo', x: 1, z: 2 })
    expect(orders.current).toEqual({ kind: 'rideTo', x: 1, z: 2 })
    orders.next()
    expect(orders.current).toBeUndefined()
  })

  it('can be cleared, for whoever takes over', () => {
    const orders = new Orders()
    orders.add({ kind: 'cruise', seconds: 5 })
    orders.clear()
    expect(orders.current).toBeUndefined()
  })
})
