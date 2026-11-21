/**
 * The Studio's load (join-walls: drop drawn-over walls, reach loose ends, join overlaps and crossings, drop stubs, heal
 * straight runs, move doors off stubs) and the import's settle pass, PINNED: session 31's speed lane made them several
 * times faster (each corner's walls and each wall's box kept once per version of the drawing, boxes tested before the
 * line maths) with the promise that nothing they give changes. Every built-in drawing, the founder's two kept drafts and
 * 40 seeded messy drawings (ends a few centimetres short, crossings, walls drawn over walls, T's, columns, zone lines,
 * openings at split points) go through both; the whole result — every corner, wall, opening and label, ids made
 * deterministic — is hashed and must equal the hash the code gave before the speed-up (2513bb1).
 * After a deliberate change to the joining rules: PIN_PRINT=1 npx vitest run src/studio/joinPinned.test.ts prints the
 * new table to paste below.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Opening, Pillar, RoomLabel, Unit, Vertex, Wall } from '../core'
import { importIfc } from '../import/ifc'
import { settleImport } from '../import/plan2d'
import { emptyUnit, initialState, reducer } from './model'

/** the built-in drawings and the founder's kept drafts (his auto-traced Type A, his Sheltech A, his Banani unit A, a BTI whole floor) */
const kept = import.meta.glob(['../data/units/*.json', '../data/fixtures/*.json', '!../data/fixtures/overpass-*.json'], { eager: true, import: 'default' }) as Record<string, Unit>

