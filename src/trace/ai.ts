/**
 * The backup reader (founder 2026-09-28: local first, AI only for what the local pass is unsure of).
 * One adapter: Google Gemini (free tier), used ONLY when the user has put a key in localStorage — no key in code.
 * Wave 19: the labels the local reader could not read for sure go to the model as ONE montage image (numbered tiles),
 * at most two calls per sheet; the answer is parsed with the strict size grammar. Nothing here calls a model in tests.
 */
import { renderFont } from './sizes'
import { classifyRoom, cropGray, itemFromAi, reaskReason, resample, toCanvas } from './text'
import type { AiAsk, AiReader, Dims, Gray, TextItem, TextTrace } from './types'

/** The whole prompt. Small task, fixed JSON, no guessing. */
export const AI_PROMPT =
  'Read the printed text in this crop of an apartment floor plan. Return JSON only: ' +
  '[{"text": "...", "box": [ymin, xmin, ymax, xmax], "kind": "room|dims|area|north|other"}] with box normalised to 0-1000. ' +
  'Keep a room name and the size printed under it in one item, joined by a newline (e.g. "BED-1\\n14\'-0\\"X16\'-0\\""). ' +
  'Copy characters exactly as printed; leave out anything you cannot read.'

/** The montage prompt: numbered tiles in, one JSON row per tile out. */
export const MONTAGE_PROMPT =
  'Each numbered tile is a crop of an apartment floor plan around one room label. For every tile, copy the room name ' +
  'and the room size printed in the middle of the tile (the size is usually the line under the name, feet and inches, ' +
  'e.g. 12\'-0"X14\'-6"). Return JSON only: [{"n": 1, "name": "BED-2", "size": "12\'-0\\"X14\'-6\\""}]. ' +
  'Copy characters exactly as printed. Use "" for a field that is not printed or not clearly legible — never guess.'

export const AI_KEY_STORAGE = 'plotline.geminiKey'

/** The model's JSON (fenced or not) → TextItems in image pixels. Unusable answers → []. Pure. */
export function parseAiAnswer(answer: string, crop: { w: number; h: number; offset: { x: number; y: number } }): TextItem[] {
  let rows: unknown
  try {
    rows = JSON.parse(answer.replace(/^\s*```(?:json)?|```\s*$/g, ''))
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    const { text, box } = (r ?? {}) as { text?: unknown; box?: unknown }
    if (typeof text !== 'string' || !text.trim() || !Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === 'number')) return []
    const [y0, x0, y1, x1] = (box as number[]).map((v) => Math.min(1000, Math.max(0, v)) / 1000)
    return [itemFromAi(text.trim(), { x: Math.round(x0 * crop.w), y: Math.round(y0 * crop.h), w: Math.round((x1 - x0) * crop.w), h: Math.round((y1 - y0) * crop.h) }, crop.offset)]
  })
}

const FT = 0.3048
/**
 * A size exactly in the printed grammar, else null: F'-I"xF'-I" (inches 0–11, optional ½, feet 1–39, x / X / ×), a side
 * may be bare feet (15X18'-3") when the other carries marks. Stricter than parseDims on purpose: the model's text is
 * trusted only when it is a well-formed size.
 */
