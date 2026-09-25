/**
 * Door / window / passage joinery in wall-local coordinates (u along a→b from vertex a, v up,
 * w along the wall normal; the wall solid spans w ∈ [−t/2, t/2]). Everything static is merged
 * per clickable part (leaf, handle, frame, glass) and material, so a door is 3–5 draw calls and a window 3.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MaterialRef, Opening, Wall } from '../core'
import type { ObjectKind } from '../furnish/kit'
import { materialFor } from './materials'

/** Rewrites UVs so each face maps its own plane in metres (positions must already be in metres). Any geometry with normals. */
export function meterUVs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i))
    const nz = Math.abs(n.getZ(i))
    if (nz > 0.5) uv.setXY(i, p.getX(i), p.getY(i))
    else if (nx > 0.5) uv.setXY(i, p.getZ(i), p.getY(i))
    else uv.setXY(i, p.getX(i), p.getZ(i))
  }
  uv.needsUpdate = true
  return g
}

/** Frame, lining and casing of interior doors: the same veneer as the leaf, tinted to a darker teak. */
const DOOR_WOOD: MaterialRef = { kind: 'pbr', textureId: 'wood_veneer_light', tint: '#7a5a42' }
/** Painted trim (skirting, the architrave of a doorless opening): a teak casing on a 4.7 m opening read as a dark timber lintel. */
export const TRIM_PAINT: MaterialRef = { kind: 'color', color: '#f2f0ea', roughness: 0.35 }
const LEAF_WOOD: MaterialRef = { kind: 'pbr', textureId: 'wood_veneer_light' }
/** Main entrance: darker, heavier solid-teak look for leaf and frame alike. */
const MAIN_WOOD: MaterialRef = { kind: 'pbr', textureId: 'wood_veneer_light', tint: '#5a3d2b' }
/** Powder-coated, not bare metal: at metalness 0.85 the frames mirrored the env map and flipped black/white with view and hour. */
const ALU: MaterialRef = { kind: 'color', color: '#d5d7d6', roughness: 0.45, metalness: 0.15 }
const STEEL: MaterialRef = { kind: 'color', color: '#c4c4c2', roughness: 0.3, metalness: 1 }
/** Window sills and thresholds: polished white marble. Flat on purpose: the tiled floor-marble texture reads as wood on a 30 mm edge. */
const STONE: MaterialRef = { kind: 'color', color: '#e6e2da', roughness: 0.18 }
let glass: THREE.MeshPhysicalMaterial | null = null

const J = 0.03 // door lining (jamb) thickness
const CW = 0.07 // casing width
const CP = 0.015 // casing projection off the wall face
const REV = 0.005 // casing set back from the lining face
const GAP = 0.003 // leaf-to-lining clearance
const THRESHOLD_H = 0.02

/** Axis-aligned box between two corners, UVs in metres. */
function slab(u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(u1 - u0), Math.abs(v1 - v0), Math.abs(w1 - w0))
  g.translate((u0 + u1) / 2, (v0 + v1) / 2, (w0 + w1) / 2)
  return meterUVs(g)
}

function cyl(r: number, len: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg)
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return meterUVs(g)
}

function merged(geoms: THREE.BufferGeometry[], ref: MaterialRef | THREE.Material, castShadow = false): THREE.Mesh {
  const g = mergeGeometries(geoms)!
  geoms.forEach((x) => x.dispose())
  const mesh = new THREE.Mesh(g, ref instanceof THREE.Material ? ref : materialFor(ref))
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  return mesh
}

export interface OpeningOpts {
  /** main entrance: heavier leaf, larger handle */
  main?: boolean
  /** a room lies on the +normal (front) / −normal (back) side: window sills go on those sides */
  front?: boolean
  back?: boolean
  /** adjoining rooms use different floor finish slots: 20 mm stone strip across the opening */
  threshold?: boolean
}

/**
 * A separately clickable piece of opening `g` (leaf, handle, frame, glass): picked as `${openingId}/${name}`, with the
 * opening's wall-local offset.
 */
function part(g: THREE.Group, name: string, label: string, objectKind: ObjectKind, ...meshes: THREE.Object3D[]): THREE.Group {
  const p = new THREE.Group()
  p.userData = { kind: 'opening', id: `${g.userData.id}/${name}`, wallId: g.userData.wallId, label, objectKind }
  return p.add(...meshes)
}

