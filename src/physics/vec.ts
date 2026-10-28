/** Small helpers for the plain {x, y, z} vectors and {x, y, z, w} rotations Rapier uses. */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s)
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z)
  return length > 1e-9 ? scale(a, 1 / length) : vec(0, 0, 0)
}

/** `v` rotated by `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const axis = vec(q.x, q.y, q.z)
  const t = scale(cross(axis, v), 2)
  return add(add(v, scale(t, q.w)), cross(axis, t))
}

/** `v` turned `angle` radians about the unit-length `axis` (right-hand rule). */
export function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return add(add(scale(v, cos), scale(cross(axis, v), sin)), scale(axis, dot(axis, v) * (1 - cos)))
}

/** A rotation of `angle` radians about the vertical axis. */
export function yawRotation(angle: number): Quat {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }
}
