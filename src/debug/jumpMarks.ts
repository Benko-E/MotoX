import * as THREE from 'three'
import { squareCentre, type Layout } from '../track/layout'
import type { Jump, JumpSpot } from '../track/jumpSpots'

/** The parts of a jump, in the order you ride them. */
const RUN_UP = 0xffd23a
const FACE = 0xff7a1a
const FLIGHT = 0xff2a2a
const ROLL_OUT = 0x3aa8ff
/** The rest of the spots, where a jump fits but none was placed. */
const SPARE = 0xffffff
/** How far above the ground they're drawn: over the track's strip and the grid. */
const LIFT = 0.04
/** How many pieces each tile is cut into each way, so it lies over the ground's ups and downs. */
const CUTS = 9

/**
 * Debug: the placed jumps, their squares painted in: the first is the
 * run-up (yellow), the second the face (orange), the last the roll-out
 * (blue), and the ones between red, for the flight. Every other square
 * where a jump would fit is painted faintly white.
 */
export class JumpMarks {
  private readonly group = new THREE.Group()

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  set visible(on: boolean) {
    this.group.visible = on
  }

  /** Paints `jumps` and the rest of `spots` on `layout`'s grid, on the ground `heightAt` gives, in place of the last ones. */
  build(layout: Layout, spots: JumpSpot[], jumps: Jump[], heightAt: (x: number, z: number) => number): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    const placed = jumps.flatMap(({ at }) =>
      at.map((i, k) => ({ i, color: k === 0 ? RUN_UP : k === 1 ? FACE : k === at.length - 1 ? ROLL_OUT : FLIGHT })),
    )
    const taken = new Set(placed.map((p) => p.i))
    const spare = spots.flatMap(({ at }) => at.filter((i) => !taken.has(i)).map((i) => ({ i, color: SPARE })))
    this.paint(layout, placed, 0.55, heightAt)
    this.paint(layout, spare, 0.15, heightAt)
  }

  /** One tile per square, each its own colour, laid over the ground's ups and downs. */
  private paint(layout: Layout, squares: { i: number; color: number }[], opacity: number, heightAt: (x: number, z: number) => number): void {
    if (squares.length === 0) return
    const half = (layout.shape.square * 0.94) / 2
    const positions: number[] = []
    const colors: number[] = []
    const index: number[] = []
    const color = new THREE.Color()
    for (const { i, color: c } of squares) {
      const { x, z } = squareCentre(layout, layout.squares[i])
      color.set(c)
      const first = positions.length / 3
      for (let row = 0; row <= CUTS; row++) {
        for (let col = 0; col <= CUTS; col++) {
          const px = x - half + (2 * half * col) / CUTS
          const pz = z - half + (2 * half * row) / CUTS
          positions.push(px, heightAt(px, pz) + LIFT, pz)
          colors.push(color.r, color.g, color.b)
          if (row < CUTS && col < CUTS) {
            const a = first + row * (CUTS + 1) + col
            const b = a + CUTS + 1
            index.push(a, b, a + 1, a + 1, b, b + 1)
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(index)
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false })
    const tiles = new THREE.Mesh(geometry, material)
    tiles.renderOrder = 998
    this.group.add(tiles)
  }
}
