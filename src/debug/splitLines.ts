import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { Track } from '../track/track'

const LINE_WIDTH = 5
/** How far above the ground they're drawn: over the track's strip and the jump marks. */
const ABOVE = 0.06
/** The start line, the first split. */
const START_COLOR = 0x2ee66b

/** Debug: a line across the track at each split, edge to edge, the start line green. */
export class SplitLines {
  private readonly group = new THREE.Group()

  constructor(
    scene: THREE.Scene,
    private readonly color: number,
  ) {
    scene.add(this.group)
  }

  set visible(on: boolean) {
    this.group.visible = on
  }

  /** Draws `splits` (samples of `track`, the start line first) in place of the last ones. */
  build(track: Track, splits: readonly number[]): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof Line2) {
        child.geometry.dispose()
        child.material.dispose()
      }
    }
    const half = track.shape.width / 2
    splits.forEach((at, k) => {
      const s = track.samples[at]
      // across the track: the way it runs, turned a quarter
      const points = [s.x + s.tz * half, ABOVE, s.z - s.tx * half, s.x - s.tz * half, ABOVE, s.z + s.tx * half]
      const material = new LineMaterial({ color: k === 0 ? START_COLOR : this.color, linewidth: LINE_WIDTH, depthTest: false })
      const line = new Line2(new LineGeometry().setPositions(points), material)
      line.renderOrder = 999
      this.group.add(line)
    })
  }
}
