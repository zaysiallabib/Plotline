/**
 * Names read late and the building's core (from Maheer's Plotline 2.0, his recovery tests): tesseract is mocked, and
 * `readInFaces` can hand back a fixed late read (`control.late`), so the core / ownership rules run without OCR.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import type { Gray, TextItem } from './types'
import { capacityCores, prepare } from './solve'
import { deriveRooms } from '../core'

const control = vi.hoisted(() => ({ replies: [] as string[], late: null as TextItem[] | null }))
vi.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: 6, SPARSE_TEXT: 11, SINGLE_LINE: 7, SINGLE_WORD: 8 },
  createWorker: async () => ({ setParameters: async () => {} }),
  createScheduler: () => ({ addWorker: () => {}, terminate: async () => {}, addJob: async () => ({ data: { text: control.replies.shift() ?? '', confidence: 95 } }) }),
}))
vi.mock('./text', async (original) => {
  const actual = await original<typeof import('./text')>()
  return { ...actual, readTypes: async () => [], readInFaces: (...args: Parameters<typeof actual.readInFaces>) => (control.late ? Promise.resolve(control.late) : actual.readInFaces(...args)) }
})
beforeEach(() => {
  control.replies = []
  control.late = null
})

const blank = (): Gray => ({ width: 300, height: 220, data: new Uint8Array(300 * 220).fill(255) })

test('a lift read late joins the core at its own walls — never across the partition into the bedroom — and the walls are not traced again', async () => {
  const gray = blank(), K = 30, offset = 20
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = offset + y0 * K - 2; y <= offset + y1 * K + 2; y++) for (let x = offset + x0 * K - 2; x <= offset + x1 * K + 2; x++) gray.data[y * gray.width + x] = 0
  }
  wall(0, 0, 8, 0), wall(0, 4, 8, 4), wall(0, 0, 0, 4), wall(8, 0, 8, 4), wall(5, 0, 5, 4)
  const item = (text: string, x: number, y: number, roomKind: TextItem['roomKind']): TextItem => ({ text, kind: 'room', roomKind, box: { x: offset + x * K - 8, y: offset + y * K - 4, w: 16, h: 8 }, conf: 0.9, source: 'ocr' })
  control.late = []
  const before = await prepare(gray, { pxPerM: K, text: { items: [item('BEDROOM', 2, 2, 'bed')] } })
  // the label the late face pass reads, not part of the first reading
  control.late = [item('Hoistway', 5.5, 2, 'other')]
  const p = await prepare(gray, { pxPerM: K, text: { items: [item('BEDROOM', 2, 2, 'bed')] } })
  expect(p.traces.inCore({ x: (offset + 5.5 * K) / K, y: (offset + 2 * K) / K })).toBe(true)
  // 0.7 m from the label, across the partition: the bedroom (the old 1.2 m halo took it)
  expect(p.traces.inCore({ x: (offset + 4.8 * K) / K, y: (offset + 2 * K) / K })).toBe(false)
  const shape = (t: typeof p.traces) => {
    const V = new Map(t.draft.unit.vertices.map((v) => [v.id, v]))
    return t.draft.walls.map((w) => JSON.stringify({ ends: [V.get(w.a), V.get(w.b)].map((v) => [v!.x, v!.y]).sort(), th: w.thicknessM, height: w.heightM, openings: w.openings.map((o) => [o.kind, o.offsetM, o.widthM]) })).sort()
  }
  expect(shape(p.traces)).toEqual(shape(before.traces))
})

test.each([0, Math.PI / 5])('two small sized rooms side by side, each printed "8 persons", no flat room name: a lift bank (turned %s rad); one alone, or one with a bedroom name, is not', (angle) => {
  const turn = (x: number, y: number) => ({ x: 5 + x * Math.cos(angle) - y * Math.sin(angle), y: 5 + x * Math.sin(angle) + y * Math.cos(angle) })
  const vertices = [[0, 0], [2, 0], [4, 0], [0, 2], [2, 2], [4, 2]].map(([x, y], i) => ({ id: `v${i}`, ...turn(x, y) }))
  const walls = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]].map(([a, b], i) => ({ id: `w${i}`, a: `v${a}`, b: `v${b}`, heightM: 3, thicknessM: 0.127, openings: [] }))
  const unit = { vertices, walls, roomLabels: [] }, rooms = deriveRooms(unit)
  const item = (x: number, text: string, dims?: { aM: number; bM: number }): TextItem => {
    const p = turn(x, 1)
    return { kind: dims ? 'dims' : 'other', text, box: { x: p.x * 30 - 4, y: p.y * 30 - 3, w: 8, h: 6 }, dims, source: 'ocr', conf: 0.9 }
  }
  const items = [item(1, '8 persons'), item(3, '8 persons'), item(1, 'size', { aM: 1.9, bM: 1.9 }), item(3, 'size', { aM: 1.9, bM: 1.9 })]
  expect(capacityCores(unit, rooms, { items }, 30)).toHaveLength(2)
  expect(capacityCores(unit, rooms, { items: items.slice(0, 2) }, 30)).toEqual([])
  expect(capacityCores(unit, rooms, { items: items.filter((it) => it !== items[1]) }, 30)).toEqual([])
  expect(capacityCores(unit, rooms, { items: [...items, { ...item(1, 'BEDROOM'), kind: 'room', roomKind: 'bed' }] }, 30)).toEqual([])
})
