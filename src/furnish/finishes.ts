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
import { isOutdoor, roomPolygon, type Configuration, type FinishOption, type FinishSlot, type Id, type MaterialRef, type Room, type RoomKind, type Unit, type Wall } from '../core'

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
const NOT_BATH: RoomKind[] = ['bed', 'living', 'dining', 'kitchen', 'balcony', 'study', 'closet', 'utility', 'shaft', 'other', 'foyer', 'pantry', 'maid', 'prayer', 'lobby', 'gym', 'community', 'guard']

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
    kinds: ['living', 'dining', 'other', 'foyer', 'prayer', 'community'],
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
    kinds: ['kitchen', 'bath', 'utility', 'pantry', 'maid', 'guard'],
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
 * A roof's coverings (data/building/roof.ts Roof.covering): finish options over the roof texture sets, chosen by staff for the
 * whole building (Studio → Building → Roof; the 3D view's Finishes → click the roof). A flat roof's deck and a pitched roof's
 * slopes take their own; the first of each is the roof as it was drawn before any was chosen (the plaster slab, the grey sheet).
 */
export const ROOF_COVERINGS: { flat: FinishOption[]; pitched: FinishOption[] } = {
  flat: [
    { id: 'rc_slab', brand: 'Generic', sku: 'ROOF-SLAB', label: 'Plain roof slab', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'plaster_white', tint: '#dbd3c6' } },
    { id: 'rc_gravel', brand: 'Generic', sku: 'ROOF-GRAVEL-16', label: 'Gravel', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'roof_gravel', tint: '#b8b4ab' } },
    { id: 'rc_green', brand: 'Generic', sku: 'ROOF-GREEN-SEDUM', label: 'Green roof', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'turf', tint: '#c9cf9a' } },
    { id: 'rc_terrace', brand: 'Mir Ceramic', sku: 'MIR-TERRA-300', label: 'Terracotta terrace tiles', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'tile_floor_terracotta' } },
  ],
  pitched: [
    { id: 'rc_sheet', brand: 'Generic', sku: 'ROOF-SHEET-GREY', label: 'Grey metal sheet', priceDeltaBdt: 0, material: { kind: 'color', color: '#6b6660', roughness: 0.75 } },
    { id: 'rc_clay', brand: 'Generic', sku: 'ROOF-CLAY-TILE', label: 'Clay tiles', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'roof_clay' } },
    { id: 'rc_slate', brand: 'Generic', sku: 'ROOF-SLATE', label: 'Slate', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'roof_slate' } },
    { id: 'rc_zinc', brand: 'Generic', sku: 'ROOF-ZINC-SEAM', label: 'Zinc standing seam', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'metal_seam', tint: '#aeb2b6' } },
    { id: 'rc_shingles', brand: 'Generic', sku: 'ROOF-SHINGLE-TIMBER', label: 'Timber shingles', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'roof_shingles' } },
    { id: 'rc_corrugated', brand: 'Generic', sku: 'ROOF-CORRUGATED', label: 'Corrugated metal', priceDeltaBdt: 0, material: { kind: 'pbr', textureId: 'metal_corrugated' } },
  ],
}

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
  const poly = roomPolygon(room, unit) // (a room going round a column has points that are no vertex: Room.joinPts)
  const at = (k: number) => poly[((k % n) + n) % n] // wallIds[k] runs loop[k] → loop[k + 1]
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

// ── the outside (session 31 facade, founder: "real buildings look a lot different from the outside … make sure they can be
// used in any and all projects") ─────────────────────────────────────────────────────────────────────────────────────────

/** Plaster as Plotline has drawn every outside: the white stucco scan, warmer and darker than the paint (three/materials.ts EXTERIOR_PLASTER). */
export const OUTSIDE_PLASTER: MaterialRef = { kind: 'pbr', textureId: 'plaster_white', tint: '#dbd3c6' }
const pbr = (textureId: string, tint?: string): MaterialRef => ({ kind: 'pbr', textureId, ...(tint ? { tint } : {}) })
const outside = (id: string, brand: string, label: string, sku: string, material: MaterialRef): FinishOption => ({ id: `fo_out_${id}`, brand, sku, label, priceDeltaBdt: 0, material })
const frame = (id: string, brand: string, label: string, sku: string, material: MaterialRef): FinishOption => ({ id: `fo_frame_${id}`, brand, sku, label, priceDeltaBdt: 0, material })

