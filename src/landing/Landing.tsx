/**
 * The front page (`/`): one story told as the person scrolls — the Type A sheet, its walls rising, a tower of that plan
 * (story.ts draws it on one canvas) — then what Plotline does, in prose and six pictures from the 3D view. Plain React +
 * CSS; never imports the viewer or three.js, so `/` stays a small page.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { floor, name, northDeg, projectName, roomLabels, vertices, walls } from '../data/units/type-a.json'
import type { Unit } from '../core'
import { draw, moment, planOf, type Box, type Inks } from './story'
import './landing.css'

const FLAT = '/u/type-a'

/** "Open the Studio", and under it on a phone that it is for a computer (qa3 P14: it opened squeezed, nothing said so) */
const StudioLink = () => (
  <span className="studio-link">
    <a className="quiet" href="/studio">
      <span className="u">Open the Studio</span>
      <span aria-hidden="true">→</span>
    </a>
    <span className="phone-note">The Studio is for a computer</span>
  </span>
)

/** The story's three acts, as the scroll passes them (the canvas and the words read the same position). */
const actAt = (p: number) => (p < 0.14 ? 1 : p < 0.47 ? 2 : 3)

/** Wires the story to the scroll: one draw per frame while the page moves or resizes, nothing while it rests. */
function story(root: HTMLElement): () => void {
  const section = root.querySelector<HTMLElement>('.story')!
  const stage = section.querySelector<HTMLElement>('.stage')!
  const cv = stage.querySelector('canvas')!
  const g = cv.getContext('2d')
  if (!g) return () => {}
  const css = getComputedStyle(root)
  const v = (n: string) => css.getPropertyValue(n).trim()
  const ink: Inks = { ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), hairline: v('--hairline'), paper: v('--surface'), sans: v('--font'), serif: v('--font-display') }
  const plan = planOf({ vertices, walls, roomLabels, name, projectName, floor, northDeg } as unknown as Unit)
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0
  let last = -1
  let box: Box = { x: 0, y: 0, w: 0, h: 0, dpr: 1 }
  /** phone: where each act's words end (px from the stage's top); the drawing hangs under the words on screen */
  let ends = [0, 0, 0]
  const size = (): void => {
    const W = stage.clientWidth
    const H = stage.clientHeight
    const dpr = Math.min(devicePixelRatio || 1, 2)
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    // desktop: the drawing stands right of the words; phone: under them, full width, under each act's own words (act I's
    // are the tallest: under them acts II and III left a gap) — an act not laid out (reduced motion) counts as act I's
    const top = stage.getBoundingClientRect().top
    const hero = stage.querySelector<HTMLElement>('.hero')!.getBoundingClientRect().bottom
    ends = [...stage.querySelectorAll<HTMLElement>('.cap')].map((e) => (e.getBoundingClientRect().height ? e.getBoundingClientRect().bottom : hero) - top + 8)
    box = W >= 900 ? { x: W * 0.4, y: 64, w: W * 0.6 - 48, h: H - 96, dpr } : { x: 16, y: ends[0], w: W - 32, h: H - ends[0] - 24, dpr, top: true }
    last = -1
  }
  const frame = (): void => {
    raf = 0
    root.classList.toggle('scrolled', scrollY > 8)
    const r = section.getBoundingClientRect()
    if (r.bottom < 0 || r.top > innerHeight) return
    const p = still.matches ? 1 : Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)))
    if (p === last) return
    last = p
    root.style.setProperty('--p', p.toFixed(4))
    stage.dataset.act = String(actAt(p))
    const m = moment(p)
    if (box.top) {
      // the words' end follows the camera: act I's while the sheet lies flat, act II's as it tilts, act III's as it zooms out
      const y = ends[0] + (ends[1] - ends[0]) * m.tilt + (ends[2] - ends[1]) * m.zoom
      box = { ...box, y, h: box.h + box.y - y }
    }
    draw(g, plan, m, box, ink)
  }
  const kick = (): void => {
    raf ||= requestAnimationFrame(frame)
  }
  const resize = (): void => {
    size()
    kick()
  }
  size()
  frame()
  document.fonts.ready.then(resize)
  addEventListener('scroll', kick, { passive: true })
  addEventListener('resize', resize)
  still.addEventListener('change', resize)
  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('scroll', kick)
    removeEventListener('resize', resize)
    still.removeEventListener('change', resize)
  }
}

/** A plate in the book: a picture from the 3D view with its number and caption. */
function Plate({ n, src, alt, caption }: { n: string; src: string; alt: string; caption: string }) {
  return (
    <figure className="plate">
      <img src={`/landing/${src}.jpg`} alt={alt} width={1600} height={1000} loading="lazy" decoding="async" />
      <figcaption>
        <span className="label">Plate {n}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  )
}

