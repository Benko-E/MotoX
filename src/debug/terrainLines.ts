import * as THREE from 'three'
import { TERRAIN_CELL, TERRAIN_HALF, type Terrain } from '../world/terrain'

/** How tall a hill's pole stands, metres. */
const POLE_HEIGHT = 20
const POLE_RADIUS = 0.3
/** How far above the ground the contour lines are drawn, so they don't flicker into the dirt. */
const ABOVE = 0.08
/** A contour line above the middle height, and one below it (the middle one is the Contours setting's colour). */
const ABOVE_COLOR = new THREE.Color(0xff9a3c)
const BELOW_COLOR = new THREE.Color(0x3aa8ff)

/**
 * Debug for the Terrain tab: a pole on top of each big swell, to see how
 * far apart Width puts them, and contour lines on the ground like on a
 * map: one at the middle height (0 m), and one every step above (orange)
 * and below (blue) it, so a rise or a dip shows as rings.
 */
export class TerrainLines {
  private readonly poles: THREE.InstancedMesh
  private readonly contours: THREE.LineSegments

  constructor(scene: THREE.Scene, poleColor: number, private readonly middleColor: number) {
    const pole = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 6).translate(0, POLE_HEIGHT / 2, 0)
    // room for plenty of tops: the narrowest Width puts a couple of thousand on the grid
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshBasicMaterial({ color: poleColor }), 4096)
    this.poles.frustumCulled = false
    this.contours = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }))
    this.contours.frustumCulled = false
    scene.add(this.poles, this.contours)
  }

  set showPoles(on: boolean) {
    this.poles.visible = on
  }

  set showContours(on: boolean) {
    this.contours.visible = on
  }

  /** A pole on each of `terrain`'s swell tops, standing on the ground `heightAt` gives. */
  buildPoles(terrain: Terrain, heightAt: (x: number, z: number) => number): void {
    const place = new THREE.Matrix4()
    const count = Math.min(terrain.peaks.length, this.poles.instanceMatrix.count)
    for (let i = 0; i < count; i++) {
      const { x, z } = terrain.peaks[i]
      this.poles.setMatrixAt(i, place.makeTranslation(x, heightAt(x, z), z))
    }
    this.poles.count = count
    this.poles.instanceMatrix.needsUpdate = true
  }

  /**
   * Contour lines over `terrain`'s grid, every `step` metres. Worked out
   * on the same triangles the ground is drawn with, so they lie right on it.
   */
  buildContours(terrain: Terrain, step: number): void {
    const n = terrain.samples
    const h = terrain.heights
    const positions: number[] = []
    const colors: number[] = []
    const middle = new THREE.Color(this.middleColor)
    // where the line at `level` crosses the edge from point i to point j
    const cross = (level: number, i: number, j: number) => {
      const t = (level - h[i]) / (h[j] - h[i])
      const x = (i % n) + ((j % n) - (i % n)) * t
      const z = Math.floor(i / n) + (Math.floor(j / n) - Math.floor(i / n)) * t
      positions.push(-TERRAIN_HALF + x * TERRAIN_CELL, level + ABOVE, -TERRAIN_HALF + z * TERRAIN_CELL)
    }
    const triangle = (a: number, b: number, c: number) => {
      const low = Math.min(h[a], h[b], h[c])
      const high = Math.max(h[a], h[b], h[c])
      for (let k = Math.ceil(low / step); k * step < high; k++) {
        const level = k * step
        // the two edges with one end at or above the level and the other below
        const edges = ([[a, b], [b, c], [c, a]] as const).filter(([i, j]) => h[i] >= level !== h[j] >= level)
        if (edges.length !== 2) continue
        for (const [i, j] of edges) cross(level, i, j)
        const color = k === 0 ? middle : k > 0 ? ABOVE_COLOR : BELOW_COLOR
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
      }
    }
    if (step > 0) {
      for (let iz = 0; iz < n - 1; iz++) {
        for (let ix = 0; ix < n - 1; ix++) {
          const a = iz * n + ix
          const b = a + 1
          const c = a + n
          const d = c + 1
          // the ground's two triangles in this square, split from b to c
          triangle(a, c, b)
          triangle(b, c, d)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    this.contours.geometry.dispose()
    this.contours.geometry = geometry
  }
}
