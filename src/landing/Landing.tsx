/**
 * The front page (`/`): what Plotline is, for a developer who has never seen it. Plain React + CSS + one small canvas:
 * a faint floor plan behind everything that bends toward the mouse (planField), sections that rise in as they scroll
 * into view, product pictures (public/landing, shot in Firefox from the buyer's viewer) that drift a little and tilt
 * under the mouse. Never imports the viewer or three.js — `/` must stay a small page.
 */
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import './landing.css'

const FLAT = '/u/type-a'
const still = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Small seeded random (mulberry32): the plan is the same on every visit. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Seg = [number, number, number, number]

/** A made-up floor plan filling w×h: rooms split in two until they are room-sized, each split wall with a door gap. */
function plan(w: number, h: number): Seg[] {
  const r = rng(7)
  const out: Seg[] = [[0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0]]
  const split = (x: number, y: number, rw: number, rh: number): void => {
    const vertical = rw > rh * 1.15 || (rw > rh / 1.15 && r() < 0.5)
    const len = vertical ? rw : rh
    if (len < 220 || (len < 420 && r() < 0.3)) return
    const at = len * (0.32 + r() * 0.36)
    const span = vertical ? rh : rw
    const door = Math.min(38, span * 0.3)
    const d = span * (0.15 + r() * 0.6)
    if (vertical) {
      out.push([x + at, y, x + at, y + d], [x + at, y + d + door, x + at, y + rh])
      split(x, y, at, rh)
      split(x + at, y, rw - at, rh)
    } else {
      out.push([x, y + at, x + d, y + at], [x + d + door, y + at, x + rw, y + at])
      split(x, y, rw, at)
      split(x, y + at, rw, rh - at)
    }
  }
  split(0, 0, w, h)
  return out
}

/** How far the plan moves for each pixel scrolled (a slow layer behind the page). */
const DRIFT = 0.35
/** The plan's height (px): enough for any page height × DRIFT; fixed, so the plan only changes when the width does. */
const TALL = 4200
/** The pull toward the mouse: strength and reach (px). */
const PULL = 0.3
const REACH = 170

/**
 * The background: the plan, drawn faint; near the mouse its lines lean toward it and warm to gold. Draws only when
 * something changes (the mouse, the scroll, the size); the loop stops once the lines settle and never runs in a hidden tab.
 */
function planField(cv: HTMLCanvasElement): () => void {
  const g = cv.getContext('2d')
  if (!g) return () => {}
  const calm = still()
  let segs: Seg[] = []
  let w = 0
  let h = 0
  let planW = 0
  let raf = 0
  const target = { x: 0, y: 0, on: 0 }
  const at = { x: 0, y: 0, on: 0 }
  const lean = (x: number, y: number): [number, number] => {
    const dx = at.x - x
    const dy = at.y - y
    const f = PULL * at.on * Math.exp(-(dx * dx + dy * dy) / (REACH * REACH))
    return [x + dx * f, y + dy * f]
  }
  const draw = (): void => {
    const off = calm ? 0 : -scrollY * DRIFT
    g.clearRect(0, 0, w, h)
    if (at.on > 0.01) {
      const glow = g.createRadialGradient(at.x, at.y, 0, at.x, at.y, 420)
      glow.addColorStop(0, `rgba(232,193,112,${0.07 * at.on})`)
      glow.addColorStop(1, 'rgba(232,193,112,0)')
      g.fillStyle = glow
      g.fillRect(0, 0, w, h)
    }
    const ink = g.createRadialGradient(at.x, at.y, 0, at.x, at.y, REACH * 2.2)
    ink.addColorStop(0, `rgba(232,193,112,${0.07 + 0.38 * at.on})`)
    ink.addColorStop(1, 'rgba(242,242,240,0.07)')
    g.strokeStyle = ink
    g.beginPath()
    for (const [x1, y1a, x2, y2a] of segs) {
      const y1 = y1a + off
      const y2 = y2a + off
      if (Math.max(y1, y2) < -2 || Math.min(y1, y2) > h + 2) continue
      const mx = Math.max(Math.min(at.x, Math.max(x1, x2)), Math.min(x1, x2))
      const my = Math.max(Math.min(at.y, Math.max(y1, y2)), Math.min(y1, y2))
      const near = at.on > 0.01 && Math.hypot(mx - at.x, my - at.y) < REACH * 2.5
      const n = near ? Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12)) : 1
      for (let i = 0; i <= n; i++) {
        const [x, y] = near ? lean(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n) : i ? [x2, y2] : [x1, y1]
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
    }
    g.stroke()
  }
  const tick = (): void => {
    raf = 0
    const k = 0.14
    at.x += (target.x - at.x) * k
    at.y += (target.y - at.y) * k
    at.on += (target.on - at.on) * 0.08
    draw()
    if (Math.abs(target.x - at.x) + Math.abs(target.y - at.y) > 0.3 || Math.abs(target.on - at.on) > 0.005) kick()
  }
  const kick = (): void => {
    if (!raf && !document.hidden) raf = requestAnimationFrame(tick)
  }
  const size = (): void => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    w = innerWidth
    h = innerHeight
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.lineWidth = 1
    if (planW !== w) segs = plan(w + 2, TALL).map(([a, b, c, d]) => [a - 1, b - 1, c - 1, d - 1])
    planW = w
    draw()
  }
  const move = (e: globalThis.PointerEvent): void => {
    if (calm || e.pointerType !== 'mouse') return
    if (!target.on) (at.x = e.clientX), (at.y = e.clientY) // arriving: start where the mouse is, not where it left
    target.x = e.clientX
    target.y = e.clientY
    target.on = 1
    kick()
  }
  const leave = (e: globalThis.PointerEvent): void => {
    if (!e.relatedTarget) (target.on = 0), kick()
  }
  size()
  addEventListener('resize', size)
  addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerout', leave)
  if (!calm) addEventListener('scroll', kick, { passive: true })
  document.addEventListener('visibilitychange', kick)
  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('resize', size)
    removeEventListener('pointermove', move)
    document.removeEventListener('pointerout', leave)
    removeEventListener('scroll', kick)
    document.removeEventListener('visibilitychange', kick)
  }
}

