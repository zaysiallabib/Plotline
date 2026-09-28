/// <reference types="node" />
/** Node-only IO for the trace eval (tests): load PGM fixtures (scripts/trace-fixtures.mjs), write overlay PNGs. Never imported by the app. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Unit } from '../core'
import { segPieces } from './walls'
import type { Gray, Px, WallTrace } from './types'

export const FIXTURES = process.env.TRACE_FIXTURES ?? 'E:/dev/tmp/wave15/walls/fixtures/'
/** set TRACE_SHOTS=<dir> to write overlay PNGs */
export const SHOTS = process.env.TRACE_SHOTS ?? ''

export function loadPgm(path: string): Gray | null {
  if (!existsSync(path)) return null
  const b = readFileSync(path)
  const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 40).toString('latin1'))
  if (!m) throw new Error(`not a P5 PGM: ${path}`)
  const w = +m[1], h = +m[2]
  return { width: w, height: h, data: new Uint8Array(b.buffer, b.byteOffset + m[0].length, w * h) }
}

/** P6 colour fixture (`trace-fixtures.mjs --rgb`) → RGBA, as a canvas would give it. */
export function loadPpm(path: string): { width: number; height: number; data: Uint8Array } | null {
  if (!existsSync(path)) return null
  const b = readFileSync(path)
  const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 40).toString('latin1'))
  if (!m) throw new Error(`not a P6 PPM: ${path}`)
  const w = +m[1], h = +m[2], o = m[0].length
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) (data[i * 4] = b[o + i * 3]), (data[i * 4 + 1] = b[o + i * 3 + 1]), (data[i * 4 + 2] = b[o + i * 3 + 2]), (data[i * 4 + 3] = 255)
  return { width: w, height: h, data }
}

type RGB = [number, number, number]

/**
 * The plan faded to 45 % contrast; hand-traced walls green, traced walls red (arcs orange, ends black ticks); openings:
 * door blue (+ a thin hinge→swing line), window cyan, passage/unknown magenta; eval misses brown, extras yellow.
 */
export function writeOverlay(
  path: string,
  g: Gray,
  trace: WallTrace,
  truth?: { a: Px; b: Px }[],
  crop?: { x: number; y: number; w: number; h: number; s?: number },
  /** eval misses (hand-traced wall no trace covers → brown dots) and extras (trace on no hand-traced wall → yellow) */
  marks?: { missed: Px[]; extra: Px[] },
): void {
  const c = crop ?? { x: 0, y: 0, w: g.width, h: g.height }
  const s = crop?.s ?? 1
  const W = Math.round(c.w * s), H = Math.round(c.h * s)
  const px = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(c.x + x / s), sy = Math.floor(c.y + y / s)
      const v = sx >= 0 && sy >= 0 && sx < g.width && sy < g.height ? 140 + (g.data[sy * g.width + sx] * 115) / 255 : 128
      px[(y * W + x) * 3] = px[(y * W + x) * 3 + 1] = px[(y * W + x) * 3 + 2] = v
    }
  const dot = (x: number, y: number, col: RGB) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return
    const i = (yi * W + xi) * 3
    ;(px[i] = col[0]), (px[i + 1] = col[1]), (px[i + 2] = col[2])
  }
  const to = (p: Px) => ({ x: (p.x - c.x) * s, y: (p.y - c.y) * s })
  const line = (p: Px, q: Px, col: RGB, r = 0) => {
    const a = to(p), b = to(q)
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) + 1
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) dot(x + dx, y + dy, col)
    }
  }
  const lw = crop ? 1 : Math.max(0, Math.round(Math.max(g.width, g.height) / 1500))
  for (const l of truth ?? []) line(l.a, l.b, [0, 170, 0], crop ? 0 : lw)
  for (const wl of trace.walls) {
    const col: RGB = wl.mid ? [255, 120, 0] : [220, 0, 0]
    for (const p of segPieces(wl)) line(p.a, p.b, col, lw)
    for (const p of [wl.a, wl.b]) {
      const q = to(p)
      for (let d = -2 - lw; d <= 2 + lw; d++) dot(q.x + d, q.y, [0, 0, 0]), dot(q.x, q.y + d, [0, 0, 0])
    }
  }
  const kc: Record<string, RGB> = { door: [0, 60, 255], window: [0, 200, 220], slider: [160, 0, 255], passage: [255, 0, 200], unknown: [255, 0, 200] }
  for (const op of trace.openings) {
    line(op.a, op.b, kc[op.kind], lw + 1)
    if (op.hingeAt && op.swingTo) line(op.hingeAt, op.swingTo, kc.door, 0)
  }
  const blob = (p: Px, col: RGB) => {
    const q = to(p)
    for (let dy = -1 - lw; dy <= 1 + lw; dy++) for (let dx = -1 - lw; dx <= 1 + lw; dx++) dot(q.x + dx, q.y + dy, col)
  }
  for (const p of marks?.missed ?? []) blob(p, [130, 70, 0])
  for (const p of marks?.extra ?? []) blob(p, [240, 200, 0])
  writePng(path, W, H, px)
}

