/**
 * The parity audit (session 18): what a Studio draft / auto-trace / its share link lacks that the five hand-authored
 * units carry, defaulted in the one place the viewer loads every unit. PURE (parity.test.ts runs it on the founder's
 * draft). A field the unit has always wins; nothing here keys on a unit id or a room's name.
 * Not here: `floor` (the 3D stands an unnumbered flat where the Building view does, render.ts — the load screen and
 * the room chip still show no floor rather than an invented one); `northDeg` (0 = plan-up, normalizeUnit).
 */
import { deriveFlats, deriveRooms, isOutdoor, sqmToSqft, type Flat, type Room, type Unit } from '../core'
import { finishSlotsFor } from '../furnish/finishes'
import { withOwnOptions } from '../furnish/own'
import { isCommonCore } from '../furnish/presets'

/** what Auto-trace named every draft until session 31: a stored draft still carries it; it names nothing */
const TRACED = 'Auto-trace draft'

/**
 * A drawing's title when it has none (session 31 QA: Preview 3D of a traced floor said "Auto-trace draft · 3,493 sqft"):
 * its one flat's printed type ("Type A"), else "Floor plan A" for a whole floor — several flats, or the stair and lift
 * drawn in it (a whole-floor drawing's name, founder 2026-10-09) — else "Untitled unit". The project's name, when it has
 * one, is the line above it on the start screen. The Studio's name box shows it in grey while no name is typed.
 */
export function titleOf(u: Unit, rooms: Room[], known?: Flat[]): string {
  const own = u.name?.trim()
  if (own && own !== TRACED) return own
  const flats = known ?? deriveFlats(u, rooms)
  if (flats.length === 1 && !/^Flat \d+$/.test(flats[0].name)) return flats[0].name
  return flats.length > 1 || rooms.some((r) => r.kind === 'other' && isCommonCore(r)) ? 'Floor plan A' : 'Untitled unit'
}

const TITLES = new WeakMap<Unit, string>()
/** titleOf a drawing of a tower (its rooms worked out once per drawing): the Building view's words name its flats by it, as the walk names the one walked */
export function drawingTitle(u: Unit): string {
  let t = TITLES.get(u)
  if (t === undefined) TITLES.set(u, (t = titleOf(u, deriveRooms(u))))
  return t
}

/** as auto-trace counts a flat with no printed area: the closed rooms' total, sqft (shafts out; a lawn, drive or deck is no floor area) */
export const roomsSqft = (rooms: Room[]): number => Math.round(sqmToSqft(rooms.filter((r) => r.kind !== 'shaft' && !isOutdoor(r.kind)).reduce((t, r) => t + r.areaSqm, 0)))

export function withDefaults(u: Unit, rooms: Room[]): Unit {
  return {
    ...u,
    name: titleOf(u, rooms),
    areaSqft: u.areaSqft || roomsSqft(rooms),
    // no slots of its own: the catalog by room kind (furnish/finishes.ts); the staff's own options at the end of theirs
    finishSlots: withOwnOptions(finishSlotsFor(u, rooms)),
  }
}
