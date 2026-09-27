/**
 * Procedural assets Poly Haven lacks (upholstered beds, a fabric sofa, a contemporary
 * dining set and desk, a fitted kitchen run, wall-hung bathroom fixtures, rugs, TVs)
 * from three primitives with CC0 PBR textures (textures.data.ts). Metadata (sizes,
 * ids, mountY) is in procedural.meta.ts so presets/tests never import three.
 * Every builder returns a Group grounded at y = 0, centred in x, front = +z. Parts are
 * merged per material (a handful of draw calls per piece) and get box-projected UVs
 * in METRES, the same convention as src/three/materials.ts.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { pointInPolygon, type Pt } from '../core'
import { CLEAR_GLASS } from '../three/openings'
import { TEXTURES } from './textures'
import type { ObjectKind } from './kit'
import { ART, ART_H, ART_PHOTO, ART_W, BED_STYLES, parsePlanter, PLANTER, PLANTER_KERB, PROCEDURAL, PLANTER_TOP, STAIR_D, STAIR_RISE, STAIR_W, stairId, wardrobeDoors } from './procedural.meta'

export { PROCEDURAL } from './procedural.meta'

type Size3 = { x: number; y: number; z: number }

// ───────────────────────────── materials ─────────────────────────────

const loader = new THREE.TextureLoader()
const texCache = new Map<string, Promise<THREE.Texture>>()
function tex(url: string, repeatM: number, srgb: boolean): Promise<THREE.Texture> {
  const key = `${url}|${repeatM}`
  let p = texCache.get(key)
  if (!p) {
    p = loader.loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(1 / repeatM, 1 / repeatM)
      t.anisotropy = 8 // WebGLTextures clamps to the GPU max
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      return t
    })
    p.catch(() => console.warn(`[plotline] texture missing: ${url}`))
    texCache.set(key, p)
  }
  return p
}

type PbrOpt = { tint?: string; roughness?: number; metalness?: number; scale?: number }
const matCache = new Map<string, THREE.MeshStandardMaterial>()
/** Textured material; maps attach once loaded (a 404 keeps the flat tint). roughness scales the roughness map. */
function pbr(textureId: string, o: PbrOpt = {}): THREE.MeshStandardMaterial {
  const key = `${textureId}|${o.tint}|${o.roughness}|${o.metalness}|${o.scale}`
  let m = matCache.get(key)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ color: o.tint ?? '#ffffff', roughness: o.roughness ?? 1, metalness: o.metalness ?? 0 })
  const set = TEXTURES[textureId]
  if (set) {
    const r = set.repeatM * (o.scale ?? 1)
    const mat = m
    const slot = (k: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', url: string | undefined, srgb = false) =>
      url &&
      tex(url, r, srgb)
        .then((t) => {
          mat[k] = t
          mat.needsUpdate = true
        })
        .catch(() => {})
    slot('map', set.albedo, true)
    slot('normalMap', set.normal)
    slot('roughnessMap', set.roughness)
    slot('aoMap', set.ao)
  }
  matCache.set(key, m)
  return m
}
const flat = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })

// one material per kind, shared by every instance
let mats: ReturnType<typeof makeMats> | null = null
function makeMats() {
  const oak = pbr('wood_veneer_light')
  oak.userData.grain = true // boxUV: grain along each panel's long side, offset per panel
  return {
    oak,
    stone: pbr('marble_floor_white', { scale: 0.6 }),
    // full metalness mirrors the dark studio HDRI and reads black; partly metallic reads as steel
    steel: pbr('metal_brushed', { metalness: 0.85 }),
    // appliance panels: paler and less metallic, the brush pattern at 2× so it reads as grain, not streaks
    applianceSteel: pbr('metal_brushed', { metalness: 0.6, tint: '#eef0f2', scale: 2 }),
    fridgeBody: flat('#a4a7aa', 0.4, 0.3), // painted sides: a shade off the steel doors

    upholstery: pbr('fabric_upholstery', { tint: '#d2c8b8' }), // warm taupe: headboard, bed base
    sofa: pbr('fabric_upholstery', { tint: '#e6e1d8' }), // oatmeal
    chair: pbr('fabric_upholstery', { tint: '#b3ae9c' }), // sage-grey dining seats
    duvet: pbr('fabric_upholstery', { tint: '#ffffff', scale: 0.7 }),
    linen: pbr('fabric_curtain', { tint: '#ffffff' }),
    throw: pbr('fabric_upholstery', { tint: '#a4705a' }), // dusty terracotta accent
    throwSage: pbr('fabric_upholstery', { tint: '#a3a48f' }),
    cushion: pbr('fabric_curtain', { tint: '#d9b98c' }), // ochre accent
    cushionOat: pbr('fabric_curtain', { tint: '#e4d9c6' }),
    cushionTaupe: pbr('fabric_curtain', { tint: '#bfae98' }),
    rugIvory: pbr('rug_wool', { tint: '#f3eee6' }),
    rugOat: pbr('rug_wool', { tint: '#e3d8c6' }),
    rugStone: pbr('rug_wool', { tint: '#d6cfc4' }),
    rugBorder: pbr('rug_wool', { tint: '#8f8272' }),
    mattress: flat('#f1efe9', 0.9),
    ceramic: flat('#fbfbf9', 0.12),
    ceramicIn: flat('#f4f4f2', 0.15, 0, { side: THREE.DoubleSide }),
    blackGlass: flat('#070707', 0.06), // glass is a dielectric: metalness mirrored the HDRI as silver
    blackSteel: flat('#1e1e1e', 0.45, 0.6),
    dark: flat('#262320', 0.7),
    ring: flat('#3a3a3a', 0.35),
    filter: flat('#4a4a48', 0.5, 0.7), // hood grease filter
    // a mirror out of reflection range (see mirror()): pale silver, the env map's studio would read as a checkerboard
    mirror: flat('#cfd7d9', 0.06, 0.4),
    glaze: flat('#c9cdbf', 0.18, 0, { side: THREE.DoubleSide }), // sage stoneware bowl (open: both faces show)
    lemon: flat('#e0b53c', 0.45),
    mat: flat('#f7f5f0', 0.9),
    glass: flat('#dfe9e6', 0.05, 0, { transparent: true, opacity: 0.18, depthWrite: false }),
    led: flat('#fff4dc', 0.5, 0, { emissive: '#ffe9c4', emissiveIntensity: 1.2 }),
    // ceiling-light diffuser: the old fixture disc's glow; render.ts Look.setHour ramps it at dusk (fixtureGlow)
    opal: flat('#ffffff', 0.6, 0, { emissive: '#fff0dc', emissiveIntensity: 2.5 }),
    whitePaint: flat('#f3f2ee', 0.4), // AC casing (satin white)
    kerb: pbr('plaster_white', { tint: '#d3cdc1' }), // planter kerb: weathered plaster
    soil: flat('#33271e', 1), // damp potting soil
    nickel: flat('#d4d1ca', 0.3, 0.5), // ceiling-light canopy and trim ring
  }
}
const M = () => (mats ??= makeMats())
/** The ceiling lights' shared diffuser material (emissive follows the hour). */
export const fixtureGlow = (): THREE.MeshStandardMaterial => M().opal

// ───────────────────────────── geometry helpers ─────────────────────────────

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m)
  o.position.set(x, y, z)
  o.castShadow = o.receiveShadow = true
  return o
}
/** Box of w × h × d with its CENTRE at (x, y, z). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z)
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z)
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rTop = r, open = false) =>
  mesh(new THREE.CylinderGeometry(rTop, r, h, 40, 1, open), m, x, y, z)
/** Tilt a part about x (radians, + tips its top toward +z) and return it. */
const tilt = (o: THREE.Mesh, a: number) => ((o.rotation.x = a), o)

/** A plump cushion: a sphere squared off in its face plane, w × h, t thick at the centre, front = +z; `lean` tips its top back. */
function cushion(w: number, h: number, t: number, m: THREE.Material, x: number, y: number, z: number, lean = 0.3): THREE.Mesh {
  const g = new THREE.SphereGeometry(1, 28, 18)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i)
    const Y = p.getY(i)
    p.setXYZ(i, (X * (1 + 0.45 * Y * Y) * w) / 2, (Y * (1 + 0.45 * X * X) * h) / 2, (p.getZ(i) * t) / 2)
  }
  g.computeVertexNormals()
  return tilt(mesh(g, m, x, y, z), -lean)
}

/** Stable pseudo-random in [0, 1). */
const rnd = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * UVs in metres by box projection on the dominant normal axis (fabrics, stone tile the same on every part).
 * `grain` (veneer, whose figure runs along the texture's u): u follows the longer side of each face of the part,
 * so a door's grain runs up it and a table top's along it, shifted by (du, dv) so no two panels match.
 */
function boxUV(geo: THREE.BufferGeometry, grain?: { du: number; dv: number }): void {
  const p = geo.attributes.position
  const n = geo.attributes.normal
  let ext: number[] | null = null
  if (grain) {
    geo.computeBoundingBox()
    const s = geo.boundingBox!.getSize(new THREE.Vector3())
    ext = [s.x, s.y, s.z]
  }
  const uv = new Float32Array(p.count * 2)
  const P = [0, 0, 0]
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    let [a, b] = ax >= ay && ax >= az ? [2, 1] : ay >= az ? [0, 2] : [0, 1]
    if (ext && ext[b] > ext[a]) [a, b] = [b, a]
    P[0] = p.getX(i)
    P[1] = p.getY(i)
    P[2] = p.getZ(i)
    uv[2 * i] = P[a] + (grain?.du ?? 0)
    uv[2 * i + 1] = P[b] + (grain?.dv ?? 0)
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Marks meshes as one clickable sub-part of the piece; furniture.ts names it `${placementId}/${name}`. */
function part(name: string, label: string, kind: ObjectKind, ...os: THREE.Object3D[]): THREE.Object3D[] {
  for (const o of os) o.userData.part = { name, label, kind }
  return os
}

let builds = 0
/**
 * Bake every part into one mesh per material; parts flagged userData.solo (the mirror) stay separate objects.
 * Meshes tagged by part() go into a child group per sub-part (userData.part), merged per material inside it.
 */
function finish(parts: THREE.Object3D[]): THREE.Group {
  const seed = ++builds // two cabinets of one kind get different veneer
  const g = new THREE.Group()
  const byMat = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>([[g, new Map()]])
  const subs = new Map<string, THREE.Group>()
  parts.forEach((o, i) => {
    const tag = o.userData.part
    delete o.userData.part
    let into: THREE.Group = g
    if (tag) {
      if (!subs.has(tag.name)) {
        const s = new THREE.Group()
        s.userData.part = tag
        subs.set(tag.name, s)
        byMat.set(s, new Map())
        g.add(s)
      }
      into = subs.get(tag.name)!
    }
    if (o.userData.solo) return void into.add(o)
    const piece = o as THREE.Mesh
    const m = piece.material as THREE.Material
    piece.updateMatrix()
    const geo = (piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry).applyMatrix4(piece.matrix) // RoundedBox is non-indexed, Box/Cylinder/Sphere are not
    if (!m.userData.ownUV) boxUV(geo, m.userData.grain ? { du: rnd(seed, i) * 3, dv: rnd(i, seed) * 3 } : undefined)
    const mm = byMat.get(into)!
    mm.set(m, [...(mm.get(m) ?? []), geo])
  })
  for (const [into, mm] of byMat) for (const [m, geos] of mm) into.add(mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos)!, m))
  return g
}

