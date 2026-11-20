/**
 * Staff work in the cloud (session 30): what the Studio has open — a project (its floors and drawings) or one loose
 * drawing — saved to the company's `projects` row while signed in, 2 s after the last change. Every save is kept by
 * the database (project_versions), so nothing is ever lost. The browser's own copy (the draft, the projects list)
 * stays exactly as before and always works; the cloud is a second home for it, never in the way.
 *
 * Two people on one project: a save names the version it started from; when someone saved a newer one meanwhile the
 * save is refused ("stale") and the Studio asks: open theirs, or keep mine (saved on top — theirs stays in the history).
 */
import { sb } from './supabase'

export type Kind = 'project' | 'unit'
/** what the Studio has open, as the cloud keeps it; `key` names it in this browser (`project:<id>` / `unit:<id>`) */
export interface CloudItem {
  key: string
  kind: Kind
  name: string
  data: unknown
}
export const itemKey = (kind: Kind, id: string): string => `${kind}:${id}`
/** where an item lives in the cloud: its row, the version this browser last saved or opened, that copy's hash */
export interface Link {
  id: string
  version: number
  hash: string
}
export interface CloudRow {
  id: string
  name: string
  kind: Kind
  version: number
  updated_at: string
  updated_by: string | null
}
export interface SavedVersion {
  version: number
  name: string
  saved_at: string
  saved_by: string | null
  deleted: boolean
}

/** offline = try again later; stale = someone saved a newer version; gone = deleted / no longer yours; refused = anything else */
export type Why = 'offline' | 'stale' | 'gone' | 'refused'
export class CloudError extends Error {
  constructor(
    public why: Why,
    message: string,
  ) {
    super(message)
  }
}

/** the database refuses a save over 5 MB (the migration's check); said here first, in words */
export const MAX_BYTES = 5_000_000
const COLS = 'id, name, kind, version, updated_at, updated_by'

const db = () => {
  if (!sb) throw new CloudError('refused', 'accounts are not set up on this site')
  return sb
}
/** a PostgREST answer's error: no network (status 0) or the server down (5xx) = offline, try again; else refused */
const fail = (error: { message: string }, status: number) =>
  new CloudError(status === 0 || status >= 500 ? 'offline' : 'refused', status === 0 ? 'no connection' : error.message)

/** FNV-1a over the saved JSON: "this copy is the one already in the cloud" without keeping the copy */
export function hashOf(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return `${s.length}:${(h >>> 0).toString(16)}`
}

/**
 * The optimistic-concurrency rule: a save that changed no row found the project at another version (someone saved
 * after this browser last did → stale), deleted, or not there at all for this person (deleted for good, other company).
 */
export function whyNoRow(row: { version: number; deleted_at: string | null } | null, from: number): CloudError {
  if (!row) return new CloudError('gone', 'it is not in the cloud any more')
  if (row.deleted_at) return new CloudError('gone', 'it was deleted from the cloud')
  if (row.version !== from) return new CloudError('stale', `someone else saved it after you opened it (their version ${row.version})`)
  return new CloudError('refused', 'the cloud did not take it')
}

/**
 * Saves `item` into company `org`: a new row without `link`, else over version `link.version` (refused as stale when
 * the cloud has moved on). `over` = keep mine: saved on top of whatever the cloud has now (theirs stays in the history),
 * or as a new row when it was deleted. Resolves to the new place and version.
 */
export async function saveProject(org: string, item: CloudItem, link?: Pick<Link, 'id' | 'version'>, over = false): Promise<Omit<Link, 'hash'>> {
  const c = db()
  const bytes = JSON.stringify(item.data).length
  if (bytes > MAX_BYTES) throw new CloudError('refused', `too big for the cloud (${(bytes / 1e6).toFixed(1)} MB, the most is 5 MB)`)
  const name = item.name.trim().slice(0, 200) || 'Untitled'
  if (link && over) {
    const now = await current(link.id)
    link = now && !now.deleted_at ? { id: link.id, version: now.version } : undefined
  }
  if (!link) {
    const { data, error, status } = await c.from('projects').insert({ org_id: org, name, kind: item.kind, data: item.data }).select('id, version').single()
    if (error) throw fail(error, status)
    return { id: data.id as string, version: data.version as number }
  }
  const { data, error, status } = await c
    .from('projects')
    .update({ name, data: item.data })
    .eq('id', link.id)
    .eq('version', link.version)
    .is('deleted_at', null)
    .select('id, version')
  if (error) throw fail(error, status)
  if (data.length) return { id: data[0].id as string, version: data[0].version as number }
  throw whyNoRow(await current(link.id), link.version)
}

