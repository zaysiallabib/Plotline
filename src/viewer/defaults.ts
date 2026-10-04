/**
 * The parity audit (session 18): what a Studio draft / auto-trace / its share link lacks that the five hand-authored
 * units carry, defaulted in the one place the viewer loads every unit. PURE (parity.test.ts runs it on the founder's
 * draft). A field the unit has always wins; nothing here keys on a unit id or a room's name.
 * Not here: `floor` (the 3D stands an unnumbered flat where the Building view does, render.ts — the load screen and
 * the room chip still show no floor rather than an invented one); `northDeg` (0 = plan-up, normalizeUnit).
 */
import { isOutdoor, sqmToSqft, type Room, type Unit } from '../core'
import { finishSlotsFor } from '../furnish/finishes'

export function withDefaults(u: Unit, rooms: Room[]): Unit {
  return {
    ...u,
    name: u.name?.trim() || 'Untitled unit',
    // as auto-trace does without a printed area: the closed rooms' total (shafts out; a lawn, drive or deck is no floor area)
    areaSqft: u.areaSqft || Math.round(sqmToSqft(rooms.filter((r) => r.kind !== 'shaft' && !isOutdoor(r.kind)).reduce((t, r) => t + r.areaSqm, 0))),
    // no slots of its own: the catalog by room kind (furnish/finishes.ts)
    finishSlots: finishSlotsFor(u, rooms),
  }
}