let reflecting = false
/**
 * A w × h mirror facing +z at (x, y, z): a real reflection (three Reflector, 512² target) while the camera is
 * within 4 m in front of it, outside XR, and it is on screen (onBeforeRender only runs for drawn objects);
 * otherwise the flat `mirror` material. userData.mirror.forceOff switches it off (cost measurements).
 * ponytail: the render target is not disposed with the unit (one 512² target per vanity); dispose on unit swap if units start changing at runtime.
 */
function mirror(w: number, h: number, x: number, y: number, z: number): THREE.Mesh {
  const r = new Reflector(new THREE.PlaneGeometry(w, h), {
    textureWidth: 512,
    textureHeight: 512,
    color: new THREE.Color().setRGB(0.44, 0.46, 0.45), // overlay blend: ≈ 90 % reflectance, a hint of green
    multisample: 4,
  })
  r.position.set(x, y, z)
  r.userData.solo = true
  const state = { forceOff: false }
  r.userData.mirror = state
  const live = r.material
  const off = M().mirror
  r.material = off // until its first reflection pass has run
  const render = r.onBeforeRender.bind(r)
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  r.onBeforeRender = (renderer, scene, camera, ...rest) => {
    if (reflecting) return // another mirror's reflection pass: no mirror-in-mirror
    c.setFromMatrixPosition(r.matrixWorld)
    const toCam = n.setFromMatrixPosition(camera.matrixWorld).sub(c)
    const on = !state.forceOff && !renderer.xr.isPresenting && toCam.lengthSq() < 16 && toCam.dot(c.set(0, 0, 1).transformDirection(r.matrixWorld)) > 0.05
    if (on) {
      reflecting = true
      render(renderer, scene, camera, ...rest)
      reflecting = false
    }
    r.material = on ? live : off // takes effect next frame: the render list already holds this frame's material
  }
  return r
}

const printCache = new Map<string, THREE.MeshStandardMaterial>()
/** A photographic print: the image spans the part's front face (own 0..1 UVs, not metre-projected). */
function print(url: string): THREE.MeshStandardMaterial {
  let m = printCache.get(url)
  if (!m) {
    const mat = (m = new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.55 }))
    mat.userData.ownUV = true
    tex(url, 1, true)
      .then((t) => {
        mat.map = t
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      })
      .catch(() => {})
    printCache.set(url, m)
  }
  return m
}

/**
 * A painted print (ART_SETS not in ART_PHOTO): a diptych is one 720 × 504 canvas, `_l` shows its left half and `_r`
 * its right (clones share one GPU upload). Without a DOM (Vitest) it stays a flat paper tone.
 */
function painted(id: string): THREE.MeshStandardMaterial {
  let m = printCache.get(id)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
  m.userData.ownUV = true
  if (typeof globalThis.document?.createElement === 'function') {
    const set = id.slice(0, -2)
    const whole = (canvases[set] ??= new THREE.CanvasTexture(paintArt(set)))
    whole.colorSpace = THREE.SRGBColorSpace
    whole.anisotropy = 8
    const t = whole.clone()
    t.repeat.set(0.5, 1)
    t.offset.set(id.endsWith('_r') ? 0.5 : 0, 0)
    m.map = t
  } else m.color.set('#e9e3d8')
  printCache.set(id, m)
  return m
}
const canvases: Record<string, THREE.CanvasTexture> = {}

/** The painted sets, one calm palette (founder: "calmer" staging): paper, sand, clay, terracotta, ochre, sage, mist, slate. */
function paintArt(set: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const [W, H] = [(c.width = 720), (c.height = 504)]
  const g = c.getContext('2d')!
  const fill = (color: string | CanvasGradient) => ((g.fillStyle = color), g)
  const grad = (y0: number, y1: number, a: string, b: string) => {
    const l = g.createLinearGradient(0, y0, 0, y1)
    l.addColorStop(0, a)
    l.addColorStop(1, b)
    return l
  }
  fill('#efe9df').fillRect(0, 0, W, H)
  const halves = [0, 360]
  if (set === 'art_blocks') {
    // soft colour fields, two to a print
    ;[['#b9785a', '#d9c7a7'], ['#9ea58c', '#c9a27f']].forEach(([a, b], i) => {
      g.filter = 'blur(1.5px)'
      fill(a).fillRect(halves[i] + 48, 56, 264, 214)
      fill(b).fillRect(halves[i] + 48, 286, 264, 162)
      g.filter = 'none'
    })
  } else if (set === 'art_botanical') {
    // a leafy stem per print in fine ink, leaves washed in pale sage
    g.lineWidth = 2.2
    g.strokeStyle = '#3b3a36'
    halves.forEach((x0, h) => {
      const P = (s: number) => ({ x: x0 + 180 + (h ? -1 : 1) * 60 * s * s - 20 * s, y: 460 - 390 * s })
      g.beginPath()
      for (let s = 0; s <= 1.001; s += 0.05) g.lineTo(P(s).x, P(s).y)
      g.stroke()
      for (let i = 1; i <= 9; i++) {
        const s = i / 10
        const p = P(s)
        const side = i % 2 ? 1 : -1
        const len = 62 - 30 * s
        g.save()
        g.translate(p.x, p.y)
        g.rotate(side * (0.9 - 0.3 * s))
        g.beginPath()
        g.ellipse(0, -len / 2, len * 0.3, len / 2, 0, 0, Math.PI * 2)
        fill('rgba(158,165,140,0.35)').fill()
        g.stroke()
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(0, -len * 0.85)
        g.stroke()
        g.restore()
      }
    })
  } else if (set === 'art_city') {
    // a grey skyline in three planes of haze
    fill(grad(0, H, '#e2e5e3', '#c8cdcc')).fillRect(0, 0, W, H)
    ;['#bcc2c3', '#9aa2a5', '#6f7b82'].forEach((color, l) => {
      fill(color)
      for (let x = -10, i = 0; x < W; i++) {
        const w = 26 + 50 * rnd(i, l + 1)
        const top = 170 + l * 70 + 110 * rnd(l + 1, i)
        g.fillRect(x, top, w - 3, H - top)
        x += w
      }
    })
    fill(grad(H - 140, H, 'rgba(226,229,227,0)', 'rgba(226,229,227,0.55)')).fillRect(0, H - 140, W, 140)
  } else if (set === 'art_stripes') {
    const cols = ['#b9785a', '#cfa35a', '#e4d3b8', '#c99a7b', '#d9c7a7', '#efe9df']
    for (let y = 0, i = 0; y < H; i++) {
      const h = 18 + 52 * rnd(i, 4)
      fill(cols[i % cols.length]).fillRect(0, y, W, h + 1)
      y += h
    }
  } else if (set === 'art_arches') {
    // nested arches on paper, the second print in reverse order
    const cols = ['#b9785a', '#d9c7a7', '#9ea58c', '#c99a7b']
    halves.forEach((x0, h) => {
      g.lineWidth = 24
      ;(h ? [...cols].reverse() : cols).forEach((color, i) => {
        const r = 132 - i * 30
        g.strokeStyle = color
        g.beginPath()
        g.moveTo(x0 + 180 - r, 430)
        g.arc(x0 + 180, 300, r, Math.PI, 0)
        g.lineTo(x0 + 180 + r, 430)
        g.stroke()
      })
    })
  } else if (set === 'art_hills') {
    fill(grad(0, 300, '#ebe6dc', '#d6dcd9')).fillRect(0, 0, W, H)
    ;['#c3cbc9', '#a9b8bf', '#9ea58c', '#7d816f', '#5f6557'].forEach((color, l) => {
      g.beginPath()
      g.moveTo(0, H)
      for (let x = 0; x <= W; x += 8) g.lineTo(x, 200 + l * 55 + 28 * Math.sin(x / (90 + 25 * l) + l * 1.7) + 12 * Math.sin(x / 37 + l))
      g.lineTo(W, H)
      fill(color).fill()
    })
  } else if (set === 'art_sun') {
    // low sun over still water, reflection broken into strokes
    fill(grad(0, 300, '#efe3d3', '#e6c9ad')).fillRect(0, 0, W, 300)
    fill(grad(300, H, '#cbc4b8', '#b5afa4')).fillRect(0, 300, W, H - 300)
    fill('#c9774f')
    g.beginPath()
    g.arc(540, 236, 52, 0, Math.PI * 2)
    g.fill()
    fill('#a39c90').fillRect(0, 294, 250, 6)
    for (let i = 0; i < 14; i++) fill(`rgba(217,150,110,${0.55 - i * 0.035})`).fillRect(540 - 50 + 30 * rnd(i, 9) - i * 2, 312 + i * 11, 70 + i * 4 - 40 * rnd(9, i), 3)
  }
  // paper grain
  for (let i = 0; i < 5000; i++) fill(`rgba(70,60,50,${0.03 * rnd(i, 1)})`).fillRect(rnd(i, 2) * W, rnd(i, 3) * H, 2, 2)
  return c
}

// ───────────────────────────── builders ─────────────────────────────

/**
 * Upholstered bed: channel-tufted headboard at −z, duvet, pillows; linen by style (BED_STYLES): '' ochre + terracotta
 * cushions and a terracotta throw across the foot, '_b' oat + ochre cushions and a sage throw over the right foot
 * corner, '_c' plain white + taupe cushions, no throw.
 */