/** Sections rise in once as they come into view; pictures drift with the scroll; the top bar gets its line once scrolled. */
function motion(root: HTMLElement): () => void {
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es)
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  root.querySelectorAll('.reveal').forEach((el) => io.observe(el))
  const shots = [...root.querySelectorAll<HTMLElement>('.shot')]
  const calm = still()
  let raf = 0
  const frame = (): void => {
    raf = 0
    root.classList.toggle('scrolled', scrollY > 8)
    if (calm) return
    const vh = innerHeight
    for (const s of shots) {
      const r = s.getBoundingClientRect()
      if (r.bottom > -vh && r.top < vh * 2) s.style.setProperty('--p', ((r.top + r.height / 2 - vh / 2) / vh).toFixed(3))
    }
  }
  const onScroll = (): void => {
    raf ||= requestAnimationFrame(frame)
  }
  frame()
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll)
  return () => {
    io.disconnect()
    cancelAnimationFrame(raf)
    removeEventListener('scroll', onScroll)
    removeEventListener('resize', onScroll)
  }
}

/** Under the mouse a picture tips a few degrees toward it and a soft light follows. */
function tilt(e: PointerEvent<HTMLElement>): void {
  if (e.pointerType !== 'mouse' || still()) return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  el.style.setProperty('--rx', `${((0.5 - y) * 4).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${((x - 0.5) * 5).toFixed(2)}deg`)
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
}
const untilt = (e: PointerEvent<HTMLElement>): void => {
  for (const k of ['--rx', '--ry']) e.currentTarget.style.setProperty(k, '0deg')
}

