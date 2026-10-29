/**
 * Where HUD elements go on the screen. Each sits at one of 9 anchors, nudged
 * in from there by x and y. Nudges and sizes are measured in shares of the
 * screen's height, so the HUD looks the same at any resolution, and a wider
 * screen just has more room in the middle.
 */

/** The 9 spots an element can sit at. */
export const ANCHORS = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'] as const
export type Anchor = (typeof ANCHORS)[number]

export interface Placement {
  anchor: Anchor
  /** Nudges, in % of the screen height: in from the edge it sits at (right and down when centred). */
  x: number
  y: number
}

export interface Screen {
  width: number
  height: number
}

/**
 * Where an element goes, in pixels from the top-left of the screen, and
 * which point of the element sits there (0 its left or top edge, 0.5 its
 * middle, 1 its right or bottom edge).
 */
export interface Place {
  x: number
  y: number
  alignX: number
  alignY: number
}

/** 1 HUD unit: 1% of the screen height, times hud.size. Sizes inside elements are in these. */
export function hudUnit(screen: Screen, size: number): number {
  return (screen.height / 100) * size
}

export function placeElement(placement: Placement, screen: Screen, size: number): Place {
  const unit = hudUnit(screen, size)
  const { anchor } = placement
  const across = anchor.endsWith('Left') || anchor === 'left' ? 0 : anchor.endsWith('Right') || anchor === 'right' ? 1 : 0.5
  const down = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5
  // nudged inward from an edge, or right and down from the middle
  const inX = across === 1 ? -1 : 1
  const inY = down === 1 ? -1 : 1
  return {
    x: round(across * screen.width + inX * placement.x * unit),
    y: round(down * screen.height + inY * placement.y * unit),
    alignX: across,
    alignY: down,
  }
}

/** Rounds away floating-point dust (1887.6000000000001), not to whole pixels. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
