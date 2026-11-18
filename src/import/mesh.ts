/**
 * A plain 3D model of the building (.glb .gltf .obj .fbx .dae .stl .3dm) → the exact outside shape only (ImportedShell), no
 * storeys: an architect's massing / facade model stands around the traced flats. Every format goes through three's own
 * loader and comes out as one GLB (GLTFExporter), in the frame of types.ts: Y up, the lowest point at Y = 0, the
 * footprint centred on X / Z = 0.
 *
 * UNITS. A .3dm says its unit system, an .fbx its UnitScaleFactor (cm × factor), a .dae its <unit meter>, glTF is metres
 * by definition; .obj / .stl say nothing → guessed from the extent (guessUnit): a building reads 6–200 m tall or wide.
 * UP AXIS. glTF / FBX / DAE are Y-up as three loads them (FBX and DAE turn themselves); Rhino is Z-up (turned here); OBJ
 * / STL say nothing → Y-up assumed (the Studio's Turn / Floor height fields fix the rest by hand). The guesses go in `notes`.
 * The pure parts (magic check, unit guess, framing) are tested in mesh.test.ts; the loaders run in the browser only.
 */
import type { ImportResult, ImportedShell } from './types'

/** metres per file unit, and why */
export interface UnitGuess {
  scale: number
  note: string
}

/**
 * The scale of a file that names no unit, from its longest extent (a building reads 6–200 m): 6 000–200 000 is
 * millimetres; 200–6 000 is ambiguous (feet, or a big site in metres) → metres unless over 400, then millimetres of a
 * small model (a 400 m "metre" building is nothing we sell); else metres.
 */
export function guessUnit(extent: number): UnitGuess {
  if (!(extent > 0)) return { scale: 1, note: 'The file has no size: read as metres' }
  if (extent >= 6000) return { scale: 0.001, note: `The file names no unit: ${Math.round(extent)} across reads as millimetres (${(extent / 1000).toFixed(1)} m)` }
  if (extent > 400) return { scale: 0.001, note: `The file names no unit: ${Math.round(extent)} across is too big for metres, read as millimetres (${(extent / 1000).toFixed(2)} m) — if it is feet, set the size in the Studio` }
  if (extent > 200) return { scale: 1, note: `The file names no unit: ${Math.round(extent)} across read as metres (it may be feet: ${(extent * 0.3048).toFixed(1)} m)` }
  return { scale: 1, note: `The file names no unit: ${extent.toFixed(1)} across read as metres` }
}

/** Rhino's UnitSystem enum (rhino3dm File3dmSettings.modelUnitSystem) → metres per unit; null for none / unknown. */
export function rhinoUnitScale(system: number | undefined): number | null {
  const m: Record<number, number> = { 1: 1e-6, 2: 0.001, 3: 0.01, 4: 1, 5: 1000, 6: 2.54e-8, 7: 2.54e-5, 8: 0.0254, 9: 0.3048, 10: 1609.344 }
  return system !== undefined && m[system] !== undefined ? m[system] : null
}

/** A binary glTF starts with the magic "glTF" and version 2. */
export const isGlb = (bytes: ArrayBuffer): boolean => {
  if (bytes.byteLength < 12) return false
  const v = new DataView(bytes)
  return v.getUint32(0, true) === 0x46546c67 && v.getUint32(4, true) === 2
}

/** A .gltf is JSON with an `asset` object (glTF 2.0). */
export function isGltfJson(text: string): boolean {
  try {
    const j = JSON.parse(text) as { asset?: { version?: string } }
    return typeof j === 'object' && !!j && typeof j.asset === 'object' && !!j.asset
  } catch {
    return false
  }
}

type Box = { min: [number, number, number]; max: [number, number, number] }

/** The move that puts a box's lowest point on Y = 0 and its footprint's centre on X / Z = 0 (after `scale`). */
export function framing(b: Box, scale = 1): { dx: number; dy: number; dz: number } {
  return { dx: (-(b.min[0] + b.max[0]) / 2) * scale, dy: -b.min[1] * scale, dz: (-(b.min[2] + b.max[2]) / 2) * scale }
}

/** Already in frame (within 1 cm): the bytes of a .glb can go through untouched. */
export const inFrame = (b: Box): boolean => Math.abs(b.min[1]) < 0.01 && Math.abs(b.min[0] + b.max[0]) < 0.02 && Math.abs(b.min[2] + b.max[2]) < 0.02

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? ''

