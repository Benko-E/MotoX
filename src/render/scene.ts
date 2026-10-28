import * as THREE from 'three'
import type { Config } from '../config'

/** How far around the camera the sun draws shadows, metres. */
const SHADOW_REACH = 60

export interface SceneView {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Placeholder the size of a dirt bike, for scale. Replaced by the bike in step 3. */
  scaleBox: THREE.Mesh
  /** Keeps the sun's shadows centred on what the camera is looking at. */
  focusShadows(at: THREE.Vector3): void
  render(): void
}

/** Sets up the renderer, sky, fog and light. The ground is added separately. */
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
  scene.fog = new THREE.Fog(sky, 200, 480)

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 2000)

  // A fairly low sun and a soft sky light, so the hills' shapes show.
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b5338, 0.8))
  const sunOffset = new THREE.Vector3(45, 35, 25)
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.8)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -SHADOW_REACH
  sun.shadow.camera.right = SHADOW_REACH
  sun.shadow.camera.top = SHADOW_REACH
  sun.shadow.camera.bottom = -SHADOW_REACH
  sun.shadow.camera.far = 200
  sun.shadow.bias = -0.0005
  scene.add(sun, sun.target)

  const scaleBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 2.1),
    new THREE.MeshStandardMaterial({ color: 0xd8432b }),
  )
  scaleBox.castShadow = true
  scene.add(scaleBox)

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
    scaleBox,
    focusShadows(at) {
      sun.target.position.copy(at)
      sun.position.copy(at).add(sunOffset)
    },
    render() {
      if (camera.fov !== config.camera.fov) {
        camera.fov = config.camera.fov
        camera.updateProjectionMatrix()
      }
      renderer.render(scene, camera)
    },
  }
}