/** Door/passage/window joinery in wall-local coordinates (u, v, w). The group is picked as the opening; parts on their own. */
export function buildOpening(o: Opening, wall: Wall, opts: OpeningOpts = {}): THREE.Group {
  const g = new THREE.Group()
  const slider = o.kind === 'door' && !o.hinge && o.widthM >= 1.2
  const [label, objectKind]: [string, ObjectKind] =
    o.kind === 'window' ? ['Window', 'window'] : o.kind === 'passage' ? ['Cased opening', 'passage'] : [slider ? 'Sliding door' : opts.main ? 'Main door' : 'Door', 'door']
  g.userData = { kind: 'opening', id: o.id, wallId: wall.id, label, objectKind }
  const T2 = wall.thicknessM / 2
  const u0 = o.offsetM
  const u1 = o.offsetM + o.widthM
  const s = o.sillM
  const H = o.heightM
  const th = opts.threshold && o.kind !== 'window' ? THRESHOLD_H : 0
  const stone: THREE.BufferGeometry[] = []
  if (th) stone.push(slab(u0, u1, s, s + th, -T2, T2))

  if (o.kind === 'window') {
    buildWindow(g, o, T2)
    // stone sill on each room side: 30 mm thick, 20 mm proud of the face, horns 50 mm past the reveal
    const df = Math.min(0.08, 2 * T2 - 0.02) / 2
    if (opts.front ?? true) stone.push(slab(u0 - 0.05, u1 + 0.05, s - 0.01, s + 0.02, df, T2 + 0.02))
    if (opts.back ?? true) stone.push(slab(u0 - 0.05, u1 + 0.05, s - 0.01, s + 0.02, -df, -T2 - 0.02))
  } else if (o.kind === 'passage') {
    g.add(merged(casings(u0, u1, s, s + H, T2, 0), TRIM_PAINT))
  } else if (slider) {
    buildSlider(g, o, T2, th)
  } else {
    buildDoor(g, o, T2, th, !!opts.main)
  }
  if (stone.length) g.add(merged(stone, STONE))
  return g
}

/** Casing (architrave) legs + head on both wall faces around [u0, u1] × [v0, top]; `inset` = lining thickness minus reveal. */
function casings(u0: number, u1: number, v0: number, top: number, T2: number, inset: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  const a = u0 + inset
  const b = u1 - inset
  const head = top - inset
  for (const f of [1, -1]) {
    const w0 = f * T2
    const w1 = f * (T2 + CP)
    out.push(slab(a - CW, a, v0, head, w0, w1), slab(b, b + CW, v0, head, w0, w1), slab(a - CW, b + CW, head, head + CW, w0, w1))
  }
  return out
}

