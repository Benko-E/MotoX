import * as THREE from 'three'

/**
 * A soft dark patch on the ground right under each tyre, where the sun's
 * shadow is too coarse to show a thin tyre touching down. It's what makes the
 * bike sit on the ground instead of hovering. It fades as the tyre lifts off.
 */

/** Gone by the time the tyre is this high off the ground, metres. */
const FADE_HEIGHT = 2
/** Size of the patch: across the tyre, and along it, metres. */
const WIDTH = 0.4
const LENGTH = 0.9
/** Lifted this far off the ground so it doesn't flicker into it, metres. */
const LIFT = 0.02

/** How dark the patch is with the tyre `height` metres off the ground, at `darkness` when touching. */
export function shadowOpacity(height: number, darkness: number): number {
  const t = Math.min(Math.max(1 - height / FADE_HEIGHT, 0), 1)
  return darkness * t * t
}

export class TyreShadows {
  readonly group = new THREE.Group()
  private readonly patches: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]
  private readonly basis = new THREE.Matrix4()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly back = new THREE.Vector3()

  constructor(wheels = 2) {
    const texture = softSpot(64)
    const shape = new THREE.PlaneGeometry(WIDTH, LENGTH).rotateX(-Math.PI / 2) // lying flat, long side along -z
    this.patches = Array.from({ length: wheels }, () => {
      const patch = new THREE.Mesh(
        shape,
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          map: texture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -4,
        }),
      )
      patch.renderOrder = 2
      this.group.add(patch)
      return patch
    })
  }

  /**
   * Lays tyre `i`'s patch on the ground at `ground`, facing up along `normal`,
   * its long side along `pointing`, with the tyre `height` metres above it.
   */
  place(i: number, ground: THREE.Vector3, normal: THREE.Vector3, pointing: THREE.Vector3, height: number, darkness: number): void {
    const patch = this.patches[i]
    const opacity = shadowOpacity(height, darkness)
    patch.visible = opacity > 0.005
    if (!patch.visible) return
    patch.material.opacity = opacity
    this.forward.copy(pointing).addScaledVector(normal, -pointing.dot(normal)).normalize()
    this.right.crossVectors(this.forward, normal)
    this.back.copy(this.forward).negate()
    patch.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right, normal, this.back))
    patch.position.copy(ground).addScaledVector(normal, LIFT)
  }
}

/** A black spot that's solid in the middle and fades softly to nothing at the edge. */
function softSpot(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const t = Math.max(1 - Math.hypot(dx, dy) * 2, 0)
      data[(y * size + x) * 4 + 3] = Math.round(255 * t * t)
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.needsUpdate = true
  return texture
}
