import RAPIER from '@dimforge/rapier3d-compat'
import type { Heightfield } from '../terrain/heightfield'

/**
 * Who touches whom, as Rapier collision groups (which groups a shape is in,
 * in the top 16 bits, and which it touches, in the bottom 16). Bikes touch
 * the ground but pass through each other, and anything looking for the
 * ground (a wheel, the rider's head) only ever finds the ground.
 */
const GROUND = 0x0001
const BIKES = 0x0002
export const GROUND_GROUPS = (GROUND << 16) | 0xffff
export const BIKE_GROUPS = (BIKES << 16) | GROUND
/** For a search that should only find the ground. */
export const FIND_GROUND = (0xffff << 16) | GROUND

/** Friction of the ground, for anything that slides on it (not the tyres). */
const GROUND_FRICTION = 0.8

/** Loads the physics engine. Must finish before anything else in this folder is used. */
export async function initPhysics(): Promise<void> {
  await RAPIER.init()
}

/** The physics world: the ground as a solid shape, plus whatever moves on it. */
export class PhysicsWorld {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  /** Gravity used in the latest step, m/s². */
  gravity = 9.81
  private ground: RAPIER.Collider[] = []

  /** Replaces the ground, e.g. after the map changed. */
  setGround(field: Heightfield): void {
    for (const collider of this.ground) this.world.removeCollider(collider, false)

    // Rapier wants the heights column by column; ours are stored row by row.
    const n = field.samples
    const columns = new Float32Array(n * n)
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) columns[iz + ix * n] = field.heights[iz * n + ix]
    }
    const terrain = RAPIER.ColliderDesc.heightfield(
      n - 1,
      n - 1,
      columns,
      { x: field.size, y: 1, z: field.size },
      RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES,
    ).setFriction(GROUND_FRICTION).setCollisionGroups(GROUND_GROUPS)
    this.ground = [this.world.createCollider(terrain)]

    // New shapes only become findable (for wheel casts and groundHeightAt)
    // after a step. A step of zero time does that without moving anything.
    const dt = this.world.timestep
    this.world.timestep = 0
    this.world.step()
    this.world.timestep = dt
  }

  /** Height of whatever solid is below (x, z), ignoring `exclude`. Null if nothing. */
  groundHeightAt(x: number, z: number, exclude?: RAPIER.RigidBody): number | null {
    // A tiny falling ball rather than a ray: a ray exactly on a line between
    // two of the ground's triangles can slip through without hitting either.
    const top = 10_000
    const radius = 0.01
    const hit = this.world.castShape(
      { x, y: top, z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(radius),
      0, 2 * top, true, undefined, FIND_GROUND, undefined, exclude,
    )
    return hit ? top - hit.time_of_impact - radius : null
  }

  /** Advances everything by `dt` seconds. */
  step(dt: number, gravity: number): void {
    this.world.timestep = dt
    this.gravity = gravity
    this.world.gravity = { x: 0, y: -gravity, z: 0 }
    this.world.step()
  }
}