function buildDoor(g: THREE.Group, o: Opening, T2: number, th: number, main: boolean): void {
  const u0 = o.offsetM
  const u1 = o.offsetM + o.widthM
  const s = o.sillM
  const H = o.heightM
  const LT = main ? 0.05 : 0.04
  const wood = main ? MAIN_WOOD : DOOR_WOOD
  // leaf hinged on the 'hinge' side. Unit JSON convention: 'in' = leaf on the LEFT of a→b in image
  // coords = −normal side (normal = (−dir.y, dir.x) is the right-hand side on screen).
  const hingeB = o.hinge === 'b'
  const sx = hingeB ? -1 : 1 // leaf extends +u from hinge a, −u from hinge b
  const sw = o.swing === 'in' ? -1 : 1 // swing side of the wall
  const lw = o.widthM - 2 * J - 2 * GAP
  const bottom = th + 0.008
  const lh = H - J - GAP - bottom

  // lining over the full wall thickness, door stop behind the closed leaf, casings on both faces
  const stopW0 = sw * (T2 - LT)
  const stopW1 = sw * Math.max(-T2 + 0.005, T2 - LT - 0.03)
  const frame = [
    slab(u0, u0 + J, s, s + H - J, -T2, T2),
    slab(u1 - J, u1, s, s + H - J, -T2, T2),
    slab(u0, u1, s + H - J, s + H, -T2, T2),
    slab(u0 + J, u0 + J + 0.012, s + th, s + H - J, stopW0, stopW1),
    slab(u1 - J - 0.012, u1 - J, s + th, s + H - J, stopW0, stopW1),
    slab(u0 + J + 0.012, u1 - J - 0.012, s + H - J - 0.012, s + H - J, stopW0, stopW1),
    ...casings(u0, u1, s, s + H, T2, J - REV),
  ]

  // pivot at the opening edge on the swing face, ajar 20°: rotating +u about Y by +φ moves it toward −w
  const pivot = new THREE.Group()
  pivot.position.set(hingeB ? u1 : u0, s, sw * T2)
  pivot.rotation.y = sx * (o.swing === 'in' ? 1 : -1) * THREE.MathUtils.degToRad(20)
  const x0 = sx * (J + GAP) // hinge edge of the leaf, pivot-local
  const xc = sx * (J + GAP + lw / 2)
  const zc = (-sw * LT) / 2 // leaf's swing face is flush with the wall face (pivot z = 0)
  const leaf = meterUVs(new THREE.BoxGeometry(lw, lh, LT).translate(xc, bottom + lh / 2, zc))

  // leaf relief, pivot-local: V-grooves on an interior flush door, bolection-moulded panels on the main door
  const relief: THREE.BufferGeometry[] = []
  const faces = [
    [0, sw], // swing face (pivot-local z) and its outward direction
    [-sw * LT, -sw],
  ]
  const across = (from: number, to: number) => [x0 + sx * from, x0 + sx * to].sort((a, b) => a - b) // leaf-relative → pivot x
  if (main) {
    // 2 × 3 moulded panels: tall, short (lock rail zone), tall
    const mw = 0.022
    const colW = (lw - 0.28) / 2
    const avail = lh - 0.5
    const rows = [
      [0.15, 0.4 * avail],
      [0.25 + 0.4 * avail, 0.2 * avail],
      [0.35 + 0.6 * avail, 0.4 * avail],
    ]
    for (const [zf, out] of faces) {
      for (const c of [0.1, 0.18 + colW]) {
        const [a, b] = across(c, c + colW)
        for (const [ry, rh] of rows) {
          const y0 = bottom + ry
          const y1 = y0 + rh
          const z1 = zf + out * 0.008
          relief.push(
            slab(a, b, y0, y0 + mw, zf, z1),
            slab(a, b, y1 - mw, y1, zf, z1),
            slab(a, a + mw, y0 + mw, y1 - mw, zf, z1),
            slab(b - mw, b, y0 + mw, y1 - mw, zf, z1),
          )
        }
      }
    }
  } else {
    const [a, b] = across(0, lw)
    for (const [zf, out] of faces) {
      for (let i = 1; i <= 4; i++) {
        const y = bottom + (lh * i) / 5
        relief.push(slab(a, b, y - 0.003, y + 0.003, zf, zf + out * 0.001))
      }
    }
  }
  // the main door's mouldings are its leaf's timber: one mesh; an interior leaf's grooves are the darker frame teak
  const leafMeshes = main ? [merged([leaf, ...relief], MAIN_WOOD, true)] : [merged([leaf], LEAF_WOOD, true), merged(relief, DOOR_WOOD)]
  pivot.add(part(g, 'leaf', 'Door leaf', 'door-leaf', ...leafMeshes))
  g.add(part(g, 'frame', 'Door frame', 'door-frame', merged(frame, wood)))

  // hardware, pivot-local: lever handle on both faces at 1.0 m, backset 60 mm; three butt-hinge knuckles
  const steel: THREE.BufferGeometry[] = []
  const hx = sx * (J + GAP + lw - 0.06)
  const hy = 1.0 - s
  for (const [zf, out] of faces) {
    if (main) {
      steel.push(slab(hx - 0.0275, hx + 0.0275, hy - 0.2, hy + 0.06, zf, zf + out * 0.008))
      steel.push(cyl(0.012, 0.06, 'z', hx, hy, zf + out * 0.038))
      steel.push(cyl(0.012, 0.17, 'x', hx - sx * 0.08, hy, zf + out * 0.068))
      steel.push(cyl(0.011, 0.012, 'z', hx, hy - 0.13, zf + out * 0.012)) // key cylinder
    } else {
      steel.push(cyl(0.026, 0.008, 'z', hx, hy, zf + out * 0.004, 20))
      steel.push(cyl(0.009, 0.05, 'z', hx, hy, zf + out * 0.033))
      steel.push(cyl(0.0095, 0.13, 'x', hx - sx * 0.06, hy, zf + out * 0.058))
      steel.push(cyl(0.016, 0.006, 'z', hx, hy - 0.075, zf + out * 0.003, 16)) // lock escutcheon
    }
  }
  for (const y of [bottom + 0.22, bottom + lh / 2 + 0.1, bottom + lh - 0.22]) steel.push(cyl(0.008, 0.1, 'y', x0 - sx * 0.002, y, sw * 0.004, 10))
  // ponytail: the hinge knuckles ride in the handle part (one steel draw call per door); split them if hinges get their own catalog slot
  pivot.add(part(g, 'handle', 'Door handle', 'door-handle', merged(steel, STEEL)))
  g.add(pivot)
}

