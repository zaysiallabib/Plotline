/** Room chip + Rooms list (top-left), the button row (top-right), comment hint, pointer-lock hint, toast, footer; staff: the dot and the piece in hand. */
import { useEffect, useRef, useState } from 'react'
import { sqmToSqft, type Room } from '../core'
import type { SceneMode } from '../three/PlotlineScene'

/** The piece in hand (ViewerApp, arrange.ts Held): its name, why it may not stay here (null: it may), whether it is anywhere yet, new from the library or not. */
export interface HandInfo {
  label: string
  error: string | null
  ready: boolean
  adding: boolean
}

/** where the free mouse last was: the hand's tag starts there */
const pointer = { x: innerWidth / 2, y: innerHeight / 2 }
addEventListener('pointermove', (e) => Object.assign(pointer, { x: e.clientX, y: e.clientY }))

/** The piece in hand, said where it is: under the dot while the mouse is locked, else beside the pointer. */
function HandTag({ hand, locked }: { hand: HandInfo; locked: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const place = () => ref.current && (ref.current.style.transform = locked ? '' : `translate(${pointer.x + 18}px, ${pointer.y + 18}px)`)
    place()
    addEventListener('pointermove', place)
    return () => removeEventListener('pointermove', place)
  }, [locked])
  return (
    <div ref={ref} className={`glass hand-tag${locked ? ' at-dot' : ''}`}>
      <div>
        {hand.adding ? 'Placing' : 'Moving'}: {hand.label}
      </div>
      {hand.error && <div className="refused">{hand.error} — move it on, or R to turn it</div>}
      <div className="muted small">
        {hand.ready ? `${locked ? 'Click or G' : 'Click'} puts it down · R turns · Esc ${hand.adding ? 'cancels' : 'puts it back'}` : 'Point at the floor, a wall or the ceiling'}
      </div>
    </div>
  )
}

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
  /** staff only: opens this unit in the Studio, new tab (the Studio makes its user staff, so buyers never see it) */
  onEditPlan: (() => void) | null
  /** staff only (arrange.ts isStaff): toggles Arrange ("Edit furniture"); null hides the button (every buyer link) */
  onArrange: (() => void) | null
  arranging: boolean
  /** the piece in hand, if any (staff) */
  hand: HandInfo | null
  /** staff (arrange.ts isStaff): G picks up furniture; the dot and the keys show in walk */
  staff: boolean
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
        {p.onArrange && (
          <button className={`btn${p.arranging ? ' active' : ''}`} title="Staff only: move, turn, resize, delete or add furniture" onClick={p.onArrange}>
            Edit furniture
          </button>
        )}
        {p.onEditPlan && (
          <button className="btn" onClick={p.onEditPlan}>
            Edit plan
          </button>
        )}
        {p.onEnterVR && (
          <button className="btn" onClick={p.onEnterVR}>
            Enter VR
          </button>
        )}
      </div>

      {p.commenting && <div className="glass hint hint-top">Click anything to leave a note</div>}
      {p.hand && p.mode !== 'building' ? (
        <HandTag hand={p.hand} locked={p.locked} />
      ) : p.arranging && p.mode !== 'building' ? (
        <div className="glass hint hint-bottom">
          {`Drag a piece, or G on it · R turns · Ctrl+Z undoes · Esc lets go${p.mode === 'walk' ? ' · drag the room to look, WASD to walk' : ''}`}
        </div>
      ) : p.mode !== 'walk' ? null : !p.locked ? (
        <div className="glass hint hint-bottom">Click to look around · WASD to walk · Esc to release{p.staff && ' · G picks up the piece under the mouse'}</div>
      ) : (
        p.staff && <div className="glass hint hint-bottom">G picks up the piece at the dot · WASD to walk · Esc frees the mouse</div>
      )}
      {p.staff && p.locked && p.mode === 'walk' && <div className="dot" />}
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
