import * as THREE from 'three'
import { TERRAIN_HALF } from '../world/terrain'
import type { Track } from './track'

/** Metres of packed dirt per repeat of its texture. */
export const TILE = 4
/** How many pixels the map of where the track is has across: 4096 over the 1024 m grid is 4 to the metre. */
const MASK_SIZE = 4096
/** How soft the track's edge is, metres: it fades from packed to loose dirt over about this. */
const EDGE = 0.5

/**
 * The track on the ground: no strip of its own, but painted onto the
 * ground's material, the way prototype 1 did it. A big black picture of the
 * whole grid has the track drawn on it in white, as wide as the track; the
 * ground's shader looks up each spot in it and turns packed dirt there,
 * fading to loose dirt at the edges. It's the same surface as the hills, so
 * nothing can poke through it.
 */
export class TrackView {
  private readonly canvas = document.createElement('canvas')
  private readonly mask: THREE.CanvasTexture

  /** Paints the track onto `ground` (the terrain's material, a MeshStandardMaterial with a map). */
  constructor(ground: THREE.MeshStandardMaterial, anisotropy: number) {
    this.canvas.width = this.canvas.height = MASK_SIZE
    this.mask = new THREE.CanvasTexture(this.canvas)
    // row 0 of the canvas is the grid's far edge (-z): no flipping
    this.mask.flipY = false
    this.mask.colorSpace = THREE.NoColorSpace
    this.mask.wrapS = this.mask.wrapT = THREE.ClampToEdgeWrapping
    this.mask.generateMipmaps = true
    this.mask.minFilter = THREE.LinearMipmapLinearFilter
    this.mask.anisotropy = anisotropy
    const dirt = packedDirt(anisotropy, false)
    ground.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        trackMask: { value: this.mask },
        trackDirt: { value: dirt },
        trackHalf: { value: TERRAIN_HALF },
        trackTile: { value: TILE },
      })
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vGroundXZ;\nuniform sampler2D trackMask;\nuniform sampler2D trackDirt;\nuniform float trackHalf;\nuniform float trackTile;',
        )
        .replace(
          '#include <map_fragment>',
          [
            '#include <map_fragment>',
            'float onTrack = texture2D(trackMask, vGroundXZ / (2.0 * trackHalf) + 0.5).r;',
            'vec3 packed = texture2D(trackDirt, vGroundXZ / trackTile).rgb * diffuse;',
            'diffuseColor.rgb = mix(diffuseColor.rgb, packed, onTrack);',
          ].join('\n'),
        )
    }
  }

  /** Paints `track` on, in place of the last one. */
  build(track: Track): void {
    const paint = this.canvas.getContext('2d')!
    const scale = MASK_SIZE / (TERRAIN_HALF * 2)
    const px = (x: number) => (x + TERRAIN_HALF) * scale
    paint.fillStyle = '#000'
    paint.fillRect(0, 0, MASK_SIZE, MASK_SIZE)
    paint.beginPath()
    track.samples.forEach((s, i) => (i === 0 ? paint.moveTo(px(s.x), px(s.z)) : paint.lineTo(px(s.x), px(s.z))))
    paint.closePath()
    paint.strokeStyle = '#fff'
    paint.lineJoin = paint.lineCap = 'round'
    paint.filter = `blur(${(EDGE * scale) / 2}px)`
    paint.lineWidth = track.shape.width * scale
    paint.stroke()
    paint.filter = 'none'
    this.mask.needsUpdate = true
  }
}

/** A tile of packed dirt: darker and smoother than the loose dirt around it, with streaks along the way you ride if `streaks`. */
export function packedDirt(anisotropy: number, streaks = true): THREE.CanvasTexture {
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
  for (let i = 0; streaks && i < 40; i++) {
    paint.fillStyle = Math.random() < 0.5 ? 'rgba(45,28,12,0.12)' : 'rgba(170,130,85,0.08)'
    paint.fillRect(Math.random() * 256, 0, 1 + Math.random() * 4, 256)
  }
  const texture = new THREE.CanvasTexture(tile)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}