function Shot({ src, alt, caption, eager }: { src: string; alt: string; caption: string; eager?: boolean }) {
  return (
    <figure className="shot reveal">
      <div className="frame" onPointerMove={tilt} onPointerLeave={untilt}>
        <img src={`/landing/${src}.jpg`} alt={alt} width={1600} height={1000} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

const Arrow = () => (
  <span className="arrow" aria-hidden="true">
    →
  </span>
)

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => motion(root.current!), [])
  useEffect(() => planField(canvas.current!), [])
  const d = (i: number) => ({ '--d': `${i * 90}ms` }) as CSSProperties
  return (
    <div className="landing" ref={root}>
      <canvas className="field" ref={canvas} aria-hidden="true" />
      <header className="bar">
        <a className="mark" href="/" aria-label="Plotline, front page">
          Plotline<span className="dot">.</span>
        </a>
        <nav aria-label="Main">
          <a href={FLAT}>See a flat</a>
          <a href="/studio">Studio</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow rise" style={d(0)}>
            Digital show flat · Dhaka
          </p>
          <h1 className="word">
            <span className="sr">Plotline</span>
            <span aria-hidden="true">
              {[...'Plotline'].map((c, i) => (
                <span key={i} className="ch" style={{ '--i': i } as CSSProperties}>
                  {c}
                </span>
              ))}
              <span className="ch dot" style={{ '--i': 8 } as CSSProperties}>
                .
              </span>
            </span>
          </h1>
          <p className="lead rise" style={d(6)}>
            The architect's plan, as a furnished 3D flat your buyers can walk.
          </p>
          <div className="actions rise" style={d(7)}>
            <a className="l-btn primary" href={FLAT}>
              See a flat <Arrow />
            </a>
            <a className="l-btn" href="#how">
              For developers
            </a>
          </div>
          <span className="cue" aria-hidden="true" />
        </section>

        <section className="wide">
          <Shot src="dining" alt="Inside a flat in the 3D walk: the dining and family living room, furnished, in afternoon sun" caption="Type A · dining and family living · 15:30" eager />
        </section>

        <section id="how" className="block">
          <h2 className="reveal">How it works</h2>
          <ol className="steps">
            <li className="reveal" style={d(0)}>
              <span className="n">01</span>
              <h3>Bring the plan</h3>
              <p>A drawing, or the architect's IFC or DXF file. Your team checks the walls against the printed sizes.</p>
            </li>
            <li className="reveal" style={d(1)}>
              <span className="n">02</span>
              <h3>Walk the building</h3>
              <p>Every room furnishes itself. Stack the floors into the whole tower.</p>
            </li>
            <li className="reveal" style={d(2)}>
              <span className="n">03</span>
              <h3>Share, then listen</h3>
              <p>Send each buyer a link. Every choice and every note comes back to you.</p>
            </li>
          </ol>
          <div className="pair">
            <Shot src="dollhouse" alt="The whole flat seen from above with the roof lifted off, every room furnished" caption="Dollhouse · the whole flat from above" />
            <Shot src="building" alt="The whole tower in 3D with one floor picked out, in its street" caption="Building · every floor of the tower" />
          </div>
        </section>

        <section className="block split">
          <div>
            <h2 className="reveal">What buyers do</h2>
            <ul className="points">
              <li className="reveal" style={d(0)}>
                <h3>Walk the exact flat</h3>
                <p>The one they are buying, on its floor — from Dhaka or from abroad.</p>
              </li>
              <li className="reveal" style={d(1)}>
                <h3>Choose finishes</h3>
                <p>Only from the options you approved.</p>
              </li>
              <li className="reveal" style={d(2)}>
                <h3>Leave a note on anything</h3>
                <p>A wall, a door, a tile. The note stays pinned to it.</p>
              </li>
            </ul>
          </div>
          <Shot src="living" alt="Inside a flat in the 3D walk: the living room with a sofa, an armchair and corner windows onto the street" caption="Type A · living room" />
        </section>

        <section className="block">
          <h2 className="reveal">What the developer gets</h2>
          <ul className="steps">
            <li className="reveal" style={d(0)}>
              <h3>One change list</h3>
              <p>Every note and choice, dated, in one list. Export it and attach it to the sale agreement.</p>
            </li>
            <li className="reveal" style={d(1)}>
              <h3>Finishes with prices</h3>
              <p>Floors, paint, tiles: each option with its price difference in taka.</p>
            </li>
            <li className="reveal" style={d(2)}>
              <h3>Sun and wind</h3>
              <p>The real sun for your site on any day, the wind month by month, the neighbours around you.</p>
            </li>
          </ul>
          <div className="pair">
            <Shot src="finishes" alt="The Finishes panel open in the 3D walk: floor options, each with its price difference in taka" caption="Finishes · each option with its price difference" />
            <Shot src="sun" alt="A bedroom in the 3D walk at 8 in the morning, the Sun & wind card open: the time, the day, the twelve months and a compass" caption="Sun · bedroom 1 at 08:00, the site's real sun" />
          </div>
        </section>

        <section className="close">
          <p className="big reveal">
            Show every flat,
            <br />
            before it is built.
          </p>
          <div className="actions reveal" style={d(1)}>
            <a className="l-btn primary" href={FLAT}>
              See a flat <Arrow />
            </a>
            <a className="l-btn" href="/studio">
              Open the Studio
            </a>
          </div>
        </section>
      </main>

      <footer className="foot">Plotline · Dhaka</footer>
    </div>
  )
}
