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
import { Reflector } from 'three/addons/objects/Reflector.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CLEAR_GLASS } from '../three/openings'
import { TEXTURES } from './textures'
import type { ObjectKind } from './kit'
import { ART, ART_H, ART_PHOTO, ART_W, BED_STYLES, STAIR_D, STAIR_RISE, STAIR_W, stairId } from './procedural.meta'

export { PROCEDURAL } from './procedural.meta'

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
    out.push(rbox(0.03, 0.26, 0.62, 0.012, m.throwSage, w / 2 + 0.075, 0.49, D / 2 - 0.34))
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

/** Seat cushions top out at 0.45 m: throw_pillows_01's mountY in kit.ts sits them on it. */
function sofa(): THREE.Mesh[] {
  const m = M()
  const W = 2.2
  const D = 0.92
  const zB = -D / 2
  const inner = W - 0.4
  const out: THREE.Mesh[] = []
  for (const x of [-(W / 2 - 0.08), W / 2 - 0.08]) for (const z of [zB + 0.08, D / 2 - 0.08]) out.push(cyl(0.016, 0.12, m.oak, x, 0.06, z, 0.022))
  for (const x of [-(W / 2 - 0.1), W / 2 - 0.1]) out.push(rbox(0.2, 0.62, D, 0.06, m.sofa, x, 0.43, 0)) // arms 0.12–0.74
  out.push(rbox(inner + 0.04, 0.7, 0.2, 0.05, m.sofa, 0, 0.47, zB + 0.1)) // back frame 0.12–0.82
  out.push(rbox(inner, 0.2, D - 0.2, 0.03, m.sofa, 0, 0.22, zB + 0.2 + (D - 0.2) / 2)) // seat base
  const cw = inner / 3
  for (let i = 0; i < 3; i++) {
    const x = -inner / 2 + cw * (i + 0.5)
    out.push(rbox(cw - 0.012, 0.13, D - 0.22, 0.05, m.sofa, x, 0.385, zB + 0.21 + (D - 0.22) / 2)) // seat cushions to 0.45
    out.push(tilt(rbox(cw - 0.012, 0.4, 0.17, 0.07, m.sofa, x, 0.61, zB + 0.29), -0.1)) // back cushions
  }
  return out
}