/**
 * What the outer walls are clad in — a developer's choice for the building, never a buyer's (no price; a buyer link shows what
 * staff chose). Not among a unit's slots (finishSlotsFor): it is kept in the building's own record (data/building/apartments.ts
 * outsideRecord). Its brand line names the family a person picks from; a developer's own brick is Finishes → + Add option.
 */
export const OUTSIDE_SLOT: FinishSlot = {
  id: 's_outside',
  label: 'Outside walls',
  target: 'wall',
  roomIds: [],
  defaultOptionId: 'fo_out_plaster',
  options: [
    outside('plaster', 'Render', 'Warm plaster', 'RENDER-WARM', OUTSIDE_PLASTER),
    outside('render_white', 'Render', 'White render', 'RENDER-WHITE', pbr('plaster_white', '#f1eee8')),
    outside('render_sand', 'Render', 'Sand render', 'RENDER-SAND', pbr('plaster_white', '#d8c6a6')),
    outside('render_terracotta', 'Render', 'Terracotta render', 'RENDER-TERRA', pbr('plaster_white', '#c4876a')),
    outside('render_charcoal', 'Render', 'Charcoal render', 'RENDER-CHAR', pbr('plaster_white', '#57595c')),
    outside('brick_red', 'Brick', 'Red brick', 'BRICK-RED', pbr('brick_red')),
    outside('brick_white', 'Brick', 'White painted brick', 'BRICK-WHITE', pbr('brick_painted', '#f2f0ec')),
    outside('brick_grey', 'Brick', 'Grey brick', 'BRICK-GREY', pbr('brick_painted', '#8f8f8c')),
    outside('stone', 'Stone', 'Stone blocks', 'STONE-BLOCK', pbr('stone_blocks', '#e6e2da')),
    outside('timber_slats', 'Timber', 'Timber slats', 'TIMBER-SLAT', pbr('timber_slats')),
    outside('clapboard', 'Timber', 'Timber clapboard', 'TIMBER-LAP', pbr('timber_clapboard')),
    outside('zinc', 'Metal', 'Zinc panels', 'ZINC-RIB', pbr('metal_seam', '#aeb2b6')),
    outside('metal_dark', 'Metal', 'Dark metal panels', 'METAL-RIB-DARK', pbr('metal_seam', '#5a5e63')),
    outside('corrugated', 'Metal', 'Corrugated metal', 'METAL-CORR', pbr('metal_corrugated')),
    outside('concrete', 'Concrete', 'Fair-faced concrete', 'CONC-FAIR', pbr('concrete_fair', '#d4d8d8')),
    outside('precast', 'Concrete', 'Precast concrete panels', 'CONC-PRECAST', pbr('concrete_precast', '#d4d8d8')),
    outside('fibre_cement', 'Panels', 'Fibre-cement panels', 'PANEL-FC', pbr('panel_grid', '#ecebe7')),
    outside('acp_charcoal', 'Panels', 'Charcoal composite panels', 'PANEL-ACP-CHAR', pbr('panel_grid', '#4b4e52')),
    outside('acp_rust', 'Panels', 'Rust composite panels', 'PANEL-ACP-RUST', pbr('panel_grid', '#9a5a3c')),
  ],
}

