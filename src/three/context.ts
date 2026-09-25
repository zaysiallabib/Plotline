/**
 * What a photo of the flat shows that the plan doesn't draw: soft contact shadows under
 * floor-standing furniture, and a plain street outside the windows (neighbour blocks, a
 * road, haze). Rule-based from the unit alone, so any traced plan gets them. Pure layout
 * (tested in context.test.ts) + the three builders Look (render.ts) adds per unit.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Pt, Unit } from '../core'
import { kitAsset, type KitCategory } from '../furnish/kit'
import { footprint } from '../furnish/presets'

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

// ───────────────────────────── contact shadows ─────────────────────────────

export interface ContactShadow {
  /** the placement it grounds */
  id: string
  /** plan footprint the shadow hugs */
  quad: Pt[]
  /** Gaussian falloff σ, metres */
  blurM: number
  /** darkening under the piece, 0..1 */
  strength: number
}

/** Up on legs: the floor shows under them, so a lighter, wider shadow. Everything else stands solid on the floor. */
const LEGGED: KitCategory[] = ['bedside', 'armchair', 'coffee-table', 'dining-table', 'dining-chair', 'desk', 'chair', 'bath']
/** The pot, not the leaves / shade. */
const POTS: KitCategory[] = ['plant', 'lamp']

/** One soft shadow per floor-standing placement; rugs and wall-, ceiling- or shelf-mounted pieces get none. */
export function contactShadows(unit: Unit): ContactShadow[] {
  const out: ContactShadow[] = []
  for (const p of unit.furniture) {
    const a = kitAsset(p.assetId)
    if (!a || a.category === 'rug' || (a.mount ?? 'floor') !== 'floor' || (a.mountY ?? 0) > 0.05) continue
    const s = p.scale ?? 1
    const legged = LEGGED.includes(a.category)
    const pot = POTS.includes(a.category) ? 0.45 * Math.min(a.sizeM.x, a.sizeM.z) * s : 0
    // a taller piece hides more of the sky from the floor around it: the falloff widens with height (a coffee
    // table ~10 cm, a wardrobe ~50 cm). Solid pieces grow by σ/2 so the base edge sits in the dark part (≈ 55 %);
    // legged ones are a diffuse patch under the whole footprint.
    const blurM = Math.min(0.25, Math.max(0.05, 0.25 * (pot || a.sizeM.y * s)))
    const grow = legged ? 0 : blurM
    const size = pot ? { x: pot + grow, z: pot + grow } : { x: a.sizeM.x * s + grow, z: a.sizeM.z * s + grow }
    out.push({ id: p.id, quad: footprint(p, p.rotationDeg, size), blurM, strength: legged ? 0.45 : 0.8 })
  }
  return out
}

/** Metres per texel of the shadow texture. */
const PX = 0.02

/**
 * All of a unit's contact shadows on one floor-level plane: a canvas mask (blurred footprints, overlaps take the
 * darker one instead of doubling up, so a kitchen run stays even) as the alpha of a black, depth-test-only decal.
 * 14 mm up so it also lies on the 12 mm rugs. One draw call, not pickable (Look's group), works in XR.
 */
export function buildContactShadows(unit: Unit, bounds: Bounds): THREE.Mesh | null {
  const list = contactShadows(unit)
  if (!list.length) return null
  const x0 = bounds.minX - 0.5
  const y0 = bounds.minY - 0.5
  const w = Math.ceil((bounds.maxX - bounds.minX + 1) / PX)
  const h = Math.ceil((bounds.maxY - bounds.minY + 1) / PX)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillRect(0, 0, w, h) // black = no shadow
  ctx.globalCompositeOperation = 'lighten'
  // each shape is filled off-canvas and only its blurred shadow lands (canvas `filter` is not in every browser)
  const off = w + 1000
  ctx.shadowOffsetX = off
  for (const s of list) {
    const v = Math.round(255 * s.strength)
    ctx.shadowColor = `rgb(${v},${v},${v})`
    ctx.shadowBlur = (2 * s.blurM) / PX // shadowBlur = 2σ
    ctx.beginPath()
    for (const p of s.quad) ctx.lineTo((p.x - x0) / PX - off, (p.y - y0) / PX)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas) // row 0 = plan minY = world −Z edge of the plane below
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * PX, h * PX).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: tex, transparent: true, depthWrite: false }),
  )
  mesh.position.set(x0 + (w * PX) / 2, 0.014, y0 + (h * PX) / 2)
  return mesh
}

// ───────────────────────────── street context ─────────────────────────────

/** One plain residential block, plan metres (x0 < x1, y0 < y1). */
export interface Block {
  x0: number
  x1: number
  y0: number
  y1: number
  storeys: number
  /** index into TINTS */
  tint: number
  /** index into FACADES */
  facade: number
}

