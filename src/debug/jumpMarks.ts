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

  /** Paints `jumps` and the rest of `spots` on `layout`'s grid, in place of the last ones. */
  build(layout: Layout, spots: JumpSpot[], jumps: Jump[]): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof THREE.InstancedMesh) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    const placed = jumps.flatMap(({ at }) =>
      at.map((i, k) => ({ i, color: k === 0 ? RUN_UP : k === 1 ? FACE : k === at.length - 1 ? ROLL_OUT : FLIGHT })),
    )
    const taken = new Set(placed.map((p) => p.i))
    const spare = spots.flatMap(({ at }) => at.filter((i) => !taken.has(i)).map((i) => ({ i, color: SPARE })))
    this.paint(layout, placed, 0.55)
    this.paint(layout, spare, 0.15)
  }

  /** One tile per square, each its own colour. */
  private paint(layout: Layout, squares: { i: number; color: number }[], opacity: number): void {
    if (squares.length === 0) return
    const size = layout.shape.square * 0.94
    const tile = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false })
    const tiles = new THREE.InstancedMesh(tile, material, squares.length)
    tiles.renderOrder = 998
    const place = new THREE.Matrix4()
    const color = new THREE.Color()
    squares.forEach(({ i, color: c }, k) => {
      const { x, z } = squareCentre(layout, layout.squares[i])
      tiles.setMatrixAt(k, place.makeTranslation(x, LIFT, z))
      tiles.setColorAt(k, color.set(c))
    })
    this.group.add(tiles)
  }
}
