/**
 * The Studio's keys (session 30): the status bar shows one short line for the tool you are on; the Keys button at its
 * right (or the ? key) opens every key in one small sheet, the tool you are on described in full at the top. Esc or a
 * click anywhere else closes it. Docs/KEYS.md §1 is the full list with the details.
 */
import { useEffect, useState } from 'react'

const GROUPS: [string, [string, string][]][] = [
  [
    'Tools',
    [
      ['V', 'Select'],
      ['S', 'Scale'],
      ['W', 'Wall'],
      ['A', 'Arc (a curved wall)'],
      ['O', 'Opening'],
      ['R', 'Room name'],
      ['C', 'Column'],
      ['F', 'Furniture'],
      ['Hold W, O or R', 'Works only while held; let go = back to your tool'],
    ],
  ],
  [
    'Drawing',
    [
      ['1 2 3 4', 'W: wall, low wall, kerb, zone line · O: door, window, slider, passage'],
      ['A digit or .', 'Type the length (W); Enter lays the wall'],
      ['Tab', 'The length box: length ↔ angle'],
      ['Backspace', 'Takes back the last piece drawn'],
      ['T', 'Thin 5" ↔ thick 10" wall'],
      ['H · Shift+H', "The picked door's hinge side · its swing"],
      ['Double-click a wall', 'Type its length'],
    ],
  ],
  [
    'Picking and moving',
    [
      ['Shift+click', 'Adds to what is picked'],
      ['Drag on empty plan', 'A box picks what it touches'],
      ['Alt+drag a wall end', 'The walls joined there follow'],
      ['Arrows', 'Nudge 1" (Shift: 1 ft) · F: one 3" square'],
      ['R', 'F: turns the piece 90°'],
      ['Ctrl+A', 'Picks every wall'],
      ['Ctrl+D', 'Copies what is picked'],
      ['Del', 'Deletes what is picked'],
    ],
  ],
  [
    'View and file',
    [
      ['Wheel', 'Zoom at the pointer'],
      ['Space+drag, right-drag', 'Slide the plan'],
      ['0', 'Fit the whole plan'],
      ['Shift held', 'No snapping'],
      ['Esc', 'One step back'],
      ['Ctrl+Z · Ctrl+Y', 'Undo · Redo'],
      ['Ctrl+S · Ctrl+O', 'Export · Import'],
      ['?', 'This sheet'],
    ],
  ],
]

/** `now`: the tool you are on, in full (the status bar's long line before session 30) */
export default function KeysSheet({ now }: { now: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
      if (e.key === '?') return setOpen((v) => !v)
      if (e.key !== 'Escape' || !open) return
      e.stopPropagation() // caught first: the Studio's own Esc (unpick) does not run too
      setOpen(false)
    }
    const down = (e: PointerEvent) => open && !(e.target as Element).closest?.('.keys-sheet, .keys-btn') && setOpen(false)
    addEventListener('keydown', key, true)
    addEventListener('pointerdown', down)
    return () => {
      removeEventListener('keydown', key, true)
      removeEventListener('pointerdown', down)
    }
  }, [open])
  return (
    <>
      <button className={`keys-btn${open ? ' on' : ''}`} aria-expanded={open} title="Every key (?)" onClick={() => setOpen((v) => !v)}>
        Keys
      </button>
      {open && (
        <div className="keys-sheet" role="dialog" aria-label="Keys">
          <div className="keys-head">
            <strong>Keys</strong>
            <button className="x" aria-label="Close" title="Close (Esc)" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <p className="keys-now">{now}</p>
          <div className="keys-cols">
            {GROUPS.map(([title, rows]) => (
              <section key={title}>
                <h4>{title}</h4>
                <dl>
                  {rows.map(([k, what]) => (
                    <div key={k + what}>
                      <dt>
                        <kbd>{k}</kbd>
                      </dt>
                      <dd>{what}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
