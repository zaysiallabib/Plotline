/**
 * The staff library (Studio tool F, the 3D view's Add): a search box over the pieces grouped by room, then by kind,
 * with counts, the groups folding; the pieces picked last on top. Enter picks the first match; one Esc empties the box and
 * lets go of it, so the app's keys work, and runs `onEsc` (the 3D view: the library closes). `focus`: typing goes to the box
 * as it opens (the 3D Add panel; not the Studio, whose letter keys pick tools). Listing and search: library.ts.
 * "Add your own…" brings a model of the staff's own in (OwnModel.tsx): it is in hand at once. Their own pieces are listed
 * on top under "Your own" (and in their room) with a ⋯: Rename, Change size, Remove.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { onOwnChange, ownItem, ownVersion, type OwnModel } from '../furnish/own'
import { removeOwn } from '../lib/library'
import { firstMatch, listing, OWN_GROUP, pushRecent, RECENT_KEY, type Entry } from './library'
import { OwnModelDialog } from './OwnModel'
import './library.css'

const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** where a piece of their own was saved, in plain words (lib/library.ts saveOwn) */
const SAVED: Record<'online' | 'here' | 'page', string> = {
  online: 'saved for your company — colleagues and buyer links see it',
  here: 'saved in this browser (sign in to share it with colleagues and buyer links)',
  page: 'kept for this page only — this browser would not store it (a private window?)',
}

/** `onNote`: where "saved …" is said when the panel closes as the new piece is picked (the 3D view's toast); else under the search */
export function LibraryPanel({ onPick, picked, focus, onEsc, onNote }: { onPick: (assetId: string) => void; picked?: string | null; focus?: boolean; onEsc?: () => void; onNote?: (text: string) => void }) {
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState(readRecent)
  const box = useRef<HTMLInputElement>(null)
  const v = useSyncExternalStore(onOwnChange, ownVersion)
  const groups = useMemo(() => listing(q, recent), [q, recent, v]) // eslint-disable-line react-hooks/exhaustive-deps
  /** the Add your own box: a new piece (true), or one of their own to change, its name or its size first */
  const [dialog, setDialog] = useState<true | { m: OwnModel; focus: 'name' | 'size' } | null>(null)
  /** the ⋯ menu open on this row (`<group>/<id>`: a piece is listed in Your own and in its room); `sure`: Remove asked once */
  const [menu, setMenu] = useState<{ id: string; sure?: boolean } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // after the click or key that opened it has landed: else a letter would be typed into the box
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => box.current?.focus({ preventScroll: true }))
    return () => clearTimeout(t)
  }, [focus])
  const pick = (id: string) => {
    const next = pushRecent(recent, id)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* private window: Recent lasts this page only */
    }
    ;(document.activeElement as HTMLElement | null)?.blur() // R / Esc now turn and cancel the piece in hand
    onPick(id)
  }
  const edit = (id: string, f: 'name' | 'size') => {
    setMenu(null)
    setNote(null)
    const m = ownItem(id)
    if (m?.type === 'model') setDialog({ m, focus: f })
  }
  return (
    <div className="lib">
      <input
        ref={box}
        type="search"
        className="lib-search"
        placeholder="Search: sofa, lamp, balcony, plant…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const m = firstMatch(q)
            if (m) pick(m.id)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setQ('')
            box.current?.blur()
            onEsc?.()
          }
        }}
      />
      <button className="lib-add" title="A 3D model of your own (GLB, glTF, OBJ, FBX, DAE, STL): it joins the library like any other piece" onClick={() => (setNote(null), setDialog(true))}>
        <span aria-hidden="true">+</span> Add your own…
      </button>
      {note && <p className="lib-note">{note}</p>}
      <div className="lib-list">
        {groups.map((g) => (
          <details key={`${g.name}${q ? '?' : ''}`} open={!!q || g.name === 'Recent' || g.name === OWN_GROUP}>
            <summary>
              {g.name} <span className="muted">{g.count}</span>
            </summary>
            {g.kinds.map((k) => (
              <div key={k.name}>
                {k.name && g.kinds.length > 1 && (
                  <div className="lib-kind">
                    {k.name} <span className="muted">{k.items.length}</span>
                  </div>
                )}
                {k.items.map((i) =>
                  i.own ? (
                    <OwnRow key={i.id} i={i} row={`${g.name}/${i.id}`} on={i.id === picked} menu={menu?.id === `${g.name}/${i.id}` ? menu : null} onPick={() => pick(i.id)} onMenu={setMenu} onEdit={(f) => edit(i.id, f)} />
                  ) : (
                    <button key={i.id} className={`lib-row${i.id === picked ? ' on' : ''}`} title={i.label} onClick={() => pick(i.id)}>
                      <span className="lib-name">{i.label}</span>
                      <span className="muted lib-feet">{i.feet}</span>
                      <span className={`lib-mark${i.scan ? ' scan' : ''}`} title={i.scan ? 'Scanned model: photo-real, loads when placed' : 'Built in code: no download, resizes cleanly'}>
                        {i.scan ? 'scan' : 'built'}
                      </span>
                    </button>
                  ),
                )}
              </div>
            ))}
          </details>
        ))}
        {!groups.length && <p className="muted">Nothing called “{q}”. Try another word: chair, table, light, plant.</p>}
      </div>
      {dialog && (
        <OwnModelDialog
          edit={dialog === true ? undefined : dialog.m}
          focus={dialog === true ? undefined : dialog.focus}
          onClose={() => setDialog(null)}
          onSaved={(m, where) => {
            const text = `${m.label}: ${SAVED[where]}.`
            if (dialog === true && onNote) onNote(text) // the 3D view adds where to click (or tap) it in
            else setNote(text)
            if (dialog === true) pick(m.id) // in hand at once: point where it goes
          }}
        />
      )}
    </div>
  )
}

/** A piece of the staff's own: its row and its ⋯ — Rename, Change size, Remove (asked once; pieces placed stay). */
function OwnRow(p: { i: Entry; row: string; on: boolean; menu: { sure?: boolean } | null; onPick: () => void; onMenu: (m: { id: string; sure?: boolean } | null) => void; onEdit: (f: 'name' | 'size') => void }) {
  const { i, menu, onMenu } = p
  const remove = () => {
    const m = ownItem(i.id)
    onMenu(null)
    if (m) void removeOwn(m)
  }
  return (
    <div className="lib-own">
      <button className={`lib-row${p.on ? ' on' : ''}`} title={i.label} onClick={p.onPick}>
        <span className="lib-name">{i.label}</span>
        <span className="muted lib-feet">{i.feet}</span>
        <span className="lib-mark own" title="Your own model: rename, resize or remove it with ⋯">
          yours
        </span>
      </button>
      <button className="lib-more" aria-label={`More for ${i.label}`} aria-expanded={!!menu} title="Rename, change size, remove" onClick={() => onMenu(menu ? null : { id: p.row })}>
        ⋯
      </button>
      {menu && (
        <div className="lib-menu" role="menu">
          {menu.sure ? (
            <>
              <p>Remove “{i.label}” from the library? Pieces already placed stay where they are.</p>
              <div className="lib-menu-row">
                <button className="danger" onClick={remove}>
                  Remove
                </button>
                <button onClick={() => onMenu(null)}>Keep</button>
              </div>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => p.onEdit('name')}>
                Rename
              </button>
              <button role="menuitem" onClick={() => p.onEdit('size')}>
                Change size
              </button>
              <button role="menuitem" className="danger" onClick={() => onMenu({ id: p.row, sure: true })}>
                Remove…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
