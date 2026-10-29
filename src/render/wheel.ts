import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * A dirt bike wheel, built 1 across its radius (scale it by the wheel's
 * radius): a thin knobby tyre on a rim, spokes laced from the rim to the hub,
 * a brake disc, and on the rear wheel a sprocket. It spins about its x axis,
 * and you can see through it between the spokes.
 */

/** How tall the tyre's knobs stand, and how deep the tyre is from the tread down to the rim, as shares of the radius. */
const KNOB_HEIGHT = 0.06
const TYRE_DEPTH = 0.22
const KNOBS = 30
const RIM_RADIUS = 0.74
const HUB_RADIUS = 0.11
const SPOKES = 20
/** How far apart the two rows of spoke ends sit across the hub, and how much the spokes cross over each other. */
const HUB_FLANGE = 0.09
const SPOKE_CROSS = 0.3

export interface WheelMaterials {
  tyre: THREE.Material
  rim: THREE.Material
  spokes: THREE.Material
  metal: THREE.Material
  trim: THREE.Material
}

export function buildWheel(materials: WheelMaterials, rear: boolean): THREE.Group {
  const wheel = new THREE.Group()
  const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    wheel.add(mesh)
  }
  // Ring shapes are built around z, then turned so the wheel's axle is x.
  const aroundAxle = (geometry: THREE.BufferGeometry) => geometry.rotateY(Math.PI / 2)

  // The tyre: a round-sectioned rubber ring, with knobs standing up on the
  // tread out to the full radius (where it touches the ground), alternating
  // one in the middle with a pair at the edges.
  const outer = 1 - KNOB_HEIGHT
  part('tyre', aroundAxle(new THREE.TorusGeometry(outer - TYRE_DEPTH / 2, TYRE_DEPTH / 2, 8, 36)), materials.tyre)
  const knobs: THREE.BufferGeometry[] = []
  for (let k = 0; k < KNOBS; k++) {
    const angle = (k / KNOBS) * Math.PI * 2
    const knob = (x: number, width: number) =>
      new THREE.BoxGeometry(width, KNOB_HEIGHT + 0.03, 0.08).translate(x, 1 - (KNOB_HEIGHT + 0.03) / 2, 0).rotateX(angle)
    if (k % 2 === 0) knobs.push(knob(0, 0.15))
    else knobs.push(knob(-0.085, 0.07), knob(0.085, 0.07))
  }
  part('knobs', mergeGeometries(knobs), materials.tyre)

  part('rim', aroundAxle(new THREE.TorusGeometry(RIM_RADIUS, 0.03, 6, 36)), materials.rim)
  part('hub', new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS, 0.26, 12).rotateZ(Math.PI / 2), materials.metal)

  // Spokes laced from both sides of the hub out to the rim, crossing over.
  const spokes: THREE.BufferGeometry[] = []
  const toward = new THREE.Vector3(0, 0, 1)
  for (let s = 0; s < SPOKES; s++) {
    const side = s % 2 === 0 ? -1 : 1
    const angle = (s / SPOKES) * Math.PI * 2
    const atHub = angle + side * SPOKE_CROSS
    const from = new THREE.Vector3(side * HUB_FLANGE, Math.sin(atHub) * HUB_RADIUS, Math.cos(atHub) * HUB_RADIUS)
    const to = new THREE.Vector3(side * 0.02, Math.sin(angle) * (RIM_RADIUS - 0.02), Math.cos(angle) * (RIM_RADIUS - 0.02))
    const along = to.clone().sub(from)
    const placed = new THREE.Matrix4().compose(
      from.clone().add(to).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(toward, along.clone().normalize()),
      new THREE.Vector3(1, 1, 1),
    )
    spokes.push(new THREE.BoxGeometry(0.022, 0.022, along.length()).applyMatrix4(placed))
  }
  part('spokes', mergeGeometries(spokes), materials.spokes)

  // A brake disc on the left; on the rear wheel, the chain's sprocket on the right.
  part('brake disc', new THREE.CylinderGeometry(0.34, 0.34, 0.015, 24).rotateZ(Math.PI / 2).translate(-0.14, 0, 0), materials.metal)
  if (rear) part('sprocket', new THREE.CylinderGeometry(0.4, 0.4, 0.015, 24).rotateZ(Math.PI / 2).translate(0.14, 0, 0), materials.trim)
  return wheel
}
