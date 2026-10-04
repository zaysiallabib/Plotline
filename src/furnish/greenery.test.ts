import { describe, expect, test } from 'vitest'
import { library } from '../studio/furniture'
import { kitAsset, rebuildsAtSize, resizeLimits } from './kit'
import { POTTED, SCANS, SHRUBS, TREES } from './procedural.meta'

describe('the library: greenery, outdoor and common-room pieces (session 19)', () => {
  const tab = (name: string) => library().find((t) => t.tab === name)!.items.map((i) => i.id)

  test('Greenery holds every plant: the three potted scans, five more in pots, three planter-box lengths, two shrubs, three trees — each with its size', () => {
    const green = tab('Greenery')
    expect(green).toEqual(
      expect.arrayContaining(['potted_plant_01', 'potted_plant_02', 'potted_plant_04', ...Object.keys(POTTED), 'planter_box_90', 'planter_box_150', 'planter_box_240', ...Object.keys(SHRUBS), ...Object.keys(TREES)]),
    )
    for (const i of library().find((t) => t.tab === 'Greenery')!.items) for (const k of ['x', 'y', 'z'] as const) expect(i.size[k], `${i.id}.${k}`).toBeGreaterThan(0)
    expect(tab('Decor')).not.toContain('potted_plant_01')
  })

  test('outdoor pieces and the lobby / gym pieces have their own tabs', () => {
    expect(tab('Outdoor')).toEqual(expect.arrayContaining(['modular_street_seating', 'outdoor_table_chair_set_01', 'lounger', 'bench_timber', 'pergola', 'swing_frame', 'slide', 'seesaw', 'covered_car']))
    expect(tab('Lobby & gym')).toEqual(expect.arrayContaining(['reception_desk', 'treadmill', 'gym_rack', 'dumbbell_rack', 'gym_mat', 'mirror_panel']))
  })

  test('a planter box grows in length with more plants (it rebuilds), plants and trees scale, a tree is a floor-level piece pieces may stand under', () => {
    expect(rebuildsAtSize('planter_box_150')).toBe(true)
    expect(resizeLimits('planter_box_150')).toMatchObject({ min: { x: 0.6 }, max: { x: 3.0 } })
    expect(resizeLimits('tree_large')!.lock).toEqual(['x', 'y', 'z'])
    expect([kitAsset('tree_large')!.category, kitAsset('tree_large')!.kind]).toEqual(['rug', 'plant'])
  })

  test('every potted piece is as big as its pot and its scan together', () => {
    for (const [id, p] of Object.entries(POTTED)) {
      const s = SCANS[p.plant]
      const k = kitAsset(id)!.sizeM
      expect(k.y, id).toBeCloseTo(p.h - 0.04 + s.max[1], 6)
      expect(k.x, id).toBeGreaterThanOrEqual(p.d)
    }
  })
})