async function current(id: string): Promise<{ version: number; deleted_at: string | null } | null> {
  const { data, error, status } = await db().from('projects').select('version, deleted_at').eq('id', id).maybeSingle()
  if (error) throw fail(error, status)
  return data as { version: number; deleted_at: string | null } | null
}

/** The company's projects and drawings, last saved first (deleted ones hidden). */
export async function listProjects(org: string): Promise<CloudRow[]> {
  const { data, error, status } = await db().from('projects').select(COLS).eq('org_id', org).is('deleted_at', null).order('updated_at', { ascending: false })
  if (error) throw fail(error, status)
  return data as CloudRow[]
}

export async function loadProject(id: string): Promise<CloudRow & { data: unknown }> {
  const { data, error, status } = await db().from('projects').select(`${COLS}, data`).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) throw fail(error, status)
  if (!data) throw new CloudError('gone', 'it is not in the cloud any more')
  return data as CloudRow & { data: unknown }
}

/** Its name in the list and inside the saved project / drawing (one more save, so it is in the history too). */
export async function renameProject(id: string, name: string): Promise<Omit<Link, 'hash'>> {
  const row = await loadProject(id)
  const data = { ...(row.data as object), name }
  return saveProject('', { key: '', kind: row.kind, name, data }, row) // over its version: no new row, so no company needed
}

/** Hidden from the list; every save of it stays in the history (the founder can bring it back in the SQL editor). */
export async function deleteProject(id: string): Promise<void> {
  const { error, status } = await db().from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw fail(error, status)
}

/** Its saves, newest first (at most 50). */
export async function projectHistory(id: string): Promise<SavedVersion[]> {
  const { data, error, status } = await db().from('project_versions').select('version, name, saved_at, saved_by, deleted').eq('project_id', id).order('version', { ascending: false }).limit(50)
  if (error) throw fail(error, status)
  return data as SavedVersion[]
}

export async function loadVersion(id: string, version: number): Promise<unknown> {
  const { data, error, status } = await db().from('project_versions').select('data').eq('project_id', id).eq('version', version).maybeSingle()
  if (error) throw fail(error, status)
  if (!data) throw new CloudError('gone', 'that save is not there')
  return (data as { data: unknown }).data
}

// ── where this browser's items live in the cloud, per signed-in person ─────────────────────────────────────────────

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return localStorage
  } catch {
    return null // blocked (or no DOM): nothing is remembered, every save makes a new row
  }
}
export interface Links {
  get(key: string): Link | undefined
  set(key: string, link: Link | null): void
}
const PREFIX = 'plotline.cloud.'
const parse = (raw: string | null | undefined): Record<string, Link> => {
  try {
    return (JSON.parse(raw ?? '{}') as Record<string, Link>) ?? {}
  } catch {
    return {}
  }
}
/**
 * This tab's own memory of the version it opened or saved, per store and person, read from the browser's ONCE: a save
 * in another tab of this browser (same storage) must not move this tab's version, or this tab's next save would go
 * over theirs without asking (the two-tab proof, session 31). The browser's copy is still written, for the next load.
 */
const tabs = new WeakMap<object, Map<string, Record<string, Link>>>()
const NO_STORE = {}
const tabOf = (store: Store | null, k: string): Record<string, Link> => {
  let m = tabs.get(store ?? NO_STORE)
  if (!m) tabs.set(store ?? NO_STORE, (m = new Map()))
  if (!m.has(k)) m.set(k, parse(store?.getItem(k)))
  return m.get(k)!
}
// read when the Studio's code loads (before its draft is read), so a save another tab makes meanwhile never seeds this one
try {
  const s = local()
  for (let i = 0; s && i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(PREFIX)) tabOf(s, localStorage.key(i)!)
} catch {
  /* no storage: nothing to remember */
}
export function linkStore(user: string, store: Store | null = local()): Links {
  const k = `${PREFIX}${user}`
  return {
    get: (key) => tabOf(store, k)[key],
    set: (key, link) => {
      const tab = tabOf(store, k)
      const a = parse(store?.getItem(k)) // the browser's, with what other tabs remembered for their items
      if (link) tab[key] = a[key] = link
      else {
        delete tab[key]
        delete a[key]
      }
      try {
        store?.setItem(k, JSON.stringify(a))
      } catch {
        /* storage full / blocked: the next save makes a new row, nothing is lost */
      }
    },
  }
}

