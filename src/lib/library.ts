/**
 * Where the staff's own library is kept (furnish/own.ts holds its rules). In this browser: IndexedDB `plotline-library`
 * — the records, and the files by their SHA-256 (a model is megabytes; localStorage holds five). Signed in to a company
 * with the database set up (lib/supabase.ts): the records in table `library_items`, the files in Storage bucket
 * `library` as `<org>/<sha-256>.<ext>` — readable by that exact name (a buyer link shows them, with no account), added
 * only by members to their own company's folder, never listed, changed or deleted by anyone
 * (supabase/migrations/20261121120000_library.sql). A share link carries the records its flat needs (forShare), so a
 * buyer's browser knows each piece, its size and its file's name. Not configured, signed out or offline: this browser
 * only, exactly as the rest of the Studio.
 */
import { isOwnItem, ownItem, ownItems, registerOwn, type OwnFile, type OwnItem } from '../furnish/own'
import { myOrg } from './auth'
import { getSb, publicUrl as fileUrl } from './supabase'

export const BUCKET = 'library'
const TYPE: Record<OwnFile['ext'], string> = { glb: 'model/gltf-binary', jpg: 'image/jpeg', png: 'image/png' }

// ── this browser ─────────────────────────────────────────────────────────────────────────────────────────────────

let db: Promise<IDBDatabase> | null = null
const open = () =>
  (db ??= new Promise((ok, no) => {
    const r = indexedDB.open('plotline-library', 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('items')
      r.result.createObjectStore('files')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  }))
const run = <T>(store: 'items' | 'files', mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest) =>
  open().then(
    (d) =>
      new Promise<T>((ok, no) => {
        const q = f(d.transaction(store, mode).objectStore(store))
        q.onsuccess = () => ok(q.result as T)
        q.onerror = () => no(q.error)
      }),
  )
const keepItem = (it: OwnItem) => run<void>('items', 'readwrite', (s) => s.put(it, it.id)).then(() => true, () => false)
const fileHere = (hash: string) => run<Blob | undefined>('files', 'readonly', (s) => s.get(hash)).catch(() => undefined)

/** the SHA-256 of some bytes, as hex: a file's name here and online */
export async function hashOf(bytes: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const fileOfItem = (it: OwnItem): OwnFile | null => (it.type === 'model' ? it.file : 'file' in it.look ? it.look.file : null)

const urls = new Map<string, string>()
const publicUrl = (path: string) => fileUrl(BUCKET, path)
/** where a file is read from: this browser's copy, else its name online, else nowhere ('' — the piece draws as its box) */
async function urlOf(f: OwnFile): Promise<string> {
  const have = urls.get(f.hash)
  if (have) return have
  const blob = await fileHere(f.hash)
  if (blob) {
    const u = URL.createObjectURL(blob)
    urls.set(f.hash, u)
    return u
  }
  return f.path ? publicUrl(f.path) : ''
}
/** these records known to the page (kit, textures, slots), each file's address found first */
async function learn(list: OwnItem[]): Promise<void> {
  const files = list.map(fileOfItem).filter((f): f is OwnFile => !!f)
  const at = new Map(await Promise.all(files.map(async (f) => [f.hash, await urlOf(f)] as const)))
  registerOwn(list, (f) => at.get(f.hash) ?? '')
}

/** A file of the library, for a preview (the edit dialog): this browser's copy, else downloaded by its name online. */
export async function fileOf(f: OwnFile): Promise<Blob | null> {
  const here = await fileHere(f.hash)
  if (here) return here
  const url = f.path && publicUrl(f.path)
  return url ? fetch(url).then((r) => (r.ok ? r.blob() : null), () => null) : null
}

// ── online ───────────────────────────────────────────────────────────────────────────────────────────────────────

const withPath = (it: OwnItem, path: string): OwnItem =>
  it.type === 'model' ? { ...it, file: { ...it.file, path } } : 'file' in it.look ? { ...it, look: { ...it.look, file: { ...it.look.file, path } } } : it

/** This record online for the company: its file first (once: the same bytes are never sent twice), then the record. */
async function pushOnline(item: OwnItem, org: { id: string }): Promise<OwnItem | null> {
  const sb = await getSb()
  if (!sb) return null
  let it = item
  const f = fileOfItem(it)
  if (f && !f.path?.startsWith(`${org.id}/`)) {
    const blob = await fileHere(f.hash)
    if (!blob) return null
    const path = `${org.id}/${f.hash}.${f.ext}`
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: TYPE[f.ext], upsert: false, cacheControl: '31536000' })
    const e = error as { statusCode?: string; status?: number; message?: string } | null
    if (e && !(e.statusCode === '409' || e.status === 409 || /exists|duplicate/i.test(e.message ?? ''))) return null
    it = withPath(it, path)
    await keepItem(it)
    await learn([it])
  }
  const { error } = await sb.from('library_items').upsert({ org_id: org.id, id: it.id, item: it })
  return error ? null : it
}

