import * as THREE from 'three'
import type { LetterSettings } from '../config'
import { pointAlong, type LetterSpot } from '../world/letterSpots'

/** How tall a letter is, metres. */
export const LETTER_HEIGHT = 2.5
/** How fast the letters turn, degrees a second. */
const SPIN = 60
/** How thick a letter is, compared to its height. */
const THICKNESS = 0.22
const GOLD = 0xffc21a
/** A little glow of their own, so they still read as gold in a hill's shadow. */
const GLOW = 0x6b4a00

/**
 * The letters floating over their jumps: bold gold block letters, slowly
 * spinning, with no collision (the bike flies straight through). Each one sits
 * on the path the ghost flew, `along` the way, read live from the settings so
 * the slider moves it straight away.
 */
export class LetterView {
  private readonly group = new THREE.Group()
  private readonly material = new THREE.MeshStandardMaterial({
    color: GOLD,
    metalness: 0.4,
    roughness: 0.35,
    emissive: GLOW,
  })
  private readonly shapes = new Map<string, THREE.BufferGeometry>()
  private readonly meshes = new Map<number, THREE.Mesh>()
  private spots: readonly LetterSpot[] = []

  constructor(
    scene: THREE.Scene,
    /** Read live, so the tuning panel applies at once. */
    readonly settings: LetterSettings,
  ) {
    scene.add(this.group)
  }

  /** A new set of letter spots (the map or the letters' settings changed). */
  show(spots: readonly LetterSpot[]): void {
    this.group.clear()
    this.meshes.clear()
    this.spots = spots
    for (const spot of spots) {
      const mesh = new THREE.Mesh(this.geometryFor(this.settings.each[spot.letter].letter), this.material)
      mesh.castShadow = true
      mesh.rotation.y = spot.letter * 1.3 // not all facing the same way
      this.group.add(mesh)
      this.meshes.set(spot.letter, mesh)
    }
  }

  /** Call once a frame. */
  update(dt: number): void {
    for (const spot of this.spots) {
      const mesh = this.meshes.get(spot.letter)!
      const at = pointAlong(spot.flight, this.settings.each[spot.letter].along)
      mesh.position.set(at.x, at.y, at.z)
      mesh.rotation.y += SPIN * (Math.PI / 180) * dt
      mesh.visible = this.settings.show
    }
  }

  /** The letter drawn for letter number `i` (its place in settings.each), if it has a spot. */
  letter(i: number): THREE.Mesh | undefined {
    return this.meshes.get(i)
  }

  /** One solid letter per character, LETTER_HEIGHT tall, centred on its middle, shared by every letter that uses it. */
  private geometryFor(char: string): THREE.BufferGeometry {
    let geometry = this.shapes.get(char)
    if (!geometry) {
      geometry = new THREE.ExtrudeGeometry(letterShape(char), {
        depth: THICKNESS,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
      })
      geometry.computeBoundingBox()
      const tall = geometry.boundingBox!.max.y - geometry.boundingBox!.min.y
      geometry.scale(LETTER_HEIGHT / tall, LETTER_HEIGHT / tall, LETTER_HEIGHT / tall)
      geometry.center()
      this.shapes.set(char, geometry)
    }
    return geometry
  }
}

/** The outline of a bold block letter, standing on y = 0 and 1 tall. M, O, T and X; anything else is a plain block. */
export function letterShape(char: string): THREE.Shape {
  const outline = (points: number[][]) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))
  switch (char.toUpperCase()) {
    case 'M':
      return outline([[0, 0], [0.2, 0], [0.2, 0.6], [0.425, 0.28], [0.65, 0.6], [0.65, 0], [0.85, 0], [0.85, 1], [0.65, 1], [0.425, 0.62], [0.2, 1], [0, 1]])
    case 'T':
      return outline([[0, 1], [0.8, 1], [0.8, 0.8], [0.5, 0.8], [0.5, 0], [0.3, 0], [0.3, 0.8], [0, 0.8]])
    case 'X':
      return outline([[0, 0], [0.22, 0], [0.4, 0.32], [0.58, 0], [0.8, 0], [0.52, 0.5], [0.8, 1], [0.58, 1], [0.4, 0.68], [0.22, 1], [0, 1], [0.28, 0.5]])
    case 'O': {
      const ring = new THREE.Shape()
      ring.absellipse(0.4, 0.5, 0.4, 0.5, 0, Math.PI * 2, false, 0)
      const hole = new THREE.Path()
      hole.absellipse(0.4, 0.5, 0.2, 0.3, 0, Math.PI * 2, true, 0)
      ring.holes.push(hole)
      return ring
    }
    default:
      return outline([[0, 0], [0.8, 0], [0.8, 1], [0, 1]])
  }
}