export const STOREY = 3.2
/** facade bay: one window per bay and storey */
export const BAY = 3.6
/** × the facade texture's plaster: washed off-white to weathered grey-beige, Dhaka apartment blocks, "plain" */
const TINTS = ['#ffffff', '#efece7', '#e9e1d3', '#dededc', '#d4ccbf']

/** Deterministic PRNG in [0, 1) (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rect = Pick<Block, 'x0' | 'x1' | 'y0' | 'y1'>

/**
 * Blocks around the unit's box: a near ring 8–25 m off each side (6–10 storeys, 2–6 bays wide, 3–9 m gaps)
 * and a far ring 40–60 m off for depth. The rows off the box's minY/maxY sides run 40–70 m past its ends and cover
 * the diagonals; the rows off minX/maxX stay within its y span ± 6 m, so no two rows ever cross.
 * The road runs down the middle of the wider minY/maxY setback; the minX/maxX rows stop short of it.
 */
export function neighbourBlocks(b: Bounds, seed: number): { blocks: Block[]; road: Rect } {
  const r = rng(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * r()
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))
  const near = [0, 1, 2, 3].map(() => between(8, 25))
  const s = near[1] > near[0] ? 1 : 0
  const c = s ? b.maxY + near[1] / 2 : b.minY - near[0] / 2
  const half = Math.min(3.5, near[s] / 2 - 1)
  const road = { x0: b.minX - 80, x1: b.maxX + 80, y0: c - half, y1: c + half }
  const blocks: Block[] = []
  for (const ring of [0, 1]) {
    for (let side = 0; side < 4; side++) {
      const d = ring ? between(40, 60) : near[side]
      const alongY = side >= 2 // sides 0/1: off minY/maxY, rows run along x; 2/3: off minX/maxX, along y
      const reach = ring ? 70 : 40
      const [t0, t1] = alongY ? [s ? b.minY - 6 : Math.max(b.minY - 6, road.y1 + 1), s ? Math.min(b.maxY + 6, road.y0 - 1) : b.maxY + 6] : [b.minX - reach, b.maxX + reach]
      for (let t = t0 + between(0, 2); t1 - t >= 2 * BAY; ) {
        const w = BAY * int(2, Math.min(6, Math.floor((t1 - t) / BAY)))
        const depth = BAY * int(3, 4)
        const base = alongY ? (side % 2 ? b.maxX : b.minX) : side % 2 ? b.maxY : b.minY
        const [n0, n1] = side % 2 ? [base + d, base + d + depth] : [base - d - depth, base - d] // away from the box
        const k = { storeys: int(6, 10), tint: int(0, TINTS.length - 1), facade: int(0, FACADES.length - 1) }
        blocks.push(alongY ? { x0: n0, x1: n1, y0: t, y1: t + w, ...k } : { x0: t, x1: t + w, y0: n0, y1: n1, ...k })
        t += w + between(3, 9)
      }
    }
  }
  return { blocks, road }
}

/** Sky radiance at the horizon of public/assets/hdri/sky.hdr (mean over altitude −2°..6°, linear). */
const HORIZON = new THREE.Color(0.62, 0.67, 0.74)
/** Extinction per metre: 1 − e^(−βd) of the colour is haze. 0.004 ≈ 1 km visibility, a clear-ish Dhaka day. */
const HAZE_BETA = 0.004
/** ...and all of it by the camera's far plane (300 m), so the ground has no hard edge against the sky. */
const FADE_M = [120, 280]
/** Haze colour, shared by every hazed material; Look.setHour tints it with the sky. */
export const haze = { value: HORIZON.clone() }
export const setHaze = (skyTint: THREE.Color) => haze.value.copy(HORIZON).multiply(skyTint)

/** Distance haze on one material (the street context, the ground), before tone mapping. */
export function hazed<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (s) => {
    s.uniforms.hazeColor = haze
    // before tone mapping: linear in both paths (composer target, and XR where the shader tone maps)
    s.fragmentShader = `uniform vec3 hazeColor;\n${s.fragmentShader}`.replace(
      '#include <tonemapping_fragment>',
      `float hazeD = length(vViewPosition);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, max(1.0 - exp(-${HAZE_BETA} * hazeD), smoothstep(${FADE_M[0]}.0, ${FADE_M[1]}.0, hazeD)));
      #include <tonemapping_fragment>`,
    )
  }
  return m
}

type Paint = [colour: string, u0: number, v0: number, u1: number, v1: number]
/**
 * Facade variants, one bay × one storey each (u along the facade, v up from the storey floor, metres), drawn over
 * weathered plaster at albedo ≈ 0.45 (brighter blew out to cream in full sun). (0.3, 1.6) stays plain plaster in
 * every variant: roofs and blockParts sample it.
 */
