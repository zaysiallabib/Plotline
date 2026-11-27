/**
 * Finish options: the floor / wall / ceiling clicked in 3D (one room, one wall) on top; one block per FinishSlot (a group
 * of rooms), chips with a tinted albedo swatch, brand, delta; the one-room choices made; Options total; Reset. Staff on the
 * flat's own page also dress the building's outside (session 31 facade): an outer wall clicked — this wall, its floor or the
 * whole building — and, at the end, the outside walls and window frames for the whole building.
 * Staff in a building: the roof too (session 31 roof lane) — its line at the foot, its covering's swatches and its fields
 * on top once the roof is clicked in the Building view (or its line's Change).
 */
import { useEffect, useRef, useState } from 'react'
import { useFinger } from './Hud'
import type { Configuration, FinishOption, FinishSlot, Id, MaterialRef } from '../core'
import { EDGES_SLOT, EDGE_SAME, FRAMES_SLOT, OUTSIDE_SLOT, outsideFloorKey, outsideKey } from '../furnish/finishes'
import { isOwnId, ownItem, type OwnFinish } from '../furnish/own'
import { textureSet } from '../furnish/textures'
import { OwnFinishForm } from './OwnFinish'
import { formatDelta, formatTaka, type FinishKeys } from './share'
import { coveringOf, coveringsFor, roofWords, type Roof } from '../data/building/roof'
import { RoofFields } from '../studio/RoofFields'

/**
 * A floor / wall / ceiling clicked in 3D while the panel is open: its room's key (finishes.ts roomKey), a wall's face key too;
 * staff: an outer wall's spot (its drawing and run — none on a block of the ground — the floor it was clicked on, its name).
 */
export interface Surface {
  roomKey?: string
  wallKey?: string
  outside?: { drawing?: Id; run?: Id; floor?: number; name: string }
}

/** Staff: the building's outside record, its slots (walls, frames, edges; the staff's own options in them) and a choice for it (null: back to what it falls back to). */
export interface OutsideProps {
  rec: Configuration
  slots: FinishSlot[]
  onSelect: (key: string, optionId: string | null) => void
}

interface Props {
  slots: FinishSlot[]
  cfg: Configuration
  /** share.ts finishKeys: every one-room / one-wall key with its slot and name */
  keys: FinishKeys
  surface: Surface | null
  /** a slot id, or a one-room / one-wall key; null = that room / wall back to the group's choice */
  onSelect: (key: string, optionId: string | null) => void
  onCloseSurface: () => void
  onReset: () => void
  /** staff (never a buyer link): "Add option" under each group, and their own options editable */
  staff?: boolean
  /** staff on the flat's own page: where the picks are kept, in words ("Kept for floor 3 only …") */
  kept?: string | null
  /** staff on the flat's own page: the building's outside */
  outside?: OutsideProps
  /** staff, the flat in a building that draws its own roof: the roof as drawn, whether its block is open, and changing it */
  roof?: { value: Roof | undefined; read: boolean; open: boolean; onOpen: (open: boolean) => void; onChange: (r: Roof) => void } | null
}

/** The roof of the whole building (staff): its covering as swatches, then its kind, pitch, eaves, edge and roof windows. */
/** a block that opens for what was just clicked (a wall, the outside, the roof) comes into view: the panel may be scrolled
 * down to the outside walls, and the click seemed to do nothing (qa4). Its key changes with the spot, so it runs per click. */
function useShown() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.scrollIntoView({ block: 'start' }), [])
  return ref
}

function RoofBlock({ roof }: { roof: NonNullable<Props['roof']> }) {
  const now = coveringOf(roof.value)
  const shown = useShown()
  return (
    <div className="slot surface" ref={shown}>
      <div className="label">The roof · the whole building</div>
      <div className="chips">
        {coveringsFor(roof.value).map((o) => (
          <Chip key={o.id} o={o} bare on={o.id === now.id} onClick={() => roof.onChange({ ...(roof.value ?? { kind: 'flat' }), covering: o.id })} />
        ))}
      </div>
      <RoofFields roof={roof.value} read={roof.read} onChange={roof.onChange} />
      <button className="link" onClick={() => roof.onOpen(false)}>
        Done
      </button>
    </div>
  )
}

function swatchStyle(m: MaterialRef): React.CSSProperties {
  if (m.kind === 'color') return { background: m.color }
  const tex = textureSet(m.textureId)
  const tint = m.tint ?? '#ffffff'
  // tint × albedo, like the renderer (materials.ts), so a deep paint shows deep, not washed out
  return tex
    ? { backgroundImage: `linear-gradient(${tint}, ${tint}), url(${tex.albedo})`, backgroundBlendMode: 'multiply', backgroundSize: 'cover' }
    : { background: tint }
}

