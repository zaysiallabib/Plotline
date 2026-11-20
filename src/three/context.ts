/**
 * What a photo of the flat shows that the plan doesn't draw: soft contact shadows under
 * floor-standing furniture, and a plain street outside the windows (neighbour blocks, a
 * road, haze). Rule-based from the unit alone, so any traced plan gets them. Pure layout
 * (tested in context.test.ts) + the three builders Look (render.ts) adds per unit.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { Pt, Unit } from '../core'
import type { Street } from '../data/building'
import { kitAsset, placementSize, type KitCategory } from '../furnish/kit'
import { footprint } from '../furnish/presets'
import { lean, lite } from '../furnish/procedural'

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
    const s = placementSize(p)
    const legged = LEGGED.includes(a.category)
    const pot = POTS.includes(a.category) ? 0.45 * Math.min(s.x, s.z) : 0
    // a taller piece hides more of the sky from the floor around it: the falloff widens with height (a coffee
    // table ~10 cm, a wardrobe ~50 cm). Solid pieces grow by σ/2 so the base edge sits in the dark part (≈ 55 %);
    // legged ones are a diffuse patch under the whole footprint.
    const blurM = Math.min(0.25, Math.max(0.05, 0.25 * (pot || s.y)))
    const grow = legged ? 0 : blurM
    const size = pot ? { x: pot + grow, z: pot + grow } : { x: s.x + grow, z: s.z + grow }
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
/**
 * × the facade texture's plaster, Dhaka apartment blocks in three families (session 31: five near-whites read as one
 * diagram): washed off-white, warm sand / cream, cool pale grey. Picked per block from the street's own seed: the same
 * every time.
 */
const TINTS = ['#ffffff', '#f2e3c6', '#e6cfb0', '#d9dee1', '#efece7']

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

/** metres the made-up street runs past the building at each end */
const REACH_M = 60

/**
 * The made-up street round a building, as a Dhaka street is (founder 2026-11-20: "buildings don't normally leave any
 * space … plotline is a simulation of real life"; RAJUK practice: a building stands 1.25–1.5 m off its plot's side and
 * back lines, and so does the next one). Side k of the walls' box (0 −y, 1 +y, 2 −x, 3 +x): a road along the plot's edge —
 * the drawing's, else one side 6–9 m wide (a corner plot: two) — with the blocks across it 1–1.5 m back from its far edge;
 * every other side a row of neighbours 2.2–4 m from the walls (never nearer than 1.25–1.5 m past the plot). Two rows a
 * side (the plots behind), 3–4 bays deep, the building's storeys ± 2, whole bays 0–1.5 m apart along the row. The −y / +y
 * rows and roads run REACH_M past the building's ends (they take the corners); the −x / +x rows stop at what stands on
 * those two sides. A road cuts every row it crosses.
 */