/** Signed in: the company's records come here (the newer copy wins), and what was made here signed out goes online. */
async function syncOnline(): Promise<void> {
  const org = await myOrg().catch(() => null)
  const sb = org && (await getSb())
  if (!sb || !org) return
  const { data, error } = await sb.from('library_items').select('item').eq('org_id', org.id)
  if (error) return
  const online = new Map((data as { item: unknown }[]).map((r) => r.item).filter(isOwnItem).map((i) => [i.id, i]))
  const newer = [...online.values()].filter((i) => (ownItem(i.id)?.at ?? '') < i.at)
  for (const i of newer) await keepItem(i)
  await learn(newer)
  for (const i of ownItems()) if (!online.has(i.id) || (online.get(i.id)!.at < i.at)) await pushOnline(i, org)
}

const timeout = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))
/**
 * The page may build its flat once this settles (main.tsx waits for it before the viewer and the Studio): this browser's
 * records known, then — signed in — the company's, for at most 2.5 s (the rest arrive while the page runs). Never fails.
 */
export const ready: Promise<void> = Promise.race([
  (async () => {
    try {
      await learn((await run<unknown[]>('items', 'readonly', (s) => s.getAll())).filter(isOwnItem))
    } catch {
      /* no IndexedDB (a private window): this page only */
    }
    await Promise.race([syncOnline().catch(() => {}), timeout(2500)])
  })(),
  timeout(4000),
])

/**
 * A record made or changed (with its file when it is new): kept in this browser, known to the page at once, then online
 * for the company when signed in. Says where it is now: 'online' (this browser and the company), 'here' (this browser
 * only), 'page' (this page only: the browser would not keep it — full, or a private window).
 */
export async function saveOwn(item: OwnItem, file?: Blob): Promise<'online' | 'here' | 'page'> {
  const f = fileOfItem(item)
  if (file && f) {
    urls.set(f.hash, URL.createObjectURL(file))
    await run<void>('files', 'readwrite', (s) => s.put(file, f.hash)).catch(() => {})
  }
  const kept = await keepItem(item)
  await learn([item])
  const org = await myOrg().catch(() => null)
  const up = org && (await pushOnline(item, org).catch(() => null))
  return up ? 'online' : kept ? 'here' : 'page'
}

/** Taken out of the library (not a built-in one): no longer listed anywhere; a piece already placed still draws. */
export const removeOwn = (it: OwnItem) => saveOwn({ ...it, removed: true, at: new Date().toISOString() })

// ── share links ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The records a share link of `unit` carries: the models its pieces use and every finish option of the staff's own —
 * online first when signed in, so a buyer's browser can read their files (else they draw as the box of their size).
 */
export async function forShare(unit: { furniture: { assetId: string; removed?: true }[] }): Promise<OwnItem[]> {
  const used = new Set(unit.furniture.filter((p) => !p.removed).map((p) => p.assetId))
  const need = ownItems().filter((i) => (i.type === 'model' ? used.has(i.id) : !i.removed))
  const org = await myOrg().catch(() => null)
  if (!org) return need
  return Promise.all(need.map(async (i) => (fileOfItem(i)?.path?.startsWith(`${org.id}/`) ? i : ((await pushOnline(i, org).catch(() => null)) ?? i))))
}

/** A share link's records (its JSON's `library`, checked), known to this page only; one this browser holds already wins. */
export async function learnCarried(raw: unknown): Promise<void> {
  if (!Array.isArray(raw)) return
  await learn(raw.filter(isOwnItem).filter((i) => !ownItem(i.id)))
}
