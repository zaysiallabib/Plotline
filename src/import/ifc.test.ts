/**
 * IFC import against real files (skipped when they are not on this machine). The eval table at the end prints one row
 * per file: run `npx vitest run src/import/ifc.test.ts --disableConsoleIntercept` to read it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { deriveRooms, validate, wallFrame } from '../core'
import { curtainRuns, importIfc, sharedEdges } from './ifc'
import { readGlbJson, WINDOW } from './glb'

const CERT = 'E:/dev/ALTERNATIVE FORMAT TEST/Certification-datasets-main'
const BENCH = 'E:/dev/ALTERNATIVE FORMAT TEST/ifc-bench/projects'
const SCHEMAS = ['IFC 2.3.0.1 (IFC 2x3 TC1)', 'IFC 4.0.2.1 (IFC 4 ADD2 TC1)', 'IFC 4.3.2.0 (IFC 4.3 ADD2)']
const WALL_FILE = `${CERT}/IFC 4.0.2.1 (IFC 4 ADD2 TC1)/ISO Spec - ReferenceView_V1.2/wall-with-opening-and-window.ifc`

/** real files only: a git-lfs pointer is ~130 bytes */
const present = (p: string): boolean => existsSync(p) && statSync(p).size > 1024
const load = (p: string) => {
  const b = readFileSync(p)
  return importIfc(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), p.split('/').pop()!)
}

/** a one-entry zip (deflate), as an .ifczip is */
function zipOf(name: string, data: Buffer): ArrayBuffer {
  const packed = deflateRawSync(data)
  const n = Buffer.from(name)
  const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b }
  const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b }
  const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(packed.length), u32(data.length), u16(n.length), u16(0), n, packed])
  const central = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(packed.length), u32(data.length), u16(n.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), n])
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(1), u16(1), u32(central.length), u32(local.length), u16(0)])
  const all = Buffer.concat([local, central, eocd])
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength)
}

describe('two rooms of one open plan', () => {
  it("their common boundary is where their outlines run together, on the first one's line; 10 cm apart is no boundary", () => {
    const sq = (x0: number, y0: number, x1: number, y1: number): [{ x: number; y: number }, { x: number; y: number }][] => [
      [{ x: x0, y: y0 }, { x: x1, y: y0 }],
      [{ x: x1, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y1 }],
      [{ x: x0, y: y1 }, { x: x0, y: y0 }],
    ]
    const s = sharedEdges(sq(0, 0, 4, 3), sq(4.02, 1, 7, 5))
    expect(s).toHaveLength(1)
    expect(s[0][0].x).toBe(4)
    expect([s[0][0].y, s[0][1].y].sort()).toEqual([1, 3])
    expect(sharedEdges(sq(0, 0, 4, 3), sq(4.1, 0, 7, 3))).toEqual([])
  })
})

describe('a glass front turning a corner (s31 bigifc: LTU A-House read it as one wall 17 m thick)', () => {
  /** a part's footprint rectangle: centre, angle (deg), length, width */
  const part = (x: number, y: number, deg: number, lengthM: number, widthM = 0.03) => ({ centre: { x, y }, dir: { x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) }, lengthM, widthM })
  it('panels along one line are one run (a mullion gap between them is no break); the corner makes a second run', () => {
    // three 1.2 m panels on y = 0 with 5 cm gaps, then two on x = 3.8 going down; mullion sections (0.05 × 0.15) left out
    const rects = [part(0.6, 0, 0, 1.2), part(1.85, 0, 0, 1.2), part(3.1, 0, 0, 1.2), part(3.8, 0.7, 90, 1.2), part(3.8, 1.95, 90, 1.2), part(1.25, 0, 90, 0.15, 0.05)]
    const runs = curtainRuns(rects)
    expect(runs).toHaveLength(2)
    const along = runs.find((r) => Math.abs(r.a.y - r.b.y) < 1e-9)!
    expect(Math.min(along.a.x, along.b.x)).toBeCloseTo(0)
    expect(Math.max(along.a.x, along.b.x)).toBeCloseTo(3.7)
    expect(along.widthM).toBeCloseTo(0.03)
    const down = runs.find((r) => r !== along)!
    expect(Math.min(down.a.y, down.b.y)).toBeCloseTo(0.1)
    expect(Math.max(down.a.y, down.b.y)).toBeCloseTo(2.55)
  })
  it('two fronts on one line with a gap wider than a door stay two runs; parts 15 cm off the line are another line', () => {
    expect(curtainRuns([part(0.5, 0, 0, 1), part(3, 0, 0, 1)])).toHaveLength(2)
    expect(curtainRuns([part(0.5, 0, 0, 1), part(1.5, 0.2, 0, 1)])).toHaveLength(2)
    expect(curtainRuns([part(0.5, 0, 0, 1), part(1.5, 0.1, 0, 1)])).toHaveLength(1)
  })
  it('nothing wall-like among the parts: no run (the wall is left to the outside shape); a run under 1 m (a frame\'s return) is no wall', () => {
    expect(curtainRuns([part(0, 0, 0, 0.2), part(1, 1, 0, 3, 2)])).toEqual([])
    expect(curtainRuns([part(0, 0, 90, 0.45, 0.1), part(5, 0, 0, 0.8)])).toEqual([])
  })
})

