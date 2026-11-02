import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { Lip, Ramp } from '../world/ramp'

/** The arcs drawn off each lip: at top speed, and this much slower each, km/h. */
const SLOWER_BY = [0, 10, 20]
/** How bright each arc is drawn, fastest first. */
const OPACITY = [1, 0.7, 0.45]
const LINE_WIDTH = 4
/** Seconds per step working out the flight, and the longest flight worked out. */
const STEP = 1 / 240
const LONGEST = 8
const G = 9.81
const DEG = Math.PI / 180

/**
 * Debug: where the bike would fly off each of the ramp's lips, riding
 * straight up its middle at top speed and a little slower, each arc labelled
 * with its speed and airtime. Worked out the same way the ride flies, so the
 * bike should follow them (it leaves the lip a touch lower than drawn).
 */
export class RampArcs {
  private readonly group = new THREE.Group()

  constructor(
    scene: THREE.Scene,
    private readonly color: number,
  ) {
    this.group.visible = false
    scene.add(this.group)
  }

  set visible(on: boolean) {
    this.group.visible = on
  }

  /** Works the arcs out again, for the ramp's shape and the bike's top speed (km/h). */
  build(ramp: Ramp, topSpeed: number): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof Line2) {
        child.geometry.dispose()
        child.material.dispose()
      }
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose()
        child.material.dispose()
      }
    }
    for (const lip of ramp.lips()) {
      SLOWER_BY.forEach((slower, i) => {
        const speed = topSpeed - slower
        if (speed <= 0) return
        const { points, airtime } = flight(lip, speed / 3.6, ramp)
        const geometry = new LineGeometry().setPositions(points.flatMap((p) => [p.x, p.y, p.z]))
        const material = new LineMaterial({
          color: this.color,
          linewidth: LINE_WIDTH,
          transparent: true,
          opacity: OPACITY[i],
          depthTest: false,
        })
        const line = new Line2(geometry, material)
        line.renderOrder = 999
        this.group.add(line)
        const label = makeLabel(`${speed} km/h · ${airtime.toFixed(2)} s`, OPACITY[i])
        label.position.copy(points[points.length - 1]).add(new THREE.Vector3(0, 0.6, 0))
        this.group.add(label)
      })
    }
  }
}

/** The bike's flight off `lip` at `speed` m/s up the ramp's middle: launched along the slope, pulled down until it meets the ground. */
function flight(lip: Lip, speed: number, ramp: Ramp): { points: THREE.Vector3[]; airtime: number } {
  let z = lip.z
  let y = lip.height
  const along = speed * Math.cos(lip.angle * DEG)
  let vy = speed * Math.sin(lip.angle * DEG)
  const points = [new THREE.Vector3(0, y, z)]
  let t = 0
  while (t < LONGEST) {
    vy -= G * STEP
    z += lip.direction * along * STEP
    y += vy * STEP
    t += STEP
    const ground = ramp.heightAt(0, z)
    if (y <= ground) {
      points.push(new THREE.Vector3(0, ground, z))
      break
    }
    if (Math.round(t / STEP) % 6 === 0) points.push(new THREE.Vector3(0, y, z))
  }
  return { points, airtime: t }
}

/** A text label that always faces the camera and stays the same size on screen. */
function makeLabel(text: string, opacity: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 48
  const paint = canvas.getContext('2d')!
  paint.fillStyle = 'rgba(0, 0, 0, 0.55)'
  paint.beginPath()
  paint.roundRect(0, 0, 256, 48, 10)
  paint.fill()
  paint.fillStyle = '#fff'
  paint.font = 'bold 24px system-ui, sans-serif'
  paint.textAlign = 'center'
  paint.textBaseline = 'middle'
  paint.fillText(text, 128, 25)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false, transparent: true, opacity }),
  )
  sprite.scale.set(0.16, 0.03, 1)
  sprite.renderOrder = 1000
  return sprite
}
