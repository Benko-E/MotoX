import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Bike } from '../src/physics/bike'
import { initPhysics } from '../src/physics/world'
import { BikeView } from '../src/render/bikeView'
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
  return { bike, run, view, model }
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
