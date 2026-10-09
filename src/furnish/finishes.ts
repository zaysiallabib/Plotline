/**
 * The finish catalog (session 18, ask 3): the buyer-selectable slots every unit offers — ONE source for the options,
 * their brands / SKUs / integer BDT deltas and their ids. PURE (Vitest runs it in node).
 *
 * A unit that carries its own `finishSlots` keeps them: the five hand-authored JSONs carry exactly these slots with the
 * room lists their author chose (finishes.test.ts holds them to this catalog). A unit with none — a Studio draft, an
 * auto-trace, a share link of either — gets them here, by ROOM KIND, never by a room's name or a unit's id.
 * Slot and option ids are fixed strings (invariant 4): a buyer's choice (`?c=`, an events row) means the same thing
 * after the plan is edited and re-published.
 */
import { isOutdoor, vertexById, type FinishSlot, type Id, type Room, type RoomKind, type Unit } from '../core'

export type CatalogSlot = Omit<FinishSlot, 'roomIds'> & {
  /** the room kinds this slot covers on a unit without slots of its own; 'all' = every room */
  kinds: RoomKind[] | 'all'
  /** the kinds it covers on a common LEVEL instead (isLevel): there an 'other' face is the stair / lift core, not a foyer */
  levelKinds?: RoomKind[]
}

/**
 * A LEVEL — a ground floor, basement, rooftop, a common floor: outdoor zones (core.isOutdoor) besides planters, or common
 * rooms (lobby, gym, community, guard: a flat has none). Walked (viewer/spawn.ts) and finished by its own rules.
 */
const COMMON: RoomKind[] = ['lobby', 'gym', 'community', 'guard']
export const isLevel = (rooms: Room[]): boolean => rooms.some((r) => (isOutdoor(r.kind) && r.kind !== 'planter') || COMMON.includes(r.kind))

/** Every kind but the wet rooms' tiled walls: a shaft or an unnamed "Space N" ('other') is painted like a room. */
const NOT_BATH: RoomKind[] = ['bed', 'living', 'dining', 'kitchen', 'balcony', 'study', 'closet', 'utility', 'shaft', 'other', 'lobby', 'gym', 'community', 'guard']