export const chosen = (slot: FinishSlot, cfg: Configuration): FinishOption | undefined =>
  slot.options.find((o) => o.id === (cfg[slot.id] ?? slot.defaultOptionId))

/**
 * Every slot as chosen (or its default), plus each one-room / one-wall choice once at its option's own delta. Flat per
 * choice, not by floor area: a room's marble does not take its share off the group's price (session 23, kept simple).
 */
export const optionsTotal = (slots: FinishSlot[], cfg: Configuration): number => {
  const delta = new Map(slots.flatMap((s) => s.options.map((o) => [o.id, o.priceDeltaBdt]))) // option ids are unique (finishes.test)
  const own = Object.entries(cfg).filter(([k]) => !slots.some((s) => s.id === k))
  return slots.reduce((t, s) => t + (chosen(s, cfg)?.priceDeltaBdt ?? 0), 0) + own.reduce((t, [, o]) => t + (delta.get(o) ?? 0), 0)
}

/** One option; `title` = the "Same as …" chip: what it falls back to shown under it, no price of its own; `bare`: no price (the roof's: staff's choice, not a buyer's). */
function Chip({ o, on, onClick, title, bare }: { o: FinishOption; on: boolean; onClick: () => void; title?: string; bare?: boolean }) {
  return (
    <button className={`chip${on ? ' selected' : ''}`} onClick={onClick}>
      <span className="swatch" style={swatchStyle(o.material)} />
      <span className="chip-text">
        <span>{title ?? o.label}</span>
        <span className="muted">{title ? o.label : o.brand}</span>
      </span>
      {!title && !bare && <span className={`delta${o.priceDeltaBdt ? '' : ' muted'}`}>{formatDelta(o.priceDeltaBdt)}</span>}
    </button>
  )
}