/** The words of one act, shown while the scroll is between a and b. */
const span = (a: number, b: number) => ({ '--a': a, '--b': b }) as CSSProperties

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => story(root.current!), [])
  return (
    <div className="landing grain" ref={root}>
      <header className="bar">
        <a className="mark display" href="/" aria-label="Plotline, front page">
          Plotline
        </a>
        <nav aria-label="Main">
          <a href={FLAT}>See a flat</a>
          <a href="/studio">Studio</a>
        </nav>
      </header>

      <section className="story" aria-label="From a floor plan to a building">
        <div className="stage" data-act="1">
          <canvas role="img" aria-label="The Type A floor plan on a sheet of paper; as the page scrolls its walls rise, then floors of it stack into a tower on a colonnade" />
          <div className="hero cap" style={span(-1, 0.14)}>
            <p className="label">Digital show flat · Dhaka</p>
            <h1 className="display">Plotline</h1>
            <p className="lead">The architect's plan becomes a furnished flat your buyers can walk, long before it is built.</p>
            <div className="actions">
              <a className="btn primary" href={FLAT}>
                See a flat
              </a>
              <StudioLink />
            </div>
          </div>
          <div className="act cap" style={span(0.15, 0.47)} aria-hidden="true">
            <p className="label">II · The walls</p>
            <p className="say display">Every wall stands where the sheet draws it.</p>
            <p className="more">Its real thickness and height, with the doors and windows cut where the plan puts them.</p>
          </div>
          <div className="act cap" style={span(0.48, 2)} aria-hidden="true">
            <p className="label">III · The building</p>
            <p className="say display">One plan, every floor.</p>
            <p className="more">Stack the floors into the tower, set it in its street, and light it with the real sun of its site.</p>
          </div>
          <ol className="acts" aria-hidden="true">
            <li className="label">I · Plan</li>
            <li className="label">II · Walls</li>
            <li className="label">III · Building</li>
          </ol>
        </div>
      </section>

      <main>
        <section className="sec" id="how">
          <p className="label">How it works</p>
          <h2 className="display">From a sheet of paper to a building you can walk.</h2>
          <ol className="cols">
            <li>
              <span className="num display">I</span>
              <h3 className="display">Bring the plan</h3>
              <p>A drawing, a photo of one, or the architect's IFC or DXF file. Your team checks each wall against the printed sizes.</p>
            </li>
            <li>
              <span className="num display">II</span>
              <h3 className="display">Walk the building</h3>
              <p>Every room furnishes itself. Stack the floors into the whole tower, in its street.</p>
            </li>
            <li>
              <span className="num display">III</span>
              <h3 className="display">Share, then listen</h3>
              <p>Each buyer gets a link. Every choice and every note comes back to you.</p>
            </li>
          </ol>
          <Plate n="I" src="dining" alt="Inside a flat in the 3D walk: the dining and family living room, furnished, in afternoon sun" caption="Type A, dining and family living, at 15:30" />
          <div className="pair">
            <Plate n="II" src="dollhouse" alt="The whole flat seen from above with the roof lifted off, every room furnished" caption="The whole flat from above, the roof lifted" />
            <Plate n="III" src="building" alt="The whole tower in 3D with one floor picked out, in its street" caption="Every floor of the tower, in its street" />
          </div>
        </section>

        <section className="sec split">
          <div>
            <p className="label">For buyers</p>
            <h2 className="display">What buyers do</h2>
            <ul className="rows">
              <li>
                <h3 className="display">Walk the exact flat</h3>
                <p>The one they are buying, on its own floor, from Dhaka or from abroad.</p>
              </li>
              <li>
                <h3 className="display">Choose finishes</h3>
                <p>Only from the options you approved.</p>
              </li>
              <li>
                <h3 className="display">Leave a note on anything</h3>
                <p>A wall, a door, a tile. The note stays pinned to it.</p>
              </li>
            </ul>
          </div>
          <Plate n="IV" src="living" alt="Inside a flat in the 3D walk: the living room with a sofa, an armchair and corner windows onto the street" caption="Type A, the living room" />
        </section>

        <section className="sec">
          <p className="label">For developers</p>
          <h2 className="display">What the developer gets</h2>
          <ul className="cols">
            <li>
              <h3 className="display">One change list</h3>
              <p>Every note and choice, dated, in one list. Export it and attach it to the sale agreement.</p>
            </li>
            <li>
              <h3 className="display">Finishes with prices</h3>
              <p>Floors, paint, tiles: each option with its price difference in taka.</p>
            </li>
            <li>
              <h3 className="display">Sun and wind</h3>
              <p>The real sun for your site on any day, the wind month by month, the neighbours around you.</p>
            </li>
          </ul>
          <div className="pair">
            <Plate n="V" src="finishes" alt="The Finishes panel open in the 3D walk: floor options, each with its price difference in taka" caption="Finishes, each with its price difference" />
            <Plate n="VI" src="sun" alt="A room in the 3D walk with the Sun and wind card open: the time, the day, the months and a compass" caption="The site's real sun, hour by hour" />
          </div>
        </section>

        <section className="close">
          <p className="display">
            Show every flat,
            <br />
            before it is built.
          </p>
          <div className="actions">
            <a className="btn primary" href={FLAT}>
              See a flat
            </a>
            <StudioLink />
          </div>
        </section>
      </main>

      <footer className="foot">
        <span className="label">Plotline · Dhaka</span>
        <nav aria-label="Footer">
          <a href={FLAT}>See a flat</a>
          <a href="/studio">Studio</a>
        </nav>
      </footer>
    </div>
  )
}
