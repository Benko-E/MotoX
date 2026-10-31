import { describe, expect, it } from 'vitest'
import { FollowTrack, FreeRoam, Orders, PickBehaviour } from '../src/ai/orders'
import type { JumpSpot } from '../src/world/jumps'

const DEG = Math.PI / 180
const settings = () => ({ roamRadius: 300, lookAhead: 120, lookWide: 35, jumpAppetite: 1, jumpCooldown: 12 })
/** Always the same "random" number. */
const always = (n: number) => () => n

/** A made-up jump whose run-up starts at (x, z), ridden toward compass `heading`. */
function jump(x: number, z: number, heading: number): JumpSpot {
  const dx = Math.sin(heading * DEG)
  const dz = -Math.cos(heading * DEG)
  const runUp = [{ x, y: 0, z }, { x: x + dx * 30, y: 0, z: z + dz * 30 }]
  return { lip: runUp[1], heading, runUp, speed: 70, airtime: 2, landing: { x: x + dx * 60, y: 0, z: z + dz * 60 }, source: 'found', kind: 'fast' }
}
/** Him at the middle, heading north (toward -z). */
const here = { x: 0, z: 0, heading: 0 }
/** The same jump, as a map feature built it, of a kind. */
const designed = (spot: JumpSpot, kind: JumpSpot['kind'], source = 'bigAir'): JumpSpot => ({ ...spot, kind, source })

