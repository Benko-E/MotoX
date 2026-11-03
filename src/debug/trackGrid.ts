import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { squareCentre, type Layout } from '../track/layout'
import type { Track } from '../track/track'

const LINE_WIDTH = 4
/** How far above the ground it's drawn, so it doesn't flicker into the dirt. */
const ABOVE = 0.05
/** The first square, where the loop starts. */
const START_COLOR = 0x2ee66b

/**
 * Debug: the track's layout from above. The grid's squares, the squares
 * the loop runs through filled in (the first one green), the loop itself,
 * a line through their middles in riding order, and the smooth spline the
 * track actually follows, with its tightest corner marked.
 */
export class TrackGrid {
  private readonly grid = new THREE.Group()
  private readonly path = new THREE.Group()
  private readonly centre = new THREE.Group()

  constructor(
    scene: THREE.Scene,
    private readonly gridColor: number,
    private readonly pathColor: number,
    private readonly centreColor: number,
  ) {
    scene.add(this.grid, this.path, this.centre)
  }

  set showGrid(on: boolean) {
    this.grid.visible = on
  }

  set showPath(on: boolean) {
    this.path.visible = on
  }

  set showCentre(on: boolean) {
    this.centre.visible = on
  }

  /** Draws `layout` and the `track` through it again, in place of the last ones. */
  build(layout: Layout, track: Track): void {
    for (const group of [this.grid, this.path, this.centre]) {
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

    // the spline the track follows, and a ring round its tightest corner
    const spline = [...track.samples, track.samples[0]].flatMap((s) => [s.x, ABOVE * 3, s.z])
    const centre = new Line2(new LineGeometry().setPositions(spline), new LineMaterial({ color: this.centreColor, linewidth: LINE_WIDTH, depthTest: false }))
    centre.renderOrder = 999
    this.centre.add(centre)
    const { radius, at } = track.tightest
    if (Number.isFinite(radius)) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.3, radius + 0.3, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: this.centreColor, depthTest: false, transparent: true, opacity: 0.6 }),
      )
      // its middle is off to the inside of the corner
      const s = track.samples[at]
      const before = track.samples[(at - 3 + track.samples.length) % track.samples.length]
      const inside = Math.sign(before.tx * s.tz - before.tz * s.tx) || 1
      ring.position.set(s.x - s.tz * radius * inside, ABOVE * 3, s.z + s.tx * radius * inside)
      ring.renderOrder = 999
      this.centre.add(ring)
    }
  }
}