export const FACADES: Paint[][] = [
  // sash: a 1.5 × 1.3 m window with a frame and sill
  [['#c4c3bf', 1.0, 0.86, 2.6, 2.26], ['#3b4247', 1.05, 0.92, 2.55, 2.2], ['#7c8387', 1.78, 0.92, 1.82, 2.2], ['#cac7c1', 0.95, 0.84, 2.65, 0.9]],
  // ribbon: a 2.4 m three-pane window under a concrete sunshade (chajja) with a soft shadow line
  [
    ['#c4c3bf', 0.6, 0.86, 3.0, 2.2], ['#3b4247', 0.65, 0.92, 2.95, 2.14], ['#7c8387', 1.43, 0.92, 1.47, 2.14], ['#7c8387', 2.18, 0.92, 2.22, 2.14],
    ['#cac7c1', 0.55, 0.84, 3.05, 0.9], ['#8f8a83', 0.45, 2.2, 3.15, 2.32], ['#cfccc6', 0.45, 2.32, 3.15, 2.44],
  ],
  // balcony: a 1.0 m window and a door-height opening behind the balcony parapet (slab + parapet: blockParts)
  [['#c4c3bf', 0.5, 0.96, 1.5, 2.26], ['#3b4247', 0.55, 1.02, 1.45, 2.2], ['#cac7c1', 0.45, 0.94, 1.55, 1.0], ['#c4c3bf', 1.9, 0.18, 3.0, 2.3], ['#2f3437', 1.95, 0.18, 2.95, 2.25]],
]

const facades: THREE.CanvasTexture[] = []
function facadeTexture(variant: number): THREE.CanvasTexture {
  if (facades[variant]) return facades[variant]
  const px = 36 // per metre
  const c = document.createElement('canvas')
  c.width = BAY * px
  c.height = STOREY * px
  const g = c.getContext('2d')!
  const rect = (col: string, u0: number, v0: number, u1: number, v1: number) => {
    g.fillStyle = col
    g.fillRect(u0 * px, c.height - v1 * px, (u1 - u0) * px, (v1 - v0) * px) // v up from the storey's floor
  }
  rect('#b9b5ae', 0, 0, BAY, STOREY)
  rect('#a29e97', 0, 0, BAY, 0.18) // slab edge
  for (const r of FACADES[variant]) rect(...r)
  const t = (facades[variant] = new THREE.CanvasTexture(c))
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / BAY, 1 / STOREY)
  t.anisotropy = 8
  return t
}

/** A box on a block: plan x/y, height z above the ground; `shade` × the block's tint; a tank is a cylinder in it. */
export interface Part {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
  shade: number
  tank?: boolean
}

/**
 * What a plain Dhaka block has besides windows: a roof parapet, the stair/lift head room with black water tanks on
 * it, outdoor AC units under some windows and, on balcony blocks (facade 2), a slab + parapet at every bay's door.
 * Facade parts only on the faces that look toward `at` (the others are never seen), none on the ground storey (parking).
 */
export function blockParts(k: Block, at: Pt, r: () => number): Part[] {
  const H = k.storeys * STOREY
  const T = 0.15
  const parts: Part[] = [
    { x0: k.x0, x1: k.x1, y0: k.y0, y1: k.y0 + T, z0: H, z1: H + 1, shade: 1 },
    { x0: k.x0, x1: k.x1, y0: k.y1 - T, y1: k.y1, z0: H, z1: H + 1, shade: 1 },
    { x0: k.x0, x1: k.x0 + T, y0: k.y0 + T, y1: k.y1 - T, z0: H, z1: H + 1, shade: 1 },
    { x0: k.x1 - T, x1: k.x1, y0: k.y0 + T, y1: k.y1 - T, z0: H, z1: H + 1, shade: 1 },
  ]
  const hx = k.x0 + 1 + r() * (k.x1 - k.x0 - 5.6)
  const hy = k.y0 + 1 + r() * (k.y1 - k.y0 - 5)
  parts.push({ x0: hx, x1: hx + 3.6, y0: hy, y1: hy + 3, z0: H, z1: H + 2.8, shade: 0.95 })
  for (let i = 0, n = 1 + Math.floor(2 * r()); i < n; i++) {
    parts.push({ x0: hx + 0.3 + 1.6 * i, x1: hx + 1.4 + 1.6 * i, y0: hy + 0.9, y1: hy + 2, z0: H + 2.8, z1: H + 4, shade: 0.12, tank: true })
  }
  const faces = [
    { n: [0, -1], o: [k.x0, k.y0], d: [1, 0], len: k.x1 - k.x0 },
    { n: [0, 1], o: [k.x0, k.y1], d: [1, 0], len: k.x1 - k.x0 },
    { n: [-1, 0], o: [k.x0, k.y0], d: [0, 1], len: k.y1 - k.y0 },
    { n: [1, 0], o: [k.x1, k.y0], d: [0, 1], len: k.y1 - k.y0 },
  ]
  for (const { n, o, d, len } of faces) {
    if ((at.x - o[0] - (d[0] * len) / 2) * n[0] + (at.y - o[1] - (d[1] * len) / 2) * n[1] <= 0) continue
    // u along the face from the block corner (= the facade texture's u), w out from the wall
    const box = (u0: number, u1: number, z0: number, z1: number, w0: number, w1: number, shade: number) => {
      const xs = [o[0] + d[0] * u0 + n[0] * w0, o[0] + d[0] * u1 + n[0] * w1]
      const ys = [o[1] + d[1] * u0 + n[1] * w0, o[1] + d[1] * u1 + n[1] * w1]
      parts.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0, z1, shade })
    }
    for (let b = 0; b + BAY <= len + 1e-6; b += BAY) {
      for (let s = 1; s < k.storeys; s++) {
        const z = s * STOREY
        if (k.facade === 2) {
          box(b + 1.6, b + 3.3, z + 0.06, z + 0.18, 0, 0.9, 0.9) // slab
          box(b + 1.6, b + 3.3, z + 0.18, z + 1.15, 0.8, 0.9, 1) // parapet
          box(b + 1.6, b + 1.7, z + 0.18, z + 1.15, 0, 0.8, 1)
          box(b + 3.2, b + 3.3, z + 0.18, z + 1.15, 0, 0.8, 1)
        } else if (r() < 0.3) box(b + 1.4, b + 2.2, z + 0.25, z + 0.8, 0, 0.3, 1.25) // outdoor AC unit under the window
      }
    }
  }
  return parts
}

