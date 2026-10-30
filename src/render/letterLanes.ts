import * as THREE from 'three'
import type { LetterSettings } from '../config'
import type { LetterSpot } from '../world/letterSpots'
import { arrowTexture, fadeMarker, laneMarker, laneShape, ringShape, type Marker } from './jumpLanes'

/** The letters' gold, so a letter's lane can't be mistaken for the jump guide's pink ones. */
const GOLD = 0xffc21a

/**
 * Gold lanes up the run-ups of the letters' jumps, drawn like the jump
 * guide's lanes, with a ring where the ghost landed. Unlike those they show
 * wherever you are, for every letter with `showRunUp` on, until you grab it.
 */
export class LetterLanes {
  private readonly group = new THREE.Group()
  private readonly arrows = arrowTexture()
  private readonly lanes = new Map<number, Marker>()
  private readonly rings = new Map<number, Marker>()

  constructor(
    scene: THREE.Scene,
    private readonly groundAt: (x: number, z: number) => number,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: LetterSettings,
  ) {
    scene.add(this.group)
  }

  /** A new set of letter spots. */
  show(spots: readonly LetterSpot[]): void {
    for (const marker of [...this.lanes.values(), ...this.rings.values()]) {
      marker.geometry.dispose()
      marker.material.dispose()
    }
    this.group.clear()
    this.lanes.clear()
    this.rings.clear()
    for (const spot of spots) {
      this.lanes.set(spot.letter, laneMarker(this.group, laneShape(spot.jump.runUp, this.groundAt), GOLD, this.arrows))
      this.rings.set(spot.letter, laneMarker(this.group, ringShape(spot.flight.at(-1)!, this.groundAt), GOLD, null))
    }
  }

  /** Call once a frame with which letters you have (by place in settings.each). */
  update(grabbed: readonly boolean[], dt: number): void {
    for (const [letter, lane] of this.lanes) {
      const on = this.settings.show && this.settings.each[letter].showRunUp && !grabbed[letter]
      fadeMarker(lane, this.rings.get(letter)!, on, dt)
    }
  }

  /** The lane and the landing ring drawn for letter number `i`, if it has a spot. */
  lane(i: number): Marker | undefined {
    return this.lanes.get(i)
  }

  ring(i: number): Marker | undefined {
    return this.rings.get(i)
  }
}
