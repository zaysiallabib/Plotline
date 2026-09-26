/**
 * A unit reflected about the vertical line x = axisX (plan space): the opposite flat of a mirrored pair.
 *
 * A reflection reverses orientation, so every wall's a/b is swapped: the wall's +normal (wallFrame) then still faces
 * the same room, `swing` keeps its meaning, the offset along the wall is re-measured from the new a
 * (L − offset − width) and the hinge jamb swaps name. ids get a `-m` suffix; the plan image is kept as is (the
 * reflected coordinates live in the same frame, so the unflipped drawing still registers). Furniture is dropped:
 * presets re-run at load, and placed assets are chiral.
 */
import { vertexMap } from './geometry'
import type { Unit } from './types'

const m = (id: string) => `${id}-m`

export function mirrorUnit(unit: Unit, axisX: number): Unit {
  const vs = vertexMap(unit.vertices)
  return {
    ...unit,
    id: m(unit.id),
    vertices: unit.vertices.map((v) => ({ ...v, id: m(v.id), x: 2 * axisX - v.x })),
    walls: unit.walls.map((w) => {
      const a = vs.get(w.a)
      const b = vs.get(w.b)
      const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
      return {
        ...w,
        id: m(w.id),
        a: m(w.b),
        b: m(w.a),
        openings: w.openings.map((o) => ({
          ...o,
          id: m(o.id),
          offsetM: L - o.offsetM - o.widthM,
          ...(o.hinge ? { hinge: o.hinge === 'a' ? ('b' as const) : ('a' as const) } : {}),
        })),
      }
    }),
    roomLabels: unit.roomLabels.map((l) => ({ ...l, id: m(l.id), x: 2 * axisX - l.x })),
    furniture: [],
    finishSlots: unit.finishSlots.map((s) => ({ ...s, roomIds: s.roomIds === 'all' ? 'all' : s.roomIds.map(m) })),
  }
}
