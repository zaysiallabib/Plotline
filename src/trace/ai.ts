/**
 * The backup reader (founder 2026-09-28: local first, AI only for what the local pass is unsure of).
 * One adapter: Google Gemini (free tier), used ONLY when the user has put a key in localStorage — no key in code.
 * Everything the model says goes through the same parser/classifier as OCR (itemFromAi); nothing here runs in tests.
 */
import { cropGray, itemFromAi, reaskList, toCanvas } from './text'
import type { AiReader, Gray, TextItem, TextTrace } from './types'

/** The whole prompt. Small task, fixed JSON, no guessing. */
export const AI_PROMPT =
  'Read the printed text in this crop of an apartment floor plan. Return JSON only: ' +
  '[{"text": "...", "box": [ymin, xmin, ymax, xmax], "kind": "room|dims|area|north|other"}] with box normalised to 0-1000. ' +
  'Keep a room name and the size printed under it in one item, joined by a newline (e.g. "BED-1\\n14\'-0\\"X16\'-0\\""). ' +
  'Copy characters exactly as printed; leave out anything you cannot read.'

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

/** Gemini generateContent with one image. The key travels in a header, never in the URL. */
export function geminiReader(key: string, model = 'gemini-2.5-flash'): AiReader {
  return async (crop, question) => {
    const bytes = new Uint8Array(await crop.png.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }, { inline_data: { mime_type: 'image/png', data: btoa(bin) } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const json = await res.json()
    const bmp = await createImageBitmap(crop.png)
    return parseAiAnswer(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]', { w: bmp.width, h: bmp.height, offset: crop.offset })
  }
}

/** The configured reader, or null when the user has not put a key in this browser. */
export function aiReaderFromStorage(): AiReader | null {
  try {
    const key = localStorage.getItem(AI_KEY_STORAGE)
    return key ? geminiReader(key) : null
  } catch {
    return null
  }
}

/**
 * Re-ask the reader about every item `reaskList` flags (at most `maxCalls`, free-tier friendly). An item is replaced
 * by what the reader found in its crop when that includes a room or a size; otherwise the OCR item stays.
 */
export async function askAi(trace: TextTrace, gray: Gray, reader: AiReader, maxCalls = 20): Promise<TextTrace> {
  const replaced = new Map<TextItem, TextItem[]>()
  for (const { item, crop } of reaskList(trace).slice(0, maxCalls)) {
    const png = await toCanvas(cropGray(gray, crop)).convertToBlob({ type: 'image/png' })
    const found = (await reader({ png, offset: { x: Math.round(crop.x), y: Math.round(crop.y) } }, AI_PROMPT)).filter((it) => it.kind === 'room' || it.kind === 'dims')
    if (found.length) replaced.set(item, found)
  }
  return { items: trace.items.flatMap((it) => replaced.get(it) ?? [it]) }
}
