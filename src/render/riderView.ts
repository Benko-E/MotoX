import * as THREE from 'three'

/** Grips at the ends of the handlebar, in the front end's own space. */
const GRIPS = [new THREE.Vector3(-0.3, 0.42, 0.1), new THREE.Vector3(0.3, 0.42, 0.1)]
/** Footpegs, in the bike's space. */
const PEGS = [new THREE.Vector3(-0.17, -0.1, 0.05), new THREE.Vector3(0.17, -0.1, 0.05)]
/** Where the rider sits, in the bike's space, when not leaning. */
const SEAT = new THREE.Vector3(0, 0.36, 0.16)
const TORSO_LENGTH = 0.55
const SHOULDER_WIDTH = 0.36

/**
 * A placeholder rider made of boxes, sitting on the bike. Leaning forward
 * slides the hips forward and tips the torso over the handlebar; leaning back
 * sits back and straightens up. The hips drop a little as the suspension
 * squashes, so landings show in the body too. Arms always reach the grips,
 * so they follow the steering.
 */
export class RiderView {
  private readonly torso: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly arms: THREE.Mesh[]
  private readonly thighs: THREE.Mesh[]
  private readonly shins: THREE.Mesh[]
  private readonly scratch = new THREE.Vector3()

  constructor(
    private readonly bike: THREE.Object3D,
    private readonly frontEnd: THREE.Object3D,
  ) {
    const jersey = new THREE.MeshStandardMaterial({ color: 0x2b6fd8, roughness: 0.7 })
    const pants = new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 0.8 })
    const helmet = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 })
    const visor = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })

    // The torso box hangs up from its bottom edge, so rotating it tips it about the hips.
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, TORSO_LENGTH, 0.22).translate(0, TORSO_LENGTH / 2, 0), jersey)
    this.torso.castShadow = true
    bike.add(this.torso)

    const helmetShell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), helmet)
    const helmetVisor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06), visor)
    helmetVisor.position.set(0, 0.01, -0.12)
    helmetShell.castShadow = true
    this.head.add(helmetShell, helmetVisor)
    bike.add(this.head)

    this.arms = [0, 1].map(() => this.limb(0.09, jersey))
    this.thighs = [0, 1].map(() => this.limb(0.13, pants))
    this.shins = [0, 1].map(() => this.limb(0.11, pants))
  }

  /** `lean` -1 (back) to 1 (forward); `squash` 0 to 1, how far the suspension is pushed in. */
  update(lean: number, squash: number): void {
    const hips = SEAT.clone()
    hips.z += lean < 0 ? -lean * 0.16 : -lean * 0.14 // sit back, or slide forward
    hips.y -= squash * 0.12
    this.torso.position.copy(hips)
    this.torso.rotation.x = -(25 + lean * 25) * (Math.PI / 180) // riding crouch, more over the bars leaning forward

    const up = new THREE.Vector3(0, 1, 0).applyEuler(this.torso.rotation)
    const neck = hips.clone().addScaledVector(up, TORSO_LENGTH)
    this.head.position.copy(neck).addScaledVector(up, 0.15)
    this.head.rotation.x = this.torso.rotation.x * 0.5 // keeps looking ahead

    const across = new THREE.Vector3(1, 0, 0)
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1
      const shoulder = neck.clone().addScaledVector(across, (sign * SHOULDER_WIDTH) / 2).addScaledVector(up, -0.05)
      const grip = this.bike.worldToLocal(this.frontEnd.localToWorld(this.scratch.copy(GRIPS[side])))
      this.place(this.arms[side], shoulder, grip)

      const hip = hips.clone().addScaledVector(across, sign * 0.12)
      const peg = PEGS[side]
      // knee up and forward, between the hip and the peg
      const knee = hip.clone().lerp(peg, 0.5).add(new THREE.Vector3(sign * 0.04, 0.12, -0.18))
      this.place(this.thighs[side], hip, knee)
      this.place(this.shins[side], knee, peg)
    }
  }

  /** A box limb `thickness` across, stretched between two points by `place`. */
  private limb(thickness: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, 1), material)
    mesh.castShadow = true
    this.bike.add(mesh)
    return mesh
  }

  /** Stretches a limb from `a` to `b`. */
  private place(limb: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const along = b.clone().sub(a)
    limb.position.copy(a).add(b).multiplyScalar(0.5)
    limb.scale.z = Math.max(along.length(), 0.01)
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along.normalize())
  }
}