/**
 * The street context in world space: blocks (one merged mesh per facade variant, a tint per block in vertex colours,
 * the facade in metre UVs, roofs and parts on the plain plaster texel) and the road, standing on `groundY`.
 * Neither casts nor receives shadow: they must never shade the unit, and the sun's shadow map only covers the unit.
 */
export function buildStreet(unit: Unit, bounds: Bounds, groundY: number): THREE.Group {
  const seed = [...unit.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const { blocks, road } = neighbourBlocks(bounds, seed)
  const at = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  const tints = TINTS.map((t) => new THREE.Color(t))
  /** non-indexed and painted: a facade keeps metre UVs on its walls (along-face from the corner, height), the rest samples the plain texel */
  const paint = (geo: THREE.BufferGeometry, c: THREE.Color, facade: boolean) => {
    const g = geo.toNonIndexed()
    geo.dispose()
    const p = g.attributes.position
    const n = g.attributes.normal
    const uv = g.attributes.uv
    const col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      if (!facade || Math.abs(n.getY(i)) > 0.5) uv.setXY(i, 0.3, 1.6)
      else uv.setXY(i, Math.abs(n.getZ(i)) > 0.5 ? p.getX(i) : p.getZ(i), p.getY(i))
      col.set([c.r, c.g, c.b], i * 3)
    }
    return g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  const geos: THREE.BufferGeometry[][] = FACADES.map(() => [])
  blocks.forEach((k, i) => {
    const [W, H, D] = [k.x1 - k.x0, k.storeys * STOREY, k.y1 - k.y0]
    const tint = tints[k.tint]
    geos[k.facade].push(paint(new THREE.BoxGeometry(W, H, D).translate(W / 2, H / 2, D / 2), tint, true).translate(k.x0, groundY, k.y0))
    for (const q of blockParts(k, at, rng(seed + i + 1))) {
      const [w, h, d] = [q.x1 - q.x0, q.z1 - q.z0, q.y1 - q.y0]
      const g = q.tank ? new THREE.CylinderGeometry(w / 2, w / 2, h, 10) : new THREE.BoxGeometry(w, h, d)
      geos[k.facade].push(paint(g, tint.clone().multiplyScalar(q.shade), false).translate((q.x0 + q.x1) / 2, groundY + (q.z0 + q.z1) / 2, (q.y0 + q.y1) / 2))
    }
  })
  const group = new THREE.Group()
  geos.forEach((list, v) => {
    if (!list.length) return
    group.add(new THREE.Mesh(mergeGeometries(list)!, hazed(new THREE.MeshStandardMaterial({ map: facadeTexture(v), vertexColors: true, roughness: 0.92 }))))
    list.forEach((g) => g.dispose())
  })
  const asphalt = hazed(new THREE.MeshStandardMaterial({ color: '#5b5955', roughness: 0.95 }))
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(road.x1 - road.x0, road.y1 - road.y0).rotateX(-Math.PI / 2), asphalt)
  strip.position.set((road.x0 + road.x1) / 2, groundY + 0.05, (road.y0 + road.y1) / 2)
  group.add(strip)
  return group
}
