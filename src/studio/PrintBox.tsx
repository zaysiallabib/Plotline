/**
 * Print the plan (session 31, ⋯ → Print plan…): the drawing as an architect's sheet — at 1 : 50, 1 : 100 or 1 : 200 on A4
 * to A1, with its title block, scale bar and north arrow (import/sheet.ts sheetSvg). The box shows the sheet as it will
 * print; Print hands it to the browser's print window, where "Save as PDF" makes the PDF. A scale the plan does not fit
 * on that paper is greyed out. Esc or × closes it.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Unit } from '../core'
import { PAPERS, SCALES, fits, layoutOf, sheetOf, sheetSvg, type Paper } from '../import/sheet'

/** prints an SVG sheet on its own page of that size, then takes it away again */
function printSheet(svg: string, w: number, h: number): void {
  const host = document.createElement('div')
  host.className = 'print-sheet'
  host.innerHTML = svg
  const page = document.createElement('style')
  page.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`
  document.body.append(host, page)
  const done = () => (host.remove(), page.remove())
  addEventListener('afterprint', done, { once: true })
  window.print()
}

export default function PrintBox({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const sheet = useMemo(() => sheetOf(unit), [unit])
  const firstFit = (p: Paper) => SCALES.find((s) => fits(sheet, p, s)) ?? null
  const [paper, setPaper] = useState<Paper>(() => (Object.keys(PAPERS) as Paper[]).find((p) => p !== 'A4' && firstFit(p) === 100) ?? 'A3')
  const [scale, setScale] = useState<number>(() => firstFit(paper) ?? 200)
  const ok = fits(sheet, paper, scale)
  const svg = useMemo(
    () => sheetSvg(sheet, paper, scale, { project: unit.projectName, name: unit.name, floor: unit.floor, areaSqft: unit.areaSqft || undefined, northDeg: unit.northDeg, date: new Date().toISOString().slice(0, 10) }),
    [sheet, paper, scale, unit],
  )
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [onClose])
  const pick = (p: Paper) => {
    setPaper(p)
    if (!fits(sheet, p, scale)) setScale(firstFit(p) ?? scale)
  }
  const { w, h } = layoutOf(sheet, paper)
  return (
    <div className="print-box" role="dialog" aria-label="Print the plan">
      <div className="head">
        <strong>Print the plan</strong>
        <button className="x" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </div>
      {/* (sheetSvg escapes every name and number it writes: a dropped drawing's text cannot become markup) */}
      <div className="print-preview" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="row">
        <span>Paper</span>
        <div className="seg" role="group" aria-label="Paper">
          {(Object.keys(PAPERS) as Paper[]).map((p) => (
            <button key={p} className={p === paper ? 'on' : ''} aria-pressed={p === paper} onClick={() => pick(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span>Scale</span>
        <div className="seg" role="group" aria-label="Scale">
          {SCALES.map((s) => (
            <button key={s} className={s === scale ? 'on' : ''} aria-pressed={s === scale} disabled={!fits(sheet, paper, s)} title={fits(sheet, paper, s) ? `1 : ${s}` : `Too big for ${paper} at 1 : ${s}`} onClick={() => setScale(s)}>
              1 : {s}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">{ok ? `${paper} ${w > h ? 'landscape' : 'upright'}. In the print window, choose "Save as PDF" for a PDF.` : `The plan does not fit ${paper} at 1 : ${scale}: a larger paper or a smaller scale.`}</p>
      <div className="actions">
        <button className="primary" disabled={!ok} onClick={() => printSheet(svg, w, h)}>
          Print
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
