import * as THREE from 'three'
import type { Kickers } from './kickers'
import { packedDirt, TILE } from './trackView'

/** How far above the ground they're drawn, so their bottom edges don't flicker into the track's strip. */
const LIFT = 0.01
/** How light each side is drawn: the face lightest, the back darkest. */
const FACE = 1.15
const SIDE = 0.85
const BACK = 0.7

/** The kickers on the ground: packed dirt like the track, each a wedge of four flat faces. */
export class KickerView {
  private readonly mesh: THREE.Mesh

  constructor(scene: THREE.Scene, anisotropy: number) {
    const material = new THREE.MeshStandardMaterial({ map: packedDirt(anisotropy), roughness: 1, flatShading: true, vertexColors: true })
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
  }

  /**
   * Builds `kickers` in place of the last ones. Flat on flat ground for now:
   * on a ground that dips or curves, the faces would need cutting finer to
   * follow it (their height already adds on top of it).
   */
  build(kickers: Kickers): void {
    const { height, width } = kickers.shape
    const { face, back, side } = kickers
    const half = width / 2
    const wide = half + side
    const positions: number[] = []
    const uvs: number[] = []
    const colors: number[] = []
    for (const k of kickers.list) {
      // a corner, `along` metres from the lip the way you ride and `across` to the left
      const corner = (along: number, across: number, up: number) => ({
        x: k.x + k.dx * along + k.dz * across,
        y: up + LIFT,
        z: k.z + k.dz * along - k.dx * across,
        u: (across + wide) / TILE,
        v: along / TILE,
      })
      const lipLeft = corner(0, half, height)
      const lipRight = corner(0, -half, height)
      const frontLeft = corner(-face, wide, 0)
      const frontRight = corner(-face, -wide, 0)
      const backLeft = corner(back, wide, 0)
      const backRight = corner(back, -wide, 0)
      // each side shaded its own, so the shape reads from the saddle (the sun lights them all much the same)
      const triangles = [
        [FACE, lipLeft, lipRight, frontRight], [FACE, lipLeft, frontRight, frontLeft],
        [BACK, lipLeft, backLeft, backRight], [BACK, lipLeft, backRight, lipRight],
        [SIDE, lipLeft, frontLeft, backLeft],
        [SIDE, lipRight, backRight, frontRight],
      ] as const
      for (const [shade, a, ...rest] of triangles) {
        let [b, c] = rest
        // every face slopes up, so wind each one to face up
        if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b]
        for (const p of [a, b, c]) {
          positions.push(p.x, p.y, p.z)
          uvs.push(p.u, p.v)
          colors.push(shade, shade, shade)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }
}
