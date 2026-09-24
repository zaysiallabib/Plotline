/** Room chip + Rooms list (top-left), the button row (top-right), comment hint, pointer-lock hint, toast, footer. */
import { useEffect, useRef, useState } from 'react'
import { sqmToSqft, type Room } from '../core'
import type { SceneMode } from '../three/PlotlineScene'

interface Props {
  room: Room | null
  rooms: Room[]
  mode: SceneMode
  finishesOpen: boolean
  commenting: boolean
  locked: boolean
  vrButton: HTMLElement | null
  toast: string | null
  onJump: (room: Room) => void
  onToggleMode: () => void
  onToggleFinishes: () => void
  onToggleComment: () => void
  onShare: () => void
}

const sqft = (sqm: number) => Math.round(sqmToSqft(sqm))

export default function Hud(p: Props) {
  const [roomsOpen, setRoomsOpen] = useState(false)
  const vrHost = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (p.vrButton && vrHost.current) vrHost.current.replaceChildren(p.vrButton)
  }, [p.vrButton])

  return (
    <>
      <div className="hud-tl">
        {p.room && (
          <div className="glass chip-room">
            <div className="room-name">{p.room.name}</div>
            {p.room.printedSize && <div className="muted">{p.room.printedSize}</div>}
            <div className="muted">
              {p.room.areaSqm.toFixed(1)} m² · {sqft(p.room.areaSqm)} sqft
            </div>
          </div>
        )}
        <button className="btn" onClick={() => setRoomsOpen((v) => !v)}>
          Rooms
        </button>
        {roomsOpen && (
          <div className="glass rooms-list">
            {p.rooms.map((r) => (
              <button
                key={r.id}
                className="room-row"
                onClick={() => {
                  p.onJump(r)
                  setRoomsOpen(false)
                }}
              >
                <span>{r.name}</span>
                <span className="muted">{r.printedSize ?? `${r.areaSqm.toFixed(1)} m²`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hud-tr">
        <button className="btn" onClick={p.onToggleMode}>
          {p.mode === 'walk' ? 'Dollhouse' : 'Walk'}
        </button>
        <button className={`btn${p.finishesOpen ? ' active' : ''}`} onClick={p.onToggleFinishes}>
          Finishes
        </button>
        <button className={`btn${p.commenting ? ' active' : ''}`} onClick={p.onToggleComment}>
          Comment
        </button>
        <button className="btn" onClick={p.onShare}>
          Share
        </button>
        {p.vrButton && <span ref={vrHost} className="vr-host" />}
      </div>

      {p.commenting && <div className="glass hint hint-top">Click anything to leave a note</div>}
      {!p.locked && p.mode === 'walk' && <div className="glass hint hint-bottom">Click to look around · WASD to walk · Esc to release</div>}
      {p.toast && <div className="glass toast">{p.toast}</div>}
      {!p.locked && <div className="footer">Powered by Plotline</div>}
    </>
  )
}
