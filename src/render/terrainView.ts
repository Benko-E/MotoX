import * as THREE from 'three'
import type { MapDef } from '../maps/types'
import type { PlacedRamp } from '../terrain/generate'
import { sampleCoord, type Heightfield } from '../terrain/heightfield'
import { buildRampMesh } from '../terrain/ramps'

/** The ground texture repeats every this many metres; its faint lines mark the squares. */
const TILE_METRES = 10

const GRASS = new THREE.Color(0x76913f)
const DIRT = new THREE.Color(0x9a7b52)
const PACKED_DIRT = new THREE.Color(0xb39470)
const RAMP_WOOD = 0xc69c63

/** Draws the ground and the ramps. Call `show` again whenever the map changes. */
export class TerrainView {
  private readonly group = new THREE.Group()
  private readonly groundMaterial: THREE.MeshStandardMaterial
  private readonly rampMaterial = new THREE.MeshStandardMaterial({ color: RAMP_WOOD, roughness: 0.9 })

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const texture = makeGroundTexture()
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    this.groundMaterial = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1 })
    scene.add(this.group)
  }

  show(field: Heightfield, ramps: PlacedRamp[], map: MapDef): void {
    for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose()
    this.group.clear()

    const ground = new THREE.Mesh(buildGroundGeometry(field, map), this.groundMaterial)
    ground.receiveShadow = true
    this.group.add(ground)

    for (const ramp of ramps) {
      const { positions, indices } = buildRampMesh(ramp.def, ramp.baseY)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, this.rampMaterial)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
  }
}

function buildGroundGeometry(field: Heightfield, map: MapDef): THREE.BufferGeometry {
  const n = field.samples
  const positions = new Float32Array(n * n * 3)
  const uvs = new Float32Array(n * n * 2)
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix
      const x = sampleCoord(field, ix)
      const z = sampleCoord(field, iz)
      positions.set([x, field.heights[i], z], i * 3)
      uvs.set([x / TILE_METRES, z / TILE_METRES], i * 2)
    }
  }

  // Two triangles per grid square, wound so they face up.
  const indices = new Uint32Array((n - 1) * (n - 1) * 6)
  let k = 0
  for (let iz = 0; iz + 1 < n; iz++) {
    for (let ix = 0; ix + 1 < n; ix++) {
      const a = iz * n + ix
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices.set([a, c, b, b, c, d], k)
      k += 6
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.setAttribute('color', new THREE.BufferAttribute(groundColors(geometry, map), 3))
  return geometry
}

/** Grass on gentle ground, dirt on slopes and jumps, packed dirt in the flat area. */
function groundColors(geometry: THREE.BufferGeometry, map: MapDef): Float32Array {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  const { flatArea } = map
  for (let i = 0; i < position.count; i++) {
    const steepness = 1 - normal.getY(i)
    color.copy(GRASS).lerp(DIRT, smoothstep(0.03, 0.12, steepness))
    const fromFlat = Math.hypot(position.getX(i) - flatArea.x, position.getZ(i) - flatArea.z)
    color.lerp(PACKED_DIRT, 1 - smoothstep(flatArea.radius, flatArea.radius + flatArea.blend * 0.5, fromFlat))
    colors.set([color.r, color.g, color.b], i * 3)
  }
  return colors
}

/** A light speckled tile with faint edges, tinted by the vertex colours. */
function makeGroundTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const image = g.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const shade = 215 + Math.random() * 40
    image.data.set([shade, shade, shade, 255], i * 4)
  }
  g.putImageData(image, 0, 0)
  g.strokeStyle = 'rgba(0, 0, 0, 0.12)'
  g.lineWidth = 2
  g.strokeRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(Math.max((value - from) / (to - from), 0), 1)
  return t * t * (3 - 2 * t)
}
