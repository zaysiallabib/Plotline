/**
 * "What is in this set?" (session 31, Stage 1 of Docs/PLAN_DRAWING_SETS.md). A drawing set dropped — a PDF of several
 * pages, or several PDFs at once — is read page by page (src/import/sheets.ts: the titles' words, then the sheet number,
 * then the drawing's shape) and listed by kind, a page of several drawings split into them: plans with the floors their
 * titles name, ticked to become the project's drawings on those floors; elevations, sections, the site plan, schedules and
 * interior elevations ticked to be kept with the project as pictures; details and title pages left out. One click changes a
 * kind, the floors, a tick — remembered by the drawing's title for the next set from the same architect. Build makes the
 * project in one go; a row's picture opens that one drawing alone, as the page picker did.
 */
import { useEffect, useMemo, useState } from 'react'
import type { PdfDoc } from '../import/pdf'
import { KEPT, SHEET_KINDS, norm, parseSlots, readSheet, setChoices, slotsWords, type Box, type SetSlot, type SheetKind, type SheetRead, type View } from '../import/sheets'

export interface SetFile {
  name: string
  doc: PdfDoc
}

/** one drawing of the set, as listed */
export interface SetRow {
  key: string
  file: number
  page: number
  /** its frame on the page (sheets.ts): its own part of a page of several drawings, else the page inside its border and title block */
  frame: Box
  view: View
  /** the sheet number in the title block (A1.3), when read */
  number?: string
  kind: SheetKind
  /** what the person typed: a plan's floors ("G, 2-8, R"), an elevation's side, a section's mark; null = as read */
  which: string | null
  /** the person's tick; null = as the kind says */
  tick: boolean | null
  /** set from what the person chose for this title before */
  yours: boolean
  thumb?: string
}

/** a row as the set will be built: its floors and whether it is used */
export interface SetChoice extends SetRow {
  slots: SetSlot[]
  used: boolean
}

const KIND_WORDS: Record<SheetKind, string> = {
  plan: 'Plan',
  elevation: 'Elevation',
  section: 'Section',
  site: 'Site plan',
  schedule: 'Schedule',
  interior: 'Interior elevation',
  detail: 'Detail',
  title: 'Title & notes',
  other: 'Other',
}
const GROUP_WORDS: Record<SheetKind, string> = {
  plan: 'Plans — each ticked one becomes the drawing of its floors',
  elevation: 'Elevations — kept with the project',
  section: 'Sections — kept with the project',
  site: 'Site — kept with the project',
  schedule: 'Schedules — kept with the project',
  interior: 'Interior elevations — kept with the project',
  detail: 'Details — left out unless ticked',
  title: 'Title pages and notes — left out unless ticked',
  other: 'Other pages — left out unless ticked',
}

/** what the person chose for a drawing's title, kept in this browser for the next set (the layer list's pattern) */
const CHOICES_KEY = 'plotline.sheetChoices'
type Choice = { kind: SheetKind; which: string | null; tick: boolean | null }
const readChoices = (): Record<string, Choice> => {
  try {
    return JSON.parse(localStorage.getItem(CHOICES_KEY) ?? '{}') as Record<string, Choice>
  } catch {
    return {}
  }
}
const keyOf = (r: SetRow) => (r.view.title ? norm(r.view.title) : '')

interface Props {
  files: SetFile[]
  onOpenOne: (row: SetRow, files: SetFile[]) => void
  onBuild: (rows: SetChoice[], files: SetFile[]) => void
  onClose: () => void
}