export async function importMesh(bytes: ArrayBuffer, name: string): Promise<ImportResult> {
  const THREE = await import('three')
  const notes: string[] = []
  const e = ext(name)
  let object: InstanceType<typeof THREE.Object3D>
  let scale: number | null = null // null = guess
  let zUp = false
  const text = () => new TextDecoder().decode(bytes)
  switch (e) {
    case 'glb':
    case 'gltf': {
      if (e === 'glb' ? !isGlb(bytes) : !isGltfJson(text())) throw new Error(`${name} is not a glTF 2.0 file`)
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
      const gltf = await new GLTFLoader().parseAsync(e === 'glb' ? bytes : text(), '').catch((err: unknown) => {
        const m = err instanceof Error ? err.message : String(err)
        throw new Error(/DRACO/i.test(m) ? `${name} is Draco-compressed: export it from the modelling tool without compression` : m)
      })
      object = gltf.scene
      scale = 1
      notes.push('glTF: metres, Y up (as the format says)')
      break
    }
    case 'obj': {
      const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js')
      object = new OBJLoader().parse(text())
      notes.push('OBJ names no up axis: read as Y up (Turn / Floor height in the Studio fix it; a CAD export is often Z up)')
      break
    }
    case 'stl': {
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js')
      const g = new STLLoader().parse(bytes)
      object = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.8 }))
      notes.push('STL has no materials or up axis: plain plaster, read as Y up')
      break
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js')
      object = new FBXLoader().parse(bytes, '')
      const f = (object.userData as { unitScaleFactor?: number }).unitScaleFactor
      if (typeof f === 'number' && f > 0) (scale = f / 100), notes.push(`FBX unit scale factor ${f}: ${f} cm per unit`)
      else notes.push('FBX names no unit scale')
      break
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js')
      const dae = new ColladaLoader().parse(text(), '')
      if (!dae?.scene) throw new Error(` holds no scene`)
      object = dae.scene // the loader applies <unit meter> and <up_axis> itself
      scale = 1
      notes.push('Collada: its own <unit> and <up_axis> applied')
      break
    }
    case '3dm': {
      const { Rhino3dmLoader } = await import('three/addons/loaders/3DMLoader.js')
      const loader = new Rhino3dmLoader().setLibraryPath('/rhino3dm/') // public/rhino3dm/ = the rhino3dm package's js + wasm (Docs/SOURCES.md)
      object = await new Promise((ok, no) => loader.parse(bytes, ok, no))
      loader.dispose()
      const sys = (object.userData as { settings?: { modelUnitSystem?: number | { value?: number } } }).settings?.modelUnitSystem
      scale = rhinoUnitScale(typeof sys === 'object' ? sys?.value : sys)
      notes.push(scale === null ? 'Rhino file names no unit system' : `Rhino unit system: ${scale} m per unit`)
      zUp = true
      break
    }
    default:
      throw new Error(`Plotline cannot read .${e} files`)
  }
  if (zUp) object.rotateX(-Math.PI / 2), notes.push('Z up turned to Y up')
  // a picture the file only points to (an .fbx / .obj beside its texture folder) never came: the exporter must not wait for it
  let lost = 0
  object.traverse((o) => {
    const m = o as InstanceType<typeof THREE.Mesh>
    if (!m.isMesh) return
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const slots = mat as unknown as Record<string, { image?: unknown } | null>
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap', 'lightMap'])
        if (slots[k] && !slots[k]!.image) (slots[k] = null), (mat.needsUpdate = true), lost++
    }
  })
  if (lost) notes.push(`${lost} texture${lost === 1 ? '' : 's'} the file points to elsewhere were left out (a .glb with them inside keeps them)`)
  object.updateMatrixWorld(true)
  const raw = new THREE.Box3().setFromObject(object)
  if (raw.isEmpty()) throw new Error(`${name} holds no geometry`)
  const rawBox: Box = { min: raw.min.toArray() as Box['min'], max: raw.max.toArray() as Box['max'] }
  if (scale === null) {
    const g = guessUnit(Math.max(...raw.getSize(new THREE.Vector3()).toArray()))
    scale = g.scale
    notes.push(g.note)
  }
  let triangles = 0
  object.traverse((o) => {
    const m = o as InstanceType<typeof THREE.Mesh>
    if (m.isMesh) triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3
  })
  triangles = Math.round(triangles)
  if (!triangles) throw new Error(`${name} holds no surfaces (lines or curves only)`)
  const f = framing(rawBox, scale)
  const bounds: Box = {
    min: [rawBox.min[0] * scale + f.dx, 0, rawBox.min[2] * scale + f.dz],
    max: [rawBox.max[0] * scale + f.dx, (rawBox.max[1] - rawBox.min[1]) * scale, rawBox.max[2] * scale + f.dz],
  }
  let glb: ArrayBuffer
  if (e === 'glb' && inFrame(rawBox)) glb = bytes
  else {
    const root = new THREE.Group()
    root.add(object)
    object.scale.multiplyScalar(scale)
    object.position.set(f.dx, f.dy, f.dz)
    object.updateMatrixWorld(true)
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
    const out = await new GLTFExporter().parseAsync(root, { binary: true })
    if (!(out instanceof ArrayBuffer)) throw new Error('could not write the GLB')
    glb = out
  }
  const size = bounds.max.map((v, i) => v - bounds.min[i])
  notes.push(`Outside shape: ${size[0].toFixed(1)} × ${size[2].toFixed(1)} m, ${size[1].toFixed(1)} m tall, ${triangles.toLocaleString()} triangles`)
  const shell: ImportedShell = { glb, name: name.replace(/\.[^.]+$/, ''), bounds, triangles }
  return { format: 'mesh', storeys: [], shell, notes, unitScale: scale, origin: { x: 0, y: 0 } }
}
