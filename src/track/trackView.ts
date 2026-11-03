import * as THREE from 'three'
import type { Track } from './track'

/** How far above the ground the strip is drawn: under the tyre tracks (0.015), over the ground. */
const LIFT = 0.005
/** How many pieces the strip is cut into across, so it follows the ground's tilt. */
const ACROSS = 6
/** Metres of strip per repeat of its texture, along and across. */
export const TILE = 4

/**
 * The track on the ground: a strip of darker, packed dirt along the
 * spline, as wide as the track, laid over the ground's ups and downs.
 */
export class TrackView {
  private readonly mesh: THREE.Mesh

  constructor(scene: THREE.Scene, anisotropy: number) {
    const material = new THREE.MeshStandardMaterial({ map: packedDirt(anisotropy), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
  }

  /** Lays the strip along `track`, on the ground `heightAt` gives, in place of the last one. */
  build(track: Track, heightAt: (x: number, z: number) => number): void {
    const { samples } = track
    const half = track.shape.width / 2
    const step = track.length / samples.length
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    const row = ACROSS + 1
    // one row of points across per sample, and the first again at the end to close the loop
    for (let i = 0; i <= samples.length; i++) {
      const s = samples[i % samples.length]
      const v = (i * step) / TILE
      for (let j = 0; j < row; j++) {
        // from the left side to the right (the left is the way the track runs, turned a quarter to the left)
        const off = half - (j / ACROSS) * half * 2
        const x = s.x + s.tz * off
        const z = s.z - s.tx * off
        positions.push(x, heightAt(x, z) + LIFT, z)
        uvs.push(((half - off) / TILE), v)
      }
      if (i > 0) {
        for (let j = 0; j < ACROSS; j++) {
          const a = (i - 1) * row + j
          const b = a + row
          index.push(a, a + 1, b, a + 1, b + 1, b)
        }
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
export function packedDirt(anisotropy: number): THREE.CanvasTexture {
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
