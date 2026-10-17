/**
 * s27 Local AI (founder 2026-10-18): a free vision model on his own PC (Ollama, http://localhost:11434) answers a
 * "Check these" row by picking one of its answers. `askLocalAI` is the one call: one picture + a multiple-choice
 * question → the chosen id (or null: not sure) and a short why. Later features (the sheet's north arrow) call it too.
 */
import type { Unit } from '../core'
import type { StudioState } from './model'
import { LOOKS_RIGHT, SHOW_ME, logAnswer, type Answer, type Box } from './review'

/** localStorage: { url, model } — this browser only */
export const LOCAL_AI_KEY = 'plotline.localAI'
export interface LocalAI {
  url: string
  model: string
  /** ticked by hand: a server that is not on this PC / its network is still used (founder 2026-10-18: local and free only) */
  remote?: boolean
}
export const LOCAL_AI_DEFAULT: LocalAI = { url: 'http://localhost:11434', model: 'qwen2.5vl:7b' }

/** this PC or its home network: localhost, 127.x, ::1, 10.x, 172.16–31.x, 192.168.x, *.local */
export function isLocalUrl(url: string): boolean {
  let h: string
  try {
    h = new URL(url.trim()).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  return h === 'localhost' || h === '::1' || h.endsWith('.local') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
}
/** never a paid / hosted model: Ollama's "-cloud" models run on ollama.com and need an account */
const isCloudModel = (m: string) => /(^|[-:])cloud\b/i.test(m)
/** why these settings may not be used, or null */
export function refusal(ai: LocalAI): string | null {
  if (!isLocalUrl(ai.url) && !ai.remote) return `${ai.url} is not a local server. Plotline only asks a model on this PC (http://localhost:11434), so it costs nothing.`
  if (isCloudModel(ai.model)) return `${ai.model} is a cloud model (paid, runs on ollama.com). Use a local one, e.g. ${LOCAL_AI_DEFAULT.model}.`
  return null
}

export function localAISettings(store: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): LocalAI {
  try {
    return { ...LOCAL_AI_DEFAULT, ...JSON.parse(store?.getItem(LOCAL_AI_KEY) ?? '{}') }
  } catch {
    return LOCAL_AI_DEFAULT
  }
}

const EXE = 'E:\\dev\\tools\\ollama\\ollama.exe'
/** the double-click file that starts the server (the line below + Ollama's own files on E:) */
export const START_CMD = 'E:\\dev\\tools\\ollama\\start-ollama.cmd'
/** the one PowerShell line that starts the server: models on E:, any page may call it, no cloud models */
export const START_LINE = `$env:OLLAMA_MODELS='E:\\dev\\tools\\ollama\\models'; $env:OLLAMA_ORIGINS='*'; $env:OLLAMA_NO_CLOUD='1'; ${EXE} serve`
const notRunning = (url: string) => `Local AI server not running at ${url}. Start it: double-click ${START_CMD}`
const blocked = `Blocked by CORS: the server does not let this page in. Close its window and start it again with ${START_CMD} (it sets OLLAMA_ORIGINS)`
const notPulled = (model: string) => `Model ${model} not pulled. With the server running, type in PowerShell: ${EXE} pull ${model}`

type Fetch = typeof fetch
const base = (ai: LocalAI) => ai.url.trim().replace(/\/+$/, '')

/** fetch, with a failed call told apart: no server at all, or a server the browser may not read (CORS) */
async function call(ai: LocalAI, path: string, init: RequestInit | undefined, f: Fetch): Promise<Response> {
  const no = refusal(ai)
  if (no) throw new Error(no)
  try {
    return await f(`${base(ai)}${path}`, init)
  } catch {
    // an opaque (no-cors) request still goes through when only CORS stood in the way
    const up = await f(`${base(ai)}/api/tags`, { mode: 'no-cors' }).then(
      () => true,
      () => false,
    )
    throw new Error(up ? blocked : notRunning(base(ai)))
  }
}

/** Settings → Test: "found <model>", or throws the plain reason with its one-line fix */
export async function testLocalAI(ai: LocalAI = localAISettings(), f: Fetch = fetch): Promise<string> {
  const r = await call(ai, '/api/tags', undefined, f)
  if (!r.ok) throw new Error(`The server at ${base(ai)} answered ${r.status} — is it Ollama?`)
  const names: string[] = (((await r.json()) as { models?: { name: string }[] }).models ?? []).map((m) => m.name)
  const m = ai.model.trim()
  if (!names.some((n) => n === m || n === `${m}:latest`)) throw new Error(`${notPulled(m)}${names.length ? ` (it has: ${names.join(', ')})` : ''}`)
  return `found ${m}`
}

export interface Choice {
  id: string
  label: string
}
export interface AIAnswer {
  /** one of the choices' ids; null = the AI was not sure (or answered something not on the list) */
  answer: string | null
  why: string
  ms: number
}

/**
 * THE call: one picture (a PNG data URL) and a multiple-choice question → the model's pick, parsed strictly. Throws a
 * plain reason when the server cannot be reached or refuses. Uses the saved settings unless given others.
 */
export async function askLocalAI({ image, question, choices }: { image: string; question: string; choices: Choice[] }, ai: LocalAI = localAISettings(), f: Fetch = fetch): Promise<AIAnswer> {
  const t0 = Date.now()
  const ids = choices.map((c) => c.id)
  const content = `${question}\n\nChoices:\n${choices.map((c) => `- ${c.id}: ${c.label}`).join('\n')}\n\nReply with JSON only: {"why": "<what is drawn at the ring, 10 words at most>", "answer": "<one id from the list>"}. Answer "not-sure" only if the picture is unreadable at that spot.`
  const body = {
    model: ai.model.trim(),
    stream: false,
    // Ollama's structured output: the reply can only be this shape (the id is still checked below)
    format: { type: 'object', properties: { why: { type: 'string' }, answer: { type: 'string', enum: [...ids, 'not-sure'] } }, required: ['why', 'answer'] },
    options: { temperature: 0 },
    messages: [{ role: 'user', content, images: [image.replace(/^data:[^,]*,/, '')] }],
  }
  // (no Content-Type header: a plain request, no CORS pre-flight)
  const r = await call(ai, '/api/chat', { method: 'POST', body: JSON.stringify(body) }, f)
  if (!r.ok) {
    const t = await r.text()
    throw new Error(r.status === 404 && /not found/i.test(t) ? notPulled(ai.model.trim()) : `The local AI said ${r.status}: ${t.slice(0, 200)}`)
  }
  let a: { answer?: unknown; why?: unknown } | null = null
  try {
    a = JSON.parse(((await r.json()) as { message?: { content?: string } }).message?.content ?? '')
  } catch {
    /* not JSON: not sure */
  }
  const answer = typeof a?.answer === 'string' && ids.includes(a.answer) ? a.answer : null
  return { answer, why: typeof a?.why === 'string' ? a.why.trim().slice(0, 120) : '', ms: Date.now() - t0 }
}

/**
 * A "Check these" row asked of the local AI (`s` = the state when asked, `image` = its rowPicture, `row` = its text on
 * screen): the pick is logged tagged `by: 'ai'` and, when it is a fix, handed back as `fix` for applyAnswer (one undo
 * step). Looks right / Show me are shown, never applied: the AI does not take a row off the list or pick his tool. The
 * plan changed meanwhile (`current()`): nothing logged or applied.
 */
export async function askRow(s: StudioState, rowId: string, image: string, row: string, current: () => StudioState, store: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage, ai: LocalAI = localAISettings(), f: Fetch = fetch): Promise<{ note: AiNote; fix?: string }> {
  const answers = s.review?.items.find((i) => i.id === rowId)?.answers
  if (!answers) throw new Error('its answers are not worked out yet — ask again in a moment')
  const r = await askLocalAI({ image, question: rowQuestion(row), choices: rowChoices(answers) }, ai, f)
  if (current().unit !== s.unit) throw new Error('the plan changed while the AI was thinking — ask again')
  const a = answers.find((x) => x.id === r.answer)
  const note: AiNote = { row, why: r.why, s: r.ms / 1000 }
  if (!a) return { note }
  try {
    logAnswer(store, s, rowId, a.id, new Date(), { model: ai.model.trim(), why: r.why })
  } catch {
    /* storage full or blocked: the answer still counts on the plan */
  }
  const fix = a.actions.length ? a.id : undefined
  return { note: { ...note, label: a.label, ...(fix && { before: s.unit }) }, fix }
}

/** a row's question: what the tracer says there, about the ringed spot; the drawing is the truth */
export const rowQuestion = (row: string) =>
  `This picture is a piece of an apartment floor plan drawing (a sales brochure). The red ring marks one spot. A program traced the drawing into walls, doors, windows and rooms and is unsure about that spot. It says: "${row}". The drawing is always right; the program may be wrong. How plans draw things: a wall is a thick dark or grey band; a door is a gap in a wall with a thin quarter-circle arc (its swing) beside it; a window is two or three thin parallel lines across a gap in a wall; an open passage is a gap with nothing drawn in it; a railing or planter edge is a thin line; dashed lines are not walls. First say what is drawn at the red ring, then pick what the program should do so that it matches the drawing.`

/** a row's answers as choices: a fix by its button and what it does; Looks right / Show me said plainly */
export const rowChoices = (answers: Answer[]): Choice[] =>
  answers.map((a) => ({
    id: a.id,
    label: a.id === LOOKS_RIGHT ? 'Change nothing: the program already matches the drawing here' : a.id === SHOW_ME ? 'Change nothing now, a person draws it: the drawing shows something the program missed (for example a room closed on all sides) and no other choice fixes it' : `Change it: ${a.title ?? a.label}`,
  }))

/**
 * The picture for a row: its box (job 3: sheet image px) and 1 m more round it, cut from the sheet at full size, with a
 * red ring on the row's spot (`at`, metres). Browser only (a canvas).
 */
export function rowPicture(img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, u: Unit, box: Box, at: { x: number; y: number }): string {
  const pi = u.planImage
  const m = pi ? pi.pxPerM : 0
  const x0 = Math.max(0, Math.floor(box.x - m)), y0 = Math.max(0, Math.floor(box.y - m))
  const x1 = Math.min(img.naturalWidth, Math.ceil(box.x + box.w + m)), y1 = Math.min(img.naturalHeight, Math.ceil(box.y + box.h + m))
  // ponytail: a crop over 1280 px is scaled down to it (the model's picture budget); tiles if a big row ever needs detail
  const k = Math.min(1, 1280 / Math.max(x1 - x0, y1 - y0, 1))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round((x1 - x0) * k))
  c.height = Math.max(1, Math.round((y1 - y0) * k))
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height)
  if (pi) {
    g.strokeStyle = '#ff0000'
    g.lineWidth = 3
    g.beginPath()
    g.arc((pi.originPx.x + at.x * m - x0) * k, (pi.originPx.y + at.y * m - y0) * k, Math.max(12, 0.6 * m * k), 0, 2 * Math.PI)
    g.stroke()
  }
  return c.toDataURL('image/png')
}

/** what the Studio shows on a row the AI was asked about */
export interface AiNote {
  /** the row as it read when asked (shown once the row has gone) */
  row: string
  busy?: boolean
  error?: string
  /** the answer's button label; none = the AI was not sure */
  label?: string
  why?: string
  /** seconds the answer took */
  s?: number
  /** a fix was applied: the plan before it — Undo while that is still the last undo step */
  before?: Unit
}