/** The window, sliding-door and glass-wall frames, the same way (the first: the silver aluminium every window is drawn in). */
export const FRAMES_SLOT: FinishSlot = {
  id: 's_frames',
  label: 'Window frames',
  target: 'wall',
  roomIds: [],
  defaultOptionId: 'fo_frame_silver',
  options: [
    frame('silver', 'Aluminium', 'Silver', 'ALU-SILVER', { kind: 'color', color: '#d5d7d6', roughness: 0.45, metalness: 0.15 }),
    frame('white', 'Aluminium', 'White', 'RAL-9010', { kind: 'color', color: '#eeebe2', roughness: 0.4, metalness: 0 }),
    frame('anthracite', 'Aluminium', 'Anthracite', 'RAL-7016', { kind: 'color', color: '#3a4045', roughness: 0.45, metalness: 0.15 }),
    frame('black', 'Aluminium', 'Black', 'RAL-9005', { kind: 'color', color: '#1d1e20', roughness: 0.45, metalness: 0.15 }),
    frame('timber', 'Timber', 'Timber', 'TIMBER-FRAME', pbr('wood_veneer_light', '#7a5a42')),
  ],
}

/** "Same as the walls" (EDGES_SLOT's first option): each edge wears its own wall's outside — a brick tower's slab edges brick */
export const EDGE_SAME = 'fo_edge_walls'
const edge = (id: string, brand: string, label: string, sku: string, material: MaterialRef): FinishOption => ({ id: `fo_edge_${id}`, brand, sku, label, priceDeltaBdt: 0, material })
/**
 * The building's edges and caps (session 31 outside2): the floor slabs' edges between the storeys, a balcony's slab edge, the
 * cap on a solid low wall, the ground floor's columns, the roof's cornice. The first follows the walls (a brick tower: brick
 * edges, no plaster seams); or the plaster, fair-faced concrete, anthracite metal for every edge of the building. Its
 * material is only its swatch's: what "same as the walls" wears is each wall's own (Outside.edge).
 */
export const EDGES_SLOT: FinishSlot = {
  id: 's_edges',
  label: 'Edges and caps',
  target: 'wall',
  roomIds: [],
  defaultOptionId: EDGE_SAME,
  options: [
    edge('walls', 'Outside walls', 'Same as the walls', 'EDGE-AS-WALLS', OUTSIDE_PLASTER),
    edge('plaster', 'Render', 'Plaster', 'EDGE-PLASTER', OUTSIDE_PLASTER),
    edge('concrete', 'Concrete', 'Fair-faced concrete', 'EDGE-CONC', pbr('concrete_fair', '#d4d8d8')),
    edge('metal', 'Metal', 'Anthracite metal', 'EDGE-METAL', { kind: 'color', color: '#3a4045', roughness: 0.45, metalness: 0.15 }),
  ],
}

/**
 * The building's outside record (a Configuration) holds: OUTSIDE_SLOT's id (every outer wall), FRAMES_SLOT's (every frame),
 * EDGES_SLOT's (every edge and cap),
 * one wall's outside on every floor its drawing stands on, one floor's outer walls (a plinth band), one window's frame.
 */
export const outsideKey = (drawing: Id, run: Id): string => `out:${drawing}:${run}`
export const outsideFloorKey = (floor: number): string => `out:floor:${floor}`
export const frameKey = (drawing: Id, openingId: Id): string => `frame:${drawing}:${openingId}`

/** The outside, resolved for the 3D (three/building.ts, PlotlineScene). Null: nothing chosen there — drawn as it always was. */
export interface Outside {
  /** wall run `run` (outerRuns) of drawing `drawing` on floor `floor`: its own choice, its floor's, the building's */
  wall(drawing?: Id | null, run?: Id | null, floor?: number): MaterialRef | null
  /** the edges of wall run `run` on floor `floor` (its slab edge, its cap, a balcony's band; no run: a ground column): the building's Edges and caps, else as wall() */
  edge(drawing?: Id | null, run?: Id | null, floor?: number): MaterialRef | null
  /** opening `openingId`'s frame: its own choice, the building's */
  frame(drawing?: Id | null, openingId?: Id | null): MaterialRef | null
  /** the record's choices, sorted ('' = none): two equal ones draw alike */
  sig: string
  /** some frame is chosen (the building's or one window's): the tower's panes carry a colour each */
  framed: boolean
  /** some outer wall or floor has its own outside (not only the building's): an architect's shape is dressed a wall at a time */
  local: boolean
}

