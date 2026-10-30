/** Shared setup for the headless physics tests. */
import { config } from '../src/config'
import { Bike } from '../src/physics/bike'
import { CrashWatcher } from '../src/physics/crashes'
import { PhysicsWorld } from '../src/physics/world'
import { createHeightfield, sampleCoord, type Heightfield } from '../src/terrain/heightfield'

export const DT = 1 / 120
export const DEG = Math.PI / 180

/** 200 m of ground shaped by a height formula, samples 2 m apart. */
export function ground(height: (x: number, z: number) => number, size = 200): Heightfield {
  const field = createHeightfield(size, 2)
  const n = field.samples
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      field.heights[iz * n + ix] = height(sampleCoord(field, ix), sampleCoord(field, iz))
    }
  }
  return field
}

export const flat = (size = 200) => ground(() => 0, size)
/** Downhill toward +x at 10 degrees. */
export const slope = () => ground((x) => -x * Math.tan(10 * DEG))

/** A hill like a big kicker, riding along +x: up 15 degrees for 30 m to a crest 8 m up, then a 30 degree drop. Its sides slope away gently. */
export const kicker = (z0 = 0) =>
  (x: number, z: number) => {
    const across = Math.max(0, 1 - Math.max(0, Math.abs(z - z0) - 20) / 40) // full 40 m wide, gone 40 m further out
    let h = 0
    if (x > 0 && x <= 30) h = x * Math.tan(15 * DEG)
    else if (x > 30) h = Math.max(0, 30 * Math.tan(15 * DEG) - (x - 30) * Math.tan(30 * DEG))
    return h * across
  }

/**
 * A physics world with one bike. `run(seconds, each)` steps it like the game
 * does; `each` runs before every step, e.g. to work the controls.
 */
export function setup(field: Heightfield) {
  const physics = new PhysicsWorld()
  physics.setGround(field)
  const bike = new Bike(physics, structuredClone(config.bike), structuredClone(config.advanced.bikeBody))
  const run = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      each?.()
      bike.update(DT)
      physics.step(DT, 9.81)
      bike.record()
    }
  }
  return { physics, bike, run }
}

/** The same, plus crash detection, stepped after the world like the game does. */
export function setupWithCrashes(field: Heightfield) {
  const physics = new PhysicsWorld()
  physics.setGround(field)
  const bike = new Bike(physics, structuredClone(config.bike), structuredClone(config.advanced.bikeBody))
  const crashes = new CrashWatcher(physics, bike, structuredClone(config.crashes), structuredClone(config.advanced.fallingOver), structuredClone(config.jumps.landing))
  const run = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      each?.()
      bike.update(DT)
      physics.step(DT, 9.81)
      bike.record()
      crashes.step(DT)
    }
  }
  return { physics, bike, crashes, run }
}

/** Rolls the bike sideways by `degrees` (positive = right side down) around its forward axis. */
export function tilt(bike: Bike, degrees: number) {
  const r = bike.body.rotation()
  const half = (-degrees * DEG) / 2
  // roll about the body's own forward axis (-z) = q * rotation about z
  const [qx, qy, qz, qw] = [r.x, r.y, r.z, r.w]
  const [sx, sw] = [Math.sin(half), Math.cos(half)]
  bike.body.setRotation(
    { x: qx * sw + qy * sx, y: qy * sw - qx * sx, z: qz * sw + qw * sx, w: qw * sw - qz * sx },
    true,
  )
}
