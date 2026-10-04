/**
 * Walk-mode minimap (session 18, ask 12), bottom right, for everyone — orientation, not editing: the rooms (derived faces
 * of the wall graph) and the walls at floor level (doors and passages are gaps), the room you are in tinted and named,
 * you as a dot with a view cone, north from the unit's northDeg. M shows / hides it. Plan space is y-down like SVG, so
 * plan metres are the SVG's own coordinates and any wall angle draws as it is. The dot, the cone and the tint are
 * written straight to the DOM from the camera each frame (like PinLayer): no React re-render per frame.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as core from '../core'
import type { Id, Room, RoomKind, Unit } from '../core'
import type { PlotlineScene } from '../three/PlotlineScene'

/** the map's longer side on screen, px */
export const MAP_PX = 200
/** how far the view cone reaches on the plan, m */
const CONE_M = 2.6
/** margin around the rooms, m */
const PAD_M = 0.8
/** a wall this low is a flush line (0, dashed) or a kerb (thin), not a wall */
const KERB_M = 0.2
const KERB_W = 0.08
const FLUSH_W = 0.06

export interface MapFrame {
  /** SVG viewBox in plan metres: the closed rooms' extent (+ PAD_M); a wall line running past the flat is cut off */
  box: { x: number; y: number; w: number; h: number }
  /** `zone`: an outdoor zone's kind (lawn, drive, pool …: tinted lightly by kind), absent for a room */
  rooms: { id: Id; name: string; points: string; zone?: RoomKind }[]
  /**
   * wall stretches standing at floor level (wallPieces with v0 = 0): a door, passage or slider leaves a gap; `low`: a
   * flush line (a zone's edge, dashed) or a kerb (≤ 0.2 m, thin), drawn whole
   */
  walls: { d: string; w: number; low?: 'flush' | 'kerb' }[]
}

export function mapOf(unit: Unit, rooms: Room[]): MapFrame {
  const polys = rooms.map((r) => ({ r, poly: core.roomPolygon(r, unit) }))
  const pts = polys.length ? polys.flatMap((p) => p.poly) : unit.vertices
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const [x0, y0] = [Math.min(...xs, Infinity) - PAD_M, Math.min(...ys, Infinity) - PAD_M]
  const [x1, y1] = [Math.max(...xs, -Infinity) + PAD_M, Math.max(...ys, -Infinity) + PAD_M]
  const box = Number.isFinite(x0 + x1 + y0 + y1) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: -5, y: -5, w: 10, h: 10 }
  const f = (n: number) => +n.toFixed(3)
  const walls = unit.walls.flatMap((w): MapFrame['walls'] => {
    const fr = core.wallFrame(w, unit.vertices)
    const at = (u: number) => `${f(fr.origin.x + fr.dir.x * u)} ${f(fr.origin.y + fr.dir.y * u)}`
    if (w.heightM <= KERB_M) return [{ d: `M${at(0)}L${at(fr.lengthM)}`, w: w.heightM ? KERB_W : FLUSH_W, low: w.heightM ? 'kerb' : 'flush' }]
    // the pieces touching the floor, joined where they meet (a window's sill piece and its two sides are one stretch)
    const runs: [number, number][] = []
    for (const p of core.wallPieces(w, fr.lengthM).filter((p) => p.v0 < 0.01).sort((a, b) => a.u0 - b.u0)) {
      const last = runs.at(-1)
      if (last && p.u0 <= last[1] + 1e-6) last[1] = Math.max(last[1], p.u1)
      else runs.push([p.u0, p.u1])
    }
    return runs.map(([u0, u1]) => ({ d: `M${at(u0)}L${at(u1)}`, w: w.thicknessM }))
  })
  return {
    box,
    rooms: polys.map(({ r, poly }) => ({ id: r.id, name: r.name, points: poly.map((p) => `${f(p.x)},${f(p.y)}`).join(' '), ...(core.isOutdoor(r.kind) && { zone: r.kind }) })),
    walls,
  }
}

/** the view cone pointing +x (rotated onto the heading by its group): apex at the eye, half-angle `half` rad, radius r */
export const conePath = (half: number, r: number): string => {
  const [c, s] = [+(r * Math.cos(half)).toFixed(3), +(r * Math.sin(half)).toFixed(3)]
  return `M0 0L${c} ${-s}A${r} ${r} 0 0 1 ${c} ${s}Z`
}

/** the camera's horizontal field of view, half of it, rad */
const halfHfov = (cam: THREE.PerspectiveCamera) => Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect)

interface Props {
  scene: PlotlineScene
  unit: Unit
  rooms: Room[]
  /** walk mode (the dollhouse is already a map) */
  walking: boolean
}

export default function Minimap({ scene, unit, rooms, walking }: Props) {
  const map = useMemo(() => mapOf(unit, rooms), [unit, rooms])
  const [shown, setShown] = useState(true)
  const me = useRef<SVGGElement>(null)
  const cone = useRef<SVGPathElement>(null)
  const name = useRef<HTMLDivElement>(null)
  const polys = useRef(new Map<Id, SVGPolygonElement>())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm') setShown((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!shown || !walking) return
    const p = new THREE.Vector3()
    const d = new THREE.Vector3()
    let raf = 0
    let aspect = 0
    let here: Id | null | undefined
    const tick = () => {
      const cam = scene.camera
      cam.getWorldPosition(p)
      cam.getWorldDirection(d)
      me.current?.setAttribute('transform', `translate(${p.x.toFixed(3)} ${p.z.toFixed(3)}) rotate(${((Math.atan2(d.z, d.x) * 180) / Math.PI).toFixed(1)})`)
      if (cam.aspect !== aspect) cone.current?.setAttribute('d', conePath(halfHfov(cam), CONE_M))
      aspect = cam.aspect
      const id = scene.currentRoomId()
      if (id !== here) {
        if (here) polys.current.get(here)?.classList.remove('here')
        if (id) polys.current.get(id)?.classList.add('here')
        if (name.current) name.current.textContent = rooms.find((r) => r.id === id)?.name ?? ''
        here = id
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, rooms, shown, walking])

  if (!walking || !shown) return null
  const k = MAP_PX / Math.max(map.box.w, map.box.h)
  const { x, y, w, h } = map.box
  return (
    <div className="glass minimap" title="Where you are · M hides the map">
      <div className="minimap-head">
        <div ref={name} className="minimap-name" />
        <svg className="compass" width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${unit.northDeg}deg)` }} aria-label="north">
          <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 3.5 L11 9 L9 8 L7 9 Z" fill="currentColor" />
        </svg>
      </div>
      <svg width={Math.round(w * k)} height={Math.round(h * k)} viewBox={`${x} ${y} ${w} ${h}`} aria-label="minimap">
        {map.rooms.map((r) => (
          <polygon
            key={r.id}
            ref={(el) => {
              if (el) polys.current.set(r.id, el)
              else polys.current.delete(r.id)
            }}
            className={r.zone ? `room zone z-${r.zone}` : 'room'}
            points={r.points}
          />
        ))}
        {map.walls.map((s, i) => (
          <path key={i} className={s.low ? `wall ${s.low}` : 'wall'} d={s.d} strokeWidth={s.w} />
        ))}
        <g ref={me}>
          <path ref={cone} className="cone" />
          <circle className="me" r={0.3} />
        </g>
      </svg>
    </div>
  )
}