// ── autosave ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** saved: `at` = when this tab last sent it (unknown for a copy that was already in the cloud when it was opened) */
export type Status = { kind: 'idle' | 'saving' | 'offline' } | { kind: 'saved'; at?: number } | { kind: 'stale' | 'gone' | 'refused'; reason: string }

/** the word beside the drawing's name in the top bar */
export function statusWord(s: Status, now = Date.now()): string {
  switch (s.kind) {
    case 'idle':
      return ''
    case 'saving':
      return 'Saving…'
    case 'saved': {
      if (s.at === undefined) return 'Saved'
      const min = Math.floor((now - s.at) / 60000)
      if (min < 1) return 'Saved · just now'
      if (min < 60) return `Saved · ${min} min ago`
      return `Saved · ${new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    }
    case 'offline':
      return 'Offline · will retry'
    case 'stale':
      return 'Someone else saved'
    case 'gone':
      return 'Deleted in the cloud'
    default:
      return `Not saved: ${s.reason}`
  }
}

export interface Autosaver {
  /** something changed: save 2 s after the last call */
  touch(): void
  /** save now (if anything changed) and wait for it */
  flush(): Promise<void>
  /** after stale / gone: keep mine — save on top of the cloud's copy, or as a new one when it was deleted */
  keepMine(): Promise<void>
  stop(): void
  status(): Status
}

/**
 * Debounced saving with a status: `snapshot` is read when the 2 s are up (not on every keystroke), an unchanged copy
 * (same hash as the last save) is not sent, a change during a save is saved right after it, offline retries every
 * `retryMs`, and stale / gone stop saving THAT item until keepMine (or another item is opened). Never throws.
 */
export function autosaver(o: {
  snapshot: () => CloudItem | null
  save: (item: CloudItem, link: Link | undefined, over: boolean) => Promise<Omit<Link, 'hash'>>
  links: Links
  onStatus: (s: Status) => void
  delayMs?: number
  retryMs?: number
}): Autosaver {
  const delay = o.delayMs ?? 2000
  let status: Status = { kind: 'idle' }
  let timer: ReturnType<typeof setTimeout> | undefined
  let inflight: Promise<void> | null = null
  let again = false
  /** the item a stale / gone answer stopped, and its link then: a link changed since (its newer copy opened) frees it */
  let blocked: { key: string; link?: Link } | null = null
  let stopped = false
  const set = (s: Status) => {
    status = s
    if (!stopped) o.onStatus(s)
  }
  const schedule = (ms: number) => {
    clearTimeout(timer)
    if (!stopped) timer = setTimeout(() => void run(false), ms)
  }

  async function attempt(over: boolean): Promise<void> {
    const item = o.snapshot()
    if (!item) return set({ kind: 'idle' })
    const link = o.links.get(item.key)
    if (!over && blocked?.key === item.key && blocked.link?.id === link?.id && blocked.link?.version === link?.version) return // waits for the person
    blocked = null
    const json = JSON.stringify(item.data)
    const hash = hashOf(json)
    if (!over && link?.hash === hash) return set(status.kind === 'saved' ? status : { kind: 'saved' })
    set({ kind: 'saving' })
    try {
      o.links.set(item.key, { ...(await o.save(item, link, over)), hash })
      set({ kind: 'saved', at: Date.now() })
    } catch (e) {
      const err = e instanceof CloudError ? e : new CloudError('offline', e instanceof Error ? e.message : String(e))
      if (err.why === 'offline') {
        set({ kind: 'offline' })
        schedule(o.retryMs ?? 15000)
      } else {
        if (err.why !== 'refused') blocked = { key: item.key, link }
        set({ kind: err.why, reason: err.message })
      }
    }
  }
  function run(over: boolean): Promise<void> {
    if (stopped) return Promise.resolve()
    if (inflight) {
      again = true
      return inflight
    }
    inflight = attempt(over).finally(() => {
      inflight = null
      if (again) {
        again = false
        void run(false)
      }
    })
    return inflight
  }
  return {
    touch: () => schedule(delay),
    flush: async () => {
      clearTimeout(timer)
      await run(false)
      while (inflight) await inflight // a change made during that save went out right after it
    },
    keepMine: async () => {
      clearTimeout(timer)
      while (inflight) await inflight
      await run(true)
    },
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
    status: () => status,
  }
}
