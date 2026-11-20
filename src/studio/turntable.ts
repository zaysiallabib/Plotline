/**
 * The small turntable of "Add your own…" (OwnModel.tsx): the model just read, on a marble floor in soft room light,
 * turned so the side picked as its front faces you, swaying gently (still under prefers-reduced-motion), with an arrow on
 * the floor at its front. Loaded only when the dialog opens (three.js is a separate chunk).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Front } from '../furnish/own'
import { FRONT_FIX } from '../three/furniture'

export interface Turntable {
  setFront(f: Front): void
  dispose(): void
}

/** The model's box in its file's axes (m, as the file says), and the turntable on `canvas`. */
export async function turntable(canvas: HTMLCanvasElement, glb: ArrayBuffer, front: Front): Promise<{ box: THREE.Vector3; view: Turntable }> {
  const gltf = await new GLTFLoader().parseAsync(glb.slice(0), '')
  const model = gltf.scene
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const c = box.getCenter(new THREE.Vector3())
  model.position.set(-c.x, -box.min.y, -c.z)
  const fit = new THREE.Group() // the model at a unit size: the camera frames any piece the same
  fit.add(model)
  fit.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 1e-6))
  const turn = new THREE.Group()
  turn.add(fit)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  const sun = new THREE.DirectionalLight('#ffffff', 1.2)
  sun.position.set(1.5, 3, 2)
  scene.add(sun, turn)
  // the floor: a hairline ring and the front's arrow, ink at low opacity (the design's quiet line)
  const ink = new THREE.LineBasicMaterial({ color: '#17191c', transparent: true, opacity: 0.22 })
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 72 }, (_, i) => new THREE.Vector3(Math.cos((i / 72) * Math.PI * 2) * 0.62, 0, Math.sin((i / 72) * Math.PI * 2) * 0.62))), ink)
  const arrow = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.07, 0, 0.62), new THREE.Vector3(0, 0, 0.72), new THREE.Vector3(0.07, 0, 0.62)]), ink)
  turn.add(ring, arrow)

  const camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.01, 20)
  camera.position.set(0, 0.95, 2.55)
  camera.lookAt(0, 0.38, 0)

  let base = FRONT_FIX[front] ?? 0
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = 0
  const t0 = performance.now()
  const frame = () => {
    // the front toward you, swaying ±25° over 7 s so its depth reads
    const t = (performance.now() - t0) / 1000
    turn.rotation.y = 0
    fit.rotation.y = base + (still ? -0.35 : Math.sin((t / 7) * Math.PI * 2) * 0.44 - 0.2)
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  frame()
  return {
    box: size,
    view: {
      setFront: (f) => void (base = FRONT_FIX[f] ?? 0),
      dispose: () => {
        cancelAnimationFrame(raf)
        scene.traverse((o) => {
          const m = o as THREE.Mesh
          m.geometry?.dispose()
          for (const x of [m.material ?? []].flat() as THREE.Material[]) {
            for (const v of Object.values(x)) if (v instanceof THREE.Texture) v.dispose()
            x.dispose()
          }
        })
        env.dispose()
        pmrem.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
      },
    },
  }
}