let n = 0
beforeEach(() => {
  n = 0
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${(n++).toString(16).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`)
})

/** mulberry32: the same messy drawings on every machine */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** a drawing the way a file or a hurried hand gives it: a grid of walls whose ends stop short, run past, cross, double */
function messy(seed: number): Unit {
  const r = rng(seed)
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)]
  const u = emptyUnit()
  const vertices: Vertex[] = []
  const walls: Wall[] = []
  let k = 0
  const vtx = (x: number, y: number): string => {
    // a third of the ends land on a corner already drawn nearby (a shared corner), the rest are their own
    const near = r() < 0.35 ? vertices.find((v) => Math.hypot(v.x - x, v.y - y) < 0.05) : undefined
    if (near) return near.id
    const v = { id: `v${k++}`, x, y }
    vertices.push(v)
    return v.id
  }
  const jit = () => pick([0, 0, 0, 0.004, -0.006, 0.02, -0.03, 0.05, -0.08, 0.12])
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    const a = vtx(x0 + jit(), y0 + jit()), b = vtx(x1 + jit(), y1 + jit())
    if (a === b) return
    const thicknessM = pick([0.075, 0.125, 0.125, 0.25, 0.25, 0.3])
    const heightM = pick([3, 3, 3, 3, 3, 1.1, 0.15, 0])
    const L = Math.hypot(x1 - x0, y1 - y0)
    const openings: Opening[] = []
    if (heightM > 0 && L > 1.5 && r() < 0.4) {
      const widthM = Math.min(L - 0.4, pick([0.8, 0.9, 1.2, 2.4]))
      openings.push({ id: `o${k++}`, kind: pick(['door', 'window', 'passage', 'slider'] as const), offsetM: 0.2 + r() * (L - 0.4 - widthM), widthM, heightM: 2.1, sillM: 0 })
    }
    walls.push({ id: `w${k++}`, a, b, thicknessM, heightM, openings, ...(r() < 0.05 ? { standsAlone: true } : {}) })
  }
  const xs = Array.from({ length: 3 + Math.floor(r() * 5) }, () => Math.round(r() * 200) / 10).sort((p, q) => p - q)
  const ys = Array.from({ length: 3 + Math.floor(r() * 5) }, () => Math.round(r() * 200) / 10).sort((p, q) => p - q)
  // the grid lines, each in pieces between the crossing lines (some pieces left out, some run through a crossing)
  for (const y of ys) for (let i = 0; i + 1 < xs.length; i++) if (r() < 0.8) wall(xs[i], y, r() < 0.15 && i + 2 < xs.length ? xs[i + 2] : xs[i + 1], y)
  for (const x of xs) for (let i = 0; i + 1 < ys.length; i++) if (r() < 0.8) wall(x, ys[i], x, r() < 0.15 && i + 2 < ys.length ? ys[i + 2] : ys[i + 1])
  // walls drawn over walls, angled walls, short stubs
  for (let i = 0, m = Math.floor(r() * 6); i < m && walls.length; i++) {
    const w = pick(walls)
    const a = vertices.find((v) => v.id === w.a)!, b = vertices.find((v) => v.id === w.b)!
    const f = r() * 0.3
    wall(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + 0.004, a.x + (b.x - a.x) * (f + 0.5), a.y + (b.y - a.y) * (f + 0.5) + 0.004)
  }
  for (let i = 0, m = Math.floor(r() * 4); i < m; i++) wall(pick(xs), pick(ys), pick(xs) + r(), pick(ys) + r())
  for (let i = 0, m = Math.floor(r() * 5); i < m; i++) {
    const x = pick(xs), y = pick(ys)
    wall(x, y, x + pick([0.2, 0.3, -0.25]), y)
  }
  const pillars: Pillar[] = Array.from({ length: Math.floor(r() * 4) }, () => ({ id: `p${k++}`, x: pick(xs), y: pick(ys), wM: 0.3, hM: 0.45 }))
  const roomLabels: RoomLabel[] = []
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) if (r() < 0.5) roomLabels.push({ id: `l${k++}`, name: `Room ${i}${j}`, kind: 'bed', x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 })
  return { ...u, id: `u${seed}`, vertices, walls, pillars, roomLabels }
}

const hash = (x: unknown): string => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16)
const run = (f: () => unknown): string => {
  try {
    return hash(f())
  } catch (e) {
    return `throws ${(e as Error).message.slice(0, 40)}`
  }
}

const CASES: [string, () => Unit][] = [
  ...Object.entries(kept).map(([p, u]): [string, () => Unit] => [p.split('/').slice(-2).join('/'), () => structuredClone(u)]),
  ...Array.from({ length: 40 }, (_, i): [string, () => Unit] => [`messy ${i + 1}`, () => messy(1000 + i)]),
]

const printed: Record<string, [string, string]> = {}
afterAll(() => {
  if (process.env.PIN_PRINT) console.log(JSON.stringify(printed, null, 1))
})

describe('the load and the import settle give what they gave before the speed-up', () => {
  for (const [name, make] of CASES)
    test(name, () => {
      const loaded = run(() => reducer(initialState(), { type: 'load-unit', unit: make() }).unit)
      n = 0
      const settled = run(() => settleImport(make()).unit)
      printed[name] = [loaded, settled]
      if (!process.env.PIN_PRINT) expect([loaded, settled]).toEqual(PINNED[name])
    })
})

/** three small buildings of the IFC corpus (skipped where the corpus is not on the machine): every floor as the import gives it
 * (city house re-pinned by formats3: the rooms its attic's walls leave open close along their own outlines) */
const BENCH = 'E:/dev/ALTERNATIVE FORMAT TEST/ifc-bench/projects'
const IFCS = ['duplex/arc.ifc', 'fzk_house/arc.ifc', 'city_house_munich/arc.ifc']
describe('an IFC reads as it read before the speed-up', () => {
  for (const f of IFCS)
    test.skipIf(!existsSync(`${BENCH}/${f}`) || statSync(`${BENCH}/${f}`).size < 1024)(f, async () => {
      const b = readFileSync(`${BENCH}/${f}`)
      const r = await importIfc(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'arc.ifc')
      const got = hash({ storeys: r.storeys, notes: r.notes.filter((x) => !/^Read in/.test(x)) })
      printed[f] = [got, got]
      if (!process.env.PIN_PRINT) expect(got).toBe(PINNED[f][0])
    }, 60000)
})

const PINNED: Record<string, [string, string]> = {
  'duplex/arc.ifc': ['28f757ae961bf761', '28f757ae961bf761'],
  'fzk_house/arc.ifc': ['d7b9a2a932441f5c', 'd7b9a2a932441f5c'],
  'city_house_munich/arc.ifc': ['09f1e40ef1bc26f9', '09f1e40ef1bc26f9'],
  'fixtures/autotrace-bti-floor-2026-11-20.json': ['dae0408aebf3902c', 'b8df5c02ace179c7'],
  'fixtures/founder-autotrace-type-a-2026-10-06.json': ['f1dc554e237be1da', 'a05cc86392ce384b'],
  'fixtures/founder-banani-unit-a-2026-10-09.json': ['1d6f3042c3bf9c8f', '1d6f3042c3bf9c8f'],
  'fixtures/founder-sheltech-a-draft.json': ['3e0ca0278d8efa5f', 'f902ded48b5e8418'],
  'units/banani-b1.json': ['721eb81a40d27853', '721eb81a40d27853'],
  'units/banani-b2.json': ['b2559a7c4e8aa0dc', 'b2559a7c4e8aa0dc'],
  'units/banani-ground.json': ['e84d187105a87661', 'f959cd929f5e9cf1'],
  'units/banani-roof.json': ['25499ce9229194f8', '25499ce9229194f8'],
  'units/banani-typical.json': ['3a4b2cd1c3792243', '3a4b2cd1c3792243'],
  'units/dmd-b1.json': ['b0a3bbc9a4c9b72f', 'b0a3bbc9a4c9b72f'],
  'units/dmd-b2.json': ['b4a5d526d86e383e', 'b4a5d526d86e383e'],
  'units/dmd-ground.json': ['fd42dd9a3f5fe9c6', 'fd42dd9a3f5fe9c6'],
  'units/dmd-roof.json': ['f045171346fcaa2b', 'f045171346fcaa2b'],
  'units/dmd-typical.json': ['4ca08b4ff9c7a5a6', '4ca08b4ff9c7a5a6'],
  'units/sheltech-a.json': ['f17b1020ec109bfa', 'f17b1020ec109bfa'],
  'units/sheltech-b.json': ['d65e9743658720a0', 'd65e9743658720a0'],
  'units/sheltech-b1.json': ['b4f11ee90b031ea6', 'a57c1c3f50153c77'],
  'units/sheltech-b2.json': ['d8760063017da5c1', 'ff3bbceb6bb79a4b'],
  'units/sheltech-ground.json': ['b135edf4461eeb53', 'b135edf4461eeb53'],
  'units/sheltech-l1.json': ['ce4e00464e56b7b1', 'ce4e00464e56b7b1'],
  'units/sheltech-roof.json': ['d036413720553420', 'd036413720553420'],
  'units/type-a.json': ['de56ff7ec73bc1a2', 'de56ff7ec73bc1a2'],
  'units/type-b.json': ['cf776bdd57d4ec4a', 'cf776bdd57d4ec4a'],
  'units/type-c.json': ['f8ac11c559f14a1b', 'f8ac11c559f14a1b'],
  'messy 1': ['e4d19a06c481ccc3', '98d55a510f08a41a'],
  'messy 2': ['05a51573e31eaaee', '2129f68ced098de8'],
  'messy 3': ['aed33b7a89c314f6', 'f43826aa60e7a3f7'],
  'messy 4': ['50da45feb29a1877', '6188cef32f0cffc5'],
  'messy 5': ['4389e1851434e990', 'b904fb424069e40c'],
  'messy 6': ['7cbd435705fea5fd', 'e31e3a74c3d8f02e'],
  'messy 7': ['359d370551de3124', '04786e945e93c23e'],
  'messy 8': ['e81b385d49df234d', 'c7d4fb3d7504c7fa'],
  'messy 9': ['5f4f6499bb12a770', 'de7acc59da4603cd'],
  'messy 10': ['5e1b03cb89c60ffa', '990c1c726336d99e'],
  'messy 11': ['4e005c0664b5458d', 'ed22eb27acf23b5f'],
  'messy 12': ['f8c7c2910c83f36b', '2a99e741760d6e68'],
  'messy 13': ['91a109db24c3cf26', 'd80c6b446efb6c7e'],
  'messy 14': ['780ba486f3725dbb', '413af176df2af0ec'],
  'messy 15': ['51f11a378f2cb3ce', '54ad414bb1ed9bb1'],
  'messy 16': ['0ac3d5e86604a048', 'e914909c5811234d'],
  'messy 17': ['c9066aa0a80fb7f0', '8d613c38e05fb222'],
  'messy 18': ['f907d65368715f55', '7706e7107ca4814c'],
  'messy 19': ['7edc5c6c03824cb0', 'b43643cff9d68c56'],
  'messy 20': ['ae5eef4173c6c70e', '3e9e0e5d5fca8554'],
  'messy 21': ['7471883e46c6b4e5', '2926f70491f926ba'],
  'messy 22': ['aad0a5912e974f16', 'd385988222033ebc'],
  'messy 23': ['687b05ef9b919035', 'bca098d2affc0f48'],
  'messy 24': ['795f17d8b7236aee', '2cdc8e098039bda9'],
  'messy 25': ['2e235b2d03027ae3', '7807947be13618c3'],
  'messy 26': ['f933439e42db7d32', 'b5a1fa0172769d04'],
  'messy 27': ['c2ab7a8af276626f', 'd69bfd3cfb69520c'],
  'messy 28': ['f0db69e5844b3a81', '20169b5d95d900f4'],
  'messy 29': ['d71b8b6dc3b5eea1', 'df860227aea65d6c'],
  'messy 30': ['e4baf60807cf821e', '8c9a5bff03cc390a'],
  'messy 31': ['a245cf1e9fbd43f6', 'c469e18bbcd1b301'],
  'messy 32': ['e54b8c9f1f15fe50', 'bdc3891e309a1a5a'],
  'messy 33': ['aa076650dbd36157', '90683ae37c5eb64a'],
  'messy 34': ['2293c268c7df16fb', '0c565a4437be530e'],
  'messy 35': ['9b2baf7fab435a85', 'e2e7ecec1c43fc1e'],
  'messy 36': ['e8d15c8070cd7847', '6fa4340d22054b0f'],
  'messy 37': ['0d874e027256dfa2', '252301732eb34ab8'],
  'messy 38': ['42b639ff8f2a75b5', '7b6180a86a5b749a'],
  'messy 39': ['12d3164a91b7e4f6', '4792aa97bd5cff5b'],
  'messy 40': ['c4ab330bada6ba03', '988b788b7019657b'],
}

