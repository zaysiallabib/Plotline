/** Room chip + Rooms list (top-left), the button row (top-right), comment hint, pointer-lock hint, toast, footer. */
import { useState } from 'react'
import { sqmToSqft, type Room } from '../core'
import type { SceneMode } from '../three/PlotlineScene'

interface Props {
  room: Room | null
  rooms: Room[]
  mode: SceneMode
  /** the flat's floor (?floor= or the unit's own) */
  floor?: number
  /** Building view floor picker, top down; null: the flat is not part of a tower (no Building button) */
  floors: { k: number; label: string }[] | null
  picked: number
  onPickFloor: (k: number) => void
  finishesOpen: boolean
  commenting: boolean
  locked: boolean
  /** set when immersive-vr is supported: shows "Enter VR" */
  onEnterVR: (() => void) | null
  toast: string | null
  onJump: (room: Room) => void
  onMode: (mode: SceneMode) => void
  onToggleFinishes: () => void
  onToggleComment: () => void
  onShare: () => void
  /** opens this unit in the Studio, new tab */
  onEditPlan: () => void
}

const sqft = (sqm: number) => Math.round(sqmToSqft(sqm))

export default function Hud(p: Props) {
  const [roomsOpen, setRoomsOpen] = useState(false)

  return (
    <>
      <div className="hud-tl">
        {p.room && (
          <div className="glass chip-room">
            <div className="room-name">{p.room.name}</div>
            {p.floor !== undefined && <div className="muted">Floor {p.floor}</div>}
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
        {(
          [
            ['walk', 'Walk'],
            ['orbit', 'Dollhouse'],
            ...(p.floors ? [['building', 'Building']] : []),
          ] as [SceneMode, string][]
        ).map(([m, label]) => (
          <button key={m} className={`btn${p.mode === m ? ' active' : ''}`} onClick={() => p.onMode(m)}>
            {label}
          </button>
        ))}
        <button className={`btn${p.finishesOpen ? ' active' : ''}`} onClick={p.onToggleFinishes}>
          Finishes
        </button>
        <button className={`btn${p.commenting ? ' active' : ''}`} onClick={p.onToggleComment}>
          Comment
        </button>
        <button className="btn" onClick={p.onShare}>
          Share
        </button>
        <button className="btn" onClick={p.onEditPlan}>
          Edit plan
        </button>
        {p.onEnterVR && (
          <button className="btn" onClick={p.onEnterVR}>
            Enter VR
          </button>
        )}
      </div>

      {p.commenting && <div className="glass hint hint-top">Click anything to leave a note</div>}
      {!p.locked && p.mode === 'walk' && <div className="glass hint hint-bottom">Click to look around · WASD to walk · Esc to release</div>}
      {p.mode === 'building' && p.floors && (
        <>
          <div className="glass floor-picker">
            {p.floors.map(({ k, label }) => (
              <button
                key={k}
                className={`btn${p.picked === k ? ' active' : ''}${p.floor === k ? ' own' : ''}`}
                title={p.floor === k ? 'Your flat’s floor' : undefined}
                onClick={() => p.onPickFloor(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="glass hint hint-bottom">Click a flat to open it · drag to turn · scroll to zoom</div>
        </>
      )}
      {p.toast && <div className="glass toast">{p.toast}</div>}
      {!p.locked && <div className="footer">Powered by Plotline</div>}
    </>
  )
}
