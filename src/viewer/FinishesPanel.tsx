/**
 * Finish options: the floor / wall / ceiling clicked in 3D (one room, one wall) on top; one block per FinishSlot (a group
 * of rooms), chips with a tinted albedo swatch, brand, delta; the one-room choices made; Options total; Reset.
 */
import { useEffect, useState } from 'react'
import type { Configuration, FinishOption, FinishSlot, MaterialRef } from '../core'
import { TEXTURES } from '../furnish/textures'
import { formatDelta, formatTaka, type FinishKeys } from './share'

/** A floor / wall / ceiling clicked in 3D while the panel is open: its room's key (finishes.ts roomKey), a wall's face key too. */
export interface Surface {
  roomKey: string
  wallKey?: string
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
}

function swatchStyle(m: MaterialRef): React.CSSProperties {
  if (m.kind === 'color') return { background: m.color }
  const tex = TEXTURES[m.textureId]
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

/** One option; `title` = the "Same as …" chip: what it falls back to shown under it, no price of its own. */
function Chip({ o, on, onClick, title }: { o: FinishOption; on: boolean; onClick: () => void; title?: string }) {
  return (
    <button className={`chip${on ? ' selected' : ''}`} onClick={onClick}>
      <span className="swatch" style={swatchStyle(o.material)} />
      <span className="chip-text">
        <span>{title ?? o.label}</span>
        <span className="muted">{title ? o.label : o.brand}</span>
      </span>
      {!title && <span className={`delta${o.priceDeltaBdt ? '' : ' muted'}`}>{formatDelta(o.priceDeltaBdt)}</span>}
    </button>
  )
}

/** The clicked surface: its name, for a wall "This wall" / "The whole room", then "Same as …" and the covering slot's options. */
function SurfaceBlock({ surface, keys, cfg, onSelect, onClose }: { surface: Surface; keys: FinishKeys; cfg: Configuration; onSelect: Props['onSelect']; onClose: () => void }) {
  const [wide, setWide] = useState(false)
  const key = surface.wallKey && !wide ? surface.wallKey : surface.roomKey
  const k = keys.get(key)
  if (!k) return null
  const own = (id: string | undefined) => k.slot.options.find((o) => o.id === id)
  const sel = own(cfg[key])
  const oneWall = key === surface.wallKey
  const fallback = (oneWall ? own(cfg[surface.roomKey]) : undefined) ?? chosen(k.slot, cfg)
  return (
    <div className="slot">
      <div className="label">{k.scope}</div>
      {surface.wallKey && (
        <div className="arrange-row">
          <button className={`btn${wide ? '' : ' active'}`} onClick={() => setWide(false)}>
            This wall
          </button>
          <button className={`btn${wide ? ' active' : ''}`} onClick={() => setWide(true)}>
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
      <button className="link" onClick={onClose}>
        Done
      </button>
    </div>
  )
}

export default function FinishesPanel({ slots, cfg, keys, surface, onSelect, onCloseSurface, onReset }: Props) {
  // warm the HTTP cache so the engine's TextureLoader hits it (≤ 200 ms swap after caching)
  useEffect(() => {
    for (const s of slots) {
      for (const o of s.options) {
        if (o.material.kind !== 'pbr') continue
        const t = TEXTURES[o.material.textureId]
        for (const url of [t?.albedo, t?.normal, t?.roughness, t?.ao]) if (url) new Image().src = url
      }
    }
  }, [slots])

  const total = optionsTotal(slots, cfg)
  const ones = Object.entries(cfg).flatMap(([key, id]) => {
    const k = keys.get(key)
    const o = k?.slot.options.find((x) => x.id === id)
    return k && o ? [{ key, scope: k.scope, label: o.label }] : []
  })
  return (
    <section className="finishes">
      {surface ? (
        <SurfaceBlock key={`${surface.roomKey}|${surface.wallKey}`} surface={surface} keys={keys} cfg={cfg} onSelect={onSelect} onClose={onCloseSurface} />
      ) : (
        <p className="muted small">Click a floor, a wall or a ceiling to choose for that room or that wall alone. Each block below covers a group of rooms.</p>
      )}
      {slots.map((slot) => {
        const sel = chosen(slot, cfg)?.id
        return (
          <div key={slot.id} className="slot">
            <div className="label">{slot.label}</div>
            <div className="chips">
              {slot.options.map((o) => (
                <Chip key={o.id} o={o} on={o.id === sel} onClick={() => onSelect(slot.id, o.id)} />
              ))}
            </div>
          </div>
        )
      })}
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
    </section>
  )
}
