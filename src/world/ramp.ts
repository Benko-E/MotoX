import * as THREE from 'three'

/** The ramp's shape, as set in the debug menu's Temporary tab. */
export interface RampShape {
  /** How steep the run-up rises, degrees. */
  angle: number
  /** How high the top is, metres. */
  height: number
  /** How wide it is, side to side, metres. */
  width: number
  /** How much flat top there is after the lip, before the back side drops, metres. */
  top: number
  /** How steep the back side drops, degrees. */
  landing: number
  /** How far ahead of the start the run-up begins, metres. */
  distance: number
}

const DEG = Math.PI / 180

/**
 * A test ramp straight ahead of the start (toward -z): a run-up rising at
 * `angle`, a flat top, and a back side dropping at `landing`. Temporary: it's
 * here to find out how leaving the ground and landing feel.
 */
export class Ramp {
  readonly mesh: THREE.Mesh
  private shape: RampShape
  /** The run-up's, top's and back side's lengths along the ground, metres. */
  private up = 0
  private down = 0

  constructor(scene: THREE.Scene, shape: RampShape, material: THREE.Material) {
    this.shape = shape
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh)
    this.build(shape)
  }

  /** Reshapes the ramp, unless nothing changed. */
  build(shape: RampShape): void {
    const same = this.mesh.geometry.attributes.position && JSON.stringify(shape) === JSON.stringify(this.shape)
    this.shape = shape
    if (same) return
    this.up = shape.height / Math.tan(shape.angle * DEG)
    this.down = shape.height / Math.tan(shape.landing * DEG)

    // The side view, along the ground (x) and up (y), extruded across its width.
    const outline = new THREE.Shape()
    outline.moveTo(0, 0)
    outline.lineTo(this.up, shape.height)
    outline.lineTo(this.up + shape.top, shape.height)
    outline.lineTo(this.up + shape.top + this.down, 0)
    outline.closePath()
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: shape.width, bevelEnabled: false })
    // Along the ground toward -z, centred across x, starting `distance` ahead.
    geometry.translate(0, 0, -shape.width / 2)
    geometry.rotateY(Math.PI / 2)
    geometry.translate(0, 0, -shape.distance)
    // Dirt on every face, a tile every 4 m.
    const uv = geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4)
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }

  /** The height of the ground at (x, z): the ramp's top surface, or 0 off it. */
  heightAt(x: number, z: number): number {
    const { width, height, top, distance } = this.shape
    if (Math.abs(x) > width / 2) return 0
    const along = -z - distance
    if (along <= 0) return 0
    if (along < this.up) return (along / this.up) * height
    if (along < this.up + top) return height
    const back = along - this.up - top
    return back < this.down ? height * (1 - back / this.down) : 0
  }
}
