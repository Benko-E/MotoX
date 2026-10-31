import type { LetterSettings } from '../config'
import type { Point } from './jumps'
import { pointAlong, type LetterSpot } from './letterSpots'

/** Moving further than this between two frames is the bike being put somewhere else, not riding: nothing in between is grabbed, metres. */
const PUT_BACK = 10

/**
 * Which letters you've grabbed. A letter is grabbed when the middle of the
 * bike comes within its grab size, checked along the whole way the bike went
 * since the last frame, so a fast bike can't slip through a small one between
 * frames. Any order. With respawn on, a letter comes back a while after it
 * was grabbed.
 */
export class LetterHunt {
  /** Which letters you have, by their place in settings.each. */
  readonly grabbed: boolean[]
  /** Seconds since each was grabbed. */
  private readonly grabbedFor: number[]
  private last: Point | null = null

  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: LetterSettings,
  ) {
    this.grabbed = settings.each.map(() => false)
    this.grabbedFor = settings.each.map(() => 0)
  }

  /** The letters were placed again: nothing grabbed. */
  reset(): void {
    this.grabbed.fill(false)
    this.grabbedFor.fill(0)
    this.last = null
  }

  /** Call once a frame with where the middle of the bike is now. */
  update(spots: readonly LetterSpot[], bike: Point, dt: number): void {
    const { settings } = this
    const from = this.last && distance(this.last, bike) <= PUT_BACK ? this.last : bike
    this.last = { ...bike }
    for (const spot of spots) {
      const i = spot.letter
      if (this.grabbed[i]) {
        this.grabbedFor[i] += dt
        if (settings.respawn && this.grabbedFor[i] >= settings.respawnAfter) this.grabbed[i] = false
        continue
      }
      const letter = pointAlong(spot.flight, settings.each[i].along)
      if (distanceToSegment(letter, from, bike) <= settings.each[i].grabSize) {
        this.grabbed[i] = true
        this.grabbedFor[i] = 0
      }
    }
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** How close `p` comes to the straight line from `a` to `b`. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const length2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z
  const t = length2 > 0 ? Math.min(Math.max(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / length2, 0), 1) : 0
  return distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t })
}
