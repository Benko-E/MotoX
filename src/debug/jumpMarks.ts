import * as THREE from 'three'
import { squareCentre, type Layout } from '../track/layout'
import type { JumpSpot } from '../track/jumpSpots'

/** The parts of a spot, in the order you ride them. */
const RUN_UP = 0xffd23a
const FACE = 0xff7a1a
const FLIGHT = 0xff2a2a
const ROLL_OUT = 0x3aa8ff
/** How far above the ground they're drawn: over the track's strip and the grid. */
const LIFT = 0.04

/**
 * Debug: every spot a jump fits, its squares painted in: the first is
 * the run-up (yellow), the second the face (orange), the last the roll-out
 * (blue), and the ones between red, for the flight. A long run doesn't mean
 * a long jump, only that it has room to go anywhere along it.
 */
export class JumpMarks {
  private readonly group = new THREE.Group()

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  set visible(on: boolean) {
    this.group.visible = on
  }

  /** Paints `spots` on `layout`'s grid, in place of the last ones. */
  build(layout: Layout, spots: JumpSpot[]): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof THREE.InstancedMesh) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    const count = spots.reduce((sum, spot) => sum + spot.squares.length, 0)
    if (count === 0) return
    const size = layout.shape.square * 0.94
    const tile = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false })
    const tiles = new THREE.InstancedMesh(tile, material, count)
    tiles.renderOrder = 998
    const place = new THREE.Matrix4()
    const color = new THREE.Color()
    let i = 0
    for (const { squares } of spots) {
      squares.forEach((s, k) => {
        const { x, z } = squareCentre(layout, s)
        tiles.setMatrixAt(i, place.makeTranslation(x, LIFT, z))
        tiles.setColorAt(i, color.set(k === 0 ? RUN_UP : k === 1 ? FACE : k === squares.length - 1 ? ROLL_OUT : FLIGHT))
        i++
      })
    }
    this.group.add(tiles)
  }
}
