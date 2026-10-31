import * as THREE from 'three'

/**
 * Drawing for the debug views: lines laid on the ground (ribbons), rings,
 * arrows, posts, flight arcs and text labels that float over them. All only
 * drawn: no collision.
 */

export type Path = readonly { x: number; z: number }[]
export type GroundAt = (x: number, z: number) => number

/** Lifted this far off the ground so they don't flicker into it, metres. */
const LIFT = 0.08
/** A line on the ground is this wide, metres. */
export const LINE_WIDTH = 0.35
/** A label's line of text is this share of the distance to the camera tall, so it stays the same size on screen near or far. */
const LABEL_SHARE = 0.022
/** Closer than this the label stops shrinking, metres. */
const LABEL_NEAREST = 1
/** Labels float this high over what they label, metres. */
export const LABEL_LIFT = 2.5
/** The canvas a label is written on: pixels per line of text. */
const LABEL_PIXELS = 64

/** A flat strip `width` wide along `path`, lying on the ground. */
export function ribbon(path: Path, groundAt: GroundAt, width = LINE_WIDTH): THREE.BufferGeometry {
  const positions: number[] = []
  path.forEach((point, i) => {
    const before = path[Math.max(i - 1, 0)]
    const after = path[Math.min(i + 1, path.length - 1)]
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1
    const ax = ((after.z - before.z) / length) * (width / 2)
    const az = (-(after.x - before.x) / length) * (width / 2)
    for (const side of [-1, 1]) {
      const x = point.x + ax * side
      const z = point.z + az * side
      positions.push(x, groundAt(x, z) + LIFT, z)
    }
  })
  const index: number[] = []
  for (let i = 0; i < path.length - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  return geometry
}

/** A closed loop of points round (`x`, `z`), `radius` out (or `radiusAt(angle)`), starting north and going clockwise. */
export function circle(x: number, z: number, radius: number | ((angle: number) => number), points = 256): Path {
  const at = typeof radius === 'number' ? () => radius : radius
  const path = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2
    const r = at(angle)
    return { x: x + Math.sin(angle) * r, z: z - Math.cos(angle) * r }
  })
  return [...path, path[0]]
}

/** Points from `a` to `b` about `step` metres apart, both ends included. */
export function straightPath(a: { x: number; z: number }, b: { x: number; z: number }, step = 1): Path {
  const steps = Math.max(Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step), 1)
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps }))
}

/** The loop moved `by` metres to its right (negative: left) all the way round, closed. */
export function offset(line: Path, by: number): Path {
  const n = line.length
  const moved = line.map((p, k) => {
    const before = line[(k - 1 + n) % n]
    const after = line[(k + 1) % n]
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1
    // right of the way the line runs: its direction turned a quarter clockwise
    return { x: p.x - ((after.z - before.z) / length) * by, z: p.z + ((after.x - before.x) / length) * by }
  })
  return [...moved, moved[0]]
}

/** A loop's points from `from` to `to`, the short way round. */
export function between(line: Path, from: number, to: number): Path {
  const n = line.length
  const step = (to - from + n) % n <= n / 2 ? 1 : -1
  const path = [line[from]]
  for (let k = from; k !== to; ) {
    k = (k + step + n) % n
    path.push(line[k])
  }
  return path
}

/** A flat arrow lying on the ground at `at`, pointing toward `toward`: its tip is the first corner, `size` metres long. */
export function arrow(at: { x: number; z: number }, toward: { x: number; z: number }, groundAt: GroundAt, size = 2.4): THREE.BufferGeometry {
  const length = Math.hypot(toward.x - at.x, toward.z - at.z) || 1
  const fx = (toward.x - at.x) / length
  const fz = (toward.z - at.z) / length
  const corners = [
    { x: at.x + fx * size * 0.5, z: at.z + fz * size * 0.5 }, // tip
    { x: at.x - fx * size * 0.5 - fz * size * 0.35, z: at.z - fz * size * 0.5 + fx * size * 0.35 },
    { x: at.x - fx * size * 0.5 + fz * size * 0.35, z: at.z - fz * size * 0.5 - fx * size * 0.35 },
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((p) => [p.x, groundAt(p.x, p.z) + LIFT * 2, p.z]), 3))
  geometry.setIndex([0, 1, 2])
  return geometry
}

/** A post standing on the ground at (`x`, `z`), `height` tall. */
export function post(x: number, z: number, height: number, groundAt: GroundAt, width = 0.3): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, Math.max(height, 0.05), width)
  geometry.translate(x, groundAt(x, z) + Math.max(height, 0.05) / 2, z)
  return geometry
}

/** A tube through the air along `points`. */
export function arc(points: readonly { x: number; y: number; z: number }[], radius = 0.12): THREE.BufferGeometry {
  if (points.length < 2) return new THREE.BufferGeometry()
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, p.z)))
  return new THREE.TubeGeometry(curve, Math.max(points.length * 2, 8), radius, 6, false)
}

/** A flat ring lying on the ground round (`x`, `z`). */
export function groundRing(x: number, z: number, radius: number, groundAt: GroundAt, width = LINE_WIDTH * 1.5): THREE.BufferGeometry {
  return ribbon(circle(x, z, radius, 48), groundAt, width)
}

