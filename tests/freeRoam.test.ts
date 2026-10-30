import { describe, expect, it } from 'vitest'
import { FreeRoam, Orders } from '../src/ai/orders'
import type { JumpSpot } from '../src/world/jumpFinder'

const DEG = Math.PI / 180
const settings = () => ({ roamRadius: 300, lookAhead: 120, lookWide: 35, jumpAppetite: 1, jumpCooldown: 12 })
/** Always the same "random" number. */
const always = (n: number) => () => n

/** A made-up jump whose run-up starts at (x, z), ridden toward compass `heading`. */
function jump(x: number, z: number, heading: number): JumpSpot {
  const dx = Math.sin(heading * DEG)
  const dz = -Math.cos(heading * DEG)
  const runUp = [{ x, y: 0, z }, { x: x + dx * 30, y: 0, z: z + dz * 30 }]
  return { lip: runUp[1], heading, runUp, lipAngle: 20, speed: 70, airtime: 2, landing: { x: x + dx * 60, y: 0, z: z + dz * 60 }, score: 2 }
}
/** Him at the middle, heading north (toward -z). */
const here = { x: 0, z: 0, heading: 0 }

describe('free roam', () => {
  it('rides off to the quarter of the map he has been to least, within the roam radius, then cruises', () => {
    const roam = new FreeRoam(settings(), () => [], always(0.5))
    const quarters: number[] = []
    for (let i = 0; i < 8; i++) {
      const orders = new Orders()
      roam.refill(orders, here)
      const order = orders.current!
      if (order.kind !== 'rideTo') throw new Error('expected a ride to a spot')
      expect(Math.hypot(order.x, order.z)).toBeLessThanOrEqual(300)
      quarters.push((order.x >= 0 ? 1 : 0) + (order.z >= 0 ? 2 : 0))
      orders.next()
      expect(orders.current?.kind).toBe('cruise')
    }
    expect([0, 1, 2, 3].map((q) => quarters.filter((at) => at === q).length)).toEqual([2, 2, 2, 2])
  })

  it('goes for a jump ahead of him that points his way, before whatever he was doing', () => {
    const ahead = jump(5, -60, 10)
    const roam = new FreeRoam(settings(), () => [ahead], always(0))
    const orders = new Orders()
    orders.add({ kind: 'cruise', seconds: 5 })
    roam.watch(orders, here, 1)
    expect(orders.current).toEqual({ kind: 'takeJump', jump: ahead })
    orders.next()
    expect(orders.current?.kind).toBe('cruise')
  })

  it('leaves jumps behind him, off to the side, too far, or pointing another way', () => {
    const jumps = [
      jump(0, 60, 0), // behind
      jump(-80, -30, 0), // off to the side
      jump(0, -200, 0), // too far
      jump(0, -60, 120), // ridden across his way
    ]
    const roam = new FreeRoam(settings(), () => jumps, always(0))
    const orders = new Orders()
    roam.watch(orders, here, 1)
    expect(orders.current).toBeUndefined()
  })

  it('only goes for jumps that land inside his roam area, so none throws him off the map', () => {
    const roam = new FreeRoam(settings(), () => [jump(0, -270, 0)], always(0)) // lands at z = -330, past 300
    const orders = new Orders()
    roam.watch(orders, { x: 0, z: -200, heading: 0 }, 1)
    expect(orders.current).toBeUndefined()
  })

  it('goes for only some, as often as his appetite says, making up his mind once per jump', () => {
    const ahead = jump(5, -60, 10)
    const s = settings()
    s.jumpAppetite = 0.3
    const keen = new FreeRoam(s, () => [ahead], always(0.2)) // under 0.3: goes for it
    const orders = new Orders()
    keen.watch(orders, here, 1)
    expect(orders.current?.kind).toBe('takeJump')

    const notKeen = new FreeRoam(s, () => [ahead], always(0.5)) // over 0.3: doesn't
    const none = new Orders()
    notKeen.watch(none, here, 1)
    expect(none.current).toBeUndefined()
    s.jumpAppetite = 1 // keener now, but that jump was already turned down
    notKeen.watch(none, here, 1)
    expect(none.current).toBeUndefined()
  })

  it('cruises a while after a jump before going for another', () => {
    const first = jump(5, -60, 10)
    const second = jump(-5, -70, 350)
    const jumps = [first]
    const roam = new FreeRoam(settings(), () => jumps, always(0))
    const orders = new Orders()
    roam.watch(orders, here, 1)
    orders.next() // he's done the jump
    jumps.push(second)
    roam.watch(orders, here, 5)
    expect(orders.current).toBeUndefined() // 5 s after: still cooling down
    roam.watch(orders, here, 8)
    expect(orders.current).toEqual({ kind: 'takeJump', jump: second }) // 13 s after
  })
})