export const FINISH_CATALOG: CatalogSlot[] = [
  {
    id: 's_floor_beds',
    label: 'Bedroom floors',
    target: 'floor',
    kinds: ['bed', 'study', 'closet'],
    defaultOptionId: 'fo_beds_oak',
    options: [
      { id: 'fo_beds_oak', brand: 'RAK Ceramics', sku: 'RAK-WOOD-OAK', label: 'Oak wood', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'wood_floor_oak' } },
      { id: 'fo_beds_marble', brand: 'Mir Ceramic', sku: 'MIR-MARBLE-WHITE', label: 'White marble', priceDeltaBdt: 185000, material: { kind: 'pbr', textureId: 'marble_floor_white' } },
      { id: 'fo_beds_tile', brand: 'Akij Ceramics', sku: 'AKIJ-PORC-600', label: 'Porcelain tile', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_floor_ceramic' } },
      { id: 'fo_beds_walnut', brand: 'RAK Ceramics', sku: 'RAK-WOOD-WALNUT', label: 'Dark walnut wood', priceDeltaBdt: 45000, material: { kind: 'pbr', textureId: 'wood_floor_walnut' } },
    ],
  },
  {
    id: 's_floor_living',
    label: 'Living & dining floors',
    target: 'floor',
    // lobby, foyer, passage and every unnamed closed space walk on the living floor; on a level only a lounge does
    kinds: ['living', 'dining', 'other', 'community'],
    levelKinds: ['living', 'dining', 'community'],
    defaultOptionId: 'fo_living_marble',
    options: [
      { id: 'fo_living_marble', brand: 'Mir Ceramic', sku: 'MIR-MARBLE-WHITE', label: 'White marble', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'marble_floor_white' } },
      { id: 'fo_living_tile', brand: 'Akij Ceramics', sku: 'AKIJ-PORC-600', label: 'Porcelain tile', priceDeltaBdt: -95000, material: { kind: 'pbr', textureId: 'tile_floor_ceramic' } },
      { id: 'fo_living_oak', brand: 'RAK Ceramics', sku: 'RAK-WOOD-OAK', label: 'Oak wood', priceDeltaBdt: 120000, material: { kind: 'pbr', textureId: 'wood_floor_oak' } },
      { id: 'fo_living_walnut', brand: 'RAK Ceramics', sku: 'RAK-WOOD-WALNUT', label: 'Dark walnut wood', priceDeltaBdt: 140000, material: { kind: 'pbr', textureId: 'wood_floor_walnut' } },
    ],
  },
  {
    id: 's_floor_wet',
    label: 'Kitchen & bath floors',
    target: 'floor',
    kinds: ['kitchen', 'bath', 'utility', 'guard'],
    defaultOptionId: 'fo_wet_tile',
    options: [
      { id: 'fo_wet_tile', brand: 'Akij Ceramics', sku: 'AKIJ-CER-300', label: 'Ceramic tile', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_floor_ceramic' } },
      { id: 'fo_wet_marble', brand: 'Mir Ceramic', sku: 'MIR-MARBLE-WHITE', label: 'White marble', priceDeltaBdt: 60000, material: { kind: 'pbr', textureId: 'marble_floor_white' } },
      { id: 'fo_wet_grey', brand: 'Akij Ceramics', sku: 'AKIJ-PORC-GR600', label: 'Grey porcelain tile', priceDeltaBdt: 15000, material: { kind: 'pbr', textureId: 'tile_floor_ceramic', tint: '#b4b3b0' } },
    ],
  },
  {
    id: 's_floor_veranda',
    label: 'Veranda floors',
    target: 'floor',
    kinds: ['balcony'],
    defaultOptionId: 'fo_veranda_tile',
    options: [
      { id: 'fo_veranda_tile', brand: 'RAK Ceramics', sku: 'RAK-OUTDOOR-R11', label: 'Outdoor tile', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_floor_outdoor' } },
      { id: 'fo_veranda_terracotta', brand: 'Mir Ceramic', sku: 'MIR-TERRA-300', label: 'Terracotta tile', priceDeltaBdt: 18000, material: { kind: 'pbr', textureId: 'tile_floor_terracotta' } },
    ],
  },
  // the common rooms of a ground floor / rooftop (session 19): a lobby on large-format stone-look porcelain, a gym on rubber
  {
    id: 's_floor_lobby',
    label: 'Lobby floors',
    target: 'floor',
    kinds: ['lobby'],
    levelKinds: ['lobby', 'other'], // a level's stair landings, lift cars and passages: the common core's floor
    defaultOptionId: 'fo_lobby_porcelain',
    options: [
      { id: 'fo_lobby_porcelain', brand: 'Akij Ceramics', sku: 'AKIJ-PORC-800-IV', label: 'Polished ivory porcelain 800 × 800', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_floor_large', tint: '#f3eee6' } },
      { id: 'fo_lobby_marble', brand: 'Mir Ceramic', sku: 'MIR-MARBLE-WHITE', label: 'White marble', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'marble_floor_white' } },
    ],
  },
  {
    id: 's_floor_gym',
    label: 'Gym floor',
    target: 'floor',
    kinds: ['gym'],
    defaultOptionId: 'fo_gym_rubber',
    options: [{ id: 'fo_gym_rubber', brand: 'Generic', sku: 'RUBBER-TILE-15', label: 'Rubber gym tiles 15 mm', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'rubber_gym' } }],
  },
  {
    id: 's_wall_paint',
    label: 'Wall paint',
    target: 'wall',
    kinds: NOT_BATH,
    defaultOptionId: 'fo_paint_warm_white',
    options: [
      { id: 'fo_paint_warm_white', brand: 'Berger', sku: 'BGR-SILK-1027', label: 'Berger Silk Warm White', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#f4f1ea' } },
      { id: 'fo_paint_off_white', brand: 'Asian Paints', sku: 'AP-ROY-L101', label: 'Asian Paints Royale Off White', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#eeebe4' } },
      { id: 'fo_paint_cream', brand: 'Berger', sku: 'BGR-SILK-2011', label: 'Berger Silk Cream', priceDeltaBdt: 12000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#e9e2d0' } },
      { id: 'fo_paint_sand', brand: 'Elite Paint', sku: 'ELT-SLK-2108', label: 'Elite Silk Sandstone', priceDeltaBdt: 12000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#e3d6c0' } },
      { id: 'fo_paint_greige', brand: 'Nippon Paint', sku: 'NP-ODL-1203', label: 'Nippon Warm Greige', priceDeltaBdt: 15000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#d8d0c4' } },
      { id: 'fo_paint_pale_grey', brand: 'Nippon Paint', sku: 'NP-ODL-0917', label: 'Nippon Pale Grey', priceDeltaBdt: 15000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#d9dad7' } },
      { id: 'fo_paint_sage', brand: 'Asian Paints', sku: 'AP-ROY-7872', label: 'Asian Paints Royale Sage', priceDeltaBdt: 18000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#d0d8c9' } },
      { id: 'fo_paint_dusty_blue', brand: 'Asian Paints', sku: 'AP-ROY-8255', label: 'Asian Paints Royale Dusty Blue', priceDeltaBdt: 20000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#bfcad2' } },
      { id: 'fo_paint_terracotta', brand: 'Elite Paint', sku: 'ELT-SLK-3302', label: 'Elite Silk Soft Terracotta', priceDeltaBdt: 22000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#d8aa92' } },
      { id: 'fo_paint_slate_blue', brand: 'Berger', sku: 'BGR-SILK-6153', label: 'Berger Silk Slate Blue', priceDeltaBdt: 35000, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#6b7d8f' } },
    ],
  },
  {
    id: 's_wall_bath',
    label: 'Bath walls',
    target: 'wall',
    kinds: ['bath'],
    defaultOptionId: 'fo_bathwall_white',
    options: [
      { id: 'fo_bathwall_white', brand: 'RAK Ceramics', sku: 'RAK-WALL-WHITE-300', label: 'White wall tile', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_wall_white' } },
      { id: 'fo_bathwall_beige', brand: 'Akij Ceramics', sku: 'AKIJ-WALL-BG-3060', label: 'Warm beige wall tile', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_wall_white', tint: '#ecdfc8' } },
      { id: 'fo_bathwall_grey_marble', brand: 'DBL Ceramics', sku: 'DBL-WALL-GRM-3060', label: 'Grey marble-look tile', priceDeltaBdt: 45000, material: { kind: 'pbr', textureId: 'tile_wall_marble_grey' } },
    ],
  },
  {
    id: 's_ceiling',
    label: 'Ceiling',
    target: 'ceiling',
    kinds: 'all',
    defaultOptionId: 'fo_ceiling_white',
    options: [
      { id: 'fo_ceiling_white', brand: 'Berger', sku: 'BERGER-CEILING-WHITE', label: 'Ceiling white', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#ffffff' } },
    ],
  },
]

/**
 * The slots a unit offers: its own when it has any, else the catalog by room kind over `rooms` (core.deriveRooms of the
 * unit; an unnamed closed face is 'other' → the living floor and the paint). A slot no room falls in is left out, so a
 * flat without a veranda shows no "Veranda floors". Shafts get no floor slot (the hand-authored units leave theirs out).
 */
export function finishSlotsFor(unit: Unit, rooms: Room[]): FinishSlot[] {
  if (unit.finishSlots?.length) return unit.finishSlots
  const level = isLevel(rooms)
  return FINISH_CATALOG.flatMap(({ kinds: all, levelKinds, ...slot }): FinishSlot[] => {
    const kinds = (level && levelKinds) || all
    // 'all' (the ceiling) is offered when some room has one: an outdoor zone has none
    const roomIds = kinds === 'all' ? rooms.filter((r) => !isOutdoor(r.kind)).map((r) => r.id) : rooms.filter((r) => kinds.includes(r.kind)).map((r) => r.id)
    return roomIds.length ? [{ ...slot, roomIds: kinds === 'all' ? 'all' : roomIds }] : []
  })
}

/**
 * Configuration keys beside the slot ids (session 23, founder: "Bed 1's floor must not change Bed 2"): one room's floor /
 * walls / ceiling, and one wall's face toward a room. The value is still an option of the slot covering that room
 * (slotFor), so a per-room choice is developer-approved too. Priority (materials.ts resolveFinishRef): wall face → room →
 * the slot (the group) → its default.
 */
export const roomKey = (roomId: Id, target: FinishSlot['target']): string => `room:${roomId}:${target}`
export const wallKey = (wallId: Id, roomId: Id): string => `wall:${wallId}:${roomId}`

/** The slot covering this room for this target: one naming the room beats one for 'all'. */
export function slotFor(slots: FinishSlot[], roomId: Id, target: FinishSlot['target']): FinishSlot | undefined {
  let slot: FinishSlot | undefined
  for (const s of slots) {
    if (s.target !== target) continue
    if (s.roomIds === 'all') slot ??= s
    else if (s.roomIds.includes(roomId)) slot = s
  }
  return slot
}

/**
 * The wall a wall FACE is chosen by. Walls in line along the room's outline are one wall to look at — the graph splits a
 * wall wherever another meets it from behind (Type A's Bed-1: 9 wall pieces round 6 corners) — so the run is named by the
 * smallest id in it, whichever piece was clicked. A wall not on the room's outline (a free-standing one) is its own.
 */
export function faceWallId(unit: Pick<Unit, 'vertices'>, room: Room, wallId: Id): Id {
  const n = room.wallIds.length
  const i = room.wallIds.indexOf(wallId)
  if (i < 0) return wallId
  const at = (k: number) => vertexById(unit.vertices, room.loop[((k % n) + n) % n]) // wallIds[k] runs loop[k] → loop[k + 1]
  const dir = (k: number) => {
    const [a, b] = [at(k), at(k + 1)]
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  }
  const d = dir(i)
  const inLine = (k: number) => {
    const e = dir(k)
    return Math.abs(d.x * e.y - d.y * e.x) < 0.02 && d.x * e.x + d.y * e.y > 0 // within ~1°, same way round
  }
  let best = wallId
  for (const step of [1, -1]) {
    for (let k = i + step; Math.abs(k - i) < n && inLine(k); k += step) {
      const id = room.wallIds[((k % n) + n) % n]
      if (id < best) best = id
    }
  }
  return best
}