/** Two-panel aluminium sliding door (veranda/study sliders): thin frame, panels offset in depth. */
function buildSlider(g: THREE.Group, o: Opening, T2: number, th: number): void {
  const u0 = o.offsetM
  const u1 = o.offsetM + o.widthM
  const s = o.sillM + th
  const top = o.sillM + o.heightM
  const F = 0.05
  const D = Math.min(0.1, 2 * T2 - 0.02) / 2
  const alu = [
    slab(u0, u0 + F, s, top, -D, D),
    slab(u1 - F, u1, s, top, -D, D),
    slab(u0 + F, u1 - F, top - F, top, -D, D),
    slab(u0 + F, u1 - F, s, s + 0.025, -D, D), // track
  ]
  const panes: THREE.BufferGeometry[] = []
  const pw = (o.widthM - 2 * F) / 2 + 0.025
  const pv0 = s + 0.025
  const pv1 = top - F
  ;[
    [u0 + F, u0 + F + pw, D * 0.45, -1],
    [u1 - F - pw, u1 - F, -D * 0.45, 1],
  ].forEach(([a, b, zc, jambSide]) => {
    const z0 = zc - 0.0175
    const z1 = zc + 0.0175
    const st = 0.05
    alu.push(slab(a, a + st, pv0, pv1, z0, z1), slab(b - st, b, pv0, pv1, z0, z1))
    alu.push(slab(a + st, b - st, pv0, pv0 + 0.08, z0, z1), slab(a + st, b - st, pv1 - 0.05, pv1, z0, z1))
    panes.push(slab(a + st, b - st, pv0 + 0.08, pv1 - 0.05, zc - 0.003, zc + 0.003))
    // flush pull on the jamb-side stile, both faces
    const hu = jambSide < 0 ? a + st / 2 : b - st / 2
    const hv = o.sillM + 0.95
    alu.push(slab(hu - 0.007, hu + 0.007, hv, hv + 0.2, z1, z1 + 0.012), slab(hu - 0.007, hu + 0.007, hv, hv + 0.2, z0 - 0.012, z0))
  })
  g.add(part(g, 'frame', 'Sliding door frame', 'door-frame', merged(alu, ALU, true)))
  g.add(part(g, 'glass', 'Sliding door glass', 'window-glass', glassMesh(panes)))
}

/** Slim aluminium sliding window: 50 mm outer frame, 2 sashes (3 over 1.8 m) alternately offset in depth. */
function buildWindow(g: THREE.Group, o: Opening, T2: number): void {
  const u0 = o.offsetM
  const u1 = o.offsetM + o.widthM
  const s = o.sillM
  const top = o.sillM + o.heightM
  const F = 0.05
  const D = Math.min(0.08, 2 * T2 - 0.02) / 2
  const alu = [
    slab(u0, u0 + F, s, top, -D, D),
    slab(u1 - F, u1, s, top, -D, D),
    slab(u0 + F, u1 - F, top - F, top, -D, D),
    slab(u0 + F, u1 - F, s, s + F, -D, D),
  ]
  const panes: THREE.BufferGeometry[] = []
  const n = o.widthM > 1.8 ? 3 : 2
  const OV = 0.04 // meeting stiles overlap
  const sw = (o.widthM - 2 * F + OV * (n - 1)) / n
  const st = 0.04
  for (let i = 0; i < n; i++) {
    const a = u0 + F + i * (sw - OV)
    const b = a + sw
    const zc = (i % 2 ? -1 : 1) * D * 0.4
    const z0 = zc - 0.013
    const z1 = zc + 0.013
    alu.push(slab(a, a + st, s + F, top - F, z0, z1), slab(b - st, b, s + F, top - F, z0, z1))
    alu.push(slab(a + st, b - st, s + F, s + F + st, z0, z1), slab(a + st, b - st, top - F - st, top - F, z0, z1))
    panes.push(slab(a + st, b - st, s + F + st, top - F - st, zc - 0.003, zc + 0.003))
  }
  g.add(part(g, 'frame', 'Window frame', 'window-frame', merged(alu, ALU, true)))
  g.add(part(g, 'glass', 'Window glass', 'window-glass', glassMesh(panes)))
}

function glassMesh(panes: THREE.BufferGeometry[]): THREE.Mesh {
  glass ??= new THREE.MeshPhysicalMaterial({ transmission: 0.9, roughness: 0.05, thickness: 0.01, ior: 1.5 })
  return merged(panes, glass)
}
