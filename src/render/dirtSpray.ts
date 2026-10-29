import * as THREE from 'three'
import type { EffectSettings } from '../config'

/**
 * Clods of dirt thrown up where a tyre slides, skids or spins: little lumps
 * that fly, fall, land and shrink away. Only looks.
 */

/** Most clods in the air at once. */
const MAX_CLODS = 400
/** How long a clod lasts, seconds (each gets a random time between these). */
const SHORTEST = 0.6
const LONGEST = 1.2
/** How much of the bike's own speed a clod keeps when it's thrown. */
const CARRIED = 0.4
const COLOR = 0x4a3220

export interface Clod {
  position: THREE.Vector3
  velocity: THREE.Vector3
  /** Seconds since it was thrown, and how long it lasts. */
  age: number
  life: number
  size: number
  /** Landed: it sits where it fell until it's gone. */
  landed: boolean
  spin: THREE.Euler
}

export class DirtSpray {
  readonly mesh: THREE.InstancedMesh
  /** Clods in the air or lying on the ground right now. */
  readonly clods: Clod[] = []
  /** Clods thrown so far. */
  thrown = 0
  private owed = 0
  private readonly matrix = new THREE.Matrix4()
  private readonly rotation = new THREE.Quaternion()
  private readonly scale = new THREE.Vector3()

  constructor(
    /** Read live, so the tuning panel applies at once. */
    readonly settings: EffectSettings['dirt'],
    /** The ground height under a point, metres. */
    private readonly groundAt: (x: number, z: number) => number,
    /** How hard things fall right now, m/s². */
    private readonly gravity: () => number,
    private readonly random: () => number = Math.random,
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: COLOR }),
      MAX_CLODS,
    )
    this.mesh.count = 0
    this.mesh.frustumCulled = false
  }

  /**
   * Throws dirt from `at` for one frame of `dt` seconds: `amount` (0 to 1) of
   * the flat-out rate, mostly along `direction` (unit length), on top of a
   * share of `carried` (the bike's own velocity).
   */
  throwFrom(at: THREE.Vector3, direction: THREE.Vector3, carried: THREE.Vector3, amount: number, dt: number): void {
    if (!this.settings.enabled || amount <= 0) return
    this.owed += amount * this.settings.amount * dt
    const strength = this.settings.throw * Math.sqrt(amount)
    while (this.owed >= 1) {
      this.owed -= 1
      if (this.clods.length >= MAX_CLODS) this.clods.shift() // the oldest makes way
      const r = this.random
      const velocity = carried
        .clone()
        .multiplyScalar(CARRIED)
        .addScaledVector(direction, strength * (0.5 + 0.5 * r()))
        .add(new THREE.Vector3((r() - 0.5) * 0.6, 0.4 + 0.5 * r(), (r() - 0.5) * 0.6).multiplyScalar(strength))
      this.clods.push({
        position: at.clone().add(new THREE.Vector3((r() - 0.5) * 0.15, 0.03, (r() - 0.5) * 0.15)),
        velocity,
        age: 0,
        life: SHORTEST + (LONGEST - SHORTEST) * r(),
        size: this.settings.size * (0.6 + 0.7 * r()),
        landed: false,
        spin: new THREE.Euler(r() * 6, r() * 6, r() * 6),
      })
      this.thrown++
    }
  }

  /** Moves every clod on by `dt` seconds and draws them; call once a frame. */
  update(dt: number): void {
    const g = this.gravity()
    for (const clod of this.clods) {
      clod.age += dt
      if (clod.landed) continue
      clod.velocity.y -= g * dt
      clod.position.addScaledVector(clod.velocity, dt)
      clod.spin.x += dt * 8
      const ground = this.groundAt(clod.position.x, clod.position.z)
      if (clod.position.y < ground) {
        clod.position.y = ground
        clod.landed = true
      }
    }
    for (let i = this.clods.length - 1; i >= 0; i--) {
      if (this.clods[i].age >= this.clods[i].life) this.clods.splice(i, 1)
    }

    this.clods.forEach((clod, i) => {
      // shrinks away toward the end of its life
      const left = 1 - (clod.age / clod.life) ** 3
      this.scale.setScalar(clod.size * left)
      this.matrix.compose(clod.position, this.rotation.setFromEuler(clod.spin), this.scale)
      this.mesh.setMatrixAt(i, this.matrix)
    })
    this.mesh.count = this.clods.length
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