export function strictSize(raw: string): Dims | null {
  const s = raw
    .replace(/[‘’′`´]/g, "'")
    .replace(/[“”″]|''/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
  const side = String.raw`(\d{1,2})(?:'(?:-?(\d{1,2})(½|1\/2)?")?)?`
  const m = new RegExp(`^${side}[xX×]${side}$`).exec(s)
  if (!m || !/['"]/.test(s)) return null
  const one = (f: string, i?: string, half?: string) => {
    const ft = +f
    const inch = i === undefined ? 0 : +i
    return ft >= 1 && ft <= 39 && inch <= 11 ? (ft + (inch + (half ? 0.5 : 0)) / 12) * FT : null
  }
  const a = one(m[1], m[2], m[3])
  const b = one(m[4], m[5], m[6])
  return a !== null && b !== null && a >= 0.6 && b >= 0.6 ? { aM: a, bM: b } : null
}

/** Rows of a montage answer: tile number → name + size (size only when it passes strictSize). Junk → empty map. */
export function parseMontageAnswer(answer: string, tiles: number): Map<number, { name: string; dims?: Dims; size: string }> {
  const out = new Map<number, { name: string; dims?: Dims; size: string }>()
  let rows: unknown
  try {
    rows = JSON.parse(answer.replace(/^\s*```(?:json)?|```\s*$/g, ''))
  } catch {
    return out
  }
  if (!Array.isArray(rows)) return out
  for (const r of rows) {
    const { n, name, size } = (r ?? {}) as { n?: unknown; name?: unknown; size?: unknown }
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > tiles || out.has(n)) continue
    const nm = typeof name === 'string' ? name.trim() : ''
    const sz = typeof size === 'string' ? size.trim() : ''
    const dims = sz ? strictSize(sz) : null
    out.set(n, { name: nm, size: sz, ...(dims ? { dims } : {}) })
  }
  return out
}

/** Labels worth asking about: a size seen but unread, a room label with no size, a size line with no parse, a size with no name over it. */
export function montageItems(trace: TextTrace): TextItem[] {
  return trace.items.filter((it) => it.source !== 'ai' && (it.sizeUnread || (it.kind === 'dims' && it.dims) || (reaskReason(it) !== null && reaskReason(it) !== 'low-confidence')))
}

/** The crop around a label: wide (a size line is wider than its name) and tall enough for the line under it. */
export function tileCrop(it: TextItem, lineH: number): { x: number; y: number; w: number; h: number } {
  const b = it.sizeBox ? { x: Math.min(it.box.x, it.sizeBox.x), y: Math.min(it.box.y, it.sizeBox.y), w: 0, h: 0 } : it.box
  const x1 = Math.max(it.box.x + it.box.w, it.sizeBox ? it.sizeBox.x + it.sizeBox.w : 0)
  const y1 = Math.max(it.box.y + it.box.h, it.sizeBox ? it.sizeBox.y + it.sizeBox.h : 0)
  const cx = (b.x + x1) / 2
  const w = Math.max(x1 - b.x + 4 * lineH, 14 * lineH)
  const up = it.kind === 'dims' ? 2.8 : 1.2 // a lone size: its name sits above
  return { x: cx - w / 2, y: b.y - up * lineH, w, h: y1 - b.y + (up - 1.2 + (it.sizeBox ? 2.4 : 3.6)) * lineH }
}

/**
 * One montage image of label crops: each tile upscaled so a text line is ~28 px tall, its number drawn in a white
 * strip on the left, tiles stacked with grey rules between. Pure.
 */
export function buildMontage(gray: Gray, items: TextItem[], lineH: number): Gray {
  const scale = Math.max(1, Math.min(6, 28 / Math.max(3, lineH)))
  const tiles = items.map((it) => resample(cropGray(gray, tileCrop(it, lineH)), scale, 'lanczos'))
  const font = renderFont(0.16, 0.8)
  const strip = 70
  const sep = 6
  const W = strip + Math.max(...tiles.map((t) => t.width))
  const H = tiles.reduce((a, t) => a + Math.max(t.height, 34) + sep, 0)
  const out = new Uint8Array(W * H).fill(255)
  let y0 = 0
  tiles.forEach((t, k) => {
    const h = Math.max(t.height, 34)
    for (let y = 0; y < t.height; y++) out.set(t.data.subarray(y * t.width, (y + 1) * t.width), (y0 + y) * W + strip)
    // the number, dark on white, from the size reader's own stroke digits
    let x = 8
    for (const ch of String(k + 1)) {
      const g = font[ch]
      for (let y = 0; y < g.d.length / g.w; y++)
        for (let gx = 0; gx < g.w; gx++) {
          const yy = y0 + 4 + y
          if (yy < H) out[yy * W + x + gx] = Math.min(out[yy * W + x + gx], Math.round(255 * (1 - g.d[y * g.w + gx])))
        }
      x += g.w + 3
    }
    y0 += h
    out.fill(160, y0 * W, (y0 + sep) * W)
    y0 += sep
  })
  return { width: W, height: H, data: out }
}

/** Gemini generateContent with one image. The key travels in a header, never in the URL. */
function gemini(key: string, model: string): AiAsk {
  return async (png, prompt) => {
    const bytes = new Uint8Array(await png.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: btoa(bin) } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const json = await res.json()
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
  }
}

/** The Gemini reader: the per-crop AiReader of wave 15, plus `ask` (raw answer) for the montage. */
export function geminiReader(key: string, model = 'gemini-2.5-flash'): AiReader & { ask: AiAsk } {
  const ask = gemini(key, model)
  const reader: AiReader = async (crop, question) => {
    const bmp = await createImageBitmap(crop.png)
    return parseAiAnswer(await ask(crop.png, question), { w: bmp.width, h: bmp.height, offset: crop.offset })
  }
  return Object.assign(reader, { ask })
}

/** The configured reader, or null when the user has not put a key in this browser. */
export function aiReaderFromStorage(): (AiReader & { ask: AiAsk }) | null {
  try {
    const key = localStorage.getItem(AI_KEY_STORAGE)
    return key ? geminiReader(key) : null
  } catch {
    return null
  }
}

const canvasPng = (g: Gray) => toCanvas(g).convertToBlob({ type: 'image/png' })

/**
 * Ask the reader about every label the local pass could not read for sure: one montage per ≤ `perCall` labels, at most
 * `maxCalls` calls. A tile's size is taken only when it passes the strict grammar; a name only when the local pass had
 * none that names a room. Whatever is still without a size where one is expected stays flagged `sizeUnread`.
 * A reader without `ask` (no montage support) leaves the trace as it is.
 */
export async function askAi(
  trace: TextTrace,
  gray: Gray,
  reader: AiReader,
  opts: { maxCalls?: number; perCall?: number; encode?: (g: Gray) => Promise<Blob> } = {},
): Promise<TextTrace> {
  const ask = (reader as AiReader & { ask?: AiAsk }).ask
  if (!ask) return trace
  const { maxCalls = 2, perCall = 20, encode = canvasPng } = opts
  const asks = montageItems(trace).slice(0, maxCalls * perCall)
  const lineH = trace.glyphPx ?? 10
  const fixed = new Map<TextItem, TextItem>()
  for (let c = 0; c * perCall < asks.length; c++) {
    const batch = asks.slice(c * perCall, (c + 1) * perCall)
    const answer = parseMontageAnswer(await ask(await encode(buildMontage(gray, batch, lineH)), MONTAGE_PROMPT), batch.length)
    batch.forEach((it, k) => {
      const a = answer.get(k + 1)
      // the local name stands when it names a room; the model's only fills a gap
      const named = a && it.kind !== 'room' && a.name ? classifyRoom(a.name) : null
      if (!a || (!a.dims && !named)) return
      const lines = it.text.split('\n')
      const next: TextItem = { ...it, source: 'ai' }
      if (named) Object.assign(next, { kind: 'room', roomKind: named.kind, green: named.green || undefined, text: it.kind === 'dims' ? `${a.name}\n${it.text}` : [a.name, ...lines.slice(1)].join('\n') })
      // a sure local size is kept over the model's reading (a lone size only asked for its name)
      if (a.dims && !it.dims) {
        Object.assign(next, { dims: a.dims, text: `${named ? a.name : lines[0]}\n${a.size}` })
        delete next.sizeUnread
        delete next.sizeGuess
      }
      fixed.set(it, next)
    })
  }
  return { ...trace, items: trace.items.map((it) => fixed.get(it) ?? it) }
}