/** `rec` (the building's outside record) over `slots` (OUTSIDE_SLOT, FRAMES_SLOT and EDGES_SLOT with staff's own options: own.ts withOwnOptions); a choice not among the options is ignored. */
export function outsideOf(rec: Configuration, slots: FinishSlot[] = [OUTSIDE_SLOT, FRAMES_SLOT, EDGES_SLOT]): Outside {
  const walls = slots.find((s) => s.id === OUTSIDE_SLOT.id) ?? OUTSIDE_SLOT
  const frames = slots.find((s) => s.id === FRAMES_SLOT.id) ?? FRAMES_SLOT
  const edges = slots.find((s) => s.id === EDGES_SLOT.id) ?? EDGES_SLOT
  const pick = (slot: FinishSlot, keys: (string | null)[]): MaterialRef | null => {
    for (const k of keys) {
      const o = k !== null && rec[k] !== undefined ? slot.options.find((x) => x.id === rec[k]) : undefined
      if (o) return o.material
    }
    return null
  }
  const entries = Object.entries(rec).sort()
  const wall: Outside['wall'] = (drawing, run, floor) => pick(walls, [drawing && run ? outsideKey(drawing, run) : null, floor !== undefined ? outsideFloorKey(floor) : null, walls.id])
  return {
    wall,
    edge: (drawing, run, floor) => (rec[edges.id] !== EDGE_SAME && pick(edges, [edges.id])) || wall(drawing, run, floor),
    frame: (drawing, openingId) => pick(frames, [drawing && openingId ? frameKey(drawing, openingId) : null, frames.id]),
    sig: entries.length ? JSON.stringify(entries) : '',
    framed: entries.some(([k]) => k === frames.id || k.startsWith('frame:')),
    local: entries.some(([k]) => k.startsWith('out:')),
  }
}

const RUNS = new WeakMap<object, Map<Id, Id>>()
/**
 * The wall an outside face is chosen by: walls end to end in a straight line (within ~1°) and as tall as each other are one
 * wall to look at — the graph splits an outer wall wherever a room's wall meets it from inside — named by the smallest id in
 * the run, whichever piece was clicked (faceWallId's rule, without a room). A parapet in line with a storey wall is its own.
 */
export function outerRuns(unit: Pick<Unit, 'vertices' | 'walls'>): Map<Id, Id> {
  const kept = RUNS.get(unit)
  if (kept) return kept
  const up = new Map(unit.walls.map((w) => [w.id, w.id]))
  const root = (id: Id): Id => {
    let r = id
    while (up.get(r) !== r) r = up.get(r)!
    up.set(id, r)
    return r
  }
  const ends = new Map<Id, { w: Wall; dx: number; dy: number }[]>()
  const vs = new Map(unit.vertices.map((v) => [v.id, v]))
  for (const w of unit.walls) {
    const [a, b] = [vs.get(w.a), vs.get(w.b)]
    const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
    if (!a || !b || L < 1e-6) continue
    const [dx, dy] = [(b.x - a.x) / L, (b.y - a.y) / L]
    for (const [v, s] of [[w.a, 1], [w.b, -1]] as const) ends.set(v, [...(ends.get(v) ?? []), { w, dx: dx * s, dy: dy * s }])
  }
  // two pieces leaving one corner in opposite directions, alike in height: one wall (the smaller id names the run)
  for (const at of ends.values())
    for (let i = 0; i < at.length; i++)
      for (let j = i + 1; j < at.length; j++) {
        const [p, q] = [at[i], at[j]]
        if (p.dx * q.dx + p.dy * q.dy > -0.9998 || Math.abs(p.w.heightM - q.w.heightM) > 0.01) continue
        const [x, y] = [root(p.w.id), root(q.w.id)]
        if (x !== y) up.set(x < y ? y : x, x < y ? x : y)
      }
  const runs = new Map(unit.walls.map((w) => [w.id, root(w.id)]))
  RUNS.set(unit, runs)
  return runs
}
