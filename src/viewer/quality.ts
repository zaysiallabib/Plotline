/**
 * Choosing quality (founder, 2026-10-18: "give them a choice"): Lite / Low / High (three/render.ts Quality). The device
 * check recommends one with a plain reason; the person's pick is remembered in this browser and never overridden after
 * that — only a GPU failure (context lost, out of memory) falls to Lite, and says so. `?quality=` in a link forces it.
 */
import type { Quality } from '../three/render'

export type { Quality }
export const QUALITIES: Quality[] = ['lite', 'low', 'high']
export const NAME: Record<Quality, string> = { lite: 'Lite', low: 'Low', high: 'High' }
const isQuality = (v: unknown): v is Quality => QUALITIES.includes(v as Quality)

export interface Device {
  /** the WebGL renderer string ('' without WebGL 2) */
  gpu: string
  webgl2: boolean
  /** navigator.deviceMemory (Chrome; rounded down, at most 8) */
  memoryGb?: number
  /** navigator.hardwareConcurrency */
  cores?: number
  phone?: boolean
}

/** a renderer with no graphics chip: the CPU draws every pixel */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i
/** the graphics built into the processor (Intel HD / UHD / Iris, phone chips); Intel Arc is a real graphics card */
const INTEGRATED = /intel|mali|adreno|powervr|videocore/i

/** The tier this device should start at and why (null: a capable machine). `slow`: the tier a slow-frames drop stored. */
export function recommend(d: Device, slow: string | null = null): { tier: Quality; why: string | null } {
  const lite = (why: string) => ({ tier: 'lite' as const, why })
  if (!d.webgl2) return lite('no WebGL 2 in this browser')
  if (SOFTWARE.test(d.gpu)) return lite('no graphics chip in use (software drawing)')
  if (d.phone) return lite('a phone or tablet') // every one: a small battery-run chip, whatever its name (session 31)
  if (INTEGRATED.test(d.gpu) && !/\barc\b/i.test(d.gpu)) return lite('integrated graphics')
  if (d.memoryGb !== undefined && d.memoryGb <= 4) return lite(`${d.memoryGb} GB memory`)
  if (d.cores !== undefined && d.cores <= 4) return lite(`${d.cores} processor threads`)
  if (isQuality(slow)) return { tier: slow, why: 'slow frames' }
  return { tier: 'high', why: null }
}

/** One tier down (a slow-frames drop). */
export const lower = (t: Quality): Quality => (t === 'high' ? 'low' : 'lite')

/** Who set the tier: a GPU failure this session, the link's ?quality=, the person's pick, or the device check. */
export type By = 'fallback' | 'link' | 'you' | 'device'
export function chosen(o: { fallback: string | null; link: string | null; picked: string | null; rec: Quality }): { tier: Quality; by: By } {
  if (isQuality(o.fallback)) return { tier: o.fallback, by: 'fallback' }
  if (isQuality(o.link)) return { tier: o.link, by: 'link' }
  if (isQuality(o.picked)) return { tier: o.picked, by: 'you' }
  return { tier: o.rec, by: 'device' }
}

/** Storage keys: the pick and the slow-frames drop per browser (localStorage); a GPU fallback and its note per tab (sessionStorage). */
export const KEYS = { picked: 'plotline.quality', slow: 'plotline.quality.slow', seen: 'plotline.quality.seen', fallback: 'plotline.quality.fallback', note: 'plotline.quality.note' }
/** storage that is blocked (private windows, iframes) reads as empty and ignores writes */
export const read = (s: () => Storage, k: string): string | null => {
  try {
    return s().getItem(k)
  } catch {
    return null
  }
}
export const write = (s: () => Storage, k: string, v: string | null): void => {
  try {
    if (v === null) s().removeItem(k)
    else s().setItem(k, v)
  } catch {
    /* blocked */
  }
}
export const local = () => localStorage
export const tab = () => sessionStorage

/** The device as the 3D will see it: a throw-away WebGL 2 context asking for the fast graphics chip, as PlotlineScene does. */
export function probeDevice(): Device {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const phone = /Android|iPhone|iPad/i.test(nav.userAgent) || (nav.maxTouchPoints > 1 && /Mac/.test(nav.userAgent))
  let gpu = ''
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = document.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' })
    if (gl) {
      gpu = String(gl.getParameter(gl.RENDERER))
      // Chrome and Safari say "WebKit WebGL" here; Firefox gives the real (rounded) name and warns on the extension
      const ext = /webkit|mozilla/i.test(gpu) ? gl.getExtension('WEBGL_debug_renderer_info') : null
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      gl.getExtension('WEBGL_lose_context')?.loseContext() // give the context back now, not at garbage collection
    }
  } catch {
    gl = null
  }
  return { gpu, webgl2: !!gl, memoryGb: nav.deviceMemory, cores: nav.hardwareConcurrency || undefined, phone }
}

/**
 * The stats card (`?stats=1`, ⋯ → How fast is it here?; never on a buyer's link): what this device does with the 3D, in
 * words a person can send — the chip's name as the browser tells it, the tier, the median of the last 60 frames drawn back to
 * back (PlotlineScene.stats), what one frame draws, what sits in the graphics memory, the pixels drawn.
 */
export interface Readout {
  gpu: string
  tier: Quality
  /** ms; null: not two frames drawn yet (nothing moved) */
  ms: number | null
  calls: number
  triangles: number
  programs: number
  textureMB: number
  width: number
  height: number
}

const n = (x: number) => Math.round(x).toLocaleString('en-US')

/** The card's rows: [label, value]. */
export function readout(r: Readout): [string, string][] {
  return [
    ['Graphics chip', r.gpu || 'not told by this browser'],
    ['Quality', NAME[r.tier]],
    ['A frame', r.ms === null ? 'move to measure' : `${r.ms.toFixed(1)} ms · ${n(Math.min(1000 / r.ms, 999))} a second`],
    ['Draw calls', n(r.calls)],
    ['Triangles', n(r.triangles)],
    ['Shader programs', n(r.programs)],
    ['Pictures in graphics memory', `about ${n(r.textureMB)} MB`],
    ['Pixels drawn', `${n(r.width)} × ${n(r.height)} (${(r.width * r.height / 1e6).toFixed(1)} million)`],
  ]
}

/** The same as plain text for the clipboard (Copy), with where it was taken: the page, the window, the browser. */
export const readoutText = (r: Readout, where: { page: string; view: string; screen: string; browser: string }): string =>
  ['Plotline — how fast it is here', ...readout(r).map(([k, v]) => `${k}: ${v}`), `View: ${where.view}`, `Page: ${where.page}`, `Window: ${where.screen}`, `Browser: ${where.browser}`].join('\n')
