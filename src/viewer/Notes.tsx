/** Comment pins: numbered HTML markers projected from their world point each frame, the draft popover, and the Notes list. */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Room } from '../core'
import type { PlotlineScene } from '../three/PlotlineScene'
import type { Pin } from './storage'

export interface Draft {
  point: { x: number; y: number; z: number }
}

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
        if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`
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
      <div className="label">Notes ({pins.length})</div>
      {pins.length === 0 && <div className="muted empty">No notes yet. Press C and click anything you'd change.</div>}
      {pins.map((p, i) => (
        <div key={p.id} className="note">
          <button className="note-main" onClick={() => onFocus(p)}>
            <span className="pin-dot small">{i + 1}</span>
            <span className="note-text">
              <span>{p.text.split('\n')[0]}</span>
              <span className="muted">{rooms.find((r) => r.id === p.roomId)?.name ?? ''}</span>
            </span>
          </button>
          <button className="link" onClick={() => onRemove(p)}>
            Remove
          </button>
        </div>
      ))}
    </section>
  )
}
