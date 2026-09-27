/// <reference types="node" />
/** Node-only IO for the trace eval (tests): load PGM fixtures (scripts/trace-fixtures.mjs), write overlay PNGs. Never imported by the app. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
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

type RGB = [number, number, number]

/** The plan faded to 45 % contrast, then (optional) hand-traced walls in green, traced walls in red, openings by kind. */
export function writeOverlay(
  path: string,
  g: Gray,
  trace: WallTrace,
  truth?: { a: Px; b: Px }[],
  crop?: { x: number; y: number; w: number; h: number; s?: number },
  /** eval misses (hand-traced wall no trace covers → blue dots) and extras (trace on no hand-traced wall → yellow) */
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
  for (const p of marks?.missed ?? []) blob(p, [30, 90, 255])
  for (const p of marks?.extra ?? []) blob(p, [240, 200, 0])
  writePng(path, W, H, px)
}

function writePng(path: string, w: number, h: number, rgb: Uint8Array): void {
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
