import { describe, expect, it } from 'vitest'
import { deriveRooms, type Unit } from '../core'
import { FINISH_CATALOG } from '../furnish/finishes'
import { kitAsset, objectKind } from '../furnish/kit'
import { furnish } from '../furnish/presets'
import { library } from './furniture'
import { entry, firstMatch, listing, pushRecent, RECENT_MAX, score } from './library'

const ids = (q: string) => listing(q).flatMap((g) => g.kinds.flatMap((k) => k.items.map((i) => i.id)))
const names = (q: string) => listing(q).flatMap((g) => g.kinds.flatMap((k) => k.items.map((i) => i.label)))

describe('the library listing: search, groups, Recent', () => {
  it('no query: every group of library() with its count, its pieces by kind, nothing lost', () => {
    const groups = listing('')
    const tabs = library().filter((t) => t.items.length)
    expect(groups.map((g) => [g.name, g.count])).toEqual(tabs.map((t) => [t.tab, t.items.length]))
    for (const g of groups) expect(g.kinds.flatMap((k) => k.items).length).toBe(g.count)
    expect(groups.find((g) => g.name === 'Living')!.kinds.map((k) => k.name)).toEqual(expect.arrayContaining(['Sofas', 'Armchairs', 'Coffee tables']))
  })

  it('finds by name, kind, tag and room; whole room words only ("bed" finds beds, not every bedroom piece)', () => {
    expect(names('sofa').every((n) => /sofa/i.test(n))).toBe(true)
    expect(ids('almirah')).toEqual(expect.arrayContaining(['wardrobe_tall', 'wardrobe_2door'])) // a kind word
    expect(ids('nightstand')).toContain('side_table_01') // a tag
    expect(ids('balcony')).toEqual(expect.arrayContaining(['bench_timber', 'planter_box_150', 'pot_fern'])) // a room word: Outdoor, Greenery
    expect(ids('bed')).not.toContain('wardrobe_tall')
    expect(ids('lamps')).toContain('modern_ceiling_lamp_01') // plural
    expect(ids('dining basin')).toContain('basin')
    expect(listing('dining basin')[0].name).toBe('Dining') // the hand-wash basin is under Dining (Dhaka)
    expect(ids('zzzz')).toEqual([])
  })

  it('a word of the name ranks before a tag, and its group comes first; Enter picks the first one listed', () => {
    const e = entry('modern_ceiling_lamp_01')!
    expect(score(e, ['lamp'])).toBeGreaterThan(score(entry('ceiling_light')!, ['lamp']))
    expect(firstMatch('bed')!.label).toMatch(/\bbed\b/i)
    expect(firstMatch('ceiling fan')!.id).toBe('ceiling_fan')
    expect(firstMatch('sofa')!.id).toBe(listing('sofa')[0].kinds[0].items[0].id)
    expect(firstMatch('')).toBeNull()
    expect(firstMatch('zzzz')).toBeNull()
  })

  it('Recent: the last picked first, no repeats, at most six, listed on top only without a query', () => {
    let r: string[] = []
    for (const id of ['sofa_02', 'fridge', 'sofa_02', 'a', 'b', 'c', 'd', 'e']) r = pushRecent(r, id)
    expect(r).toEqual(['e', 'd', 'c', 'b', 'a', 'sofa_02'])
    expect(r).toHaveLength(RECENT_MAX)
    const top = listing('', ['fridge', 'gone_id', 'sofa_02'])[0]
    expect([top.name, top.count, top.kinds[0].items.map((i) => i.id)]).toEqual(['Recent', 2, ['fridge', 'sofa_02']])
    expect(listing('sofa', ['fridge']).some((g) => g.name === 'Recent')).toBe(false)
  })

  it('every row has a footprint in feet and a mark: built in code or a scan', () => {
    expect(entry('sofa_3seat')).toMatchObject({ scan: false, feet: `7'-3" × 3'-0"` })
    expect(entry('sofa_02')!.scan).toBe(true)
  })
})

describe('nothing only in a built-in file (CLAUDE.md "Nothing only Claude can do", workflow point 7)', () => {
  it('every piece the built-in flats and levels show is in the library, but what the plan itself lays (planter beds, stairs)', () => {
    const listed = new Set(library().flatMap((t) => t.items.map((i) => i.id)))
    const units = Object.values(import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' }))
    expect(units.length).toBeGreaterThanOrEqual(20)
    const shown = new Set(units.flatMap((u) => [...u.furniture, ...furnish(u, deriveRooms(u))].map((p) => p.assetId)))
    // a planter bed fills a drawn planter zone by its own outline, a stair stands in a stair room: drawn in the Studio, not picked
    const missing = [...shown].filter((id) => !listed.has(id) && !id.startsWith('planter_bed') && objectKind(kitAsset(id)!) !== 'stair')
    expect(missing).toEqual([])
    // their finishes are the catalog's (finishes.test.ts), and every texture of the list can be offered as one (Finishes → Add option)
    const options = new Set(FINISH_CATALOG.flatMap((s) => s.options.map((o) => JSON.stringify(o))))
    for (const u of units) for (const s of u.finishSlots) for (const o of s.options) expect(options.has(JSON.stringify(o))).toBe(true)
  })
})

describe('the Outside group (session 31): what hangs on a building or stands on its roof', () => {
  it('lists every piece made for the outside, by kind; the edge planter also under Greenery, the porch roof under Outdoor', () => {
    const outside = listing('').find((g) => g.name === 'Outside')!
    const ids = outside.kinds.flatMap((k) => k.items.map((i) => i.id))
    expect(ids).toEqual(expect.arrayContaining(['canopy_glass', 'canopy_slab', 'porch_roof', 'sunshade', 'awning_fabric', 'fins_vertical', 'louvre_screen', 'jaali_screen', 'planter_edge', 'fire_escape', 'solar_panel', 'chimney', 'flagpole', 'name_sign']))
    for (const id of ids.filter((id) => kitAsset(id)?.mount === 'wall')) expect(kitAsset(id)!.outdoor, id).toBe(true) // each one may go on an outer face
    expect(entry('planter_edge')!.rooms).toEqual(['Greenery', 'Outside'])
    expect(entry('porch_roof')!.rooms).toEqual(['Outdoor', 'Outside'])
    expect(outside.kinds.map((k) => k.name)).toEqual(expect.arrayContaining(['Sunshades', 'Canopies and porch roofs', 'Screens and fins', 'Solar panels']))
  })

  it('found by the words people use: chhajja, louver, jaali, aircon, PV', () => {
    expect(firstMatch('chhajja')!.id).toBe('sunshade')
    expect(ids('louver')).toContain('louvre_screen')
    expect(ids('jaali')).toContain('jaali_screen')
    expect(ids('facade')).toEqual(expect.arrayContaining(['sunshade', 'canopy_glass']))
    expect(ids('pv')).toContain('solar_panel')
  })
})
