/**
 * A plain 3D model of the building (.glb .gltf .obj .fbx .dae .stl .3dm .3ds .kmz .wrl .ply) → the exact outside shape only (ImportedShell), no
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
import { findSibling } from './bundle'
import { toneGlass } from './materials'

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

/**
 * The loaders' file finder: a file a model points to (a .gltf's .bin, a picture, an .obj's .mtl) comes from the files
 * dropped with it (bundle.ts); one that is not there fails at once (no request to the server) and is counted.
 */
function finder(THREE: typeof import('three'), siblings: Map<string, Blob>) {
  const manager = new THREE.LoadingManager()
  const urls = new Map<Blob, string>()
  const missing = new Set<string>()
  let busy = false
  manager.onStart = () => (busy = true)
  manager.onLoad = () => (busy = false)
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url) || /draco|meshopt/i.test(url)) return url
    const b = findSibling(siblings, url)
    if (!b) {
      missing.add(decodeURIComponent(url).split(/[\\/]/).pop() ?? url)
      return 'data:,'
    }
    let u = urls.get(b)
    if (!u) urls.set(b, (u = URL.createObjectURL(b)))
    return u
  })
  return {
    manager,
    missing,
    /** until every picture a loader started has come (or failed), 30 s at most */
    settle: async () => {
      for (let i = 0; busy && i < 600; i++) await new Promise((r) => setTimeout(r, 50))
    },
    done: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  }
}

/** a .gltf's buffers that live in other files and were not dropped with it (they hold the 3D itself) */
export function missingBuffers(gltf: { buffers?: { uri?: string }[] }, has: (uri: string) => boolean): string[] {
  return (gltf.buffers ?? []).map((b) => b.uri).filter((u): u is string => !!u && !/^data:/i.test(u) && !has(u))
}

/**
 * `siblings`: the other files of the drop (bundle.ts), by their path from this file's folder — a .gltf's .bin and
 * textures, an .obj's .mtl, the pictures an .fbx / .glb / .dae / .3ds points to.
 */
