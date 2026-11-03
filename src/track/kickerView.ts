import * as THREE from 'three'
import type { Kickers } from './kickers'
import { packedDirt, TILE } from './trackView'

/** How far above the ground they're drawn, so their bottom edges don't flicker into the track's strip. */
const LIFT = 0.01
/** Metres between the grid's points along a kicker. */
const STEP = 0.5
/** How light each side is drawn: the face lightest, the back darkest. */
const FACE = 1.15
const SIDE = 0.85
const BACK = 0.7

/** The kickers on the ground: packed dirt like the track, each a wedge: a face, a back and two steep sides. */
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
   * Builds `kickers` on the ground `baseAt` gives, in place of the last ones.
   * Each is cut into a fine grid of little faces, lifted off the ground
   * there by the kicker's height, so it sits on slopes and tilts as well.
   */
  build(kickers: Kickers, baseAt: (x: number, z: number) => number): void {
    const { face, back, side, lip } = kickers
    const wide = lip + side
    // along, from the face's foot to the back's: every half metre, and right at the lip
    const along = steps(-face, 0, STEP).concat(steps(0, back, STEP).slice(1))
    // across: the sides' feet, the lip's ends, and every metre between
    const across = [-wide, -wide + side / 2, ...steps(-lip, lip, 1), wide - side / 2, wide]
    const positions: number[] = []
    const uvs: number[] = []
    const colors: number[] = []
    for (const k of kickers.list) {
      // a point `a` metres from the lip the way you ride and `c` to the left
      const point = (a: number, c: number) => {
        const x = k.x + k.dx * a + k.dz * c
        const z = k.z + k.dz * a - k.dx * c
        return { x, y: baseAt(x, z) + kickers.heightAt(x, z) + LIFT, z, u: (c + wide) / TILE, v: a / TILE }
      }
      const grid = along.map((a) => across.map((c) => point(a, c)))
      for (let i = 0; i + 1 < along.length; i++) {
        for (let j = 0; j + 1 < across.length; j++) {
          const [p, q, r, t] = [grid[i][j], grid[i][j + 1], grid[i + 1][j], grid[i + 1][j + 1]]
          // shaded by which part it's on, so the shape reads from the saddle
          const mid = (along[i] + along[i + 1]) / 2
          const out = Math.abs((across[j] + across[j + 1]) / 2) > lip
          const shade = out ? SIDE : mid < 0 ? FACE : BACK
          for (let [a, b, c] of [[p, q, r], [q, t, r]]) {
            // every face slopes up, so wind each one to face up
            if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b]
            for (const v of [a, b, c]) {
              positions.push(v.x, v.y, v.z)
              uvs.push(v.u, v.v)
              colors.push(shade, shade, shade)
            }
          }
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

/** From `from` to `to` in steps of about `step`, both ends included. */
function steps(from: number, to: number, step: number): number[] {
  const count = Math.max(1, Math.ceil((to - from) / step))
  return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count)
}