describe('free roam', () => {
  it('rides off to the quarter of the map he has been to least, within the roam radius, then cruises', () => {
    const roam = new FreeRoam(settings(), () => [], always(0.5))
    const quarters: number[] = []
    let him = here
    for (let i = 0; i < 8; i++) {
      const orders = new Orders()
      roam.refill(orders, him)
      const order = orders.current!
      if (order.kind !== 'rideTo') throw new Error('expected a ride to a spot')
      expect(Math.hypot(order.x, order.z)).toBeLessThanOrEqual(300)
      quarters.push((order.x >= 0 ? 1 : 0) + (order.z >= 0 ? 2 : 0))
      orders.next()
      expect(orders.current?.kind).toBe('cruise')
      him = { x: order.x, z: order.z, heading: Math.atan2(order.x - him.x, -(order.z - him.z)) / DEG } // he got there
    }
    expect([0, 1, 2, 3].map((q) => quarters.filter((at) => at === q).length)).toEqual([2, 2, 2, 2])
  })

  it('goes for a jump ahead of him that points his way, dropping what he was doing (so he never turns back for it after)', () => {
    const ahead = jump(5, -60, 10)
    const roam = new FreeRoam(settings(), () => [ahead], always(0))
    const orders = new Orders()
    orders.add({ kind: 'rideTo', x: 0, z: -50 })
    orders.add({ kind: 'cruise', seconds: 5 })
    roam.watch(orders, here, 1)
    expect(orders.current).toEqual({ kind: 'takeJump', jump: ahead })
    orders.next()
    expect(orders.current).toBeUndefined() // he picks where next from wherever he lands
  })

  it('heads for a quarter ahead of him rather than one behind, when he has been to both as often', () => {
    const roam = new FreeRoam(settings(), () => [], always(0.5))
    const southward = { x: 0, z: 0, heading: 180 }
    for (const wanted of [2, 3]) {
      const orders = new Orders()
      roam.refill(orders, southward)
      const order = orders.current!
      if (order.kind !== 'rideTo') throw new Error('expected a ride to a spot')
      expect((order.x >= 0 ? 1 : 0) + (order.z >= 0 ? 2 : 0)).toBe(wanted) // south-west, then south-east
    }
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

  it('roaming, he goes for big air first, then a jump a feature built, before a nearer found one', () => {
    const near = jump(0, -40, 0)
    const fast = designed(jump(10, -70, 0), 'fast', 'track')
    const big = designed(jump(-10, -100, 0), 'bigAir')
    for (const [jumps, wanted] of [[[near, fast, big], big], [[near, fast], fast], [[near], near]] as const) {
      const orders = new Orders()
      new FreeRoam(settings(), () => jumps, always(0)).watch(orders, here, 1)
      expect(orders.current).toEqual({ kind: 'takeJump', jump: wanted })
    }
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

  it('thinks again about a jump he turned down, a while later', () => {
    const ahead = jump(5, -60, 10)
    const s = settings()
    s.jumpAppetite = 0.3
    const roam = new FreeRoam(s, () => [ahead], always(0.5))
    const orders = new Orders()
    roam.watch(orders, here, 1) // turned down
    s.jumpAppetite = 1
    for (let t = 0; t < 30; t++) roam.watch(orders, here, 1)
    expect(orders.current).toBeUndefined() // half a minute on: his mind is still made up
    for (let t = 0; t < 40; t++) roam.watch(orders, here, 1)
    expect(orders.current).toEqual({ kind: 'takeJump', jump: ahead })
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

describe('following the track', () => {
  /** A round track 100 m out, its points about 1 m apart, going round clockwise from north. */
  const line = Array.from({ length: 628 }, (_, i) => {
    const bearing = (i / 628) * Math.PI * 2
    return { x: Math.sin(bearing) * 100, z: -Math.cos(bearing) * 100 }
  })
  /** On the track, at its north point. */
  const onTrack = { x: 0, z: -100, heading: 90 }
  const bearingOf = (p: { x: number; z: number }) => (Math.atan2(p.x, -p.z) * 180) / Math.PI

  it('rides on to a point a little further round the track, the way the track runs', () => {
    for (const [way, sign] of [['clockwise', 1], ['counterclockwise', -1]] as const) {
      const follow = new FollowTrack(() => way, () => line)
      const orders = new Orders()
      follow.refill(orders, onTrack)
      const order = orders.current!
      if (order.kind !== 'rideTo') throw new Error('expected a ride to a spot')
      const round = bearingOf(order) * sign // degrees on round the way he goes
      expect(round).toBeGreaterThan(10) // about 25 m on, 100 m out: 14 degrees
      expect(round).toBeLessThan(20)
    }
  })

  it('tells him how the track bends ahead of him, the way he rides it', () => {
    // a D: half way round, then straight back up to the north point (ridden clockwise from there)
    const d = [...line.slice(0, 315), ...Array.from({ length: 199 }, (_, i) => ({ x: 0, z: 99 - i }))]
    const follow = new FollowTrack(() => 'clockwise', () => d)
    const ahead = follow.roadAhead({ x: 0, z: -100, heading: 90 }, 400)
    for (let i = 1; i < ahead.length; i++) expect(ahead[i].distance).toBeGreaterThanOrEqual(ahead[i - 1].distance)
    expect(ahead.at(-1)!.distance).toBeGreaterThan(380)
    expect(ahead.at(-1)!.distance).toBeLessThanOrEqual(400)
    const round = ahead.filter((bend) => bend.distance > 20 && bend.distance < 290)
    for (const bend of round) expect(bend.radius).toBeCloseTo(100, -1) // the round part: 100 m out
    const straight = ahead.filter((bend) => bend.distance > 340)
    for (const bend of straight) expect(bend.radius).toBeGreaterThan(1000)
    // ridden the other way, the round part is behind him and the straight comes first
    const back = new FollowTrack(() => 'counterclockwise', () => d).roadAhead({ x: 0, z: -100, heading: 270 }, 400)
    expect(back.find((bend) => bend.distance > 30 && bend.distance < 100)!.radius).toBeGreaterThan(1000)
    expect(new FollowTrack(() => 'clockwise', () => undefined).roadAhead({ x: 0, z: 0, heading: 0 }, 100)).toEqual([])
    // nor away from the track, on his way to it: there he just rides
    expect(follow.roadAhead({ x: 50, z: 0, heading: 90 }, 400)).toEqual([])
  })

  it('marks the bends at the track kickers he flies, so he does not ease off for their lip', () => {
    // a track kicker whose lip is on the line 50 m round from the north point (bearing about 29 degrees)
    const lip = line[50]
    const kicker = designed({ ...jump(lip.x, lip.z, 120), lip: { x: lip.x, y: 0, z: lip.z } }, 'fast', 'track')
    const found = { ...kicker, source: 'found' as const } // one the finder found is not the track's
    for (const [jumps, marked] of [[[kicker], true], [[found], false]] as const) {
      const ahead = new FollowTrack(() => 'clockwise', () => line, () => jumps).roadAhead(onTrack, 200)
      const near = ahead.filter((bend) => Math.hypot(bend.x - lip.x, bend.z - lip.z) < 10)
      expect(near.length).toBeGreaterThan(0)
      for (const bend of near) expect(bend.kicker).toBe(marked)
      for (const bend of ahead.filter((b) => Math.hypot(b.x - lip.x, b.z - lip.z) > 20)) expect(bend.kicker).toBe(false)
    }
  })

  it('heads for the nearest bit of track when he is away from it', () => {
    const follow = new FollowTrack(() => 'clockwise', () => line)
    const orders = new Orders()
    follow.refill(orders, { x: 0, z: -40, heading: 0 }) // inside the loop, south of its north point
    const order = orders.current!
    if (order.kind !== 'rideTo') throw new Error('expected a ride to a spot')
    expect(Math.abs(bearingOf(order))).toBeLessThan(35)
  })

  it('takes the track kickers coming up on his line as jumps, dropping the rest of his way there', () => {
    // a kicker on the track 40 m on round from the north point, the way he's going (clockwise), and one the other way
    const at = (i: number) => line[(i + line.length) % line.length]
    const kicker = (from: number, to: number) => {
      const a = at(from)
      const b = at(to)
      const heading = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI
      return designed({ ...jump(a.x, a.z, heading), lip: { x: b.x, y: 0, z: b.z }, runUp: [{ ...a, y: 0 }, { ...b, y: 0 }] }, 'fast', 'track')
    }
    const ahead = kicker(20, 50)
    const behind = kicker(-20, -50)
    const follow = new FollowTrack(() => 'clockwise', () => line, () => [behind, ahead])
    const orders = new Orders()
    orders.add({ kind: 'rideTo', ...at(25), onLine: true })
    follow.watch(orders, onTrack, 1 / 60)
    expect(orders.current).toEqual({ kind: 'takeJump', jump: ahead })
    orders.next()
    expect(orders.current).toBeUndefined() // on from wherever he lands
  })

  it('may go as far out as the track does, wherever the map has put it', () => {
    let track = line
    const follow = new FollowTrack(() => 'clockwise', () => track)
    expect(follow.area?.()).toBeGreaterThanOrEqual(100)
    track = line.map((p) => ({ x: p.x * 2, z: p.z * 2 })) // the map rebuilt, its track bigger
    expect(follow.area?.()).toBeGreaterThanOrEqual(200)
  })

  it('with no track on the map, he just cruises, within his roam radius', () => {
    const orders = new Orders()
    const follow = new FollowTrack(() => 'clockwise', () => undefined)
    follow.refill(orders, onTrack)
    expect(orders.current?.kind).toBe('cruise')
    expect(follow.area?.()).toBeUndefined()
  })
})

describe('picking a behaviour', () => {
  it('uses whichever is chosen, and starts afresh when the choice changes', () => {
    let choice = 'a'
    const calls: string[] = []
    const a = { refill: () => calls.push('a') }
    const b = { refill: () => calls.push('b') }
    const pick = new PickBehaviour(() => (choice === 'a' ? a : b))
    const orders = new Orders()
    pick.refill(orders, here)
    orders.add({ kind: 'cruise', seconds: 5 })
    choice = 'b'
    pick.watch(orders, here, 1/60)
    expect(orders.current).toBeUndefined() // the old orders are dropped
    pick.refill(orders, here)
    expect(calls).toEqual(['a', 'b'])
  })
})