/** The clicked surface: its name, for a wall "This wall" / "The whole room", then "Same as …" and the covering slot's options. */
function SurfaceBlock({ surface, keys, cfg, onSelect, onClose }: { surface: Surface; keys: FinishKeys; cfg: Configuration; onSelect: Props['onSelect']; onClose: () => void }) {
  const [wide, setWide] = useState(false)
  const shown = useShown()
  const key = surface.wallKey && !wide ? surface.wallKey : surface.roomKey
  const k = key && keys.get(key)
  if (!key || !k) return null
  const own = (id: string | undefined) => k.slot.options.find((o) => o.id === id)
  const sel = own(cfg[key])
  const oneWall = key === surface.wallKey
  const fallback = (oneWall && surface.roomKey ? own(cfg[surface.roomKey]) : undefined) ?? chosen(k.slot, cfg)
  return (
    <div className="slot surface" ref={shown}>
      <div className="label">{k.scope}</div>
      {surface.wallKey && (
        <div className="seg seg-fill" role="group" aria-label="Which walls">
          <button className={wide ? '' : 'on'} aria-pressed={!wide} onClick={() => setWide(false)}>
            This wall
          </button>
          <button className={wide ? 'on' : ''} aria-pressed={wide} onClick={() => setWide(true)}>
            The whole room
          </button>
        </div>
      )}
      <div className="chips">
        {fallback && <Chip o={fallback} on={!sel} title={oneWall ? 'Same as the room' : 'Same as the group'} onClick={() => onSelect(key, null)} />}
        {k.slot.options.map((o) => (
          <Chip key={o.id} o={o} on={o.id === sel?.id} onClick={() => onSelect(key, o.id)} />
        ))}
      </div>
      {!surface.outside && (
        <button className="link" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  )
}

const NONE: FinishSlot[] = []
/** "Same as the walls" (the edges' first option) shown in the building's own wall finish: a brick tower's chip is brick */
const asWalls = (o: FinishOption, walls: FinishSlot | undefined, rec: Configuration): FinishOption =>
  o.id === EDGE_SAME && walls ? { ...o, material: chosen(walls, rec)?.material ?? o.material } : o
type Scope = 'wall' | 'floor' | 'building'
/**
 * An outer wall clicked (staff): "This wall" (its run, on every floor its drawing stands on), "This floor" (every outer wall
 * of that floor: a plinth band), "Whole building"; "Same as …" and the outside options; the window frames for the building.
 */
function OutsideBlock({ spot, outside, onClose }: { spot: NonNullable<Surface['outside']>; outside: OutsideProps; onClose: () => void }) {
  const wall = spot.drawing && spot.run ? outsideKey(spot.drawing, spot.run) : null
  const floor = spot.floor !== undefined ? outsideFloorKey(spot.floor) : null
  const [scope, setScope] = useState<Scope>(wall ? 'wall' : floor ? 'floor' : 'building')
  const [walls, frames, edges] = [OUTSIDE_SLOT, FRAMES_SLOT, EDGES_SLOT].map((s) => outside.slots.find((x) => x.id === s.id) ?? s)
  const { rec, onSelect } = outside
  const shown = useShown()
  const key = scope === 'wall' && wall ? wall : scope === 'floor' && floor ? floor : walls.id
  const opt = (id: string | undefined) => walls.options.find((o) => o.id === id)
  const sel = opt(rec[key])
  // what it falls back to: the floor's, then the building's, then the plaster it was always drawn in
  const building = opt(rec[walls.id]) ?? opt(walls.defaultOptionId)
  const fallback = key === walls.id ? undefined : key === wall ? (floor && opt(rec[floor])) || building : building
  const scopes: [Scope, string, boolean][] = [
    ['wall', 'This wall', !!wall],
    ['floor', 'This floor', !!floor],
    ['building', 'Whole building', true],
  ]
  return (
    <div className="slot surface" ref={shown}>
      <div className="label">Outside{spot.name ? ` · ${spot.name}` : ''}</div>
      <div className="seg seg-fill" role="group" aria-label="Which outside walls">
        {scopes
          .filter(([, , ok]) => ok)
          .map(([s, label]) => (
            <button key={s} className={scope === s ? 'on' : ''} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {label}
            </button>
          ))}
      </div>
      <div className="chips">
        {fallback && <Chip o={fallback} on={!sel} bare title={key === wall && floor && rec[floor] ? 'Same as the floor' : 'Same as the building'} onClick={() => onSelect(key, null)} />}
        {walls.options.map((o) => (
          <Chip key={o.id} o={o} bare on={o.id === (sel ?? (key === walls.id ? building : undefined))?.id} onClick={() => onSelect(key, o.id)} />
        ))}
      </div>
      <div className="label">Window frames · whole building</div>
      <div className="chips">
        {frames.options.map((o) => (
          <Chip key={o.id} o={o} bare on={o.id === (rec[frames.id] ?? frames.defaultOptionId)} onClick={() => onSelect(frames.id, o.id)} />
        ))}
      </div>
      <div className="label">Edges and caps · whole building</div>
      <div className="chips">
        {edges.options.map((o) => (
          <Chip key={o.id} o={asWalls(o, walls, rec)} bare on={o.id === (rec[edges.id] ?? edges.defaultOptionId)} onClick={() => onSelect(edges.id, o.id)} />
        ))}
      </div>
      <button className="link" onClick={onClose}>
        Done
      </button>
    </div>
  )
}

export default function FinishesPanel({ slots, cfg, keys, surface, onSelect, onCloseSurface, onReset, staff, kept, outside, roof }: Props) {
  /** the Add option form open under this slot, or one of the staff's own options being changed */
  const [form, setForm] = useState<{ slotId: string; edit?: OwnFinish } | null>(null)
  const outSlots = outside?.slots ?? NONE
  // warm the HTTP cache so the engine's TextureLoader hits it (≤ 200 ms swap after caching)
  useEffect(() => {
    for (const s of [...slots, ...outSlots]) {
      for (const o of s.options) {
        if (o.material.kind !== 'pbr') continue
        const t = textureSet(o.material.textureId)
        for (const url of [t?.albedo, t?.normal, t?.roughness, t?.ao]) if (url) new Image().src = url
      }
    }
  }, [slots, outSlots])

  const finger = useFinger()
  const total = optionsTotal(slots, cfg)
  const ones = Object.entries(cfg).flatMap(([key, id]) => {
    const k = keys.get(key)
    const o = k?.slot.options.find((x) => x.id === id)
    return k && o ? [{ key, scope: k.scope, label: o.label }] : []
  })
  /** a slot's chosen option id, an option's choice: the building's outside slots go to its record */
  const isOut = (id: string) => outSlots.some((s) => s.id === id)
  const select = (slotId: string, id: string) => (isOut(slotId) ? outside!.onSelect(slotId, id) : onSelect(slotId, id))
  const outWalls = outSlots.find((s) => s.id === OUTSIDE_SLOT.id)
  const block = (slot: FinishSlot, sel: string | undefined, price: boolean) => (
    <div key={slot.id} className="slot">
      <div className="label">{slot.label}</div>
      <div className="chips">
        {slot.options.map((o) =>
          staff && isOwnId(o.id) ? (
            <div key={o.id} className="chip-own">
              <Chip o={o} bare={!price} on={o.id === sel} onClick={() => select(slot.id, o.id)} />
              <button className="chip-edit" aria-label={`Change ${o.label}`} title="Your own option: change or remove it" onClick={() => setForm({ slotId: slot.id, edit: ownItem(o.id) as OwnFinish })}>
                ⋯
              </button>
            </div>
          ) : (
            <Chip key={o.id} o={outside ? asWalls(o, outWalls, outside.rec) : o} bare={!price} on={o.id === sel} onClick={() => select(slot.id, o.id)} />
          ),
        )}
      </div>
      {staff &&
        (form?.slotId === slot.id ? (
          <OwnFinishForm
            key={form.edit?.id ?? 'new'}
            slots={[...slots, ...outSlots]}
            slotId={slot.id}
            edit={form.edit}
            onDone={(saved) => {
              setForm(null)
              if (saved && !form.edit) select(saved.slotId, saved.id) // the new option on, so it shows in the 3D at once
            }}
          />
        ) : (
          <button className="link add-option" onClick={() => setForm({ slotId: slot.id })}>
            + Add option
          </button>
        ))}
    </div>
  )
  // the outside chosen for one wall or one floor (staff), each with its undo
  const outOnes = outside
    ? Object.entries(outside.rec).flatMap(([key, id]) => {
        const o = outSlots.flatMap((s) => s.options).find((x) => x.id === id)
        const what = key.startsWith('out:floor:') ? `Floor ${key.slice(10)}` : key.startsWith('out:') ? 'One outside wall' : key.startsWith('frame:') ? 'One window frame' : null
        return what && o ? [{ key, what, label: o.label }] : []
      })
    : []
  return (
    <section className="finishes">
      {roof?.open ? (
        <RoofBlock roof={roof} />
      ) : surface ? (
        <>
          {surface.roomKey && <SurfaceBlock key={`${surface.roomKey}|${surface.wallKey}`} surface={surface} keys={keys} cfg={cfg} onSelect={onSelect} onClose={onCloseSurface} />}
          {surface.outside && outside && <OutsideBlock key={`${surface.outside.drawing}|${surface.outside.run}|${surface.outside.floor}`} spot={surface.outside} outside={outside} onClose={onCloseSurface} />}
        </>
      ) : (
        <p className="muted small">
          {finger ? 'Tap' : 'Click'} a floor, a wall or a ceiling to choose for that room or that wall alone{roof ? ', or the roof in the Building view' : ''}.{outside ? ' An outside wall: for that wall, its floor or the whole building.' : ''} Each block below covers a group of rooms.
        </p>
      )}
      {slots.map((slot) => block(slot, chosen(slot, cfg)?.id, true))}
      {ones.length > 0 && (
        <div className="slot">
          <div className="label">Chosen for one room or wall</div>
          {ones.map((x) => (
            <div key={x.key} className="small">
              {x.scope}: <b>{x.label}</b>{' '}
              <button className="link" onClick={() => onSelect(x.key, null)}>
                undo
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="panel-footer">
        <span className="label">Options total</span>
        <span className="total">{total ? formatDelta(total) : `৳${formatTaka(0)}`}</span>
      </div>
      <button className="link" onClick={onReset}>
        Reset to included
      </button>
      {kept && <p className="muted small">{kept}</p>}
      {outside && (
        <>
          <p className="muted small">The building's outside — every flat and floor of it; a buyer link shows what you choose here.</p>
          {outSlots.map((slot) => block(slot, chosen(slot, outside.rec)?.id, false))}
          {outOnes.length > 0 && (
            <div className="slot">
              <div className="label">Chosen for one wall, floor or window</div>
              {outOnes.map((x) => (
                <div key={x.key} className="small">
                  {x.what}: <b>{x.label}</b>{' '}
                  <button className="link" onClick={() => outside.onSelect(x.key, null)}>
                    undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {roof && !roof.open && (
        <div className="slot roof-line">
          <div className="label">The roof · the whole building</div>
          <div className="small">
            {roofWords(roof.value, roof.read)}{' '}
            <button className="link" onClick={() => roof.onOpen(true)}>
              Change
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
