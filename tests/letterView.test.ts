import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { LETTER_HEIGHT, LetterView, letterShape } from '../src/render/letterView'
import type { JumpSpot } from '../src/world/jumpFinder'
import { pointAlong, type LetterSpot } from '../src/world/letterSpots'

const settings = () => structuredClone(config.letters)
/** A flight over x = 0 to 20, its top 10 m up at x = 10. */
const flight = Array.from({ length: 21 }, (_, i) => ({ x: i, y: 10 - 0.1 * (i - 10) ** 2, z: 5 }))
const spot = (letter: number): LetterSpot => ({ letter, slice: letter, jump: {} as JumpSpot, flight, difficulty: letter / 4 })

describe('the letters drawn', () => {
  it('float on the ghost\'s flight where `along` says, about as tall as asked', () => {
    const s = settings()
    const scene = new THREE.Scene()
    const view = new LetterView(scene, s)
    view.show([spot(0), spot(4)])
    view.update(0)
    const at = pointAlong(flight, s.each[0].along)
    expect(view.letter(0)!.position.toArray()).toEqual([at.x, at.y, at.z])
    const size = new THREE.Box3().setFromObject(view.letter(4)!).getSize(new THREE.Vector3())
    expect(size.y).toBeCloseTo(LETTER_HEIGHT, 1)
  })

  it('moving the along slider slides a letter along its jump straight away', () => {
    const s = settings()
    const view = new LetterView(new THREE.Scene(), s)
    view.show([spot(4)])
    s.each[4].along = 0.5
    view.update(1 / 60)
    expect(view.letter(4)!.position.toArray()).toEqual([10, 10, 5]) // the top
  })

  it('spin slowly', () => {
    const view = new LetterView(new THREE.Scene(), settings())
    view.show([spot(2)])
    view.update(0)
    const before = view.letter(2)!.rotation.y
    view.update(1)
    expect(view.letter(2)!.rotation.y).not.toBeCloseTo(before, 2)
  })

  it('a new set of spots replaces the old ones, and turned off nothing shows', () => {
    const s = settings()
    const scene = new THREE.Scene()
    const view = new LetterView(scene, s)
    view.show([spot(0), spot(1)])
    view.show([spot(3)])
    expect(view.letter(0)).toBeUndefined()
    expect(view.letter(3)).toBeDefined()
    s.show = false
    view.update(1 / 60)
    expect(view.letter(3)!.visible).toBe(false)
  })
})

describe('letter shapes', () => {
  it('M, O, T and X each have their own shape, the O with a hole in it', () => {
    const outlines = ['M', 'O', 'T', 'X'].map((char) => JSON.stringify(letterShape(char).extractPoints(4).shape))
    expect(new Set(outlines).size).toBe(4)
    expect(letterShape('O').holes).toHaveLength(1)
  })

  it('fill a box one high, standing on the ground line', () => {
    for (const char of ['M', 'O', 'T', 'X']) {
      const points = letterShape(char).extractPoints(8).shape
      expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0, 6)
      expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(1, 6)
    }
  })
})
