import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { initPhysics } from '../src/physics/world'
import { BikeView } from '../src/render/bikeView'
import { cameraModes, nextCameraMode } from '../src/render/cameraViews'
import { ChaseCamera } from '../src/render/chaseCamera'
import { HelmetCamera } from '../src/render/helmetCamera'
import { DEG, flat, setup } from './physicsSetup'

beforeAll(async () => {
  await initPhysics()
})

const settings = () => structuredClone(config)
const camera = () => new THREE.PerspectiveCamera(65, 1, 0.1, 2000)

/** Where the chase camera settles behind a bike standing at the origin facing -z, in `view`, zoomed `zoom` clicks. */
function settled(view: string, zoomClicks = 0) {
  const chase = new ChaseCamera(settings(), () => -100)
  chase.view = view
  chase.zoomBy(zoomClicks)
  const cam = camera()
  for (let i = 0; i < 300; i++) chase.update(cam, 1 / 60, new THREE.Vector3(0, 0, 0), 0, 0)
  return cam.position
}

describe('camera views', () => {
  it('C goes through the views in order, then the helmet view and the free-fly camera, then round again', () => {
    expect(cameraModes(config)).toEqual([...Object.keys(config.camera.views), 'helmet', 'fly'])
    let mode = cameraModes(config)[0]
    const seen = [mode]
    for (let i = 0; i < cameraModes(config).length; i++) seen.push((mode = nextCameraMode(config, mode)))
    expect(seen.slice(0, -1)).toEqual(cameraModes(config))
    expect(seen.at(-1)).toBe(seen[0])
  })

  it('each view sits at its own distance behind and height above the bike', () => {
    for (const [name, view] of Object.entries(config.camera.views)) {
      const at = settled(name)
      expect(at.z).toBeCloseTo(view.distance, 1) // behind: the bike faces -z
      expect(at.y).toBeCloseTo(view.height, 1)
    }
  })

  it('the scroll wheel zooms out further and in closer, within closest and furthest', () => {
    const { distance } = config.camera.views.chase
    expect(settled('chase', 3).z).toBeGreaterThan(distance * 1.2)
    expect(settled('chase', -3).z).toBeLessThan(distance * 0.8)
    expect(settled('chase', 100).z).toBeCloseTo(distance * config.camera.furthest, 1)
    expect(settled('chase', -100).z).toBeCloseTo(distance * config.camera.closest, 1)
  })

  it('the helmet view looks out from the rider\'s head the way the bike points, with the horizon level', () => {
    const { bike, run } = setup(flat(600))
    const scene = new THREE.Scene()
    const view = new BikeView(scene, bike)
    bike.placeOnGround(0, 0, 0)
    run(1)
    bike.lean = 35 * DEG // leaning into a turn
    view.update(1, 1 / 60)
    const helmet = new HelmetCamera()
    const cam = camera()
    for (let i = 0; i < 60; i++) helmet.update(cam, 1 / 60, view.headPosition(new THREE.Vector3()), view.forward(new THREE.Vector3()))
    expect(cam.position.distanceTo(view.headPosition(new THREE.Vector3()))).toBeLessThan(0.3) // at the head
    const looking = cam.getWorldDirection(new THREE.Vector3())
    expect(looking.z).toBeLessThan(-0.95) // ahead, toward -z
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
    expect(Math.abs(right.y)).toBeLessThan(0.01) // the horizon stays level: not tipped over with the lean
  })
})
