import * as THREE from 'three'
import { TERRAIN_CELL, TERRAIN_HALF, type Terrain } from './terrain'

/** Metres of ground per repeat of its texture. */
const TILE = 4
/** How far the flat ground reaches past the grid, so you never see the world's edge, metres. */
const BEYOND = 1000

/**
 * The ground on screen: the terrain's grid of heights as one big mesh of
 * dirt with a faint grid, and flat dirt all round it out to the horizon.
 */
export class TerrainView {
  private readonly mesh: THREE.Mesh

  constructor(scene: THREE.Scene, material: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
    // the flat ground round the grid: four strips, leaving the grid's square open
    const [a, b] = [TERRAIN_HALF, TERRAIN_HALF + BEYOND]
    const strips: [number, number, number, number][] = [
      [-b, -b, b, -a], // far side
      [-b, a, b, b], // near side
      [-b, -a, -a, a], // left
      [a, -a, b, a], // right
    ]
    const positions: number[] = []
    const uvs: number[] = []
    for (const [x0, z0, x1, z1] of strips) {
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) {
        positions.push(x, 0, z)
        uvs.push(x / TILE, -z / TILE)
      }
    }
    const flat = new THREE.BufferGeometry()
    flat.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    flat.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    flat.computeVertexNormals()
    const beyond = new THREE.Mesh(flat, material)
    beyond.receiveShadow = true
    scene.add(beyond)
  }

  /** Builds the mesh from `terrain`'s heights, in place of the last one. */
  build(terrain: Terrain): void {
    const n = terrain.samples
    const positions = new Float32Array(n * n * 3)
    const uvs = new Float32Array(n * n * 2)
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix
        const x = -TERRAIN_HALF + ix * TERRAIN_CELL
        const z = -TERRAIN_HALF + iz * TERRAIN_CELL
        positions.set([x, terrain.heights[i], z], i * 3)
        uvs.set([x / TILE, -z / TILE], i * 2)
      }
    }
    const index = new Uint32Array((n - 1) * (n - 1) * 6)
    let k = 0
    for (let iz = 0; iz < n - 1; iz++) {
      for (let ix = 0; ix < n - 1; ix++) {
        const a = iz * n + ix
        const b = a + 1
        const c = a + n
        const d = c + 1
        index.set([a, c, b, b, c, d], k)
        k += 6
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(index, 1))
    geometry.computeVertexNormals()
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }
}