export function neighbourBlocks(street: Street, seed: number): { blocks: Block[]; roads: Bounds[] } {
  const r = rng(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * r()
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))
  const b = street.walls
  const plot = street.plot ?? b
  const face = [b.minY, b.maxY, b.minX, b.maxX]
  const out = [-1, 1, -1, 1]
  /** how far the plot reaches past side k's walls */
  const margin = (k: number) => Math.max(0, out[k] * ([plot.minY, plot.maxY, plot.minX, plot.maxX][k] - face[k]))
  /** the rect n0..n1 out from side k's face, t0..t1 along it */
  const at = (k: number, n0: number, n1: number, t0: number, t1: number): Bounds => {
    const [lo, hi] = out[k] < 0 ? [face[k] - n1, face[k] - n0] : [face[k] + n0, face[k] + n1]
    return k < 2 ? { minX: t0, maxX: t1, minY: lo, maxY: hi } : { minX: lo, maxX: hi, minY: t0, maxY: t1 }
  }
  const along = (k: number): [number, number] => (k < 2 ? [b.minX - REACH_M, b.maxX + REACH_M] : [b.minY - REACH_M, b.maxY + REACH_M])
  /** t0..t1 less where a road crosses side k's band n0..n1 (`pad` clear of it) */
  const clear = (k: number, n0: number, n1: number, t0: number, t1: number, roads: Bounds[], pad = 1) => {
    const band = at(k, n0, n1, t0, t1)
    let free: [number, number][] = [[t0, t1]]
    for (const q of roads) {
      if (!(q.minX < band.maxX && band.minX < q.maxX && q.minY < band.maxY && band.minY < q.maxY)) continue
      const [c0, c1] = k < 2 ? [q.minX - pad, q.maxX + pad] : [q.minY - pad, q.maxY + pad]
      free = free.flatMap(([a, z]): [number, number][] => [[a, Math.min(z, c0)], [Math.max(a, c1), z]]).filter(([a, z]) => z > a)
    }
    return free
  }
  // the road off each side: [near, far] out from its face
  const road: ([number, number] | null)[] = [null, null, null, null]
  const given = street.roads ?? []
  for (const q of given) {
    for (let k = 0; k < 4; k++) {
      const near = out[k] * ([q.maxY, q.minY, q.maxX, q.minX][k] - face[k])
      const beside = k < 2 ? q.minX < b.maxX && b.minX < q.maxX : q.minY < b.maxY && b.minY < q.maxY
      if (near >= -0.5 && beside && !(road[k] && road[k]![0] <= near)) road[k] = [near, near + (k < 2 ? q.maxY - q.minY : q.maxX - q.minX)]
    }
  }
  const made: Bounds[] = []
  if (!given.length) {
    const first = int(0, 3)
    for (const k of r() < 0.3 ? [first, first < 2 ? int(2, 3) : int(0, 1)] : [first]) {
      const near = Math.max(margin(k), 1.5)
      road[k] = [near, near + between(6, 9)]
    }
    // the −y / +y road whole, a −x / +x one stopping at its edges: no two strips on one spot
    for (let k = 0; k < 4; k++) {
      const q = road[k]
      if (q) made.push(...clear(k, q[0], q[1], ...along(k), made, 0).map(([t0, t1]) => at(k, q[0], q[1], t0, t1)))
    }
  }
  const gap = [0, 1, 2, 3].map((k) => Math.max(between(2.2, 4), margin(k) + between(1.25, 1.5)))
  /** how far out the nearest thing off side k stands: its road, else its row */
  const inner = (k: number) => road[k]?.[0] ?? gap[k]
  const [s0, s1] = street.storeys ? [Math.max(3, street.storeys - 2), street.storeys + 2] : [6, 10]
  const roads = [...given, ...made]
  const blocks: Block[] = []
  for (let k = 0; k < 4; k++) {
    const span: [number, number] = k < 2 ? along(k) : [b.minY - inner(0), b.maxY + inner(1)]
    let n0 = road[k] ? road[k]![1] + between(1, 1.5) : gap[k]
    for (let row = 0; row < 2; row++) {
      const n1 = n0 + BAY * int(3, 4)
      for (const [t0, t1] of clear(k, n0, n1, ...span, roads)) {
        // whole bays, 2–6 a block, 0–1.5 m apart, the run centred on its stretch (what is left: half at each end)
        const run: [number, number][] = []
        for (let t = t0; ; ) {
          const room = Math.floor((t1 - t) / BAY)
          if (room < 2) break
          const w = BAY * (room <= 6 ? room : int(2, Math.min(6, room - 3)))
          run.push([t, t + w])
          t += w + between(0, 1.5)
        }
        const shift = run.length ? (t1 - run[run.length - 1][1]) / 2 : 0
        for (const [a, z] of run) {
          const q = at(k, n0, n1, a + shift, z + shift)
          blocks.push({ x0: q.minX, x1: q.maxX, y0: q.minY, y1: q.maxY, storeys: int(s0, s1), tint: int(0, TINTS.length - 1), facade: int(0, FACADES.length - 1) })
        }
      }
      n0 = n1 + between(2.5, 3) // the next plot back
    }
  }
  return { blocks, roads: made }
}

