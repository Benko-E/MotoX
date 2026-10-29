import * as THREE from 'three'

/** Grips at the ends of the handlebar, in the handlebar's own space. */
export const GRIPS = [new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.3, 0, 0)]
/** Footpegs, in the bike's space. */
const PEGS = [new THREE.Vector3(-0.17, -0.1, 0.05), new THREE.Vector3(0.17, -0.1, 0.05)]
/** Where the rider's hips are, in the bike's space: sitting on the seat, and standing on the pegs. */
const SEAT = new THREE.Vector3(0, 0.36, 0.16)
const STAND = new THREE.Vector3(0, 0.58, 0.24)
/** A foot put out in a turn: out to the side, forward and down toward the ground (right foot; the left is mirrored). */
const FOOT_OUT = new THREE.Vector3(0.38, -0.25, -0.36)
const TORSO_LENGTH = 0.55
const SHOULDER_WIDTH = 0.36
const HIP_WIDTH = 0.24
/** How far forward the torso tips, degrees: sitting, and more standing (over the bars). */
const SITTING_CROUCH = 25
const STANDING_CROUCH = 45
/** Soaking up a landing all the way: how far the hips drop, metres, and the torso tips further, degrees. */
const SOAK_DROP = 0.24
const SOAK_TIP = 12
/** How much the shoulders twist along with the bars, as a share of the bars' angle. */
const TWIST = 0.5
/** As far as the torso may tip further forward to keep hold of the bars, degrees. */
const REACH_TIP = 45
/** Lengths of the rider's limbs, metres. */
export const THIGH = 0.42
export const SHIN = 0.44
export const UPPER_ARM = 0.38
export const FOREARM = 0.38
const DEG = Math.PI / 180

/** What the rider's body is doing (see RiderMotion), plus the lean input and suspension. */
export interface RiderShape {
  /** -1 (leaning back) to 1 (forward). */
  lean: number
  /** 0 to 1, how far the suspension is pushed in. */
  squash: number
  /** 0 sitting to 1 standing on the pegs. */
  standing: number
  /** 0 to 1, crouched soaking up a landing. */
  absorb: number
  /** -1 left foot out to 1 right foot out. */
  legOut: number
  /** How far the bars are turned, degrees (positive = right). */
  bars: number
}

/** Where every joint of the rider is, in the bike's space. Left side first. */
export interface RiderPose {
  hips: THREE.Vector3
  /** How far the torso tips forward, and twists with the bars (positive = left shoulder back), radians. */
  torsoTip: number
  twist: number
  neck: THREE.Vector3
  head: THREE.Vector3
  shoulders: THREE.Vector3[]
  elbows: THREE.Vector3[]
  hands: THREE.Vector3[]
  hipJoints: THREE.Vector3[]
  knees: THREE.Vector3[]
  feet: THREE.Vector3[]
}

/**
 * Works out the rider's pose from what his body is doing, with his hands on
 * `grips` (in the bike's space, so they follow the steering). Arms and legs
 * keep their length and bend at the elbows and knees.
 */
export function riderPose(shape: RiderShape, grips: THREE.Vector3[]): RiderPose {
  const { lean, squash, absorb, legOut } = shape
  // with a foot out he sits down for the turn
  const standing = shape.standing * (1 - Math.abs(legOut))
  const hips = SEAT.clone().lerp(STAND, standing)
  hips.z += lean < 0 ? -lean * 0.16 : -lean * 0.14 // sit back, or slide forward
  hips.y -= squash * 0.12 + absorb * SOAK_DROP
  const crouch = (SITTING_CROUCH + (STANDING_CROUCH - SITTING_CROUCH) * standing + lean * 25 + absorb * SOAK_TIP) * DEG
  // the shoulders twist with the bars: turning right, the left one comes forward
  const twist = -TWIST * shape.bars * DEG

  /** The torso tipped forward by `tip`: which way is up along it, the neck and the shoulders. */
  const torso = (tip: number) => {
    const up = new THREE.Vector3(-Math.sin(tip) * Math.sin(twist), Math.cos(tip), -Math.sin(tip) * Math.cos(twist))
    const across = new THREE.Vector3(Math.cos(twist), 0, -Math.sin(twist)).multiplyScalar(SHOULDER_WIDTH / 2)
    const neck = hips.clone().addScaledVector(up, TORSO_LENGTH)
    const shoulders = [-1, 1].map((sign) => neck.clone().addScaledVector(across, sign).addScaledVector(up, -0.05))
    return { up, neck, shoulders }
  }
  // tipping further forward only as far as it takes for both hands to keep hold
  let torsoTip = crouch
  let shape_ = torso(torsoTip)
  for (let extra = 2.5; extra <= REACH_TIP && shape_.shoulders.some((s, i) => s.distanceTo(grips[i]) > UPPER_ARM + FOREARM); extra += 2.5) {
    torsoTip = crouch + extra * DEG
    shape_ = torso(torsoTip)
  }
  const { up, neck } = shape_
  const head = neck.clone().addScaledVector(up, 0.15)

  const pose: RiderPose = { hips, torsoTip, twist, neck, head, shoulders: [], elbows: [], hands: [], hipJoints: [], knees: [], feet: [] }
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? -1 : 1
    const shoulder = shape_.shoulders[side]
    const hand = grips[side].clone()
    // elbows out to the side and a little up, motocross style
    pose.shoulders.push(shoulder)
    pose.elbows.push(bend(shoulder, hand, UPPER_ARM, FOREARM, new THREE.Vector3(sign, 0.3, 0.2)))
    pose.hands.push(hand)

    const hip = hips.clone().add(new THREE.Vector3((sign * HIP_WIDTH) / 2, 0, 0))
    const out = Math.max(legOut * sign, 0) // this side's foot out
    const foot = PEGS[side].clone().lerp(new THREE.Vector3(sign * FOOT_OUT.x, FOOT_OUT.y, FOOT_OUT.z), out)
    // knees forward and a little out
    pose.hipJoints.push(hip)
    pose.knees.push(bend(hip, foot, THIGH, SHIN, new THREE.Vector3(sign * 0.3, 0.2, -1)))
    pose.feet.push(foot)
  }
  return pose
}

