/** Finish options: one block per FinishSlot, chips with a tinted albedo swatch, brand, delta; Options total; Reset. */
import { useEffect } from 'react'
import type { Configuration, FinishOption, FinishSlot, MaterialRef } from '../core'
import { TEXTURES } from '../furnish/textures'
import { formatDelta, formatTaka } from './share'

interface Props {
  slots: FinishSlot[]
  cfg: Configuration
  onSelect: (slotId: string, optionId: string) => void
  onReset: () => void
}

function swatchStyle(m: MaterialRef): React.CSSProperties {
  if (m.kind === 'color') return { background: m.color }
  const tex = TEXTURES[m.textureId]
  const tint = m.tint ?? '#ffffff'
  // tint over the albedo: an 8-digit hex gives the overlay ~45 % alpha
  return tex ? { backgroundImage: `linear-gradient(${tint}73, ${tint}73), url(${tex.albedo})`, backgroundSize: 'cover' } : { background: tint }
}

export const chosen = (slot: FinishSlot, cfg: Configuration): FinishOption | undefined =>
  slot.options.find((o) => o.id === (cfg[slot.id] ?? slot.defaultOptionId))

export const optionsTotal = (slots: FinishSlot[], cfg: Configuration): number =>
  slots.reduce((t, s) => t + (chosen(s, cfg)?.priceDeltaBdt ?? 0), 0)

export default function FinishesPanel({ slots, cfg, onSelect, onReset }: Props) {
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
  return (
    <section className="finishes">
      {slots.map((slot) => {
        const sel = chosen(slot, cfg)?.id
        return (
          <div key={slot.id} className="slot">
            <div className="label">{slot.label}</div>
            <div className="chips">
              {slot.options.map((o) => (
                <button key={o.id} className={`chip${o.id === sel ? ' selected' : ''}`} onClick={() => onSelect(slot.id, o.id)}>
                  <span className="swatch" style={swatchStyle(o.material)} />
                  <span className="chip-text">
                    <span>{o.label}</span>
                    <span className="muted">{o.brand}</span>
                  </span>
                  <span className={`delta${o.priceDeltaBdt ? '' : ' muted'}`}>{formatDelta(o.priceDeltaBdt)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
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
