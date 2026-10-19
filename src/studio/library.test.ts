import { describe, expect, it } from 'vitest'
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
