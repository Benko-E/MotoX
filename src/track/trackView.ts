import * as THREE from 'three'
import type { Track } from './track'

/** How far above the ground the strip is drawn: under the tyre tracks (0.015), over the ground. */
const LIFT = 0.005
/** Metres of strip per repeat of its texture, along and across. */
const TILE = 4

/**
 * The track on the ground: a strip of darker, packed dirt along the
 * spline, as wide as the track. Flat for now, so the bike rides it just as
 * it rides the ground around it.
 */
export class TrackView {
  private readonly mesh: THREE.Mesh

  constructor(scene: THREE.Scene, anisotropy: number) {
    const material = new THREE.MeshStandardMaterial({ map: packedDirt(anisotropy), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
  }

  /** Lays the strip along `track`, in place of the last one. */
  build(track: Track): void {
    const { samples } = track
    const half = track.shape.width / 2
    const step = track.length / samples.length
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    // one row of two corners per sample, and the first again at the end to close the loop
    for (let i = 0; i <= samples.length; i++) {
      const s = samples[i % samples.length]
      // the left side is the way the track runs, turned a quarter to the left
      positions.push(s.x + s.tz * half, LIFT, s.z - s.tx * half, s.x - s.tz * half, LIFT, s.z + s.tx * half)
      const v = (i * step) / TILE
      uvs.push(0, v, (half * 2) / TILE, v)
      if (i > 0) {
        const a = (i - 1) * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }
}

/** A tile of packed dirt: darker and smoother than the loose dirt around it, with streaks along the way you ride. */
function packedDirt(anisotropy: number): THREE.CanvasTexture {
  const tile = document.createElement('canvas')
  tile.width = tile.height = 256
  const paint = tile.getContext('2d')!
  paint.fillStyle = '#7a5a34'
  paint.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    paint.fillStyle = Math.random() < 0.5 ? 'rgba(50,32,14,0.2)' : 'rgba(190,150,100,0.12)'
    paint.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3)
  }
  // streaks along the strip (its texture runs along v, up the canvas)
  for (let i = 0; i < 40; i++) {
    paint.fillStyle = Math.random() < 0.5 ? 'rgba(45,28,12,0.12)' : 'rgba(170,130,85,0.08)'
    paint.fillRect(Math.random() * 256, 0, 1 + Math.random() * 4, 256)
  }
  const texture = new THREE.CanvasTexture(tile)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}
