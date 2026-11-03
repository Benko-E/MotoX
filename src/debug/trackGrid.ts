import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { squareCentre, type Layout } from '../track/layout'

const LINE_WIDTH = 4
/** How far above the ground it's drawn, so it doesn't flicker into the dirt. */
const ABOVE = 0.05
/** The first square, where the loop starts. */
const START_COLOR = 0x2ee66b

/**
 * Debug: the track's layout from above. The grid's squares, the squares
 * the loop runs through filled in (the first one green), and the loop
 * itself, a line through their middles in riding order.
 */
export class TrackGrid {
  private readonly grid = new THREE.Group()
  private readonly path = new THREE.Group()

  constructor(
    scene: THREE.Scene,
    private readonly gridColor: number,
    private readonly pathColor: number,
  ) {
    scene.add(this.grid, this.path)
  }

  set showGrid(on: boolean) {
    this.grid.visible = on
  }

  set showPath(on: boolean) {
    this.path.visible = on
  }

  /** Draws `layout` again, in place of the last one. */
  build(layout: Layout): void {
    for (const group of [this.grid, this.path]) {
      for (const child of [...group.children]) {
        group.remove(child)
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof Line2) {
          child.geometry.dispose()
          ;(child.material as THREE.Material).dispose()
        }
      }
    }
    const { square } = layout.shape
    const wide = Math.round(layout.shape.wide)
    const deep = Math.round(layout.shape.deep)
    const edgeX = (wide * square) / 2
    const edgeZ = (deep * square) / 2

    // the grid's lines
    const lines: number[] = []
    for (let i = 0; i <= wide; i++) lines.push(-edgeX + i * square, ABOVE, -edgeZ, -edgeX + i * square, ABOVE, edgeZ)
    for (let i = 0; i <= deep; i++) lines.push(-edgeX, ABOVE, -edgeZ + i * square, edgeX, ABOVE, -edgeZ + i * square)
    const gridGeometry = new THREE.BufferGeometry()
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    this.grid.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: this.gridColor, transparent: true, opacity: 0.5 })))

    // the loop's squares, filled in
    const tile = new THREE.PlaneGeometry(square * 0.94, square * 0.94).rotateX(-Math.PI / 2)
    const fill = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, depthWrite: false })
    const tiles = new THREE.InstancedMesh(tile, fill, layout.squares.length)
    const place = new THREE.Matrix4()
    const start = new THREE.Color(START_COLOR)
    const rest = new THREE.Color(this.pathColor)
    layout.squares.forEach((s, i) => {
      const { x, z } = squareCentre(layout, s)
      tiles.setMatrixAt(i, place.makeTranslation(x, ABOVE, z))
      tiles.setColorAt(i, i === 0 ? start : rest)
    })
    this.grid.add(tiles)

    // the loop, through the squares' middles and back to the first
    const points = [...layout.squares, layout.squares[0]].flatMap((s) => {
      const { x, z } = squareCentre(layout, s)
      return [x, ABOVE * 2, z]
    })
    const material = new LineMaterial({ color: this.pathColor, linewidth: LINE_WIDTH, depthTest: false })
    const line = new Line2(new LineGeometry().setPositions(points), material)
    line.renderOrder = 999
    this.path.add(line)
  }
}