function bed(w: number, style: (typeof BED_STYLES)[number]): THREE.Mesh[] {
  const m = M()
  const W = w + 0.16
  const D = 2.16
  const zH = -D / 2
  const out: THREE.Mesh[] = []
  out.push(rbox(W, 1.1, 0.07, 0.02, m.upholstery, 0, 0.6, zH + 0.035)) // headboard backing, 0.05–1.15
  const n = Math.max(3, Math.round(W / 0.29))
  const cw = W / n
  for (let i = 0; i < n; i++) out.push(rbox(cw - 0.012, 0.66, 0.06, 0.028, m.upholstery, -W / 2 + cw * (i + 0.5), 0.8, zH + 0.1))
  const L = D - 0.1
  out.push(rbox(w + 0.1, 0.28, L, 0.03, m.upholstery, 0, 0.2, zH + 0.1 + L / 2)) // base 0.06–0.34
  for (const x of [-w / 2, w / 2]) for (const z of [zH + 0.2, D / 2 - 0.1]) out.push(box(0.05, 0.06, 0.05, m.dark, x, 0.03, z))
  const zm = zH + 0.13 // mattress head
  out.push(rbox(w, 0.22, 2.0, 0.05, m.mattress, 0, 0.45, zm + 1.0)) // 0.34–0.56
  const zd0 = zm + 0.55
  const zd1 = D / 2 - 0.035
  out.push(rbox(w + 0.08, 0.3, zd1 - zd0, 0.06, m.duvet, 0, 0.45, (zd0 + zd1) / 2)) // drapes to 0.30, top 0.60
  out.push(rbox(w + 0.09, 0.05, 0.3, 0.024, m.duvet, 0, 0.61, zd0 + 0.15)) // turn-down
  const sleep = w > 1.3 ? [-w / 4, w / 4] : [0]
  const pw = w > 1.3 ? 0.68 : w - 0.3
  for (const x of sleep) out.push(tilt(rbox(pw, 0.13, 0.46, 0.045, m.linen, x, 0.64, zm + 0.27), -0.35))
  const [c0, c1] = style === '_b' ? [m.cushionOat, m.cushion] : style === '_c' ? [m.linen, m.cushionTaupe] : [m.cushion, m.throw]
  const accents = w > 1.3 ? [-0.25, 0.25] : [0]
  accents.forEach((x, i) => out.push(cushion(0.46, 0.46, 0.17, i ? c1 : c0, x, 0.8, zm + 0.5)))
  if (style === '') {
    out.push(rbox(w + 0.12, 0.03, 0.5, 0.012, m.throw, 0, 0.615, D / 2 - 0.28)) // throw on top
    out.push(rbox(w + 0.12, 0.28, 0.03, 0.012, m.throw, 0, 0.48, D / 2 - 0.015)) // throw hanging over the foot
  } else if (style === '_b') {
    // folded throw over the right foot corner: on top, down the foot and down the side
    const tw = Math.min(0.9, w * 0.6)
    const x0 = w / 2 + 0.06 - tw / 2
    out.push(rbox(tw, 0.03, 0.62, 0.012, m.throwSage, x0, 0.615, D / 2 - 0.34))
    out.push(rbox(tw, 0.26, 0.03, 0.012, m.throwSage, x0, 0.49, D / 2 - 0.015))
    out.push(rbox(0.03, 0.26, 0.62, 0.012, m.throwSage, w / 2 + 0.065, 0.49, D / 2 - 0.34)) // flush with the headboard
  }
  return out
}

/** Two plain linen cushions (oat, ochre) that lean on sofa_3seat's back cushions; y = 0 on the seat (mountY). */
function cushionsPlain(): THREE.Mesh[] {
  const m = M()
  return [cushion(0.44, 0.44, 0.17, m.cushionOat, -0.17, 0.213, -0.03, 0.35), cushion(0.4, 0.4, 0.15, m.cushion, 0.19, 0.193, 0.03, 0.28)]
}

/** Oak bedside table: a drawer over an open shelf, on four slim legs. */
function bedside(): THREE.Mesh[] {
  const m = M()
  const out = [
    box(0.5, 0.025, 0.4, m.oak, 0, 0.5075, 0), // top 0.495–0.52
    box(0.5, 0.02, 0.4, m.oak, 0, 0.17, 0), // bottom 0.16–0.18
    box(0.02, 0.315, 0.4, m.oak, -0.24, 0.3375, 0),
    box(0.02, 0.315, 0.4, m.oak, 0.24, 0.3375, 0),
    box(0.46, 0.315, 0.012, m.oak, 0, 0.3375, -0.194), // back
    box(0.46, 0.012, 0.37, m.oak, 0, 0.35, 0), // shelf under the drawer
    box(0.456, 0.13, 0.02, m.oak, 0, 0.428, 0.19), // drawer front 0.363–0.493
    box(0.16, 0.01, 0.004, m.dark, 0, 0.47, 0.2), // finger-pull groove
  ]
  for (const x of [-0.22, 0.22]) for (const z of [-0.16, 0.16]) out.push(cyl(0.014, 0.16, m.oak, x, 0.08, z, 0.017))
  return out
}

/** W wide (3 seats at 2.2, 2 at 1.6); seat cushions top out at 0.45 m: throw_pillows_01's mountY in kit.ts sits them on it. */
function sofa(W: number): THREE.Mesh[] {
  const m = M()
  const D = 0.92
  const zB = -D / 2
  const inner = W - 0.4
  const out: THREE.Mesh[] = []
  for (const x of [-(W / 2 - 0.08), W / 2 - 0.08]) for (const z of [zB + 0.08, D / 2 - 0.08]) out.push(cyl(0.016, 0.12, m.oak, x, 0.06, z, 0.022))
  for (const x of [-(W / 2 - 0.1), W / 2 - 0.1]) out.push(rbox(0.2, 0.62, D, 0.06, m.sofa, x, 0.43, 0)) // arms 0.12–0.74
  out.push(rbox(inner + 0.04, 0.7, 0.2, 0.05, m.sofa, 0, 0.47, zB + 0.1)) // back frame 0.12–0.82
  out.push(rbox(inner, 0.2, D - 0.2, 0.03, m.sofa, 0, 0.22, zB + 0.2 + (D - 0.2) / 2)) // seat base
  const seats = W > 2 ? 3 : 2
  const cw = inner / seats
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + cw * (i + 0.5)
    out.push(rbox(cw - 0.012, 0.13, D - 0.22, 0.05, m.sofa, x, 0.385, zB + 0.21 + (D - 0.22) / 2)) // seat cushions to 0.45
    out.push(tilt(rbox(cw - 0.012, 0.4, 0.17, 0.07, m.sofa, x, 0.61, zB + 0.29), -0.1)) // back cushions
  }
  return out
}

/** Oak top W × D on an apron, steel legs 9 cm in from each corner. */
function diningTable({ x: W, z: D }: Size3): THREE.Mesh[] {
  const m = M()
  const out = [rbox(W, 0.04, D, 0.012, m.oak, 0, 0.73, 0), box(W - 0.18, 0.07, D - 0.18, m.oak, 0, 0.675, 0)]
  for (const x of [-(W / 2 - 0.09), W / 2 - 0.09]) for (const z of [-(D / 2 - 0.09), D / 2 - 0.09]) out.push(box(0.045, 0.71, 0.045, m.blackSteel, x, 0.355, z))
  return out
}

function diningChair(): THREE.Mesh[] {
  const m = M()
  const out = [rbox(0.47, 0.07, 0.46, 0.03, m.chair, 0, 0.435, 0.03)] // seat top 0.47
  for (const x of [-0.2, 0.2]) {
    out.push(cyl(0.013, 0.43, m.oak, x, 0.215, 0.2, 0.017)) // front legs
    out.push(box(0.03, 0.84, 0.03, m.oak, x, 0.42, -0.25)) // back posts
  }
  out.push(tilt(rbox(0.44, 0.3, 0.05, 0.02, m.chair, 0, 0.66, -0.215), -0.1))
  return out
}

/** Oak top W × D on a steel frame: legs at the corners (4 / 5 cm in), side rails top and bottom, a back rail. */
function desk({ x: W, z: D }: Size3): THREE.Mesh[] {
  const m = M()
  const [lx, lz] = [W / 2 - 0.04, D / 2 - 0.05]
  const out = [rbox(W, 0.03, D, 0.008, m.oak, 0, 0.735, 0), box(2 * lx - 0.03, 0.03, 0.03, m.blackSteel, 0, 0.6, -lz)]
  for (const x of [-lx, lx]) {
    for (const z of [-lz, lz]) out.push(box(0.03, 0.72, 0.03, m.blackSteel, x, 0.36, z))
    for (const y of [0.015, 0.705]) out.push(box(0.03, 0.03, 2 * lz + 0.03, m.blackSteel, x, y, 0))
  }
  return out
}

function tv(stand: boolean): THREE.Mesh[] {
  const m = M()
  if (!stand) return [box(1.23, 0.71, 0.03, m.blackGlass, 0, 0.355, 0.015), box(0.5, 0.35, 0.03, m.dark, 0, 0.355, -0.015)]
  return [
    box(1.23, 0.71, 0.03, m.blackGlass, 0, 0.425, 0), // 0.07–0.78
    box(1.1, 0.55, 0.025, m.dark, 0, 0.45, -0.027),
    rbox(0.4, 0.015, 0.24, 0.006, m.blackSteel, 0, 0.0075, 0),
    box(0.06, 0.08, 0.03, m.blackSteel, 0, 0.055, -0.02),
  ]
}

function rug(w: number, d: number, fill: THREE.Material): THREE.Mesh[] {
  const m = M()
  const out = [rbox(w, 0.012, d, 0.005, fill, 0, 0.006, 0)]
  // woven border band 6 cm inside the edge, a hair proud of the field
  const b = 0.05
  const t = 0.05
  for (const s of [-1, 1]) {
    out.push(box(w - 2 * b, 0.0125, t, m.rugBorder, 0, 0.00625, s * (d / 2 - b - t / 2)))
    out.push(box(t, 0.0125, d - 2 * b - 2 * t, m.rugBorder, s * (w / 2 - b - t / 2), 0.00625, 0))
  }
  return out
}