/**
 * The middle joint of a two-part limb from `root` toward `end`, the parts
 * `first` and `second` long, bending toward `toward`. Out of reach, the limb
 * goes straight and both parts share the stretch.
 */
function bend(root: THREE.Vector3, end: THREE.Vector3, first: number, second: number, toward: THREE.Vector3): THREE.Vector3 {
  const along = end.clone().sub(root)
  const distance = along.length()
  if (distance >= first + second) return root.clone().addScaledVector(along, first / (first + second))
  const reach = Math.max(distance, Math.abs(first - second) + 1e-4)
  along.normalize()
  const a = (first * first - second * second + reach * reach) / (2 * reach)
  const h = Math.sqrt(Math.max(first * first - a * a, 0))
  const sideways = toward.clone().addScaledVector(along, -toward.dot(along)).normalize()
  return root.clone().addScaledVector(along, a).addScaledVector(sideways, h)
}

/**
 * A placeholder rider made of boxes, on the bike. He leans forward and back
 * with the lean keys, stands on the pegs at speed and in the air, crouches to
 * soak up landings, and puts the inside foot out in tight turns and
 * powerslides (RiderMotion decides all that). His hands stay on the grips,
 * so the arms follow the bars.
 */
export class RiderView {
  private readonly torso: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly upperArms: THREE.Mesh[]
  private readonly forearms: THREE.Mesh[]
  private readonly thighs: THREE.Mesh[]
  private readonly shins: THREE.Mesh[]
  private readonly grips = [new THREE.Vector3(), new THREE.Vector3()]

  constructor(
    private readonly bike: THREE.Object3D,
    private readonly bars: THREE.Object3D,
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

    this.upperArms = [0, 1].map(() => this.limb(0.09, jersey))
    this.forearms = [0, 1].map(() => this.limb(0.08, jersey))
    this.thighs = [0, 1].map(() => this.limb(0.13, pants))
    this.shins = [0, 1].map(() => this.limb(0.11, pants))
  }

  /** Puts the rider in shape: the lean input, suspension squash and bars (degrees), plus what his body is doing. */
  update(lean: number, squash: number, bars: number, motion: Pick<RiderShape, 'standing' | 'absorb' | 'legOut'>): void {
    for (let side = 0; side < 2; side++) {
      this.bike.worldToLocal(this.bars.localToWorld(this.grips[side].copy(GRIPS[side])))
    }
    const pose = riderPose({ lean, squash, bars, ...motion }, this.grips)
    this.torso.position.copy(pose.hips)
    this.torso.rotation.set(-pose.torsoTip, pose.twist, 0, 'YXZ')
    this.head.position.copy(pose.head)
    this.head.rotation.set(-pose.torsoTip * 0.5, pose.twist * 0.5, 0, 'YXZ') // keeps looking ahead
    for (let side = 0; side < 2; side++) {
      this.place(this.upperArms[side], pose.shoulders[side], pose.elbows[side])
      this.place(this.forearms[side], pose.elbows[side], pose.hands[side])
      this.place(this.thighs[side], pose.hipJoints[side], pose.knees[side])
      this.place(this.shins[side], pose.knees[side], pose.feet[side])
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