/** The made-up street round `street` (a unit with no site): the same blocks in the view, the daylight and the wind. */
export function madeUpStreet(unit: Unit, street: Street): { blocks: Block[]; roads: Bounds[] } {
  return neighbourBlocks(street, [...(street.seed ?? unit.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7))
}

/**
 * What stands round the building, as the daylight bake and the wind's shelter rule read it: each neighbour's outline and
 * its height over the street — the site's measured blocks (Studio → Site), else the made-up street's.
 */
export function neighbours(unit: Unit, street: Street): { plan: Pt[]; heightM: number }[] {
  if (unit.site) return core.sitePlan(unit).buildings
  return madeUpStreet(unit, street).blocks.map((k) => ({
    plan: [{ x: k.x0, y: k.y0 }, { x: k.x1, y: k.y0 }, { x: k.x1, y: k.y1 }, { x: k.x0, y: k.y1 }],
    heightM: k.storeys * STOREY,
  }))
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
/** The sky's share of the hemisphere light (Look.setAltitude): the street and the blocks get no bounce from the flat's lamps. */
export const outdoorFill = { value: 1 }
/** The neighbours' lit windows (litTexture) as the sky goes (Look.setAltitude): 0 by day → STREET_LIT at night. */
export const streetNight = { value: 0 }
export const STREET_LIT = 0.3

/**
 * A site block any part of which is nearer the camera than this (m) is not drawn, whole: in Dollhouse and the Building
 * view a neighbour between the camera and the flat / tower goes, its shadow stays (PlotlineScene sets it every frame;
 * 0 in Walk). Bug hunt 2026-10-18: a block's roof covered the bottom half of the Building view, the picked floor with it.
 */
export const siteCut = { value: 0 }

/**
 * Distance haze on one material (the street context, the ground), before tone mapping. `cut`: siteCut applies, by the
 * geometry's `bmin` / `bmax` attributes (each block's box on all its vertices; the mesh only moved, never turned) —
 * never a block sliced in two.
 */
export function hazed<M extends THREE.Material>(m: M, cut = false): M {
  m.onBeforeCompile = (s) => {
    s.uniforms.hazeColor = haze
    s.uniforms.outdoorFill = outdoorFill
    s.uniforms.streetNight = streetNight
    if (cut) {
      s.uniforms.siteCut = siteCut
      s.vertexShader = `attribute vec3 bmin;\nattribute vec3 bmax;\nvarying vec3 vMin;\nvarying vec3 vMax;\n${s.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvMin = (modelMatrix * vec4(bmin, 1.0)).xyz;\nvMax = (modelMatrix * vec4(bmax, 1.0)).xyz;',
      )
    }
    // before tone mapping: linear in both paths (composer target, and XR where the shader tone maps)
    s.fragmentShader = `uniform vec3 hazeColor;\nuniform float outdoorFill;\nuniform float streetNight;\n${cut ? 'uniform float siteCut;\nvarying vec3 vMin;\nvarying vec3 vMax;\n' : ''}${s.fragmentShader}`
      .replace('#include <lights_fragment_end>', 'irradiance *= outdoorFill;\n#include <lights_fragment_end>')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= streetNight;')
      .replace(
      '#include <tonemapping_fragment>',
      `float hazeD = length(vViewPosition);
      ${cut ? 'if (length(max(max(vMin - cameraPosition, cameraPosition - vMax), 0.0)) < siteCut) discard;' : ''}
      gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor, max(1.0 - exp(-${HAZE_BETA} * hazeD), smoothstep(${FADE_M[0]}.0, ${FADE_M[1]}.0, hazeD)));
      #include <tonemapping_fragment>`,
    )
  }
  if (cut) m.customProgramCacheKey = () => 'hazed-cut' // the same onBeforeCompile source: three would share the program
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

/** FACADES' glass (the windows' and the balcony door's panes): by day the sky's grey-blue, paler at the top as a pane mirrors the sky; lit at night (litTexture) */
const PANE_PAINT = ['#3b4247', '#2f3437']
const facades: THREE.CanvasTexture[] = []
function facadeTexture(variant: number): THREE.CanvasTexture {
  if (facades[variant]) return facades[variant]
  const px = 36 // per metre
  const c = document.createElement('canvas')
  c.width = BAY * px
  c.height = STOREY * px
  const g = c.getContext('2d')!
  const rect = (col: string, u0: number, v0: number, u1: number, v1: number) => {
    const [x, y, h] = [u0 * px, c.height - v1 * px, (v1 - v0) * px] // v up from the storey's floor
    if (PANE_PAINT.includes(col)) {
      const sky = g.createLinearGradient(0, y, 0, y + h)
      sky.addColorStop(0, '#9aa7b2')
      sky.addColorStop(1, '#56616b')
      g.fillStyle = sky
    } else g.fillStyle = col
    g.fillRect(x, y, (u1 - u0) * px, h)
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

/**
 * The neighbours at night (session 31: they were black shapes): about 40 % of their windows lit warm, a fixed pattern
 * LIT_BAYS × LIT_STOREYS windows wide (the facade's own panes, PANE_PAINT), each block reading it from its own corner
 * (buildStreet offsets it by whole bays and storeys). Its emissive × streetNight: dark by day.
 * Each lit window is a room seen from outside (polish, qa2 V2: "flat beige cards" through the living room's glass 6–9 m
 * off): brightest at its ceiling light, a little above the middle, its walls darker toward the frame; the frame's head and
 * jambs throw a shadow line on it and a mullion stays dark in front; its light one of LIT_TINTS (the pattern's own seed).
 * LIT_PX texels a metre: at 12 a window's edge blurred over a hand's width at that distance.
 */
const LIT_BAYS = 5
const LIT_STOREYS = 7
const LIT_PX = 30
/** a warm bulb, a neutral tube light, a cool LED */
const LIT_TINTS = ['#ffc685', '#ffdcae', '#f2e8d6']
const lits: THREE.CanvasTexture[] = []
function litTexture(variant: number): THREE.CanvasTexture {
  if (lits[variant]) return lits[variant]
  const px = LIT_PX
  const c = document.createElement('canvas')
  c.width = LIT_BAYS * BAY * px
  c.height = LIT_STOREYS * STOREY * px
  const g = c.getContext('2d')!
  g.fillRect(0, 0, c.width, c.height)
  const r = rng(variant + 11)
  const panes = FACADES[variant].filter(([col]) => PANE_PAINT.includes(col))
  /** what stands in front of a pane (a mullion) */
  const bars = FACADES[variant].filter(([col, u0, v0, u1, v1]) => !PANE_PAINT.includes(col) && panes.some((p) => u0 >= p[1] && u1 <= p[3] && v0 >= p[2] && v1 <= p[4]))
  for (let b = 0; b < LIT_BAYS; b++)
    for (let s = 0; s < LIT_STOREYS; s++) {
      if (r() > 0.4) continue
      const tint = new THREE.Color(LIT_TINTS[Math.floor(r() * LIT_TINTS.length)])
      const at = ([, u0, v0, u1, v1]: Paint): [number, number, number, number] => [(b * BAY + u0) * px, c.height - (s * STOREY + v1) * px, (u1 - u0) * px, (v1 - v0) * px]
      for (const q of panes) {
        const [x, y, w, h] = at(q)
        const glow = g.createRadialGradient(x + w / 2, y + 0.3 * h, 0, x + w / 2, y + 0.3 * h, 0.5 * Math.hypot(w, h))
        glow.addColorStop(0, tint.getStyle())
        glow.addColorStop(0.45, tint.clone().multiplyScalar(0.45).getStyle())
        glow.addColorStop(1, tint.clone().multiplyScalar(0.08).getStyle())
        g.fillStyle = glow
        g.fillRect(x, y, w, h)
        g.fillStyle = 'rgba(0, 0, 0, 0.6)' // the frame's shadow: head 6 cm, jambs 4 cm
        g.fillRect(x, y, w, 0.06 * px)
        g.fillRect(x, y, 0.04 * px, h)
        g.fillRect(x + w - 0.04 * px, y, 0.04 * px, h)
      }
      g.fillStyle = '#000'
      for (const q of bars) g.fillRect(...at(q))
    }
  const t = (lits[variant] = new THREE.CanvasTexture(c))
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / (LIT_BAYS * BAY), 1 / (LIT_STOREYS * STOREY))
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
 * `lines` (High, session 31: "a street, not a diagram"): the other blocks get their floor slabs' edge as a band across
 * the face at every floor, 0.5 m out and a shade lighter — the line each floor's balconies and sunshades hang on, and a
 * shadow line in the sun.
 */
export function blockParts(k: Block, at: Pt, r: () => number, lines = false): Part[] {
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
    if (lines && k.facade !== 2) for (let s = 1; s < k.storeys; s++) box(0, len, s * STOREY, s * STOREY + 0.15, 0, 0.5, 1.12)
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

/** Its box on every vertex of `g`: hazed's cut takes a block away whole. */
function boxed(g: THREE.BufferGeometry, min: THREE.Vector3, max: THREE.Vector3): THREE.BufferGeometry {
  const n = g.getAttribute('position').count
  g.setAttribute('bmin', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [min.x, min.y, min.z]).flat(), 3))
  return g.setAttribute('bmax', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [max.x, max.y, max.z]).flat(), 3))
}

/** Road strips on the ground, `y` up. */
const roadStrips = (roads: Bounds[], y: number) =>
  roads.map((q) => new THREE.PlaneGeometry(q.maxX - q.minX, q.maxY - q.minY).rotateX(-Math.PI / 2).translate((q.minX + q.maxX) / 2, y, (q.minY + q.maxY) / 2))

/**
 * The made-up street in world space (madeUpStreet round `street`): blocks (one merged mesh per facade variant, a tint per
 * block in vertex colours, the facade in metre UVs, roofs and parts on the plain plaster texel) and the roads (the
 * drawing's and the made-up ones), standing on `groundY`. Like the site's they cast the sun's shadow — a neighbour 3 m
 * off darkens the rooms facing it (Look / Building reach the shadow box to them) — and in Dollhouse / Building a block
 * between the camera and the flat is left out (hazed's cut). A unit with a site (Studio → Site) gets its real neighbours
 * and roads instead (buildSite).
 */
export function buildStreet(unit: Unit, street: Street, groundY: number): THREE.Group {
  if (unit.site) return buildSite(unit, groundY)
  const { blocks, roads } = madeUpStreet(unit, street)
  if (lite.on) return plainStreet(blocks, [...(street.roads ?? []), ...roads], groundY)
  const seed = [...(street.seed ?? unit.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const w = street.walls
  const at = { x: (w.minX + w.maxX) / 2, y: (w.minY + w.maxY) / 2 }
  const tints = TINTS.map((t) => new THREE.Color(t))
  /** non-indexed and painted: a facade keeps metre UVs on its walls (along-face from the corner + `du`, height + `dv`: whole bays and storeys, which only move the lit windows), the rest samples the plain texel */
  const paint = (geo: THREE.BufferGeometry, c: THREE.Color, facade: boolean, du = 0, dv = 0) => {
    const g = geo.toNonIndexed()
    geo.dispose()
    const p = g.attributes.position
    const n = g.attributes.normal
    const uv = g.attributes.uv
    const col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      if (!facade || Math.abs(n.getY(i)) > 0.5) uv.setXY(i, 0.3, 1.6)
      else uv.setXY(i, (Math.abs(n.getZ(i)) > 0.5 ? p.getX(i) : p.getZ(i)) + du, p.getY(i) + dv)
      col.set([c.r, c.g, c.b], i * 3)
    }
    return g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  const geos: THREE.BufferGeometry[][] = FACADES.map(() => [])
  blocks.forEach((k, i) => {
    const [W, H, D] = [k.x1 - k.x0, k.storeys * STOREY, k.y1 - k.y0]
    const tint = tints[k.tint]
    // the block and its parts (≤ 0.9 m out, tanks up to 4 m over the roof) go together
    const box = (g: THREE.BufferGeometry) => boxed(g, new THREE.Vector3(k.x0 - 0.9, groundY, k.y0 - 0.9), new THREE.Vector3(k.x1 + 0.9, groundY + H + 4, k.y1 + 0.9))
    geos[k.facade].push(box(paint(new THREE.BoxGeometry(W, H, D).translate(W / 2, H / 2, D / 2), tint, true, BAY * ((3 * i) % LIT_BAYS), STOREY * ((5 * i) % LIT_STOREYS)).translate(k.x0, groundY, k.y0)))
    for (const q of blockParts(k, at, rng(seed + i + 1), !lean.on)) {
      const [w, h, d] = [q.x1 - q.x0, q.z1 - q.z0, q.y1 - q.y0]
      const g = q.tank ? new THREE.CylinderGeometry(w / 2, w / 2, h, 10) : new THREE.BoxGeometry(w, h, d)
      geos[k.facade].push(box(paint(g, tint.clone().multiplyScalar(q.shade), false).translate((q.x0 + q.x1) / 2, groundY + (q.z0 + q.z1) / 2, (q.y0 + q.y1) / 2)))
    }
  })
  const group = new THREE.Group()
  geos.forEach((list, v) => {
    if (!list.length) return
    const mesh = new THREE.Mesh(mergeGeometries(list)!, hazed(new THREE.MeshStandardMaterial({ map: facadeTexture(v), emissiveMap: litTexture(v), emissive: '#ffffff', vertexColors: true, roughness: 0.92 }), true))
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
    list.forEach((g) => g.dispose())
  })
  const strips = roadStrips([...(street.roads ?? []), ...roads], groundY + 0.05)
  if (strips.length) {
    const mesh = new THREE.Mesh(mergeGeometries(strips)!, hazed(new THREE.MeshStandardMaterial({ color: '#5b5955', roughness: 0.95 })))
    mesh.receiveShadow = true
    strips.forEach((g) => g.dispose())
    group.add(mesh)
  }
  return group
}

/** Lite's street faces: shaded by one fixed light from above and one side, as Lite's sun is off indoors (render.ts sunLit) */
const PLAIN_LIGHT = new THREE.Vector3(-0.5, 0.8, 0.35).normalize()
/** a face's shade under PLAIN_LIGHT: 0.7 turned away … 1 facing it */
export const plainShade = (n: THREE.Vector3): number => 0.7 + 0.3 * Math.max(0, n.dot(PLAIN_LIGHT))

/**
 * Lite (session 31): the made-up street as plain boxes — no facade pictures, parapets, water tanks or AC units (≈ 65 k
 * triangles on type-a's street) — and its roads, all one mesh in vertex colours (one draw call, no texture); the blocks
 * keep their tints and hazed's cut. The roads carry a box nothing is ever near, so the cut never takes them.
 */
function plainStreet(blocks: Block[], roads: Bounds[], groundY: number): THREE.Group {
  const n = new THREE.Vector3()
  const paint = (geo: THREE.BufferGeometry, c: THREE.Color, min: THREE.Vector3, max: THREE.Vector3) => {
    const g = geo.toNonIndexed()
    geo.dispose()
    const nrm = g.attributes.normal
    const col = new Float32Array(nrm.count * 3)
    for (let i = 0; i < nrm.count; i++) col.set(c.clone().multiplyScalar(plainShade(n.fromBufferAttribute(nrm, i))).toArray(), i * 3)
    return boxed(g.setAttribute('color', new THREE.BufferAttribute(col, 3)), min, max)
  }
  const tints = TINTS.map((t) => new THREE.Color(t).multiplyScalar(0.72)) // the facade texture's plaster (#b9b5ae) under the tint
  const far = new THREE.Vector3(1e6, 1e6, 1e6)
  const geos = [
    ...blocks.map((k) => {
      const [W, H, D] = [k.x1 - k.x0, k.storeys * STOREY, k.y1 - k.y0]
      const g = new THREE.BoxGeometry(W, H, D).translate(k.x0 + W / 2, groundY + H / 2, k.y0 + D / 2)
      return paint(g, tints[k.tint], new THREE.Vector3(k.x0, groundY, k.y0), new THREE.Vector3(k.x1, groundY + H, k.y1))
    }),
    ...roadStrips(roads, groundY + 0.05).map((g) => paint(g, new THREE.Color('#5b5955'), far, far)),
  ]
  const group = new THREE.Group()
  if (!geos.length) return group
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), true))
  mesh.castShadow = mesh.receiveShadow = true
  geos.forEach((g) => g.dispose())
  return group.add(mesh)
}