/** Base cabinet carcass + door + worktop; `open` leaves the top 0.2 m hollow for a sink bowl. */
function base(open = false, door = true): THREE.Mesh[] {
  const m = M()
  const out = [box(0.6, 0.1, 0.54, m.dark, 0, 0.05, -0.02)] // recessed plinth
  out.push(open ? box(0.6, 0.56, 0.56, m.oak, 0, 0.38, -0.03) : box(0.6, 0.76, 0.56, m.oak, 0, 0.48, -0.03))
  if (open) for (const x of [-0.291, 0.291]) out.push(box(0.018, 0.2, 0.56, m.oak, x, 0.76, -0.03))
  if (door) {
    out.push(box(0.594, 0.74, 0.02, m.oak, 0, 0.48, 0.26)) // door, 3 mm shadow gaps to the next module
    out.push(box(0.3, 0.012, 0.02, m.steel, 0, 0.8, 0.28)) // bar handle
  }
  return out
}

function counter(): THREE.Mesh[] {
  return [...base(), box(0.6, 0.04, 0.62, M().stone, 0, 0.88, 0)]
}

/** A base module styled with a kettle, an oak board leaning on the splashback and a stoneware bowl of lemons. */
function counterStyled(): THREE.Mesh[] {
  const m = M()
  const T = 0.9 // worktop top
  const out = counter()
  out.push(tilt(rbox(0.28, 0.38, 0.02, 0.012, m.oak, -0.13, T + 0.19, -0.265), -0.1)) // board, top 1.28 m
  const [kx, kz] = [0.13, -0.12]
  out.push(cyl(0.08, 0.02, m.dark, kx, T + 0.01, kz)) // kettle base
  out.push(cyl(0.078, 0.19, m.applianceSteel, kx, T + 0.115, kz, 0.064)) // body, tapering up
  out.push(cyl(0.05, 0.012, m.dark, kx, T + 0.216, kz)) // lid
  out.push(box(0.026, 0.15, 0.022, m.dark, kx + 0.1, T + 0.125, kz), box(0.07, 0.022, 0.022, m.dark, kx + 0.07, T + 0.2, kz)) // handle
  const spout = box(0.05, 0.022, 0.03, m.applianceSteel, kx - 0.085, T + 0.175, kz)
  spout.rotation.z = -0.6
  out.push(spout)
  const [bx, bz] = [0.02, 0.15]
  out.push(cyl(0.05, 0.006, m.glaze, bx, T + 0.003, bz), cyl(0.05, 0.075, m.glaze, bx, T + 0.0375, bz, 0.12, true)) // flared bowl
  for (const [x, z, y] of [[-0.035, -0.01, 0.04], [0.035, -0.015, 0.04], [0, 0.035, 0.042]]) {
    const l = mesh(new THREE.SphereGeometry(0.034, 16, 12), m.lemon, bx + x, T + y, bz + z)
    l.scale.x = 1.25
    l.rotation.y = x * 20
    out.push(l)
  }
  return out
}

/**
 * Tall larder W × H (2.15 m = the wall cabinets' top line), back at z −0.31 like the base run, handles at +0.31: a lower
 * door to 1.4 m and an upper one to the top, bar handles either side of that split; over 0.7 m wide two columns of doors,
 * handles by the middle.
 */
function tall({ x: W, y: H }: Size3): THREE.Mesh[] {
  const m = M()
  const cols = W > 0.7 ? 2 : 1
  const dw = W / cols
  const out = [box(W, 0.1, 0.54, m.dark, 0, 0.05, -0.02), box(W, H - 0.1, 0.58, m.oak, 0, (H + 0.1) / 2, -0.02)] // plinth, carcass
  for (let c = 0; c < cols; c++) {
    const x = -W / 2 + dw * (c + 0.5)
    out.push(box(dw - 0.006, 1.297, 0.02, m.oak, x, 0.7515, 0.28), box(dw - 0.006, H - 1.409, 0.02, m.oak, x, (H + 1.403) / 2, 0.28)) // doors 0.103–1.4, 1.406–H
    const hx = cols === 1 ? -W / 2 + 0.05 : c ? 0.05 : -0.05
    out.push(box(0.012, 0.3, 0.02, m.steel, hx, 1.22, 0.3), box(0.012, 0.3, 0.02, m.steel, hx, 1.59, 0.3))
  }
  return out
}

function sink(): THREE.Mesh[] {
  const m = M()
  const out = base(true)
  // worktop around a 0.44 × 0.36 hole (hole centre z = 0.03)
  out.push(box(0.08, 0.04, 0.62, m.stone, -0.26, 0.88, 0), box(0.08, 0.04, 0.62, m.stone, 0.26, 0.88, 0))
  out.push(box(0.44, 0.04, 0.16, m.stone, 0, 0.88, -0.23), box(0.44, 0.04, 0.1, m.stone, 0, 0.88, 0.26))
  // steel bowl: floor + four walls, 0.2 deep, a thin rim on the worktop
  out.push(box(0.44, 0.01, 0.36, m.steel, 0, 0.705, 0.03))
  for (const s of [-1, 1]) {
    out.push(box(0.01, 0.2, 0.36, m.steel, s * 0.215, 0.8, 0.03), box(0.44, 0.2, 0.01, m.steel, 0, 0.8, 0.03 + s * 0.175))
    out.push(box(0.48, 0.004, 0.02, m.steel, 0, 0.902, 0.03 + s * 0.19), box(0.02, 0.004, 0.36, m.steel, s * 0.23, 0.902, 0.03))
  }
  out.push(cyl(0.03, 0.004, m.dark, 0, 0.712, 0.03))
  // gooseneck-ish mixer
  out.push(cyl(0.025, 0.04, m.steel, 0, 0.92, -0.22), cyl(0.012, 0.26, m.steel, 0, 1.05, -0.22))
  out.push(box(0.024, 0.024, 0.2, m.steel, 0, 1.18, -0.13), cyl(0.012, 0.06, m.steel, 0, 1.15, -0.04))
  return out
}

function hob(): THREE.Mesh[] {
  const m = M()
  const out = base(false, false)
  out.push(box(0.594, 0.12, 0.02, m.oak, 0, 0.79, 0.26), box(0.3, 0.012, 0.02, m.steel, 0, 0.77, 0.28)) // drawer
  out.push(box(0.594, 0.6, 0.02, m.blackGlass, 0, 0.42, 0.26), box(0.46, 0.015, 0.03, m.steel, 0, 0.66, 0.285)) // oven
  out.push(box(0.6, 0.04, 0.62, m.stone, 0, 0.88, 0))
  out.push(box(0.56, 0.008, 0.5, m.blackGlass, 0, 0.904, 0))
  for (const [x, z, r] of [[-0.14, -0.12, 0.1], [0.14, -0.12, 0.08], [-0.14, 0.12, 0.08], [0.14, 0.12, 0.1]])
    out.push(cyl(r, 0.002, m.ring, x, 0.909, z))
  return out
}

/** Wall cabinet 1.45–2.15 m over a stone splashback from the worktop; built from y = 0 = worktop. */
function upper(): THREE.Mesh[] {
  const m = M()
  return [
    box(0.6, 0.55, 0.012, m.stone, 0, 0.275, -0.169),
    box(0.6, 0.7, 0.33, m.oak, 0, 0.9, -0.01),
    box(0.594, 0.69, 0.02, m.oak, 0, 0.9, 0.165),
    box(0.3, 0.012, 0.02, m.steel, 0, 0.58, 0.185),
    box(0.56, 0.005, 0.02, m.led, 0, 0.548, 0.12), // under-cabinet LED strip
  ]
}

/**
 * Chimney hood in brushed steel: a box canopy (70 mm front edge with a filter line and touch controls) whose top
 * slopes back to a duct cover that runs up to 3.0 m; grease filter and two lamps underneath.
 * ponytail: the duct stops at 3.0 m (Type A's ceiling) — builders don't get the ceiling height; pass it through
 * buildProcedural if a unit with higher ceilings shows a gap above the duct.
 */
function hood(): THREE.Mesh[] {
  const m = M()
  const y0 = 0.7 // canopy underside, 1.60 m: 0.7 over the hob
  // sloped top: the box's upper face shrinks to the duct's footprint, held against the wall (z = −0.25)
  const slope = new THREE.BoxGeometry(0.6, 0.2, 0.5)
  const p = slope.attributes.position
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.47, p.getY(i), -0.25 + (p.getZ(i) + 0.25) * 0.48)
  slope.computeVertexNormals()
  const out = [
    box(0.6, y0, 0.012, m.stone, 0, y0 / 2, -0.244), // splashback up to the canopy
    rbox(0.6, 0.07, 0.5, 0.005, m.applianceSteel, 0, y0 + 0.035, 0), // canopy box, front edge 1.60–1.67 m
    mesh(slope, m.applianceSteel, 0, y0 + 0.07 + 0.1, 0),
    box(0.28, 2.1 - y0 - 0.27, 0.24, m.applianceSteel, 0, (2.1 + y0 + 0.27) / 2, -0.13), // duct cover to 3.0 m
    box(0.6, 0.003, 0.002, m.dark, 0, y0 + 0.018, 0.251), // filter line along the front edge
    box(0.5, 0.004, 0.4, m.filter, 0, y0 - 0.002, 0.01), // grease filter, a hair below the steel
    box(0.12, 0.012, 0.002, m.blackGlass, 0.19, y0 + 0.045, 0.251), // touch controls
  ]
  for (const x of [-0.2, 0.2]) out.push(cyl(0.025, 0.004, m.led, x, y0 - 0.003, 0.14))
  return out
}

/**
 * Bottom-freezer fridge W × H × D (bounds exact): satin-grey body with rounded edges, brushed-steel doors on a dark
 * gasket with a 6 mm gap between them, bar handles on the free side (+x: inCorner puts the wall on −x, the hinge side),
 * a black hinge cover on top, a recessed plinth grille on levelling feet. From 0.8 m wide French doors: two fridge
 * doors with handles either side of their split and a freezer drawer with a bar across. The freezer stays 0.07–0.735 m;
 * the fridge door takes the rest of the height.
 */
