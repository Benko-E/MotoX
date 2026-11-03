import type { Track } from './track'

/**
 * Splits the lap into `count` stretches of about the same length, from the
 * start line round to it again, and gives back where each split is (a
 * sample's index), the start line first. A split near one of the `good`
 * spots (samples, like the middle of a jump's roll-out: flat, straight and
 * clear) moves onto it, if it's within `pull` (0 to 1) of half a stretch.
 * Each good spot takes one split at most, closest first. With no good
 * spots, or none near enough, the splits stay evenly spaced.
 */
export function placeSplits(track: Track, count: number, good: readonly number[], pull: number): number[] {
  const { samples } = track
  const n = samples.length
  const start = track.startAt()
  // how far round the lap, metres, each sample is from the start line
  const along: number[] = new Array(n)
  for (let k = 0, i = start, d = 0; k < n; k++) {
    along[i] = d
    const next = (i + 1) % n
    d += Math.hypot(samples[next].x - samples[i].x, samples[next].z - samples[i].z)
    i = next
  }
  const stretch = track.length / Math.max(1, count)
  // reaching under half a stretch, a split can't pass the one either side
  const reach = Math.min(Math.max(pull, 0), 1) * stretch * 0.45
  const even = Array.from({ length: Math.max(0, count - 1) }, (_, k) => (k + 1) * stretch)
  const splits = even.map((d) => sampleAt(along, d))
  // every split and good spot near enough to it, closest pairs first
  const pairs = even
    .flatMap((d, split) => good.map((spot) => ({ split, spot, off: Math.abs(along[spot] - d) })))
    .filter(({ off }) => off <= reach)
    .sort((a, b) => a.off - b.off)
  const moved = new Set<number>()
  const used = new Set<number>()
  for (const { split, spot } of pairs) {
    if (moved.has(split) || used.has(spot)) continue
    splits[split] = spot
    moved.add(split)
    used.add(spot)
  }
  return [start, ...splits]
}

/** The sample `d` metres round from the start line. */
function sampleAt(along: number[], d: number): number {
  let best = 0
  along.forEach((a, i) => {
    if (Math.abs(a - d) < Math.abs(along[best] - d)) best = i
  })
  return best
}