/** what the map's neighbours are drawn in: plain, no facade (they are measured blocks, not a picture of them) */
const BLOCK = '#b4b0a9'
const ROAD = '#45433f'

/**
 * The site's neighbours (Studio → Site, OpenStreetMap) as plain grey blocks at their heights, and its roads as dark strips
 * their width wide, in the unit's plan by its north (core.sitePlan), standing on groundY. Unlike the made-up street they
 * CAST the sun's shadow: a tall block next door darkens the flat as it would (Look / Building reach the shadow box to them).
 */
export function buildSite(unit: Unit, groundY: number): THREE.Group {
  const { buildings, roads } = core.sitePlan(unit)
  const group = new THREE.Group()
  group.userData.site = true
  const blocks = buildings
    .filter((b) => b.heightM > 0 && Math.abs(core.signedArea(b.plan)) > 1)
    .map((b) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(b.plan.map((p) => new THREE.Vector2(p.x, p.y))), { depth: b.heightM, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, groundY + b.heightM, 0)
      g.computeBoundingBox()
      return boxed(g, g.boundingBox!.min, g.boundingBox!.max)
    })
  if (blocks.length) {
    const mesh = new THREE.Mesh(mergeGeometries(blocks)!, hazed(new THREE.MeshStandardMaterial({ color: BLOCK, roughness: 0.92 }), true))
    mesh.castShadow = mesh.receiveShadow = true
    blocks.forEach((g) => g.dispose())
    group.add(mesh)
  }
  // a strip per stretch of centre line, half its width longer at each end so the bends close
  const strips = roads.flatMap((r) =>
    r.plan.slice(1).map((q, i) => {
      const p = r.plan[i]
      const len = Math.hypot(q.x - p.x, q.y - p.y)
      return new THREE.PlaneGeometry(len + r.widthM, r.widthM)
        .rotateX(-Math.PI / 2)
        .rotateY(-Math.atan2(q.y - p.y, q.x - p.x))
        .translate((p.x + q.x) / 2, groundY + 0.04, (p.y + q.y) / 2)
    }),
  )
  if (strips.length) {
    const mesh = new THREE.Mesh(mergeGeometries(strips)!, hazed(new THREE.MeshStandardMaterial({ color: ROAD, roughness: 0.95 })))
    mesh.receiveShadow = true
    strips.forEach((g) => g.dispose())
    group.add(mesh)
  }
  return group
}