const KIND_RGB: Record<string, RGB> = {
  bed: [120, 170, 255], living: [255, 200, 90], dining: [255, 160, 60], kitchen: [255, 110, 110], bath: [90, 220, 220], balcony: [120, 220, 110],
  study: [190, 140, 255], closet: [210, 180, 140], utility: [200, 200, 120], shaft: [150, 150, 150], other: [255, 120, 230],
}

/**
 * A solver draft on its sheet (cropped to the draft ± 2 m): plan faded; rooms filled by kind (bed blue, living/dining
 * orange, kitchen red, bath cyan, veranda green, study violet, closet tan, utility olive, shaft grey, other/unnamed pink);
 * 10" walls dark red, 5" red; openings door blue, window cyan, passage magenta,
 * slider violet; review points yellow (unclosed / unlabelled) or orange (the rest); hand-traced walls green.
 */
export function writeUnitOverlay(path: string, g: Gray, unit: Unit, review: { at: { x: number; y: number }; kind: string }[], truth?: { a: Px; b: Px }[]): void {
  const pi = unit.planImage!
  const toPx = (p: { x: number; y: number }) => ({ x: pi.originPx.x + p.x * pi.pxPerM, y: pi.originPx.y + p.y * pi.pxPerM })
  const xs = unit.vertices.map((v) => toPx(v).x), ys = unit.vertices.map((v) => toPx(v).y)
  const pad = 2 * pi.pxPerM
  const c = xs.length
    ? { x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - pad), w: 0, h: 0 }
    : { x: 0, y: 0, w: g.width, h: g.height }
  if (xs.length) (c.w = Math.min(g.width, Math.max(...xs) + pad) - c.x), (c.h = Math.min(g.height, Math.max(...ys) + pad) - c.y)
  const s = Math.min(3, Math.max(1, 1400 / Math.max(c.w, c.h)))
  const W = Math.round(c.w * s), H = Math.round(c.h * s)
  const px = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(c.x + x / s), sy = Math.floor(c.y + y / s)
      const v = sx >= 0 && sy >= 0 && sx < g.width && sy < g.height ? 110 + (g.data[sy * g.width + sx] * 145) / 255 : 128
      px[(y * W + x) * 3] = px[(y * W + x) * 3 + 1] = px[(y * W + x) * 3 + 2] = v
    }
  const to = (p: Px) => ({ x: (p.x - c.x) * s, y: (p.y - c.y) * s })
  const dot = (x: number, y: number, col: RGB, a = 1) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return
    const i = (yi * W + xi) * 3
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + col[k] * a)
  }
  // rooms (smallest last so nested faces show)
  for (const r of deriveRooms(unit).sort((p, q) => q.areaSqm - p.areaSqm)) {
    const poly = roomPolygon(r, unit).map((p) => to(toPx(p)))
    const bx = poly.map((p) => p.x), by = poly.map((p) => p.y)
    for (let y = Math.max(0, Math.floor(Math.min(...by))); y <= Math.min(H - 1, Math.ceil(Math.max(...by))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...bx))); x <= Math.min(W - 1, Math.ceil(Math.max(...bx))); x++)
        if (pointInPolygon({ x, y }, poly)) dot(x, y, KIND_RGB[r.kind] ?? KIND_RGB.other, 0.35)
  }
  const line = (p: Px, q: Px, col: RGB, r = 0, dash = 0) => {
    const a = to(p), b = to(q)
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) + 1
    for (let k = 0; k <= n; k++) {
      if (dash && Math.floor(k / (2 * dash)) % 2) continue
      const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) dot(x + dx, y + dy, col)
    }
  }
  for (const l of truth ?? []) line(l.a, l.b, [0, 170, 0], 0)
  const V = new Map(unit.vertices.map((v) => [v.id, toPx(v)]))
  const opCol: Record<string, RGB> = { door: [0, 60, 255], window: [0, 200, 220], passage: [255, 0, 200], slider: [150, 0, 255] }
  for (const w of unit.walls) {
    const a = V.get(w.a)!, b = V.get(w.b)!
    line(a, b, w.thicknessM > 0.19 ? [150, 0, 0] : [230, 20, 20], w.thicknessM > 0.19 ? 2 : 1)
    const L = Math.hypot(b.x - a.x, b.y - a.y) / pi.pxPerM
    for (const o of w.openings) {
      const f0 = o.offsetM / L, f1 = (o.offsetM + o.widthM) / L
      const p = { x: a.x + (b.x - a.x) * f0, y: a.y + (b.y - a.y) * f0 }, q = { x: a.x + (b.x - a.x) * f1, y: a.y + (b.y - a.y) * f1 }
      line(p, q, opCol[o.kind], 2)
    }
  }
  for (const r of review) {
    const q = to(toPx(r.at))
    const col: RGB = r.kind === 'unclosed' || r.kind === 'unlabelled' ? [255, 230, 0] : [255, 140, 0]
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) === 3 || Math.abs(dy) === 3) dot(q.x + dx, q.y + dy, col)
  }
  writePng(path, W, H, px)
}

export function writePng(path: string, w: number, h: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1)
  }
  const crcT = new Int32Array(256).map((_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c
  })
  const crc = (buf: Buffer) => {
    let c = -1
    for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const chunk = (t: string, data: Buffer) => {
    const l = Buffer.alloc(4)
    l.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(t), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([l, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