export async function importMesh(bytes: ArrayBuffer, name: string, siblings: Map<string, Blob> = new Map(), unitScale?: number): Promise<ImportResult> {
  const THREE = await import('three')
  const notes: string[] = []
  const e = ext(name)
  const files = finder(THREE, siblings)
  const { manager } = files
  let object: InstanceType<typeof THREE.Object3D>
  let scale: number | null = null // null = guess
  let zUp = false
  let passThrough = e === 'glb' // the bytes may go to the viewer as they are (in frame, nothing outside them, not compressed)
  const text = () => new TextDecoder().decode(bytes)
  try {
    switch (e) {
      case 'glb':
      case 'gltf': {
        if (e === 'glb' ? !isGlb(bytes) : !isGltfJson(text())) throw new Error(`${name} is not a glTF 2.0 file`)
        if (e === 'gltf') {
          const lost = missingBuffers(JSON.parse(text()), (u) => !!findSibling(siblings, u))
          if (lost.length) throw new Error(`${name} keeps its 3D in ${lost.join(', ')}: drop the whole folder (or a .zip of it), not the .gltf alone`)
        }
        const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
          import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/loaders/DRACOLoader.js'),
          import('three/addons/libs/meshopt_decoder.module.js'),
        ])
        // compressed meshes (Draco, meshopt): the decoders three ships, found through Vite
        const draco = new DRACOLoader()
        const gltf = await new GLTFLoader(manager)
          .setDRACOLoader(draco)
          .setMeshoptDecoder(MeshoptDecoder)
          .parseAsync(e === 'glb' ? bytes : text(), '')
          .finally(() => draco.dispose())
          .catch((err: unknown) => {
            const m = err instanceof Error ? err.message : String(err)
            throw new Error(/KTX2|basisu/i.test(m) ? `${name} has KTX2 (compressed) pictures: export it with PNG / JPEG pictures` : m)
          })
        const used = (gltf.parser.json.extensionsUsed ?? []) as string[]
        if (used.some((x) => /draco|meshopt/i.test(x))) (passThrough = false), notes.push('glTF: compressed meshes unpacked')
        if (files.missing.size || (gltf.parser.json.images ?? []).some((i: { uri?: string }) => i.uri && !/^data:/i.test(i.uri))) passThrough = false
        object = gltf.scene
        scale = 1
        notes.push('glTF: metres, Y up (as the format says)')
        break
      }
      case 'obj': {
        const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js')
        const loader = new OBJLoader(manager)
        // its colours and pictures: the .mtl it names, when it came in the same drop
        const lib = /^mtllib\s+(.+?)\s*$/m.exec(text())?.[1]
        // (renamed files keep their old mtllib line: then the .mtl named as the .obj is, or the only one dropped)
        const mtls = [...siblings.keys()].filter((k) => k.endsWith('.mtl') && !k.includes('/'))
        const mtl = (lib ? findSibling(siblings, lib) : null) ?? findSibling(siblings, name.replace(/\.obj$/i, '.mtl')) ?? (mtls.length === 1 ? siblings.get(mtls[0])! : null)
        if (mtl) {
          const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js')
          const materials = new MTLLoader(manager).parse(await mtl.text(), '')
          materials.preload()
          loader.setMaterials(materials)
          notes.push(`OBJ: colours and pictures from ${lib}`)
        } else if (lib) notes.push(`OBJ: its colours are in ${lib}, which was not in the drop (drop the folder or a .zip to keep them)`)
        object = loader.parse(text())
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
      case 'ply': {
        const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js')
        const g = new PLYLoader().parse(bytes)
        if (!g.index) throw new Error(`${name} is a point cloud (dots, no surfaces): export it as a mesh`)
        object = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: g.getAttribute('color') ? '#ffffff' : '#d9d6cf', vertexColors: !!g.getAttribute('color'), roughness: 0.8 }))
        notes.push('PLY names no unit or up axis: read as Y up')
        break
      }
      case 'fbx': {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js')
        object = new FBXLoader(manager).parse(bytes, '')
        const f = (object.userData as { unitScaleFactor?: number }).unitScaleFactor
        if (typeof f === 'number' && f > 0) (scale = f / 100), notes.push(`FBX unit scale factor ${f}: ${f} cm per unit`)
        else notes.push('FBX names no unit scale')
        break
      }
      case 'dae': {
        const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js')
        const dae = new ColladaLoader(manager).parse(text(), '')
        if (!dae?.scene) throw new Error(`${name} holds no scene`)
        object = dae.scene // the loader applies <unit meter> and <up_axis> itself
        scale = 1
        notes.push('Collada: its own <unit> and <up_axis> applied')
        break
      }
      case 'kmz': {
        // SketchUp's "Google Earth" export: a zipped Collada with its pictures inside
        const { KMZLoader } = await import('three/addons/loaders/KMZLoader.js')
        object = new KMZLoader().parse(bytes).scene
        scale = 1
        notes.push('KMZ (SketchUp / Google Earth): the Collada inside, its own unit and up axis applied')
        break
      }
      case 'wrl': {
        const { VRMLLoader } = await import('three/addons/loaders/VRMLLoader.js')
        object = new VRMLLoader(manager).parse(text(), '')
        // its lamps and its sky (a 10 km sphere the loader draws first) are not the building
        const drop: InstanceType<typeof THREE.Object3D>[] = []
        object.traverse((o) => ((o as InstanceType<typeof THREE.Light>).isLight || o.renderOrder === -Infinity) && drop.push(o))
        for (const o of drop) o.removeFromParent()
        scale = 1
        notes.push('VRML: metres, Y up (as the format says)')
        break
      }
      case '3ds': {
        const { TDSLoader } = await import('three/addons/loaders/TDSLoader.js')
        object = new TDSLoader(manager).parse(bytes, '')
        zUp = true
        notes.push('3DS names no unit: guessed from the size; Z up (3ds Max, ArchiCAD and SketchUp write it so)')
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
    await files.settle()
  } finally {
    files.done()
  }
  if (zUp) object.rotateX(-Math.PI / 2), notes.push('Z up turned to Y up')
  // a picture the file points to that never came: the exporter must not wait for it
  let lost = 0
  object.traverse((o) => {
    const m = o as InstanceType<typeof THREE.Mesh>
    if (!m.isMesh) return
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const slots = mat as unknown as Record<string, { image?: { width?: number } } | null>
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap', 'lightMap'])
        if (slots[k] && !(slots[k]!.image && slots[k]!.image!.width)) (slots[k] = null), (mat.needsUpdate = true), lost++
    }
  })
  // a material fully see-through with nothing to cut it (the Macky Auditorium's Collada: transparency 1 read as clear) is drawn
  // solid; a see-through colour is toned to Plotline's glass (a saturated blue pane reads as glass)
  let clearing = 0
  let toned = 0
  object.traverse((o) => {
    const m = o as InstanceType<typeof THREE.Mesh>
    if (!m.isMesh) return
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as (InstanceType<typeof THREE.Material> & { color?: InstanceType<typeof THREE.Color>; map?: unknown; alphaMap?: unknown })[]) {
      if (!mat.transparent || mat.alphaMap) continue
      if (mat.opacity < 0.02) (mat.opacity = 1), (mat.transparent = false), (mat.needsUpdate = true), clearing++
      else if (mat.opacity < 0.95 && mat.color && !mat.map) {
        const [r, g, b, a] = toneGlass([mat.color.r, mat.color.g, mat.color.b, mat.opacity])
        mat.color.setRGB(r, g, b)
        mat.opacity = a
        toned++
      }
    }
  })
  if (clearing) notes.push(`${clearing} material${clearing === 1 ? '' : 's'} came fully see-through (nothing would show): drawn solid`), (passThrough = false)
  if (toned) notes.push(`${toned} glass material${toned === 1 ? '' : 's'} toned to Plotline's glass`), (passThrough = false)
  const missing = [...files.missing].filter((f) => !/\.(bin|mtl)$/i.test(f))
  if (missing.length) notes.push(`${missing.length} picture${missing.length === 1 ? '' : 's'} the file points to ${missing.length === 1 ? 'was' : 'were'} not in the drop (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}): drop the whole folder or a .zip of it to keep ${missing.length === 1 ? 'it' : 'them'}`)
  else if (lost) notes.push(`${lost} picture${lost === 1 ? '' : 's'} could not be read and ${lost === 1 ? 'was' : 'were'} left out`)
  if (lost || missing.length) passThrough = false
  object.updateMatrixWorld(true)
  const raw = new THREE.Box3().setFromObject(object)
  if (raw.isEmpty()) throw new Error(`${name} holds no geometry`)
  const rawBox: Box = { min: raw.min.toArray() as Box['min'], max: raw.max.toArray() as Box['max'] }
  if (unitScale) (scale = unitScale), notes.push(`Read at ${unitScale} m per unit, as you set it`)
  else if (scale === null) {
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
  if (passThrough && inFrame(rawBox)) glb = bytes
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
