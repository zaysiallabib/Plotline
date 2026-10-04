/**
 * A tiny ground level for tests (session 19): a 12 × 10 m plot inside a 1.8 m boundary wall; a 4 × 4 m lobby at
 * +3'-6" in a lawn, joined to the boundary by ONE flush line (heightM 0) so the lawn goes round it (a keyhole face); a
 * 3 m driveway strip split off by flush lines, its last 8 m a 1:8 ramp down to −1 m along +y; a 2 m screen standing
 * alone in the lawn. Not a real sheet — the real levels live in src/data/units / building.
 */
import type { RoomKind, RoomLabel, Unit, Wall } from '../../core'

const wall = (id: string, a: string, b: string, heightM = 3, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.25, heightM, openings: [], ...extra })
const label = (id: string, kind: RoomKind, x: number, y: number, extra: Partial<RoomLabel> = {}): RoomLabel => ({ id, name: id, kind, x, y, ...extra })

export const GROUND_SAMPLE: Unit = {
  id: 'ground-sample',
  projectName: 'Test',
  name: 'Ground',
  northDeg: 0,
  vertices: (
    [
      ['p1', 0, 0], ['t', 2, 0], ['d1', 9, 0], ['p2', 12, 0], ['r2', 12, 2], ['p3', 12, 10], ['d2', 9, 10], ['p4', 0, 10], ['r1', 9, 2],
      ['l1', 2, 2], ['l2', 6, 2], ['l3', 6, 6], ['l4', 2, 6],
      ['s1', 1, 8], ['s2', 3, 8],
    ] as const
  ).map(([id, x, y]) => ({ id, x, y })),
  walls: [
    wall('b1', 'p1', 't', 1.8), wall('b2', 't', 'd1', 1.8), wall('b3', 'd1', 'p2', 1.8), wall('b4', 'p2', 'r2', 1.8), wall('b5', 'r2', 'p3', 1.8),
    wall('b6', 'p3', 'd2', 1.8), wall('b7', 'd2', 'p4', 1.8), wall('b8', 'p4', 'p1', 1.8),
    wall('lob1', 'l1', 'l2'), wall('lob2', 'l2', 'l3'), wall('lob3', 'l3', 'l4'),
    wall('lob4', 'l4', 'l1', 3, { openings: [{ id: 'door', kind: 'door', offsetM: 1.5, widthM: 1.2, heightM: 2.1, sillM: 0 }] }),
    wall('bridge', 't', 'l1', 0), // flush: the lawn's edge round the lobby
    wall('drive1', 'd1', 'r1', 0), wall('drive2', 'r1', 'd2', 0), wall('rampTop', 'r1', 'r2', 0),
    wall('screen', 's1', 's2', 2, { standsAlone: true }),
  ],
  roomLabels: [
    label('Lobby', 'lobby', 4, 4, { levelM: 1.067 }),
    label('Lawn', 'lawn', 1, 5),
    label('Driveway', 'driveway', 10.5, 1),
    label('Ramp', 'driveway', 10.5, 6, { slope: { toLevelM: -1, dirDeg: 180 } }),
  ],
  furniture: [],
  finishSlots: [],
  areaSqft: 0,
}