export function debugMaterial(color: number): THREE.MeshBasicMaterial {
  // drawn through the fog, so they stay clear from high up
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })
}

/** A mesh for a debug view, named, drawn over the ground. */
export function debugMesh(name: string, geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, debugMaterial(color))
  mesh.name = name
  mesh.renderOrder = 4
  return mesh
}

/** Empties a group of debug meshes and labels, freeing what they drew with. */
export function clearGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
      child.geometry.dispose()
      const material = child.material as THREE.Material & { map?: THREE.Texture | null }
      material.map?.dispose()
      material.dispose()
    }
  })
  group.clear()
}

/**
 * A label: lines of text (`\n` between them) floating at `at`, always facing
 * the camera, white on a dark backing with a stripe of `color` down its left
 * (the colour of the line it labels). Its text is kept on it as `userData.text`.
 */
export function label(text: string, at: { x: number; y: number; z: number }, color = 0xffffff): THREE.Sprite {
  const lines = text.split('\n')
  const material = new THREE.SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true, fog: false })
  let aspect = 4
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const g = canvas.getContext('2d')!
    const font = `bold ${LABEL_PIXELS * 0.62}px "Trebuchet MS", Arial, sans-serif`
    g.font = font
    const pad = LABEL_PIXELS * 0.3
    const stripe = LABEL_PIXELS * 0.12
    canvas.width = Math.ceil(Math.max(...lines.map((line) => g.measureText(line).width)) + pad * 2 + stripe)
    canvas.height = lines.length * LABEL_PIXELS
    g.fillStyle = 'rgba(15, 18, 24, 0.72)'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    g.fillRect(0, 0, stripe, canvas.height)
    g.font = font
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    lines.forEach((line, i) => g.fillText(line, stripe + pad, (i + 0.5) * LABEL_PIXELS))
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    material.map = texture
    aspect = canvas.width / LABEL_PIXELS
  }
  const sprite = new THREE.Sprite(material)
  sprite.name = `label: ${lines[0]}`
  sprite.userData = { text, lines: lines.length, aspect }
  sprite.renderOrder = 6
  sprite.position.set(at.x, at.y, at.z)
  sizeLabel(sprite, 50)
  return sprite
}

/** Sizes a label for a camera `distance` away: a steady share of the distance, so it's the same size on screen. */
function sizeLabel(sprite: THREE.Sprite, distance: number): void {
  const line = Math.max(distance, LABEL_NEAREST) * LABEL_SHARE
  const { lines, aspect } = sprite.userData as { lines: number; aspect: number }
  sprite.scale.set(line * aspect, line * lines, 1)
  // hang the label above its spot, not centred on it
  sprite.center.set(0.5, 0)
}

/** Sizes every label in `group` for a camera at `camera`. */
export function sizeLabels(group: THREE.Object3D, camera: THREE.Vector3): void {
  group.traverse((child) => {
    if (child instanceof THREE.Sprite && child.userData.text !== undefined) sizeLabel(child, child.position.distanceTo(camera))
  })
}

/** The labels in a group, with their text. */
export function labelsIn(group: THREE.Object3D): { text: string; sprite: THREE.Sprite }[] {
  const found: { text: string; sprite: THREE.Sprite }[] = []
  group.traverse((child) => {
    if (child instanceof THREE.Sprite && typeof child.userData.text === 'string') found.push({ text: child.userData.text, sprite: child })
  })
  return found
}

/**
 * A debug view drawn in parts, each its own group in the scene with its own
 * checkbox in `settings` (and `show` over them all). Its labels go in a part
 * named 'labels'.
 */
export class DebugView<Part extends string> {
  private readonly parts = new Map<Part, THREE.Group>()

  constructor(
    scene: THREE.Scene,
    names: readonly Part[],
    protected readonly groundAt: GroundAt,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: { show: boolean } & Record<Part, boolean>,
  ) {
    for (const name of names) {
      const group = new THREE.Group()
      group.name = name
      group.visible = false
      scene.add(group)
      this.parts.set(name, group)
    }
  }

  /** One part's drawing. */
  part(name: Part): THREE.Group {
    return this.parts.get(name)!
  }

  /** Empties every part, ready to draw afresh. */
  protected clear(): void {
    for (const group of this.parts.values()) clearGroup(group)
  }

  /** Adds a named mesh to a part. */
  protected add(part: Part, name: string, geometry: THREE.BufferGeometry, color: number): void {
    this.part(part).add(debugMesh(name, geometry, color))
  }

  /** Adds a label `above` the ground at `at`. */
  protected say(text: string, at: { x: number; z: number }, color: number, above = LABEL_LIFT): void {
    this.part('labels' as Part).add(label(text, { x: at.x, y: this.groundAt(at.x, at.z) + above, z: at.z }, color))
  }

  /** Call once a frame (or after a setting changes): shows the parts switched on, and sizes the labels for a camera at `camera`. */
  update(camera?: THREE.Vector3): void {
    const { settings } = this
    for (const [name, group] of this.parts) group.visible = settings.show && settings[name]
    if (camera) sizeLabels(this.part('labels' as Part), camera)
  }
}

/** A number for a label: whole, or to one decimal place when it has one. */
export function num(value: number): string {
  return Number.isInteger(Math.round(value * 10) / 10) ? Math.round(value).toString() : value.toFixed(1)
}