function fridge({ x: W, y: H, z: D }: Size3): THREE.Mesh[] {
  const m = M()
  const zf = D / 2 - 0.08 // body front: gasket to +0.01, doors to +0.05, stand-offs to +0.06, handles to +0.08
  const french = W >= 0.8
  const [y0, y1] = [0.74, H - 0.01] // fridge door
  const out = [
    rbox(W, H - 0.07, D - 0.08, 0.03, m.fridgeBody, 0, (H + 0.06) / 2, (zf - D / 2) / 2), // body 0.065–(H − 0.005), back at −D/2
    box(W - 0.06, 0.065, D - 0.2, m.dark, 0, 0.0325, zf - 0.06 - (D - 0.2) / 2), // plinth grille, 60 mm behind the body front
    box(W - 0.02, H - 0.09, 0.01, m.dark, 0, (H + 0.07) / 2, zf + 0.005), // door gasket
    rbox(W, 0.665, 0.04, 0.015, m.applianceSteel, 0, 0.4025, zf + 0.03), // freezer door 0.07–0.735
    ...(french ? [-1, 1] : [0]).map((s) => rbox(french ? W / 2 - 0.003 : W, y1 - y0, 0.04, 0.015, m.applianceSteel, s * (W / 4 + 0.0015), (y0 + y1) / 2, zf + 0.03)),
    ...(french ? [-1, 1] : [-1]).map((s) => box(0.12, 0.005, 0.05, m.dark, s * (W / 2 - 0.08), H - 0.0025, zf + 0.025)), // hinge covers to H
  ]
  for (const x of [-(W / 2 - 0.05), W / 2 - 0.05]) out.push(cyl(0.016, 0.065, m.dark, x, 0.0325, zf - 0.03)) // levelling feet
  const bar = (x: number, b0: number, b1: number) => {
    out.push(rbox(0.022, b1 - b0, 0.02, 0.008, m.steel, x, (b0 + b1) / 2, zf + 0.07))
    for (const y of [b0 + 0.04, b1 - 0.04]) out.push(box(0.014, 0.014, 0.01, m.steel, x, y, zf + 0.055))
  }
  for (const x of french ? [-0.04, 0.04] : [W / 2 - 0.05]) bar(x, y0 + 0.21, H - 0.2)
  if (!french) bar(W / 2 - 0.05, 0.45, 0.68)
  else {
    out.push(rbox(W - 0.24, 0.022, 0.02, 0.008, m.steel, 0, 0.66, zf + 0.07))
    for (const x of [-(W / 2 - 0.16), W / 2 - 0.16]) out.push(box(0.014, 0.014, 0.01, m.steel, x, 0.66, zf + 0.055))
  }
  return out
}

/** Wall-hung bowl + in-wall cistern flush plate; y = 0 is the bowl's underside (mountY 0.2). */
function toilet(): THREE.Mesh[] {
  const m = M()
  return [
    rbox(0.3, 0.12, 0.44, 0.06, m.ceramic, 0, 0.06, -0.04),
    rbox(0.37, 0.13, 0.54, 0.06, m.ceramic, 0, 0.145, 0),
    rbox(0.37, 0.03, 0.46, 0.015, m.ceramic, 0, 0.225, 0.03), // seat + lid, top 0.44 m
    box(0.24, 0.16, 0.012, m.ceramic, 0, 0.85, -0.264), // flush plate 0.97–1.13 m
    box(0.1, 0.12, 0.006, m.steel, -0.055, 0.85, -0.255),
    box(0.1, 0.12, 0.006, m.steel, 0.055, 0.85, -0.255),
  ]
}

/** Floating oak vanity, stone top, vessel basin, tall mixer, frameless mirror; y = 0 is the cabinet underside (mountY 0.45). */
function vanity(): THREE.Object3D[] {
  const m = M()
  const bowl = cyl(0.14, 0.13, m.ceramicIn, 0, 0.465, 0.03, 0.2, true)
  bowl.scale.z = 0.8
  const inside = cyl(0.14, 0.004, m.ceramic, 0, 0.405, 0.03)
  inside.scale.z = 0.8
  return [
    ...part(
      'cabinet',
      'Vanity cabinet, oak, stone top',
      'vanity',
      box(0.8, 0.36, 0.46, m.oak, 0, 0.18, -0.02),
      box(0.8, 0.012, 0.005, m.dark, 0, 0.3, 0.212), // finger-pull groove
      rbox(0.8, 0.04, 0.5, 0.008, m.stone, 0, 0.38, 0), // top 0.81–0.85 m
    ),
    ...part('basin', 'Vessel basin', 'basin', bowl, inside),
    ...part('mixer', 'Basin mixer', 'mixer', cyl(0.014, 0.32, m.steel, 0, 0.56, -0.18), box(0.024, 0.024, 0.15, m.steel, 0, 0.71, -0.115)),
    ...part(
      'mirror',
      'Vanity mirror',
      'mirror',
      box(0.72, 0.82, 0.008, m.dark, 0, 1.09, -0.246),
      mirror(0.7, 0.8, 0, 1.09, -0.234), // glass 1.14–1.94 m, 8 mm proud of the backing board
    ),
  ]
}

function basin(): THREE.Mesh[] {
  const m = M()
  const bowl = cyl(0.2, 0.13, m.ceramic, 0, 0.72 + 0.065, 0, 0.25)
  bowl.scale.z = 0.9
  return [
    cyl(0.1, 0.72, m.ceramic, 0, 0.36, -0.03, 0.08),
    bowl,
    cyl(0.012, 0.12, m.steel, 0, 0.85 + 0.06, -0.17),
    box(0.024, 0.02, 0.1, m.steel, 0, 0.96, -0.12),
  ]
}

/** Shower tray in a corner: the wall corner is at local (−x, −z); fixed glass along +x; rain head on the back wall. */
function shower(): THREE.Object3D[] {
  const m = M()
  return [
    ...part(
      'tray',
      'Shower tray',
      'shower-tray',
      rbox(0.9, 0.04, 0.9, 0.01, m.ceramic, 0, 0.02, 0),
      box(0.5, 0.004, 0.05, m.steel, 0, 0.041, 0.36), // linear drain
    ),
    ...part(
      'glass',
      'Glass shower screen',
      'shower-glass',
      box(0.008, 1.95, 0.88, CLEAR_GLASS, 0.446, 1.015, 0.01), // clear pane beside the windows' tinted one: sky PMREM, rebuilt on context restore
      box(0.02, 1.95, 0.02, m.steel, 0.446, 1.015, -0.44), // wall channel
    ),
    ...part(
      'head',
      'Rain shower head',
      'shower-head',
      box(0.02, 0.02, 0.32, m.steel, 0, 2.03, -0.29), // arm 2.02–2.04 m
      cyl(0.11, 0.012, m.steel, 0, 2.01, -0.15), // rain head
    ),
    ...part('mixer', 'Shower mixer', 'mixer', box(0.14, 0.14, 0.012, m.steel, 0, 1.1, -0.444), box(0.02, 0.02, 0.08, m.steel, 0.03, 1.1, -0.4)),
  ]
}

/**
 * Flush ceiling light, Ø d × h: a satin-nickel canopy on the ceiling, an opal drum with a softly domed base that
 * glows (fixtureGlow), a slim satin-nickel trim ring round its lower edge. Top at y = h (ceiling mount).
 */
function ceilingLight(d: number, h: number): THREE.Mesh[] {
  const m = M()
  const r = d / 2
  const dome = mesh(new THREE.SphereGeometry(r - 0.012, 48, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.opal, 0, 0.018, 0)
  dome.scale.y = 0.018 / (r - 0.012) // 18 mm deep
  return [
    cyl(r * 0.86, 0.014, m.nickel, 0, h - 0.007, 0), // canopy (the ring's metal: two draw calls a fixture)
    cyl(r - 0.012, h - 0.032, m.opal, 0, 0.018 + (h - 0.032) / 2, 0, r - 0.02), // drum, tapering in toward the canopy
    cyl(r, 0.012, m.nickel, 0, 0.024, 0), // trim ring, 18–30 mm
    dome,
  ]
}

/**
 * Split-AC indoor unit, 0.9 × 0.3 × 0.22, back on the wall (−z): rounded satin-white casing, a front panel proud of it
 * with a hairline seam, the outlet slot along the underside with its louvre flap half open, a small dark display.
 */
function acSplit(): THREE.Mesh[] {
  const m = M()
  return [
    rbox(0.9, 0.295, 0.2, 0.035, m.whitePaint, 0, 0.1525, -0.01), // casing 0.005–0.30, back at z −0.11
    rbox(0.88, 0.2, 0.024, 0.01, m.whitePaint, 0, 0.19, 0.098), // front panel, face at z 0.11
    box(0.86, 0.004, 0.02, m.dark, 0, 0.088, 0.092), // seam under the front panel
    box(0.72, 0.03, 0.09, m.dark, 0, 0.015, 0.04), // outlet slot, 5 mm under the casing and its rounded front edge
    tilt(rbox(0.74, 0.008, 0.07, 0.003, m.whitePaint, 0, 0.02, 0.075), 0.45), // louvre flap, tipped down to the front
    box(0.08, 0.022, 0.004, m.blackGlass, 0.3, 0.14, 0.111), // display
  ]
}

/** ART_W × ART_H oak frame, white mat, 5:7 print; back at z = −0.015, y = 0 is the frame's bottom (mountY). */
function artFrame(printMat: THREE.Material): THREE.Mesh[] {
  const m = M()
  const W = ART_W
  const H = ART_H
  const b = 0.02 // moulding
  return [
    box(W, b, 0.03, m.oak, 0, b / 2, 0),
    box(W, b, 0.03, m.oak, 0, H - b / 2, 0),
    box(b, H - 2 * b, 0.03, m.oak, -W / 2 + b / 2, H / 2, 0),
    box(b, H - 2 * b, 0.03, m.oak, W / 2 - b / 2, H / 2, 0),
    box(W - 2 * b, H - 2 * b, 0.01, m.mat, 0, H / 2, -0.005),
    box(W * 0.68, W * 0.952, 0.002, printMat, 0, H / 2 + 0.007, 0.001),
  ]
}

/**
 * Oak wardrobe W × H × D (bounds exact, handles at the front face): ⌈W / 0.6⌉ doors (3 mm shadow gaps, ≤ 0.6 m each) on a
 * recessed plinth. Doors pair up with bar handles either side of their split, an odd last door has one by its left
 * edge; handles stay 0.6 m long centred at 1.1 m whatever the height.
 */
function wardrobe({ x: W, y: H, z: D }: Size3): THREE.Mesh[] {
  const m = M()
  const n = wardrobeDoors(W)
  const dw = W / n
  const zf = D / 2 - 0.04 // carcass front; doors to D/2 − 0.02, handles to D/2
  const out = [box(W, H - 0.06, D - 0.04, m.oak, 0, (H + 0.06) / 2, zf - (D - 0.04) / 2), box(W - 0.04, 0.06, D - 0.08, m.dark, 0, 0.03, -0.02)]
  for (let i = 0; i < n; i++) out.push(box(dw - 0.004, H - 0.08, 0.02, m.oak, -W / 2 + dw * (i + 0.5), (H + 0.06) / 2, zf + 0.01))
  for (let i = 0; i < n; i += 2) {
    const split = -W / 2 + dw * (i + 1)
    for (const x of i + 1 < n ? [split - 0.03, split + 0.03] : [split - dw + 0.03]) out.push(box(0.012, 0.6, 0.02, m.steel, x, 1.1, D / 2 - 0.01))
  }
  return out
}

/** A deformable grid: `src` without uv / normals, its coincident vertices welded (smooth across the seams and edges). */
function weld(src: THREE.BufferGeometry): THREE.BufferGeometry {
  src.deleteAttribute('uv')
  src.deleteAttribute('normal')
  return mergeVertices(src)
}

/**
 * A garment on its hanger, end-on to the closet front (its width W along z), top at y = 0: a flattened ellipse in section,
 * narrow at the neck, shoulders sloping out over the first 8 cm, the body L long flaring by `flare` toward the hem, the
 * fabric t thick at the chest and thinner at the shoulders and hem, the hem swung `lean` along x. ~200 triangles.
 */
function garment(L: number, W: number, t: number, flare: number, lean: number, m: THREE.Material): THREE.Mesh {
  const g = weld(new THREE.CylinderGeometry(1, 1, 1, 10, 10))
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const v = Math.pow(0.5 - p.getY(i), 1.7) // 0 at the neck … 1 at the hem, rows packed toward the shoulders
    const a = Math.atan2(p.getX(i), p.getZ(i))
    const r = Math.hypot(p.getX(i), p.getZ(i)) // 0 at the caps' centres
    const half = (W / 2) * (0.22 + 0.78 * Math.sin((Math.min(1, (v * L) / 0.08) * Math.PI) / 2)) * (1 + flare * v * v)
    const th = (t / 2) * (0.4 + 0.6 * Math.sin((Math.min(1, v * 2.5) * Math.PI) / 2)) * (1 - 0.35 * v)
    p.setXYZ(i, r * Math.sin(a) * th + lean * v * v, -v * L, r * Math.cos(a) * half)
  }
  g.computeVertexNormals()
  return mesh(g, m)
}