function diningTable(): THREE.Mesh[] {
  const m = M()
  const out = [rbox(1.6, 0.04, 0.9, 0.012, m.oak, 0, 0.73, 0), box(1.42, 0.07, 0.72, m.oak, 0, 0.675, 0)]
  for (const x of [-0.71, 0.71]) for (const z of [-0.36, 0.36]) out.push(box(0.045, 0.71, 0.045, m.blackSteel, x, 0.355, z))
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

function desk(): THREE.Mesh[] {
  const m = M()
  const out = [rbox(1.4, 0.03, 0.7, 0.008, m.oak, 0, 0.735, 0), box(1.29, 0.03, 0.03, m.blackSteel, 0, 0.6, -0.3)]
  for (const x of [-0.66, 0.66]) {
    for (const z of [-0.3, 0.3]) out.push(box(0.03, 0.72, 0.03, m.blackSteel, x, 0.36, z))
    for (const y of [0.015, 0.705]) out.push(box(0.03, 0.03, 0.63, m.blackSteel, x, y, 0))
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

/** Tall larder: oak carcass to 2.15 m (the wall cabinets' top line), two doors, bar handles either side of the split. */
function tall(): THREE.Mesh[] {
  const m = M()
  return [
    box(0.6, 0.1, 0.54, m.dark, 0, 0.05, -0.02), // plinth
    box(0.6, 2.05, 0.6, m.oak, 0, 1.125, -0.01), // carcass 0.1–2.15
    box(0.594, 1.297, 0.02, m.oak, 0, 0.7515, 0.3), // lower door 0.103–1.4
    box(0.594, 0.741, 0.02, m.oak, 0, 1.7765, 0.3), // upper door 1.406–2.147
    box(0.012, 0.3, 0.02, m.steel, -0.25, 1.22, 0.32),
    box(0.012, 0.3, 0.02, m.steel, -0.25, 1.59, 0.32),
  ]
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
 * Bottom-freezer fridge: satin-grey body with rounded edges, brushed-steel doors on a dark gasket with a 6 mm gap
 * between them, full-length bar handles on the free side (+x: inCorner puts the wall on −x, the hinge side), a
 * black hinge cover on top, a recessed plinth grille on levelling feet. Bounds exactly 0.7 × 1.8 × 0.7.
 */
function fridge(): THREE.Mesh[] {
  const m = M()
  const zf = 0.27 // body front: gasket 0.27–0.28, doors 0.28–0.32, stand-offs to 0.33, handles to 0.35
  const out = [
    rbox(0.7, 1.73, 0.62, 0.03, m.fridgeBody, 0, 0.93, zf - 0.31), // body 0.065–1.795, back at −0.35
    box(0.64, 0.065, 0.5, m.dark, 0, 0.0325, -0.04), // plinth grille, 60 mm behind the body front
    box(0.68, 1.71, 0.01, m.dark, 0, 0.935, zf + 0.005), // door gasket
    rbox(0.7, 1.05, 0.04, 0.015, m.applianceSteel, 0, 1.265, zf + 0.03), // fridge door 0.74–1.79
    rbox(0.7, 0.665, 0.04, 0.015, m.applianceSteel, 0, 0.4025, zf + 0.03), // freezer door 0.07–0.735
    box(0.12, 0.005, 0.05, m.dark, -0.27, 1.7975, zf + 0.025), // hinge cover to 1.8
  ]
  for (const x of [-0.3, 0.3]) out.push(cyl(0.016, 0.065, m.dark, x, 0.0325, 0.24)) // levelling feet
  for (const [y0, y1] of [[0.95, 1.6], [0.45, 0.68]]) {
    out.push(rbox(0.022, y1 - y0, 0.02, 0.008, m.steel, 0.3, (y0 + y1) / 2, zf + 0.07))
    for (const y of [y0 + 0.04, y1 - 0.04]) out.push(box(0.014, 0.014, 0.01, m.steel, 0.3, y, zf + 0.055))
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

/** Oak wardrobe of n 0.6 m doors (3 mm shadow gaps) on a recessed plinth; bar handles either side of the first split. */
function wardrobe(n: number): THREE.Mesh[] {
  const m = M()
  const W = 0.6 * n
  const out = [box(W, 2.14, 0.58, m.oak, 0, 1.13, -0.01), box(W - 0.04, 0.06, 0.52, m.dark, 0, 0.03, -0.02)]
  for (let i = 0; i < n; i++) out.push(box(0.596, 2.12, 0.02, m.oak, -W / 2 + 0.3 + 0.6 * i, 1.13, 0.29))
  for (const x of n === 3 ? [-0.33, -0.27, 0.33] : [-0.03, 0.03]) out.push(box(0.012, 0.6, 0.02, m.steel, x, 1.1, 0.31))
  return out
}

/**
 * Open closet unit W wide: oak end panels, cap and shoe shelf, a top shelf with folded stacks, a steel rail with
 * clothes hanging end-on (shirts and dresses in the linen palette, a few gaps). Back open to the wall.
 */
function closetRail(W: number): THREE.Mesh[] {
  const m = M()
  const D = 0.55
  const fab = [m.linen, m.cushionOat, m.cushionTaupe, m.chair]
  const out = [box(W - 0.036, 0.018, D - 0.02, m.oak, 0, 2.091, 0), box(W - 0.036, 0.018, D - 0.02, m.oak, 0, 1.79, 0)]
  out.push(box(W - 0.036, 0.018, D - 0.02, m.oak, 0, 0.14, 0), box(W - 0.036, 0.13, 0.018, m.dark, 0, 0.065, D / 2 - 0.05))
  for (const s of [-1, 1]) out.push(box(0.018, 2.1, D, m.oak, s * (W / 2 - 0.009), 1.05, 0))
  out.push(cyl(0.012, W - 0.04, m.steel, 0, 1.7, 0).rotateZ(Math.PI / 2))
  for (let x = -W / 2 + 0.08, i = 0; x < W / 2 - 0.06; x += 0.075, i++) {
    if (rnd(i, W) > 0.82) continue
    const L = 0.62 + 0.4 * rnd(W, i) // shirt … dress
    const d = 0.38 + 0.08 * rnd(i, 2)
    const g = rbox(0.03 + 0.03 * rnd(3, i), L, d, 0.012, fab[Math.floor(rnd(i, 7) * fab.length)], x, 1.64 - L / 2, 0)
    g.rotation.y = 0.16 * (rnd(i, 11) - 0.5)
    // oak hanger: a bar across the shoulders, a steel hook over the rail
    const h = box(0.012, 0.018, d - 0.04, m.oak, x, 1.65, 0)
    h.rotation.y = g.rotation.y
    out.push(g, h, cyl(0.004, 0.06, m.steel, x, 1.69, 0))
  }
  for (let x = -W / 2 + 0.22; x < W / 2 - 0.15; x += 0.42) {
    const h = 0.08 + 0.1 * rnd(x, 3)
    out.push(rbox(0.32, h, 0.3, 0.02, fab[Math.floor(rnd(x, 5) * fab.length)], x, 1.8 + h / 2, 0))
  }
  return out
}

/**
 * An L × W cot (chouki; 1.9 × 0.7, short 1.7 × 0.65), long side along x, head at −x: a teak-stained frame (legs, aprons,
 * a plank top whose dark edge shows round the mattress), a 12 cm mattress in a mist-blue cotton sheet, a plump white
 * pillow, a terracotta blanket folded at the foot. (It read as a white plank: an untextured off-white 8 cm slab, the
 * walls' own value, with a 5 cm pillow and a 4 cm blanket lying flat on it.)
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
  out.push(rbox(0.46, 0.045, W - 0.12, 0.018, m.throw, L / 2 - 0.3, 0.4725, 0), rbox(0.4, 0.04, W - 0.16, 0.016, m.throw, L / 2 - 0.32, 0.515, 0))
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

const BUILDERS: Record<string, () => THREE.Object3D[]> = {
  ...Object.fromEntries(BED_STYLES.flatMap((st) => [[`bed_queen${st}`, () => bed(1.6, st)], [`bed_single${st}`, () => bed(1.0, st)]])),
  bedside_oak: bedside,
  cushions_plain: cushionsPlain,
  sofa_3seat: sofa,
  dining_table: diningTable,
  dining_chair: diningChair,
  desk_oak: desk,
  tv_55: () => tv(true),
  tv_55_wall: () => tv(false),
  rug_rect_large: () => rug(3.0, 2.0, M().rugIvory),
  rug_rect_small: () => rug(2.3, 1.6, M().rugOat),
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
  wardrobe_tall: () => wardrobe(3),
  wardrobe_2door: () => wardrobe(2),
  closet_rail: () => closetRail(1.8),
  closet_rail_s: () => closetRail(1.2),
  cot: () => cot(1.9, 0.7),
  cot_s: () => cot(1.7, 0.65),
  hook_rail: hookRail,
  ...Object.fromEntries(STAIR_W.map((w) => [stairId(w), () => stair(w)])),
  ...Object.fromEntries(ART.map((id) => [id, () => artFrame(ART_PHOTO.includes(id.slice(0, -2)) ? print(`/assets/art/${id}.jpg`) : painted(id))])),
}

export function buildProcedural(id: string): THREE.Group | null {
  const parts = BUILDERS[id]?.()
  return parts ? finish(parts) : null
}
