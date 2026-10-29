import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { BikeView } from '../src/render/bikeView'
import { FACTORY } from '../src/render/livery'
import { DEG, flat, setup } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

/** A bike and its drawing; `model` is what's drawn, after the lean. */
function drawn() {
  const { bike, run } = setup(flat(600))
  const scene = new THREE.Scene()
  const view = new BikeView(scene, bike)
  const model = scene.children[0].children[0].children[0] // root -> lean pivot -> model
  return { bike, run, view, model, scene }
}

/** Draws the bike leaning `degrees`, and reads off the drawing. */
function drawLeaning(bike: Bike, view: BikeView, model: THREE.Object3D, degrees: number) {
  bike.lean = degrees * DEG
  view.update(1, 1 / 60)
  model.updateMatrixWorld(true)
  const right = new THREE.Vector3(1, 0, 0).transformDirection(model.matrixWorld)
  const heading = bike.heading * DEG
  const level = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading))
  const rearDrop = bike.wheels[1].extension + bike.radius(1)
  const rearContact = new THREE.Vector3(0, -rearDrop, bike.stats.build.wheelbase / 2).applyMatrix4(model.matrixWorld)
  return {
    /** How far the drawn bike is turned off its heading, degrees. */
    twist: Math.asin(right.dot(level)) / DEG,
    /** How far it's drawn tipped over, degrees (positive = right side down). */
    tipped: -Math.asin(right.y) / DEG,
    rearContact,
  }
}

describe('it looks like a dirt bike', () => {
  /** The drawn bike standing still and level, with both suspensions pushed in `compression` of the way. */
  function standing(compression: number) {
    const { bike, run, view, scene } = drawn()
    bike.placeOnGround(0, 0, 0)
    run(1)
    bike.wheels.forEach((wheel, i) => (wheel.extension = wheel.previousExtension = bike.travel(i) * (1 - compression)))
    view.update(1, 1 / 60)
    const part = (name: string) => {
      const found = scene.getObjectByName(name)
      expect(found, name).toBeDefined()
      found!.updateWorldMatrix(true, true)
      return new THREE.Box3().setFromObject(found!, true)
    }
    return part
  }

  it('the handlebar sits well above the seat', () => {
    const part = standing(0.3)
    expect(part('handlebar').min.y - part('seat').max.y).toBeGreaterThan(0.15)
  })

  it('the fenders sit high and stay clear of the tyres, even with the suspension all the way in', () => {
    const part = standing(1)
    expect(part('front fender').min.y).toBeGreaterThan(part('front tyre').max.y)
    expect(part('rear fender').min.y).toBeGreaterThan(part('rear tyre').max.y)
  })
})

describe('the wheels', () => {
  it('are dirt bike wheels: a thin knobby tyre on a rim, with yellow spokes to the hub', () => {
    const { scene } = drawn()
    for (const name of ['front tyre', 'rear tyre']) {
      const wheel = scene.getObjectByName(name)!
      for (const part of ['tyre', 'knobs', 'rim', 'spokes', 'hub']) expect(wheel.getObjectByName(part), `${name} ${part}`).toBeDefined()
      const spokes = wheel.getObjectByName('spokes') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      expect(spokes.material.color.getHex()).toBe(FACTORY.spokes)
      expect(FACTORY.spokes).toBe(0xf2c418) // yellow
    }
  })

  it('still sit right on the ground, knobs and all', () => {
    const { bike, run, view, scene } = drawn()
    bike.placeOnGround(0, 0, 0)
    run(2)
    view.update(1, 1 / 60)
    for (const name of ['front tyre', 'rear tyre']) {
      const wheel = scene.getObjectByName(name)!
      wheel.updateWorldMatrix(true, true)
      expect(Math.abs(new THREE.Box3().setFromObject(wheel, true).min.y)).toBeLessThan(0.01)
    }
  })
})

describe('colours', () => {
  it('a different livery recolours the bike and the rider (for other riders later)', () => {
    const { bike } = setup(flat(600))
    const scene = new THREE.Scene()
    new BikeView(scene, bike, { ...FACTORY, jersey: 0x22aa44, plastics: 0x2255dd })
    const colours = new Set<number>()
    scene.traverse((part) => {
      const material = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (material?.color) colours.add(material.color.getHex())
    })
    expect(colours.has(0x22aa44)).toBe(true)
    expect(colours.has(0x2255dd)).toBe(true)
    expect(colours.has(FACTORY.jersey)).toBe(false)
    expect(colours.has(FACTORY.plastics)).toBe(false)
  })
})

describe('where the drawn tyres touch', () => {
  it('standing still, both drawn tyres sit right on the ground: no hovering', () => {
    const { bike, run, view } = drawn()
    bike.placeOnGround(0, 0, 0)
    run(2)
    view.update(1, 1 / 60)
    for (const i of [0, 1]) {
      const touching = view.contactPoint(i, new THREE.Vector3())
      expect(Math.abs(touching.y)).toBeLessThan(0.01)
    }
  })
})

describe('drawing the lean', () => {
  it('riding level, leaning tips the drawn bike over without turning it', () => {
    const { bike, run, view, model } = drawn()
    bike.placeOnGround(0, 0, 0)
    run(1)
    const leaning = drawLeaning(bike, view, model, 30)
    expect(Math.abs(leaning.twist)).toBeLessThan(1)
    expect(leaning.tipped).toBeGreaterThan(29)
    expect(leaning.tipped).toBeLessThan(31)
  })

  it('in a wheelie, leaning tips the drawn bike sideways without twisting it off where it goes', () => {
    // the sixth tuning session: steering in a wheelie looked like crabbing diagonally
    const { bike, run, view, model } = drawn()
    bike.placeOnGround(0, 250, 0)
    run(2, () => (bike.controls.throttle = 0.5))
    bike.controls.lean = -1
    bike.controls.throttle = 1
    run(1)
    expect(bike.pitch / DEG).toBeGreaterThan(30) // up on the back wheel
    const leaning = drawLeaning(bike, view, model, 25)
    expect(Math.abs(leaning.twist)).toBeLessThan(1)
    expect(leaning.tipped).toBeGreaterThan(24)
    expect(leaning.tipped).toBeLessThan(26)
  })

  it('in a wheelie, the drawn bike leans about its rear tyre, which stays where it touches the ground', () => {
    const { bike, run, view, model } = drawn()
    bike.placeOnGround(0, 250, 0)
    run(2, () => (bike.controls.throttle = 0.5))
    bike.controls.lean = -1
    bike.controls.throttle = 1
    run(1)
    const upright = drawLeaning(bike, view, model, 0).rearContact
    const leaning = drawLeaning(bike, view, model, 25).rearContact
    expect(leaning.distanceTo(upright)).toBeLessThan(0.03)
  })
})