/**
 * Open closet unit W × H × D: oak end panels, cap and shoe shelf, a top shelf with folded stacks, a steel rail with
 * clothes hanging end-on on oak hangers (shirts, long kurtas / dresses, a jacket; a calm linen palette, a few gaps).
 * Back open to the wall. The rail sits 0.4 m under the cap (1.7 m at 2.1) but never above 1.9 m, within reach.
 * (The clothes read as slabs: flat rounded boards on a bar.)
 */
function closetRail({ x: W, y: H, z: D }: Size3): THREE.Mesh[] {
  const m = M()
  const rail = Math.min(1.9, H - 0.4)
  const fab = [m.linen, m.cushionOat, m.cushionTaupe, m.chair, m.throwSage]
  const pick = (a: number, b: number) => fab[Math.floor(rnd(a, b) * fab.length)]
  const out = [box(W - 0.036, 0.018, D - 0.02, m.oak, 0, H - 0.009, 0), box(W - 0.036, 0.018, D - 0.02, m.oak, 0, rail + 0.09, 0)]
  out.push(box(W - 0.036, 0.018, D - 0.02, m.oak, 0, 0.14, 0), box(W - 0.036, 0.13, 0.018, m.dark, 0, 0.065, D / 2 - 0.05))
  for (const s of [-1, 1]) out.push(box(0.018, H, D, m.oak, s * (W / 2 - 0.009), H / 2, 0))
  out.push(cyl(0.012, W - 0.04, m.steel, 0, rail, 0).rotateZ(Math.PI / 2))
  const T = new THREE.Matrix4()
  for (let x = -W / 2 + 0.07, i = 0; ; i++) {
    const k = rnd(i, 13)
    // shirt · long kurta / dress · jacket: length, width (along z), thickness, flare
    const [L, w0, t, flare] = k < 0.55 ? [0.72 + 0.1 * rnd(W, i), 0.44 + 0.04 * rnd(i, 2), 0.05, 0.06] : k < 0.82 ? [1.0 + 0.15 * rnd(W, i), 0.38 + 0.04 * rnd(i, 2), 0.04, 0.3] : [0.72 + 0.06 * rnd(W, i), 0.48, 0.085, 0]
    if (x + t > W / 2 - 0.05) break
    const w = Math.min(w0, D - 0.07) // inside a shallow unit too, the hem's flare included
    if (rnd(i, W) < 0.86) {
      // round a point 7.4 cm under the rail: the garment hanging from the hanger's oak neck, a steel hook up and over the rail
      const hook = mesh(new THREE.TorusGeometry(0.014, 0.0025, 4, 8, Math.PI), m.steel, 0, 0.074, 0)
      hook.rotation.y = Math.PI / 2
      const parts = [garment(L, w, t, Math.min(flare, (D - 0.04) / w - 1), 0.03 * (rnd(i, 17) - 0.5), pick(i, 7)), box(0.014, 0.02, 0.06, m.oak, 0, 0.01), mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.054, 6), m.steel, 0, 0.047, -0.014), hook]
      T.makeRotationY(0.16 * (rnd(i, 11) - 0.5)).setPosition(x + t / 2, rail - 0.074, 0)
      for (const o of parts) o.applyMatrix4(T)
      out.push(...parts)
    }
    x += t + 0.028
  }
  // folded stacks on the shelf: 2–4 soft layers each, a little askew, one colour per layer
  for (let x = -W / 2 + 0.22, j = 0; x < W / 2 - 0.15; x += 0.42, j++) {
    let y = rail + 0.099
    for (let n = 2 + Math.floor(rnd(x, 3) * 3), l = 0; l < n; l++) {
      const h = 0.035 + 0.02 * rnd(j, l)
      out.push(mesh(new RoundedBoxGeometry(0.32 - 0.02 * rnd(l, j), h, 0.3, 1, 0.012), pick(j * 7 + l, 5), x + 0.012 * (rnd(l, 9 + j) - 0.5), y + h / 2, 0.012 * (rnd(j, 5 + l) - 0.5)))
      y += h
    }
  }
  return out
}

/**
 * A folded blanket w × h × d lying on y = 0, folded edge toward +x: bullnose edges (a full round at the fold, a thinner
 * one at the open edge), the folded-over layer ending in a soft step across the middle, a slight slump toward the ends
 * and a few shallow creases. One welded grid, ~800 triangles.
 */
function foldedBlanket(w: number, h: number, d: number, m: THREE.Material, x0: number, y0: number, z0: number): THREE.Mesh {
  const g = weld(new THREE.BoxGeometry(1, 1, 1, 10, 4, 8))
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const [a, b, c] = [p.getX(i), p.getY(i), p.getZ(i)] // each −0.5 … 0.5
    const x = a * w
    const top = h * (0.55 + 0.45 * (0.5 + 0.5 * Math.tanh((x + 0.02) / 0.025))) * (1 - 0.12 * (2 * c) ** 2) + 0.003 * Math.sin(x * 37 + c * 9) + 0.002 * Math.sin(c * d * 29)
    const phi = b * Math.PI // bottom −π/2 … top π/2
    const side = Math.abs(b) < 0.499 || Math.abs(a) > 0.499 || Math.abs(c) > 0.499 // on the rim, not inside the top / bottom face
    const r = (top / 2) * (a > 0 ? 1 : 0.6)
    const inset = side ? r * (1 - Math.cos(phi)) : 0
    const px = Math.abs(a) > 0.499 ? Math.sign(a) * (w / 2 - inset) : x
    const pz = Math.abs(c) > 0.499 ? Math.sign(c) * (d / 2 - inset) : c * d
    p.setXYZ(i, px, (top * (1 + Math.sin(phi))) / 2, pz)
  }
  g.computeVertexNormals()
  return mesh(g, m, x0, y0, z0)
}

/**
 * An L × W cot (chouki; 1.9 × 0.7, short 1.7 × 0.65), long side along x, head at −x: a teak-stained frame (legs, aprons,
 * a plank top whose dark edge shows round the mattress), a 12 cm mattress in a mist-blue cotton sheet, a plump white
 * pillow, a terracotta blanket folded at the foot. (It read as a white plank: an untextured off-white 8 cm slab, the
 * walls' own value, with a 5 cm pillow and a 4 cm blanket lying flat on it; then the blanket read as a block: two
 * square-edged boards.)
 */
function cot(L: number, W: number): THREE.Mesh[] {
  const m = M()
  const teak = pbr('wood_veneer_light', { tint: '#8a6446' })
  teak.userData.grain = true
  const out = [box(L, 0.03, W, teak, 0, 0.315, 0), rbox(L - 0.05, 0.12, W - 0.05, 0.035, pbr('fabric_curtain', { tint: '#a9b8bf' }), 0, 0.39, 0)]
  for (const z of [-(W / 2 - 0.03), W / 2 - 0.03]) {
    out.push(box(L, 0.08, 0.04, teak, 0, 0.26, z))
    for (const x of [-(L / 2 - 0.05), L / 2 - 0.05]) out.push(box(0.05, 0.3, 0.05, teak, x, 0.15, z))
  }
  out.push(cushion(0.36, W - 0.14, 0.13, m.linen, -(L / 2 - 0.24), 0.51, 0, Math.PI / 2))
  out.push(foldedBlanket(0.46, 0.08, W - 0.12, m.throw, L / 2 - 0.3, 0.451, 0))
  return out
}

/** Oak hook rail (top at 0.55) with four steel hooks and a gamchha-style towel on the second; y = 0 is the towel's hem. */
function hookRail(): THREE.Mesh[] {
  const m = M()
  const out = [box(0.6, 0.07, 0.02, m.oak, 0, 0.515, -0.03)]
  for (const x of [-0.21, -0.07, 0.07, 0.21]) out.push(tilt(cyl(0.006, 0.05, m.steel, x, 0.5, -0.005), Math.PI / 2), cyl(0.007, 0.025, m.steel, x, 0.51, 0.02))
  // folded over the hook: a long back layer and a shorter front one, hems falling back toward the wall
  out.push(tilt(rbox(0.26, 0.5, 0.008, 0.004, m.throw, -0.07, 0.25, 0.012), 0.06), tilt(rbox(0.26, 0.34, 0.008, 0.004, m.throw, -0.07, 0.33, 0.03), 0.08))
  return out
}

