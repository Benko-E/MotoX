import * as THREE from 'three'
import type { JumpSpot } from '../track/jumpSpots'
import type { Track } from '../track/track'

/** Each part of a jump's footprint, in the order you ride it, and its colour. */
const PARTS: { part: 'runUp' | 'face' | 'flight' | 'rollOut'; color: number }[] = [
  { part: 'runUp', color: 0xffd23a },
  { part: 'face', color: 0xff7a1a },
  { part: 'flight', color: 0xff2a2a },
  { part: 'rollOut', color: 0x3aa8ff },
]
/** How far above the ground they're drawn: over the track's strip. */
const LIFT = 0.03
/** How much of the track's width they cover. */
const COVER = 0.8
const KMH = 3.6

/**
 * Debug: every spot on the track a jump fits, painted on it part by part
 * (run-up yellow, face orange, flight red, roll-out blue), with a label at
 * the lip: how fast you'd get there, how long you'd fly and how far.
 */
export class JumpMarks {
  private readonly group = new THREE.Group()

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
  }

  set visible(on: boolean) {
    this.group.visible = on
  }

  /** Paints `spots` on `track`, in place of the last ones. */
  build(track: Track, spots: JumpSpot[]): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
        child.geometry.dispose()
        child.material.map?.dispose()
        child.material.dispose()
      }
    }
    const step = track.length / track.samples.length
    const half = (track.shape.width * COVER) / 2
    for (const spot of spots) {
      let along = 0
      for (const { part, color } of PARTS) {
        const from = spot.from + Math.round(along / step)
        along += spot[part]
        const to = spot.from + Math.round(along / step)
        const strip = ribbon(track, from, to, half)
        if (!strip) continue
        const mesh = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }))
        mesh.renderOrder = 998
        this.group.add(mesh)
      }
      // the label floats over the lip
      const lip = track.samples[(spot.from + Math.round((spot.runUp + spot.face) / step)) % track.samples.length]
      const label = makeLabel(`${Math.round(spot.arrive * KMH)} km/h · ${spot.airtime.toFixed(1)} s · ${Math.round(spot.flight)} m`)
      label.position.set(lip.x, 3, lip.z)
      this.group.add(label)
    }
  }
}

/** A flat strip `half` metres either side of the track's middle, from sample `from` to `to` (may run past the lap's end). */
function ribbon(track: Track, from: number, to: number, half: number): THREE.BufferGeometry | null {
  if (to <= from) return null
  const n = track.samples.length
  const positions: number[] = []
  const index: number[] = []
  for (let i = from; i <= to; i++) {
    const s = track.samples[i % n]
    positions.push(s.x + s.tz * half, LIFT, s.z - s.tx * half, s.x - s.tz * half, LIFT, s.z + s.tx * half)
    if (i > from) {
      const a = (i - from - 1) * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}

/** A text label that always faces the camera and stays the same size on screen. */
function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 48
  const paint = canvas.getContext('2d')!
  paint.fillStyle = 'rgba(0, 0, 0, 0.6)'
  paint.beginPath()
  paint.roundRect(0, 0, 320, 48, 10)
  paint.fill()
  paint.fillStyle = '#fff'
  paint.font = 'bold 24px system-ui, sans-serif'
  paint.textAlign = 'center'
  paint.textBaseline = 'middle'
  paint.fillText(text, 160, 25)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false, transparent: true }))
  sprite.scale.set(0.2, 0.03, 1)
  sprite.renderOrder = 1000
  return sprite
}
