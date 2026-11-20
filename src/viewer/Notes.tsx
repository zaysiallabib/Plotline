/** Comment pins: numbered HTML markers projected from their world point each frame, the draft popover, and the Notes list. */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Room } from '../core'
import type { PlotlineScene } from '../three/PlotlineScene'
import type { Pin } from './storage'

export interface Draft {
  point: { x: number; y: number; z: number }
  /** what was clicked, e.g. "Door handle · Bed-1" */
  label?: string
}

/**
 * Where the note being written opens, from its pin at (x, y) on a w × h screen, the note pw × ph: beside the pin where it
 * fits (its right, else its left; lifted off the bottom edge), else — a phone's narrow screen — over the pin (under it
 * when the pin is near the top: the keyboard rises from below), kept inside the screen's sides.
 */
export function noteAt(x: number, y: number, w: number, h: number, pw: number, ph: number): { dx: number; dy: number } {
  const M = 8
  const G = 16
  if (x + G + pw <= w - M || x - G - pw >= M) return { dx: x + G + pw <= w - M ? G : -G - pw, dy: Math.min(-M, h - M - ph - y) }
  return { dx: Math.min(Math.max(M - x, -pw / 2), w - M - pw - x), dy: y - G - ph >= M ? -G - ph : G }
}

/** "Door handle · Bed-1"; "Bed-1 floor" already names its room. */
export const tagOf = (label?: string, room?: string): string =>
  [label, room && !label?.startsWith(room) ? room : ''].filter(Boolean).join(' · ')

interface LayerProps {
  scene: PlotlineScene
  pins: Pin[]
  draft: Draft | null
  onSave: (text: string) => void
  onCancel: () => void
}

/** Markers + popover. Positions are written straight to the DOM per frame — no React re-render per frame. */
export function PinLayer({ scene, pins, draft, onSave, onCancel }: LayerProps) {
  const els = useRef(new Map<string, HTMLDivElement>())
  const [text, setText] = useState('')

  useEffect(() => setText(''), [draft])

  useEffect(() => {
    const v = new THREE.Vector3()
    let raf = 0
    const tick = () => {
      const w = innerWidth
      const h = innerHeight
      const place = (id: string, p: { x: number; y: number; z: number }) => {
        const el = els.current.get(id)
        if (!el) return
        v.set(p.x, p.y, p.z).project(scene.camera)
        const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2
        el.style.display = visible ? '' : 'none'
        const x = ((v.x + 1) / 2) * w
        const y = ((1 - v.y) / 2) * h
        if (visible) el.style.transform = `translate(${x}px, ${y}px)`
        const note = el.querySelector<HTMLElement>('.popover')
        if (note) {
          const { dx, dy } = noteAt(x, y, w, h, note.offsetWidth, note.offsetHeight) // never off the screen's edge
          note.style.left = `${dx}px`
          note.style.top = `${dy}px`
        }
      }
      for (const p of pins) place(p.id, p.point)
      if (draft) place('draft', draft.point)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, pins, draft])

  const ref = (id: string) => (el: HTMLDivElement | null) => {
    if (el) els.current.set(id, el)
    else els.current.delete(id)
  }

  return (
    <div className="pin-layer">
      {pins.map((p, i) => (
        <div key={p.id} ref={ref(p.id)} className="pin" title={p.text}>
          <span className="pin-dot">{i + 1}</span>
        </div>
      ))}
      {draft && (
        <div ref={ref('draft')} className="pin">
          <span className="pin-dot">{pins.length + 1}</span>
          <div className="glass popover" onKeyDown={(e) => e.stopPropagation()}>
            {draft.label && <div className="muted small">{draft.label}</div>}
            <textarea
              autoFocus
              rows={3}
              placeholder="What would you like to change here?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
              <button className="btn primary" disabled={!text.trim()} onClick={() => onSave(text.trim())}>
                Save
              </button>
              <button className="btn" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ListProps {
  pins: Pin[]
  rooms: Room[]
  onFocus: (pin: Pin) => void
  onRemove: (pin: Pin) => void
}

export function NotesList({ pins, rooms, onFocus, onRemove }: ListProps) {
  return (
    <section className="notes">
      <div className="label">Your notes · {pins.length}</div>
      {pins.length === 0 && <div className="muted empty">None yet.</div>}
      {pins.map((p, i) => (
        <div key={p.id} className="note">
          <button className="note-main" title="Walk to it" onClick={() => onFocus(p)}>
            <span className="pin-dot small">{i + 1}</span>
            <span className="note-text">
              <span>{p.text.split('\n')[0]}</span>
              <span className="muted">{tagOf(p.anchor.label, rooms.find((r) => r.id === p.roomId)?.name)}</span>
            </span>
          </button>
          <button className="link danger" onClick={() => onRemove(p)}>
            Remove
          </button>
        </div>
      ))}
    </section>
  )
}