/** Dog-leg stair W wide (see STAIR_* in procedural.meta.ts): marble treads with 2 cm nosings, white risers and soffits, steel rail on the well. */
function stair(W: number): THREE.Mesh[] {
  const m = M()
  const fw = (W - 0.1) / 2
  const [xA, xB] = [-W / 2 + fw / 2, W / 2 - fw / 2]
  const r = STAIR_RISE / 18
  const t = 0.25
  const zL = -STAIR_D / 2 + 1.1 // front edge of the half landing
  const k = r / t
  const yL = 9 * r
  const out: THREE.Mesh[] = []
  // marble tread, its 2 cm nosing toward the approaching foot (dir = −1 on flight A, which climbs toward −z)
  const tread = (x: number, y: number, z: number, dir: number) => out.push(box(fw, 0.03, t + 0.02, m.stone, x, y - 0.015, z - dir * 0.01))
  // balusters from the tread to a 0.9 m rail over the nosings: at a tread centre that is 0.5 r above the tread
  const baluster = (x: number, y: number, z: number) => out.push(box(0.02, 0.9 + r / 2, 0.02, m.blackSteel, x, y + (0.9 + r / 2) / 2, z))
  const rail = (x: number, z0: number, y0: number, z1: number, y1: number) =>
    out.push(tilt(box(0.04, 0.04, Math.hypot(z1 - z0, y1 - y0), m.blackSteel, x, (y0 + y1) / 2, (z0 + z1) / 2), -Math.atan2(y1 - y0, z1 - z0)))
  // flight A: solid steps up from the floor, front to back
  for (let i = 1; i <= 8; i++) {
    const z = STAIR_D / 2 - (i - 0.5) * t
    out.push(box(fw, i * r - 0.03, t, m.whitePaint, xA, (i * r - 0.03) / 2, z))
    tread(xA, i * r, z, -1)
    baluster(-0.05, i * r, z)
  }
  rail(-0.05, STAIR_D / 2, r + 0.9, zL, yL + 0.9)
  // half landing across both flights, 0.15 m slab; a newel post where the rail turns
  out.push(box(W, 0.15, 1.1, m.whitePaint, 0, yL - 0.105, zL - 0.55), box(W, 0.03, 1.1, m.stone, 0, yL - 0.015, zL - 0.55))
  out.push(box(0.14, 0.04, 0.04, m.blackSteel, 0, yL + 0.9, zL), box(0.05, r + 0.95, 0.05, m.blackSteel, 0, yL + (r + 0.95) / 2, zL))
  // flight B: back to front on a sloped waist slab (its top 2 r under the nosing line), up into the ceiling
  const a = Math.atan2(r, t)
  const run = 8 * t
  out.push(tilt(box(fw, 0.15, run / Math.cos(a), m.whitePaint, xB, yL - r + (run / 2) * k - 0.075 / Math.cos(a), zL + run / 2), -a))
  const zTop = zL + (STAIR_RISE - 0.05 - yL - r - 0.9) / k // where its rail meets the ceiling
  for (let j = 1; j <= 8; j++) {
    const y = yL + j * r
    const z = zL + (j - 0.5) * t
    out.push(box(fw, 2 * r - 0.03, t, m.whitePaint, xB, y - r - 0.015, z))
    tread(xB, y, z, 1)
    if (z < zTop) baluster(0.05, y, z)
  }
  out.push(box(fw, r, 0.02, m.whitePaint, xB, yL + 8.5 * r, STAIR_D / 2 - 0.01)) // last riser, to the floor above
  rail(0.05, zL, yL + r + 0.9, zTop, STAIR_RISE - 0.05)
  return out
}

// ───────────────────────────── planter bed ─────────────────────────────

/** The polygon moved k inward, edge by edge (a positive loop, as rooms are: core roomInnerPolygon's construction). */
function inset(poly: Pt[], k: number): Pt[] {
  const n = poly.length
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1
    const d = { x: (q.x - p.x) / l, y: (q.y - p.y) / l }
    return { d, o: { x: p.x - d.y * k, y: p.y + d.x * k } }
  })
  return lines.map((b, i) => {
    const a = lines[(i - 1 + n) % n]
    const den = a.d.x * b.d.y - a.d.y * b.d.x
    if (Math.abs(den) < 1e-6) return b.o
    const s = ((b.o.x - a.o.x) * b.d.y - (b.o.y - a.o.y) * b.d.x) / den
    return { x: a.o.x + s * a.d.x, y: a.o.y + s * a.d.y }
  })
}

/**
 * The leaf blades of a scanned leaves mesh: its connected components textured from the atlas's leaf images (the stem
 * strip is the atlas's right edge, u > 0.75), the longest one per image, longest first, each re-posed with its
 * petiole end at the origin, tip up +y at 1 (the tip is its texel nearest the image top: the atlas's leaves stand
 * upright) and face +z (its mean normal).
 */
