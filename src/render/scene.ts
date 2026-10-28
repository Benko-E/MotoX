import * as THREE from 'three'
import type { Config } from '../config'

/** Size of the world in metres. The map in step 2 will use the same size. */
const WORLD_SIZE = 1000

export interface SceneView {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  render(): void
}

/** Sets up the renderer, sky, light and a flat ground plane. */
export function createScene(container: HTMLElement, config: Config): SceneView {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  container.appendChild(renderer.domElement)

  const sky = new THREE.Color(0x9cc3e6)
  const scene = new THREE.Scene()
  scene.background = sky
  // Fully fogged before the ground's edge (500 m from the middle).
  scene.fog = new THREE.Fog(sky, 120, 450)

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 2000)
  camera.position.set(5, 2.2, 7)
  camera.lookAt(0, 0.6, 0)

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b5338, 1.2))
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2)
  sun.position.set(30, 50, 20)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const reach = 20
  sun.shadow.camera.left = -reach
  sun.shadow.camera.right = reach
  sun.shadow.camera.top = reach
  sun.shadow.camera.bottom = -reach
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // 10 m grid squares, so distance and speed are easy to read.
  const grid = new THREE.GridHelper(WORLD_SIZE, WORLD_SIZE / 10, 0x5c4630, 0x7d6343)
  grid.position.y = 0.01
  scene.add(grid)

  // A box the size of a dirt bike, for scale. Replaced by the bike in step 3.
  const bikeSized = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 2.1),
    new THREE.MeshStandardMaterial({ color: 0xd8432b }),
  )
  bikeSized.position.y = 0.6
  bikeSized.castShadow = true
  scene.add(bikeSized)

  function fitToWindow() {
    const width = container.clientWidth
    const height = container.clientHeight
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', fitToWindow)
  fitToWindow()

  return {
    renderer,
    scene,
    camera,
    render: () => renderer.render(scene, camera),
  }
}