describe('ifc import', () => {
  it.skipIf(!present(WALL_FILE))('wall-with-opening-and-window: one wall, one window 1 m wide', async () => {
    const r = await load(WALL_FILE)
    expect(r.unitScale).toBe(0.001)
    expect(r.storeys).toHaveLength(1)
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(1)
    const w = u.walls[0]
    expect(wallFrame(w, u.vertices).lengthM).toBeCloseTo(3, 2)
    expect(w.thicknessM).toBeCloseTo(0.3, 2)
    expect(w.openings).toHaveLength(1)
    expect(w.openings[0].kind).toBe('window')
    expect(w.openings[0].widthM).toBeCloseTo(1, 2)
    expect(w.openings[0].heightM).toBeCloseTo(1, 2)
    expect(w.openings[0].sillM).toBeCloseTo(0.5, 1)
    expect(r.shell?.triangles).toBeGreaterThan(0)
  })
  it.skipIf(!present(WALL_FILE) || !present(`${BENCH}/fzk_house/arc.ifc`))('a window drawn with solid glass: its parts named in the shape and the shell says so; see-through glass: nothing said (polish2)', async () => {
    const mats = (r: Awaited<ReturnType<typeof load>>) => (readGlbJson(r.shell!.glb).json.materials as { name?: string; pbrMetallicRoughness: { baseColorFactor: number[] } }[])
    const solid = await load(WALL_FILE) // its window: plain white, solid
    expect(solid.shell?.glass).toBe('opaque')
    expect(mats(solid).filter((m) => m.name === WINDOW)).toHaveLength(1)
    const clear = await load(`${BENCH}/fzk_house/arc.ifc`) // its glass a see-through green
    expect(clear.shell?.glass).toBeUndefined()
    expect(mats(clear).filter((m) => m.name === WINDOW).some((m) => m.pbrMetallicRoughness.baseColorFactor[3] < 0.99)).toBe(true)
  })

  it.skipIf(!present(WALL_FILE))('says how far it is: stages in plain words, fractions that only grow, to the last floor', async () => {
    const seen: [string, number][] = []
    const b = readFileSync(WALL_FILE)
    await importIfc(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'wall.ifc', (stage, f) => seen.push([stage, f]))
    expect(seen[0][0]).toMatch(/starting/)
    expect(seen.some(([s]) => /opening the file/.test(s))).toBe(true)
    expect(seen.some(([s]) => /building the 3D/.test(s))).toBe(true)
    expect(seen.at(-1)![0]).toMatch(/floor 1 of 1/)
    for (let i = 1; i < seen.length; i++) expect(seen[i][1]).toBeGreaterThanOrEqual(seen[i - 1][1])
    expect(seen.every(([, f]) => f >= 0 && f <= 1)).toBe(true)
  })

  it.skipIf(!present(WALL_FILE))('the same file inside an .ifczip reads the same', async () => {
    const r = await importIfc(zipOf('wall.ifc', readFileSync(WALL_FILE)), 'wall.ifczip')
    expect(r.storeys[0].unit.walls).toHaveLength(1)
    expect(r.storeys[0].unit.walls[0].openings[0].widthM).toBeCloseTo(1, 2)
  })

  for (const schema of SCHEMAS) {
    const file = `${CERT}/${schema}/Simple-Scene/Building-Architecture.ifc`
    it.skipIf(!present(file))(`${schema} Simple-Scene: storeys, walls, rooms, shell`, async () => {
      const r = await load(file)
      expect(r.storeys.length).toBeGreaterThanOrEqual(1)
      const u = r.storeys[0].unit
      expect(u.walls.length).toBeGreaterThan(0)
      for (const w of u.walls) {
        const L = wallFrame(w, u.vertices).lengthM
        for (const o of w.openings) {
          expect(o.offsetM).toBeGreaterThanOrEqual(-1e-6)
          expect(o.offsetM + o.widthM).toBeLessThanOrEqual(L + 1e-6)
        }
      }
      // the scene has four outer walls only (no front / back): its two spaces are named and close along their own
      // outlines where the file has no wall (zone lines, drawn as nothing — the outside shape shows what stands there)
      expect(u.walls.filter((w) => w.heightM > 0).length).toBeGreaterThanOrEqual(4) // (split where a zone line meets them)
      expect(u.roomLabels.map((l) => l.name).sort()).toEqual(['entry hall', 'living room'])
      expect(deriveRooms(u).filter((x) => u.roomLabels.some((l) => l.id === x.id)).map((x) => x.name).sort()).toEqual(['entry hall', 'living room'])
      expect(validate(u).filter((i) => i.code === 'opening-out-of-bounds')).toHaveLength(0)
      expect(r.shell).toBeDefined()
      const { json, binLength } = readGlbJson(r.shell!.glb)
      expect(binLength).toBeGreaterThan(0)
      expect((json.accessors as unknown[]).length).toBeGreaterThanOrEqual(3)
      expect(r.shell!.triangles).toBeGreaterThan(0)
      // every accessor's bytes match its buffer view; the BIN chunk is the one buffer
      const views = json.bufferViews as { byteLength: number }[]
      for (const a of json.accessors as { bufferView: number; count: number; type: string; componentType: number }[])
        expect(views[a.bufferView].byteLength).toBe(a.count * (a.type === 'VEC3' ? 3 : 1) * 4)
      expect((json.buffers as { byteLength: number }[])[0].byteLength).toBe(binLength)
      expect(r.shell!.bounds.max[1]).toBeGreaterThan(r.shell!.bounds.min[1])
    })
  }

  const duplex = `${BENCH}/duplex/arc.ifc`
  it.skipIf(!present(duplex))('duplex: four storeys, two of them real floors with rooms', async () => {
    const r = await load(duplex)
    expect(r.storeys.length).toBeGreaterThanOrEqual(2)
    const floors = r.storeys.filter((s) => s.unit.walls.length > 20)
    expect(floors.length).toBeGreaterThanOrEqual(2)
    for (const s of floors) {
      const u = s.unit
      const rooms = deriveRooms(u)
      console.log(`duplex ${s.name}: walls ${u.walls.length}, openings ${u.walls.reduce((a, w) => a + w.openings.length, 0)}, labels ${u.roomLabels.length}, rooms ${rooms.length}`)
      expect(rooms.length).toBeGreaterThanOrEqual(5)
      expect(u.walls.reduce((a, w) => a + w.openings.length, 0)).toBeGreaterThanOrEqual(10)
    }
  })

  it('eval table', async () => {
    const files = [
      WALL_FILE,
      ...SCHEMAS.map((s) => `${CERT}/${s}/Simple-Scene/Building-Architecture.ifc`),
      ...(process.env.IFC_BENCH ?? 'duplex,fzk_house,wbdg_office,smiley_west,4351,ac20,dental_clinic,samuel_macalister_sample_house,city_house_munich,hitos,fantasy_residential_building_1,fantasy_office_building_2')
        .split(',')
        .map((n) => `${BENCH}/${n}/arc.ifc`),
    ].filter(present)
    const rows: string[] = ['file | schema | storeys | walls | openings | columns | labels | closed rooms | dangling | crossings | labels outside | other errors | shell tris | ms']
    for (const f of files) {
      const t0 = Date.now()
      try {
        const r = await load(f)
        const ms = Date.now() - t0
        const sum = (fn: (s: (typeof r.storeys)[0]) => number) => r.storeys.reduce((a, s) => a + fn(s), 0)
        const issues = r.storeys.flatMap((s) => validate(s.unit))
        rows.push(
          [
            f.replace(`${CERT}/`, '').replace(`${BENCH}/`, '').replace('/Simple-Scene/Building-Architecture.ifc', '').replace('/arc.ifc', ''),
            r.notes[0].replace('Schema ', '').split(',')[0],
            r.storeys.length,
            sum((s) => s.unit.walls.length),
            sum((s) => s.unit.walls.reduce((a, w) => a + w.openings.length, 0)),
            sum((s) => s.unit.pillars?.length ?? 0),
            sum((s) => s.unit.roomLabels.length),
            sum((s) => deriveRooms(s.unit).length),
            issues.filter((i) => i.code === 'dangling-vertex').length,
            issues.filter((i) => i.code === 'walls-intersect').length,
            issues.filter((i) => i.code === 'label-outside-any-room').length,
            issues.filter((i) => i.level === 'error' && !['dangling-vertex', 'walls-intersect', 'label-outside-any-room'].includes(i.code)).length,
            r.shell?.triangles ?? 0,
            ms,
          ].join(' | '),
        )
      } catch (e) {
        rows.push(`${f} | FAILED ${(e as Error).message} | ${Date.now() - t0}`)
      }
    }
    console.log(rows.join('\n'))
  }, 600_000)
})