function blades(src: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const idx = src.index!.array
  const pos = src.attributes.position
  const nor = src.attributes.normal
  const uv = src.attributes.uv
  const root = Array.from({ length: pos.count }, (_, i) => i)
  const find = (i: number) => {
    while (root[i] !== i) i = root[i] = root[root[i]]
    return i
  }
  const seen = new Map<string, number>() // uv seams split a blade's vertices: weld by position
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`
    if (seen.has(k)) root[find(i)] = find(seen.get(k)!)
    else seen.set(k, i)
  }
  for (let t = 0; t < idx.length; t += 3) root[find(idx[t + 1])] = root[find(idx[t + 2])] = find(idx[t])
  const tris = new Map<number, number[]>()
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(idx[t])
    if (!tris.has(r)) tris.set(r, [])
    tris.get(r)!.push(idx[t], idx[t + 1], idx[t + 2])
  }
  const V = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => new THREE.Vector3().fromBufferAttribute(a, i)
  const best = new Map<string, { len: number; geo: THREE.BufferGeometry }>()
  for (const ts of tris.values()) {
    const vs = [...new Set(ts)]
    const u0 = Math.min(...vs.map((i) => uv.getX(i)))
    if (u0 > 0.75) continue
    const c = vs.reduce((s, i) => s.add(V(pos, i)), new THREE.Vector3()).divideScalar(vs.length)
    const tip = V(pos, vs.reduce((a, i) => (uv.getY(i) < uv.getY(a) ? i : a)))
    const y = tip.sub(c)
    const L = y.length()
    y.divideScalar(L)
    const n = vs.reduce((s, i) => s.add(V(nor, i)), new THREE.Vector3())
    const z = n.addScaledVector(y, -n.dot(y)).normalize()
    const x = new THREE.Vector3().crossVectors(y, z)
    const base = c.clone().addScaledVector(y, -0.35 * L) // the petiole meets a heart-shaped blade ~⅓ of the way below its middle
    const s = 1 / (1.35 * L)
    const at = new Map(vs.map((v, k) => [v, k]))
    const P = new Float32Array(vs.length * 3)
    const N = new Float32Array(vs.length * 3)
    const UV = new Float32Array(vs.length * 2)
    vs.forEach((v, k) => {
      const p = V(pos, v).sub(base)
      const m = V(nor, v)
      P.set([p.dot(x) * s, p.dot(y) * s, p.dot(z) * s], 3 * k)
      N.set([m.dot(x), m.dot(y), m.dot(z)], 3 * k)
      UV.set([uv.getX(v), uv.getY(v)], 2 * k)
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2))
    geo.setIndex(ts.map((v) => at.get(v)!))
    const key = `${u0.toFixed(2)},${Math.min(...vs.map((i) => uv.getY(i))).toFixed(2)}`
    if ((best.get(key)?.len ?? 0) < L) best.set(key, { len: L, geo })
  }
  return [...best.values()].sort((a, b) => b.len - a.len).map((b) => b.geo)
}

/** Blade kinds per planter bed: one InstancedMesh (+ its shadow pass) each. */
const LEAF_KINDS = 3
/**
 * Real leaves for the planter beds: the scanned blades of Poly Haven's potted_plant_02 (CC0; the veranda pots' model,
 * so no new download), its own PBR maps (colour, normal, roughness). Leaves are lit on both faces and glow faintly
 * with their own colour (emissive = the colour map): light through a thin leaf, never black in the shade.
 */
const leafMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, emissive: '#4a5a38', metalness: 0 })
let leafGeos: Promise<THREE.BufferGeometry[]> | null = null
function loadLeaves(): Promise<THREE.BufferGeometry[]> {
  return (leafGeos ??= new GLTFLoader().loadAsync('/assets/models/potted_plant_02/potted_plant_02_1k.gltf').then((g) => {
    const src = g.scene.getObjectByName('potted_plant_02_leaves') as THREE.Mesh
    const m = src.material as THREE.MeshStandardMaterial
    Object.assign(leafMat, { map: m.map, emissiveMap: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, roughness: 1 })
    leafMat.needsUpdate = true
    return blades(src.geometry).slice(0, LEAF_KINDS)
  }))
}

/**
 * Planter bed filling a planter strip (the shape is in its id, procedural.meta.ts): a plaster kerb 8 cm wide round the
 * edge up to PLANTER_KERB, dark soil inside it, planted with real leaves (loadLeaves) in two habits:
 * - a mound of leafy clumps on a jittered grid over the soil, each a spray of leaves on (unseen) petioles, low by the
 *   curb onto the veranda (the floor, chairs and pots stay in view) and rising toward the outer parapets to their cap;
 * - trailing strands over each outer parapet every ~0.14 m: a leaf or two across its cap, then leaves hanging tip-down
 *   0.1–0.9 m down its outside face.
 * Leaves are instanced per blade kind (LEAF_KINDS draw calls + their shadow pass) and cast real shadows (they are cut
 * geometry, not alpha cards: no shimmer, no square shadows). Their layout box is set to the bed's (the strands hang
 * outside it) so furniture.ts centres and grounds the bed on its polygon; they appear once the scan has loaded.
 */
function planterBed(id: string): THREE.Object3D[] {
  const { poly, edges } = parsePlanter(id)!
  const m = M()
  const V2 = (p: Pt) => new THREE.Vector2(p.x, -p.y) // plan y → world z after rotateX(−90°)
  const soilPoly = inset(poly, 0.08)
  const ring = new THREE.Shape(poly.map(V2))
  ring.holes.push(new THREE.Path(soilPoly.map(V2)))
  const kerb = new THREE.ExtrudeGeometry(ring, { depth: PLANTER_KERB, bevelEnabled: false }).rotateX(-Math.PI / 2)
  const ySoil = PLANTER_KERB - 0.04
  const soil = new THREE.ShapeGeometry(new THREE.Shape(soilPoly.map(V2))).rotateX(-Math.PI / 2).translate(0, ySoil, 0)
  // leaves: [kind][] of matrix + tint
  const kinds: { m: THREE.Matrix4; v: number }[][] = Array.from({ length: LEAF_KINDS }, () => [])
  const UP = new THREE.Vector3(0, 1, 0)
  let n = 0
  /** A leaf, petiole end at `at`, tip along `d` (unit), `len` m long, face turned toward `face` then rolled about d. */
  const leaf = (at: THREE.Vector3, d: THREE.Vector3, face: THREE.Vector3, roll: number, len: number, v: number) => {
    const z = face.clone().addScaledVector(d, -face.dot(d))
    if (z.lengthSq() < 1e-6) z.set(1, 0, 0)
    z.normalize()
    const x = new THREE.Vector3().crossVectors(d, z)
    z.multiplyScalar(Math.cos(roll)).addScaledVector(x, Math.sin(roll)) // roll about d
    x.crossVectors(d, z)
    const mt = new THREE.Matrix4().makeBasis(x, d, z).scale(new THREE.Vector3(len, len, len)).setPosition(at)
    kinds[Math.floor(rnd(n++, 7.7) * LEAF_KINDS)].push({ m: mt, v })
  }
  const dir = (yaw: number, pitch: number) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  const sides = poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length], ...edges[i] }))
  const outer = sides.filter((e) => e.h > 0)
  const inner = sides.filter((e) => !e.h) // the curb onto a veranda, or the building's wall
  const segDist = (p: Pt, a: Pt, b: Pt) => {
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  // mound: domed clumps every ~0.25 m (a narrow strip still gets a row); 0.26 m tall away from the parapets, rising to ~0.66 m against them, except
  // within 0.4 m of an inner side (by a curb the veranda's floor, chairs and pots stay in view)
  const xs = soilPoly.map((p) => p.x)
  const ys = soilPoly.map((p) => p.y)
  const step = 0.25
  for (let x = Math.min(...xs) + step / 2, i = 0; x < Math.max(...xs); x += step, i++)
    for (let y = Math.min(...ys) + step / 2, j = 0; y < Math.max(...ys); y += step, j++) {
      const p = { x: x + step * 0.7 * (rnd(i, j) - 0.5), y: y + step * 0.7 * (rnd(j, i) - 0.5) }
      if (!pointInPolygon(p, soilPoly)) continue
      const dOut = Math.min(Infinity, ...outer.map((e) => segDist(p, e.a, e.b)))
      const dIn = Math.min(Infinity, ...inner.map((e) => segDist(p, e.a, e.b)))
      const t = Math.max(0, 1 - dOut / 0.75) ** 2 * Math.min(1, dIn / 0.4)
      const H = (0.26 + 0.4 * t) * (0.85 + 0.3 * rnd(i + 2, j))
      const count = 6 + Math.round(4 * t + 3 * rnd(j, i + 4))
      for (let k = 0; k < count; k++) {
        const a = 2 * Math.PI * (k / count + 0.3 * rnd(k, i + j))
        const f = 0.2 + 0.8 * rnd(i + k, j + 1)
        const h = H * f // petiole top above the soil; the high ones near the middle: a dome
        const r = 0.02 + 0.22 * (1 - f) ** 0.7 * (0.5 + 0.5 * rnd(j + k, i + 2))
        const at = new THREE.Vector3(p.x + r * Math.sin(a), ySoil + h, p.y + r * Math.cos(a))
        if (!pointInPolygon({ x: at.x, y: at.z }, poly)) continue
        // blades held out from the clump, the high ones nearer level, the low ones tipped up; faces to the sky
        const pitch = -0.2 + 0.8 * rnd(k, j + 3) - 0.3 * f
        const d = dir(a + 0.5 * (rnd(i, k + 5) - 0.5), pitch)
        const len = 0.12 + 0.08 * rnd(i + 7, k)
        if (!pointInPolygon({ x: at.x + d.x * len, y: at.z + d.z * len }, poly)) continue // into a wall, or over the curb
        leaf(at, d, UP, 0.6 * (rnd(k + 6, i) - 0.5), len, 0.6 + 0.35 * f)
      }
    }
  // trailing strands over the outer parapets
  outer.forEach((e, k) => {
    const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)
    const d = { x: (e.b.x - e.a.x) / L, y: (e.b.y - e.a.y) / L }
    const o = new THREE.Vector3(d.y, 0, -d.x) // outward (rooms are positive loops: inward is (−d.y, d.x))
    const along = new THREE.Vector3(d.x, 0, d.y)
    const count = Math.max(1, Math.floor(L / 0.14))
    for (let i = 0; i < count; i++) {
      if (rnd(i, k + 9) < 0.15) continue
      const u = ((i + 0.5 + 0.7 * (rnd(i, k) - 0.5)) / count) * L
      const at = (off: number, y: number) => new THREE.Vector3(e.a.x + d.x * u + o.x * off, y, e.a.y + d.y * u + o.z * off)
      const side = along.clone().multiplyScalar(0.6 * (rnd(k, i + 1) - 0.5))
      // across the cap: blades lying outward, tips dipping over the outer arris
      for (let c = 0; c < 2; c++)
        leaf(at(-0.04 + e.t * 0.45 * c, e.h + 0.03), o.clone().add(side).setY(-0.15 - 0.2 * c).normalize(), UP, 0.5 * (rnd(i, c + 2) - 0.5), 0.1 + 0.04 * rnd(c, i), 0.85)
      // down the outside face: tip-down blades facing out, smaller and paler toward the strand's end
      const drop = 0.1 + 0.8 * rnd(k + 3, i) ** 1.5
      const leaves = Math.max(1, Math.round(drop / 0.07))
      for (let s = 0; s < leaves; s++) {
        const f = s / leaves
        const sway = 0.03 * Math.sin(7 * f + i)
        const hang = new THREE.Vector3(0, -1, 0).addScaledVector(o, 0.25 + 0.5 * rnd(s, i + k)).addScaledVector(along, 0.6 * (rnd(i + s, k + 4) - 0.5)).normalize()
        const a = at(e.t + 0.025 + 0.03 * rnd(s + 1, i), e.h - 0.02 - f * drop).addScaledVector(along, sway)
        leaf(a, hang, o, 0.8 * (rnd(s, i + 2) - 0.5), (0.12 - 0.05 * f) * (0.8 + 0.4 * rnd(i, s + 3)), 0.75 + 0.25 * f)
      }
    }
  })
  const bed = new THREE.Box3(new THREE.Vector3(Math.min(...poly.map((p) => p.x)), 0, Math.min(...poly.map((p) => p.y))), new THREE.Vector3(Math.max(...poly.map((p) => p.x)), PLANTER_TOP, Math.max(...poly.map((p) => p.y))))
  const tint = new THREE.Color()
  const ims = kinds.map((ls, kind) => {
    const im = new THREE.InstancedMesh(new THREE.BufferGeometry(), leafMat, ls.length)
    ls.forEach(({ m: mt, v }, i) => {
      im.setMatrixAt(i, mt)
      // older blades darker and bluer, young ones yellower: the scan's pale green spread over a mixed bed
      const g = v * (0.8 + 0.3 * rnd(i, kind + 11))
      im.setColorAt(i, tint.setRGB(g * (0.78 + 0.22 * rnd(kind, i)), g, g * (0.7 + 0.2 * rnd(i + 1, kind))))
    })
    im.boundingBox = bed.clone()
    im.userData.solo = true
    im.visible = false // until the scan's blades are in
    return im
  })
  if (typeof globalThis.document?.createElement === 'function')
    loadLeaves()
      .then((geos) =>
        ims.forEach((im, k) => {
          im.geometry = geos[k % geos.length]
          im.boundingSphere = null // recomputed from the real blades (frustum culling)
          im.visible = true
        }),
      )
      .catch((e) => console.warn('[plotline] planter leaves failed to load', e))
  return [mesh(kerb, m.kerb), mesh(soil, m.soil), ...ims.filter((im) => im.count)]
}

/** id → builder at size s (its kit size unless resized); the resizable ones (kit.ts RESIZE) rebuild at any size in their limits. */
const BUILDERS: Record<string, (s: Size3) => THREE.Object3D[]> = {
  // mattress = width − the headboard's 16 cm
  ...Object.fromEntries(BED_STYLES.flatMap((st) => [`bed_queen${st}`, `bed_single${st}`].map((id) => [id, (s: Size3) => bed(s.x - 0.16, st)]))),
  bedside_oak: bedside,
  cushions_plain: cushionsPlain,
  sofa_3seat: () => sofa(2.2),
  sofa_2seat: () => sofa(1.6),
  dining_table: diningTable,
  dining_chair: diningChair,
  desk_oak: desk,
  tv_55: () => tv(true),
  tv_55_wall: () => tv(false),
  rug_rect_large: (s) => rug(s.x, s.z, M().rugIvory),
  rug_rect_small: (s) => rug(s.x, s.z, M().rugOat),
  rug_round: () => [cyl(1.0, 0.012, M().rugStone, 0, 0.006, 0)],
  kitchen_counter: counter,
  kitchen_counter_styled: counterStyled,
  kitchen_tall: tall,
  kitchen_sink: sink,
  kitchen_hob: hob,
  kitchen_upper: upper,
  kitchen_hood: hood,
  fridge,
  toilet,
  vanity,
  basin,
  shower_screen: shower,
  ceiling_light: () => ceilingLight(0.38, 0.085),
  ceiling_light_large: () => ceilingLight(0.5, 0.09),
  ac_split: acSplit,
  wardrobe_tall: wardrobe,
  wardrobe_2door: wardrobe,
  closet_rail: closetRail,
  closet_rail_s: closetRail,
  cot: () => cot(1.9, 0.7),
  cot_s: () => cot(1.7, 0.65),
  hook_rail: hookRail,
  ...Object.fromEntries(STAIR_W.map((w) => [stairId(w), () => stair(w)])),
  ...Object.fromEntries(ART.map((id) => [id, () => artFrame(ART_PHOTO.includes(id.slice(0, -2)) ? print(`/assets/art/${id}.jpg`) : painted(id))])),
}

/** The piece at `size` (a resized placement's sizeM), else at its kit size. */
export function buildProcedural(id: string, size?: Size3): THREE.Group | null {
  const parts = BUILDERS[id]?.(size ?? PROCEDURAL[id].sizeM) ?? (id.startsWith(PLANTER) ? planterBed(id) : undefined)
  return parts ? finish(parts) : null
}
