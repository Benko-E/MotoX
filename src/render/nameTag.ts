import * as THREE from 'three'

/** How tall the name is drawn, metres, and how far above the head it floats. */
const HEIGHT = 0.45
const ABOVE_HEAD = 0.65
/** The canvas the name is written on, pixels. */
const CANVAS = { width: 512, height: 128 }

/** An AI rider's name: from the list, else "Rider 2" and so on. */
export function riderName(i: number, names: readonly string[]): string {
  return names[i] || `Rider ${i + 1}`
}

/**
 * A rider's name floating above their head: white text with a dark outline,
 * always facing the camera. Only drawn: no collision.
 */
export class NameTag {
  readonly sprite: THREE.Sprite

  constructor(scene: THREE.Scene, name: string) {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS.width
    canvas.height = CANVAS.height
    const g = canvas.getContext('2d')!
    g.font = `bold ${CANVAS.height * 0.62}px "Trebuchet MS", Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = CANVAS.height * 0.1
    g.strokeStyle = 'rgba(0, 0, 0, 0.75)'
    g.strokeText(name, CANVAS.width / 2, CANVAS.height / 2)
    g.fillStyle = '#ffffff'
    g.fillText(name, CANVAS.width / 2, CANVAS.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }))
    this.sprite.scale.set((HEIGHT * CANVAS.width) / CANVAS.height, HEIGHT, 1)
    this.sprite.renderOrder = 5
    scene.add(this.sprite)
  }

  /** Call once a frame with where the rider's head is drawn. */
  update(head: THREE.Vector3): void {
    this.sprite.position.set(head.x, head.y + ABOVE_HEAD, head.z)
  }
}
