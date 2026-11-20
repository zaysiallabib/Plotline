/**
 * Plan pictures online (session 31). Signed in to a company, a drawing's plan picture goes to Supabase Storage, bucket
 * `plans`, into the company's folder, named by its SHA-256 (`<org>/<hash>.<ext>`): the same picture is sent once, and a
 * saved version keeps pointing at the very picture it was traced on (nothing there is ever changed or deleted — the
 * migration gives no such right). The saved project / drawing carries only `pictures: { <drawing id>: { path, w, h,
 * name } }` — project_versions keeps that, never the bytes — and a colleague who opens it gets each picture back the
 * first time that drawing opens. Not configured, signed out or offline: nothing here sends anything, and the browser
 * keeps its pictures exactly as before (studio/pictures.ts, the draft).
 */
import { sb } from './supabase'

/** a plan picture as the Studio holds it (studio/model.ts PlanImage) */
export interface Picture {
  dataUrl: string
  naturalW: number
  naturalH: number
  name: string
}
/** where a drawing's picture is online, and what the Studio needs to show it before it has loaded */
export interface CloudPicture {
  path: string
  w: number
  h: number
  name: string
}
export type Pictures = Record<string, CloudPicture>

/** the Studio's own drop limit, and the bucket's (the migration's file_size_limit) */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const PATH = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|webp)$/

/** a data: URL's bytes and type; null = not a PNG / JPG / WEBP picture held in the page (a deployed /plans/ file, say) */
export function bytesOf(dataUrl: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(dataUrl)
  if (!m) return null
  const bin = atob(dataUrl.slice(m[0].length))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { type: m[1], bytes }
}

/** bytes back into a data: URL, as the Studio shows a picture */
export function dataUrlOf(type: string, bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${type};base64,${btoa(bin)}`
}

/** `<org>/<sha-256 of the bytes>.<ext>`: the picture's name online */
export async function pathOf(org: string, type: string, bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return `${org}/${Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')}.${EXT[type]}`
}

const isPicture = (p: unknown): p is CloudPicture => {
  const c = p as CloudPicture
  return !!c && typeof c.path === 'string' && PATH.test(c.path) && Number.isFinite(c.w) && Number.isFinite(c.h) && typeof c.name === 'string'
}

// ── what this browser knows: by drawing id, where its picture is online (kept for the next page load) ───────────────

const KEY = 'plotline.pictures'
const read = (): Pictures => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(all).filter(([, p]) => isPicture(p))) as Pictures
  } catch {
    return {}
  }
}
let online: Pictures = read()
const keep = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(online))
  } catch {
    /* blocked or full: known for this page only, the next save still carries it */
  }
}
/** by drawing id: the picture last hashed here and its path (a drawing opened again is not hashed again) */
const checked = new Map<string, { dataUrl: string; path: string }>()
const pathHere = async (id: string, org: string, pic: Picture, b: { type: string; bytes: Uint8Array }) => {
  const c = checked.get(id)
  if (c?.dataUrl === pic.dataUrl && c.path.startsWith(`${org}/`)) return c.path
  const path = await pathOf(org, b.type, b.bytes)
  checked.set(id, { dataUrl: pic.dataUrl, path })
  return path
}
/** tests: start from an empty browser */
export const forgetPictures = (): void => {
  online = {}
  checked.clear()
}

/**
 * Drawing `id`'s picture `pic` online for company `org` (sent once; a picture already there is not sent again).
 * True = the saved data's `pictures` changed (the Studio saves again); false = nothing to do, or it could not be sent
 * (offline, refused, the bucket not made yet) — tried again the next time.
 */
export async function putOnline(org: string, id: string, pic: Picture | null | undefined): Promise<boolean> {
  const b = pic && bytesOf(pic.dataUrl)
  if (!sb || !pic || !b || b.bytes.length > MAX_PICTURE_BYTES) return false
  const path = await pathHere(id, org, pic, b)
  if (online[id]?.path === path) return false
  if (!Object.values(online).some((p) => p.path === path)) {
    const { error } = await sb.storage.from('plans').upload(path, new Blob([b.bytes as Uint8Array<ArrayBuffer>], { type: b.type }), { contentType: b.type, upsert: false, cacheControl: '31536000' })
    const e = error as { statusCode?: string; status?: number; message?: string } | null
    if (e && !(e.statusCode === '409' || e.status === 409 || /exists|duplicate/i.test(e.message ?? ''))) return false
  }
  online[id] = { path, w: pic.naturalW, h: pic.naturalH, name: pic.name }
  keep()
  return true
}

/** the saved data: `data` with the online pictures of drawings `ids` (none online: `data` as it is) */
export function withPictures<T extends object>(data: T, ids: string[]): T {
  const pics = Object.fromEntries(ids.flatMap((id) => (online[id] ? [[id, online[id]]] : [])))
  return Object.keys(pics).length ? { ...data, pictures: pics } : data
}

/** opened from the cloud: its pictures become the ones this browser uses for those drawings; resolves to `data` without them */
export function adoptPictures(data: unknown): unknown {
  if (!data || typeof data !== 'object' || !('pictures' in data)) return data
  const { pictures, ...rest } = data as { pictures?: Record<string, unknown> }
  for (const [id, p] of Object.entries(pictures ?? {})) if (isPicture(p)) online[id] = p
  keep()
  return rest
}

/**
 * Drawing `id`'s picture from the cloud, when it has one online and this browser holds another one or none (`here`);
 * null = keep what is here (the same picture, none online, or it could not be fetched — the Studio's own words follow).
 */
export async function pictureFromCloud(id: string, here: Picture | null | undefined): Promise<Picture | null> {
  const cp = online[id]
  if (!sb || !cp) return null
  const b = here && bytesOf(here.dataUrl)
  if (here && b && (await pathHere(id, cp.path.split('/')[0], here, b)) === cp.path) return null
  const { data, error } = await sb.storage.from('plans').download(cp.path)
  if (error || !data) return null
  const type = EXT[data.type] ? data.type : TYPE[cp.path.split('.').pop()!]
  const dataUrl = dataUrlOf(type, new Uint8Array(await data.arrayBuffer()))
  checked.set(id, { dataUrl, path: cp.path })
  return { dataUrl, naturalW: cp.w, naturalH: cp.h, name: cp.name }
}