export default function SetPanel({ files, onOpenOne, onBuild, onClose }: Props) {
  const [rows, setRows] = useState<SetRow[]>([])
  const [reading, setReading] = useState<{ at: number; of: number } | null>({ at: 0, of: files.reduce((a, f) => a + f.doc.numPages, 0) })
  // every page read in turn (a frame between pages, so the list grows on screen), then each drawing's small picture
  useEffect(() => {
    const live = { current: true } // (this run's own: closed and opened again, the old run stops)
    void (async () => {
      const pdf = await import('../import/pdf')
      const mine = readChoices()
      const all: SetRow[] = []
      let at = 0
      for (const [fi, f] of files.entries())
        for (let p = 1; p <= f.doc.numPages && live.current; p++) {
          setReading((x) => x && { ...x, at: ++at })
          await new Promise((ok) => requestAnimationFrame(ok))
          let read: SheetRead
          try {
            read = readSheet(await pdf.readSheetPage(f.doc, p))
          } catch {
            read = { views: [{ kind: 'other', title: '', box: { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }, by: 'shape' }] }
          }
          const got = read.views.map((view, i): SetRow => {
            const r: SetRow = { key: `${fi}:${p}:${i}`, file: fi, page: p, frame: view.box, view, ...(read.number ? { number: read.number } : {}), kind: view.kind, which: null, tick: null, yours: false }
            const c = mine[keyOf(r)]
            return c ? { ...r, kind: c.kind, which: c.which, tick: c.tick, yours: true } : r
          })
          all.push(...got)
          if (live.current) setRows([...all])
        }
      if (!live.current) return
      setReading(null)
      for (const r of all) {
        if (!live.current) return
        const thumb = await pdf
          .renderView(files[r.file].doc, r.page, r.frame, 240)
          .then((x) => x.canvas.toDataURL('image/jpeg', 0.8))
          .catch(() => '')
        if (live.current) setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, thumb } : x)))
      }
    })()
    return () => void (live.current = false)
  }, [files])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [onClose])

  const choices = useMemo<SetChoice[]>(() => {
    const made = setChoices(rows.map((r) => ({ kind: r.kind, level: r.kind === r.view.kind ? r.view.level : null, use: r.view.use, slots: r.kind === 'plan' && r.which !== null ? parseSlots(r.which) ?? [] : null, tick: r.tick })))
    return rows.map((r, i) => ({ ...r, slots: made[i].slots, used: made[i].tick }))
  }, [rows])

  if (import.meta.env.DEV) Object.assign(window, { __plotlineSet: { rows: choices, reading: !!reading } }) // the sets scoreboard reads what the list holds
  /** a change to a row, remembered by its title for the next set */
  const change = (key: string, patch: Partial<Pick<SetRow, 'kind' | 'which' | 'tick'>>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r
        const n = { ...r, ...patch, ...(patch.kind && patch.kind !== r.kind ? { which: null, tick: null } : {}), yours: true }
        const k = keyOf(n)
        if (k) {
          const all = readChoices()
          all[k] = { kind: n.kind, which: n.which, tick: n.tick }
          try {
            localStorage.setItem(CHOICES_KEY, JSON.stringify(all))
          } catch {
            /* no storage: this set only */
          }
        }
        return n
      }),
    )

  const plans = choices.filter((c) => c.kind === 'plan' && c.used)
  const kept = choices.filter((c) => c.kind !== 'plan' && c.used)
  const floors = slotsWords([...new Set(plans.flatMap((c) => c.slots))])
  const pages = files.reduce((a, f) => a + f.doc.numPages, 0)
  const which = (c: SetChoice): string => (c.which !== null ? c.which : c.kind === 'plan' ? slotsWords(c.slots) : c.kind === 'elevation' ? (c.view.facade ?? '') : c.kind === 'section' ? (c.view.mark ?? '') : '')
  const bad = (c: SetChoice) => c.kind === 'plan' && c.which !== null && parseSlots(c.which) === null
  // (as slotsFor: a set naming no ground floor puts its 1st floor on the ground — said once, under the plans)
  const read = rows.filter((r) => r.kind === 'plan' && r.view.kind === 'plan' && r.which === null).flatMap((r) => (r.view.level ? [r.view.level] : []))
  const firstOnGround = read.some((l) => l.at.includes(1)) && !read.some((l) => l.at.includes(0) || l.above)

  return (
    <div className="pages-sheet set-sheet" role="dialog" aria-label="What is in this set?">
      <div className="head">
        <strong>
          {files.length === 1 ? files[0].name : `${files.length} files`} · {pages} pages{rows.length > pages ? ` · ${rows.length} drawings` : ''}
        </strong>
        <button className="x" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 className="display">What is in this set</h2>
      <p className="muted">
        Each page is read by the title under its drawing. Ticked plans become the drawings of their floors; ticked elevations, sections and the rest are kept
        with the project as pictures. Change a kind or a floor with one click — the next set from the same architect remembers it. Click a picture to open
        that drawing alone.
      </p>
      {reading && <p className="set-reading">Reading page {reading.at} of {reading.of}…</p>}
      {SHEET_KINDS.map((k) => {
        const of = choices.filter((c) => c.kind === k)
        if (!of.length) return null
        return (
          <section key={k} className="set-group">
            <h3 className="label">
              {GROUP_WORDS[k]} <span>{of.length}</span>
            </h3>
            {k === 'plan' && firstOnGround && <p className="muted">This set has no ground-floor plan, so its 1st floor is the ground floor (as American and Chilean sets count). Type the floors to change it: G, 1, 2–8, B1, Roof.</p>}
            <ol>
              {of.map((c) => (
                <li key={c.key} className={c.used ? 'on' : ''}>
                  <input type="checkbox" checked={c.used} title={c.kind === 'plan' ? 'Make it a drawing of its floors' : KEPT.includes(c.kind) ? 'Keep it with the project' : 'Keep it with the project as a picture'} onChange={(e) => change(c.key, { tick: e.target.checked })} />
                  <button className="thumb" title="Open this drawing alone" onClick={() => onOpenOne(c, files)}>
                    {c.thumb ? <img src={c.thumb} alt="" /> : <span className="spin" />}
                  </button>
                  <span className="what">
                    <strong>{c.view.title || (c.view.by === 'number' ? `Sheet ${c.number}` : 'No title on the page')}</strong>
                    <span className="muted">
                      {files.length > 1 ? `${files[c.file].name} · ` : ''}Page {c.page}
                      {c.number ? ` · ${c.number}` : ''}
                      {c.view.scale ? ` · 1 : ${+c.view.scale.toFixed(1)}` : ''}
                      {c.view.use ? ` · ${c.view.use}` : ''}
                      {c.yours ? ' · as you set it' : c.view.by === 'shape' ? ' · read by its shape' : c.view.by === 'number' ? ' · read by its sheet number' : ''}
                    </span>
                  </span>
                  <select value={c.kind} title="What kind of drawing this is" onChange={(e) => change(c.key, { kind: e.target.value as SheetKind })}>
                    {SHEET_KINDS.map((s) => (
                      <option key={s} value={s}>
                        {KIND_WORDS[s]}
                      </option>
                    ))}
                  </select>
                  {c.kind === 'plan' || c.kind === 'elevation' || c.kind === 'section' ? (
                    <input
                      className={bad(c) ? 'which bad' : 'which'}
                      value={which(c)}
                      placeholder={c.kind === 'plan' ? 'floors' : c.kind === 'elevation' ? 'side' : 'mark'}
                      title={c.kind === 'plan' ? 'The floors it is on: G, B1, 2-8, Roof' : c.kind === 'elevation' ? 'Which side: north, south, front…' : 'Its mark: A-A'}
                      onChange={(e) => change(c.key, { which: e.target.value })}
                    />
                  ) : (
                    <span className="which" />
                  )}
                </li>
              ))}
            </ol>
          </section>
        )
      })}
      <div className="set-foot">
        <span className="muted">
          {plans.length ? `${plans.length} drawing${plans.length === 1 ? '' : 's'} on ${floors}` : 'No plan ticked'} · {kept.length} kept · {choices.length - plans.length - kept.length} left out
        </span>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!!reading || (!plans.length && !kept.length) || choices.some((c) => c.used && bad(c))} onClick={() => onBuild(choices, files)}>
          Build the project
        </button>
      </div>
    </div>
  )
}
