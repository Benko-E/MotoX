import RAPIER from '@dimforge/rapier3d-compat'
import type { PlacedRamp } from '../terrain/generate'
import type { Heightfield } from '../terrain/heightfield'
import { buildRampMesh } from '../terrain/ramps'

/** Friction of the ground and ramps, for anything that slides on them (not the tyres). */
const GROUND_FRICTION = 0.8

/** Loads the physics engine. Must finish before anything else in this folder is used. */
export async function initPhysics(): Promise<void> {
  await RAPIER.init()
}

/** The physics world: the ground and ramps as solid shapes, plus whatever moves on them. */
export class PhysicsWorld {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  private ground: RAPIER.Collider[] = []

  /** Replaces the ground and ramps, e.g. after the map changed. */
  setGround(field: Heightfield, ramps: PlacedRamp[]): void {
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
    ).setFriction(GROUND_FRICTION)
    this.ground = [this.world.createCollider(terrain)]

    for (const ramp of ramps) {
      const { positions, indices } = buildRampMesh(ramp.def, ramp.baseY)
      const shape = RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      this.ground.push(this.world.createCollider(shape.setFriction(GROUND_FRICTION)))
    }

    // New shapes only become findable (for wheel casts and groundHeightAt)
    // after a step. A step of zero time does that without moving anything.
    const dt = this.world.timestep
    this.world.timestep = 0
    this.world.step()
    this.world.timestep = dt
  }

  /** Height of whatever solid is below (x, z), ignoring `exclude`. Null if nothing. */
  groundHeightAt(x: number, z: number, exclude?: RAPIER.RigidBody): number | null {
    const top = 10_000
    const ray = new RAPIER.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 })
    const hit = this.world.castRay(ray, 2 * top, true, undefined, undefined, undefined, exclude)
    return hit ? top - hit.timeOfImpact : null
  }

  /** Advances everything by `dt` seconds. */
  step(dt: number, gravity: number): void {
    this.world.timestep = dt
    this.world.gravity = { x: 0, y: -gravity, z: 0 }
    this.world.step()
  }
}
