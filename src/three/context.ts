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
  /** darkening under the piece, 0..1 (≈ half of it at the footprint edge) */
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
    // table ~10 cm, a wardrobe ~50 cm). Solid pieces grow by σ/2 so the base edge sits in the dark part (≈ 45 %);
    // legged ones are a diffuse patch under the whole footprint.
    const blurM = Math.min(0.25, Math.max(0.05, 0.25 * (pot || a.sizeM.y * s)))
    const grow = legged ? 0 : blurM
    const size = pot ? { x: pot + grow, z: pot + grow } : { x: a.sizeM.x * s + grow, z: a.sizeM.z * s + grow }
    out.push({ id: p.id, quad: footprint(p, p.rotationDeg, size), blurM, strength: legged ? 0.35 : 0.65 })
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
        const k = { storeys: int(6, 10), tint: int(0, TINTS.length - 1) }
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
      `gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, 1.0 - exp(-${HAZE_BETA} * length(vViewPosition)));\n#include <tonemapping_fragment>`,
    )
  }
  return m
}

let facade: THREE.CanvasTexture | null = null
/** One bay × one storey of plain facade: plaster, a slab band, a 1.5 × 1.3 m window with a frame and sill. */
function facadeTexture(): THREE.CanvasTexture {
  if (facade) return facade
  const px = 36 // per metre
  const c = document.createElement('canvas')
  c.width = BAY * px
  c.height = STOREY * px
  const g = c.getContext('2d')!
  const rect = (col: string, u0: number, v0: number, u1: number, v1: number) => {
    g.fillStyle = col
    g.fillRect(u0 * px, c.height - v1 * px, (u1 - u0) * px, (v1 - v0) * px) // v up from the storey's floor
  }
  // weathered plaster at albedo ≈ 0.45: brighter blew out to cream in full sun
  rect('#b9b5ae', 0, 0, BAY, STOREY)
  rect('#a29e97', 0, 0, BAY, 0.18) // slab edge
  rect('#c4c3bf', 1.0, 0.86, 2.6, 2.26) // frame
  rect('#3b4247', 1.05, 0.92, 2.55, 2.2) // glass
  rect('#7c8387', 1.78, 0.92, 1.82, 2.2) // sash meeting rail
  rect('#cac7c1', 0.95, 0.84, 2.65, 0.9) // sill
  facade = new THREE.CanvasTexture(c)
  facade.colorSpace = THREE.SRGBColorSpace
  facade.wrapS = facade.wrapT = THREE.RepeatWrapping
  facade.repeat.set(1 / BAY, 1 / STOREY)
  facade.anisotropy = 8
  return facade
}

/**
 * The street context in world space: blocks (one merged mesh, a tint per block in vertex colours, a facade grid
 * in metre UVs) and the road, standing on `groundY`. Neither casts nor receives shadow: they must never shade the
 * unit, and the sun's shadow map only covers the unit anyway.
 */
export function buildStreet(unit: Unit, bounds: Bounds, groundY: number): THREE.Group {
  const seed = [...unit.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const { blocks, road } = neighbourBlocks(bounds, seed)
  const tints = TINTS.map((t) => new THREE.Color(t))
  const geos = blocks.map((k) => {
    const [W, H, D] = [k.x1 - k.x0, k.storeys * STOREY, k.y1 - k.y0]
    const g = new THREE.BoxGeometry(W, H, D).toNonIndexed().translate(W / 2, H / 2, D / 2)
    const p = g.attributes.position
    const n = g.attributes.normal
    const uv = g.attributes.uv
    const col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      // walls: along-face metres from the block corner (whole bays), height from the ground; roofs: a plain plaster texel
      if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, 0.3, 1.6)
      else uv.setXY(i, Math.abs(n.getZ(i)) > 0.5 ? p.getX(i) : p.getZ(i), p.getY(i))
      col.set([tints[k.tint].r, tints[k.tint].g, tints[k.tint].b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g.translate(k.x0, groundY, k.y0)
  })
  const group = new THREE.Group()
  const mat = hazed(new THREE.MeshStandardMaterial({ map: facadeTexture(), vertexColors: true, roughness: 0.92 }))
  group.add(new THREE.Mesh(mergeGeometries(geos)!, mat))
  geos.forEach((g) => g.dispose())
  const asphalt = hazed(new THREE.MeshStandardMaterial({ color: '#5b5955', roughness: 0.95 }))
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(road.x1 - road.x0, road.y1 - road.y0).rotateX(-Math.PI / 2), asphalt)
  strip.position.set((road.x0 + road.x1) / 2, groundY + 0.05, (road.y0 + road.y1) / 2)
  group.add(strip)
  return group
}
