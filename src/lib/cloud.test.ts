import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CloudItem, Link, Status } from './cloud'

beforeAll(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** a stand-in for PostgREST: each answer by method in turn (status + body, or 'offline' = the network is gone) */
type Reply = [number, unknown] | 'offline'
function postgrest(replies: Partial<Record<'GET' | 'POST' | 'PATCH', Reply[]>>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url: decodeURIComponent(url), body: init.body ? JSON.parse(init.body as string) : undefined })
    const r = replies[method as 'GET']?.shift()
    if (!r) throw new Error(`no reply for ${method} ${url}`)
    if (r === 'offline') throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(r[1]), { status: r[0] })
  })
  vi.stubGlobal('fetch', f)
  return calls
}
const ITEM: CloudItem = { key: 'project:p-local', kind: 'project', name: ' Banani tower ', data: { id: 'p-local', name: 'Banani tower', floors: [] } }

describe('the cloud save rule (optimistic concurrency)', () => {
  it('a save that changed no row: newer version → stale, deleted / missing → gone', async () => {
    const { whyNoRow } = await import('./cloud')
    expect(whyNoRow({ version: 7, deleted_at: null }, 5)).toMatchObject({ why: 'stale', message: expect.stringContaining('newer version (7)') })
    expect(whyNoRow({ version: 5, deleted_at: '2026-11-20T00:00:00Z' }, 5).why).toBe('gone')
    expect(whyNoRow(null, 5).why).toBe('gone')
  })

  it('a first save inserts into the company and gets version 1', async () => {
    const { saveProject } = await import('./cloud')
    const calls = postgrest({ POST: [[201, { id: 'c1', version: 1 }]] })
    expect(await saveProject('org-1', ITEM)).toEqual({ id: 'c1', version: 1 })
    expect(calls[0]).toMatchObject({ method: 'POST', body: { org_id: 'org-1', name: 'Banani tower', kind: 'project', data: ITEM.data } })
  })

  it('a later save names the version it started from; a row back = the next version', async () => {
    const { saveProject } = await import('./cloud')
    const calls = postgrest({ PATCH: [[200, [{ id: 'c1', version: 4 }]]] })
    expect(await saveProject('org-1', ITEM, { id: 'c1', version: 3 })).toEqual({ id: 'c1', version: 4 })
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toContain('id=eq.c1')
    expect(calls[0].url).toContain('version=eq.3')
    expect(calls[0].url).toContain('deleted_at=is.null')
    expect(calls[0].body).toEqual({ name: 'Banani tower', data: ITEM.data }) // never the version, the company or who: the database stamps those
  })

  it('someone saved meanwhile: refused as stale, nothing overwritten', async () => {
    const { CloudError, saveProject } = await import('./cloud')
    postgrest({ PATCH: [[200, []]], GET: [[200, [{ version: 5, deleted_at: null }]]] })
    const e = await saveProject('org-1', ITEM, { id: 'c1', version: 3 }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(CloudError)
    expect(e).toMatchObject({ why: 'stale' })
  })

  it('keep mine: saved on top of the version the cloud has now; deleted meanwhile → saved as a new one', async () => {
    const { saveProject } = await import('./cloud')
    let calls = postgrest({ GET: [[200, [{ version: 5, deleted_at: null }]]], PATCH: [[200, [{ id: 'c1', version: 6 }]]] })
    expect(await saveProject('org-1', ITEM, { id: 'c1', version: 3 }, true)).toEqual({ id: 'c1', version: 6 })
    expect(calls[1].url).toContain('version=eq.5')
    calls = postgrest({ GET: [[200, [{ version: 5, deleted_at: '2026-11-20T00:00:00Z' }]]], POST: [[201, { id: 'c2', version: 1 }]] })
    expect(await saveProject('org-1', ITEM, { id: 'c1', version: 3 }, true)).toEqual({ id: 'c2', version: 1 })
    expect(calls[1].method).toBe('POST')
  })

  it('no network or the server down = offline (try again); a refusal says why; over 5 MB is never sent', async () => {
    const { saveProject } = await import('./cloud')
    postgrest({ PATCH: ['offline'] })
    await expect(saveProject('org-1', ITEM, { id: 'c1', version: 3 })).rejects.toMatchObject({ why: 'offline' })
    postgrest({ PATCH: [[502, { message: 'bad gateway' }]] })
    await expect(saveProject('org-1', ITEM, { id: 'c1', version: 3 })).rejects.toMatchObject({ why: 'offline' })
    postgrest({ POST: [[403, { message: 'new row violates row-level security policy for table "projects"' }]] })
    await expect(saveProject('org-1', ITEM)).rejects.toMatchObject({ why: 'refused', message: expect.stringContaining('row-level security') })
    const calls = postgrest({})
    await expect(saveProject('org-1', { ...ITEM, data: { big: 'x'.repeat(5_000_001) } })).rejects.toMatchObject({ why: 'refused', message: expect.stringContaining('too big') })
    expect(calls).toHaveLength(0)
  })
})

describe('autosave: 2 s after the last change, with a status word', () => {
  const memory = () => {
    const m = new Map<string, Link>()
    return { get: (k: string) => m.get(k), set: (k: string, l: Link | null) => void (l ? m.set(k, l) : m.delete(k)), m }
  }
  const setup = (save: (item: CloudItem, link: Link | undefined, over: boolean) => Promise<Omit<Link, 'hash'>>, snapshot: () => CloudItem | null = () => ITEM) => {
    const statuses: Status[] = []
    const links = memory()
    return import('./cloud').then(({ autosaver, statusWord }) => {
      const s = autosaver({ snapshot, save, links, onStatus: (x) => statuses.push(x), delayMs: 2000, retryMs: 15000 })
      return { s, links, words: () => statuses.map(statusWord) }
    })
  }

  it('many changes, one save after 2 s of quiet: Saving… then Saved; the same copy again is not sent', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => ({ id: 'c1', version: 1 }))
    const { s, links, words } = await setup(save)
    s.touch()
    await vi.advanceTimersByTimeAsync(1500)
    s.touch()
    await vi.advanceTimersByTimeAsync(1500)
    expect(save).not.toHaveBeenCalled() // still typing
    await vi.advanceTimersByTimeAsync(600)
    expect(save).toHaveBeenCalledTimes(1)
    expect(words()).toEqual(['Saving…', 'Saved'])
    expect(links.get(ITEM.key)).toMatchObject({ id: 'c1', version: 1 })
    s.touch()
    await vi.advanceTimersByTimeAsync(2100)
    expect(save).toHaveBeenCalledTimes(1) // unchanged: nothing sent
    s.stop()
  })

  it('offline: "Offline, will retry", tried again by itself, then Saved', async () => {
    vi.useFakeTimers()
    const { CloudError } = await import('./cloud')
    const save = vi.fn().mockRejectedValueOnce(new CloudError('offline', 'no connection')).mockResolvedValue({ id: 'c1', version: 2 })
    const { s, words } = await setup(save)
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(words().at(-1)).toBe('Offline, will retry')
    await vi.advanceTimersByTimeAsync(15000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(words().at(-1)).toBe('Saved')
    s.stop()
  })

  it('stale: "Not saved: someone saved a newer version", no more saves of it until Keep mine', async () => {
    vi.useFakeTimers()
    const { CloudError } = await import('./cloud')
    let data = 1
    const save = vi.fn().mockRejectedValueOnce(new CloudError('stale', 'someone saved a newer version (5) — reload')).mockResolvedValue({ id: 'c1', version: 6 })
    const { s, words } = await setup(save, () => ({ ...ITEM, data: { n: data } }))
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(words().at(-1)).toBe('Not saved: someone saved a newer version (5) — reload')
    data = 2
    s.touch()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1) // waits for the person
    await s.keepMine()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][2]).toBe(true) // over the cloud's copy
    expect(words().at(-1)).toBe('Saved')
    s.stop()
  })

  it('stale, then their newer copy opened (the link moves to their version): saving starts again by itself', async () => {
    vi.useFakeTimers()
    const { CloudError } = await import('./cloud')
    let data = 1
    const save = vi.fn().mockRejectedValueOnce(new CloudError('stale', 'someone saved a newer version (5) — reload')).mockResolvedValue({ id: 'c1', version: 6 })
    const { s, links, words } = await setup(save, () => ({ ...ITEM, data: { n: data } }))
    links.set(ITEM.key, { id: 'c1', version: 3, hash: '' })
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(words().at(-1)).toMatch(/^Not saved: someone saved/)
    links.set(ITEM.key, { id: 'c1', version: 5, hash: 'theirs' }) // what Open theirs does
    data = 2
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][1]).toMatchObject({ version: 5 })
    expect(save.mock.calls[1][2]).toBe(false)
    expect(words().at(-1)).toBe('Saved')
    s.stop()
  })

  it('a change during a save goes out right after it; nothing open = no word', async () => {
    vi.useFakeTimers()
    let data = 1
    let release = () => {}
    const save = vi.fn(() => new Promise<Omit<Link, 'hash'>>((ok) => (release = () => ok({ id: 'c1', version: save.mock.calls.length }))))
    const { s, words } = await setup(save, () => ({ ...ITEM, data: { n: data } }))
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    data = 2
    const flushed = s.flush() // during the first save
    release()
    await vi.advanceTimersByTimeAsync(0)
    release()
    await flushed
    expect(save).toHaveBeenCalledTimes(2)
    expect((save.mock.calls[1] as unknown as [CloudItem])[0].data).toEqual({ n: 2 })
    s.stop()
    const empty = await setup(vi.fn(), () => null)
    empty.s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(empty.words()).toEqual([''])
    empty.s.stop()
    expect(words().at(-1)).toBe('Saved')
  })
})

describe('no database configured (no env): every path stays in this browser, as before accounts', () => {
  it('no client, no session, no company; signing in and the cloud refuse without sending anything', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const supabase = await import('./supabase')
    const auth = await import('./auth')
    const cloud = await import('./cloud')
    expect(supabase.configured).toBe(false)
    expect(supabase.sb).toBeNull()
    expect(await auth.session()).toBeNull()
    expect(await auth.myOrg()).toBeNull()
    await expect(auth.signIn('someone@example.com')).rejects.toThrow('not set up')
    await expect(cloud.listProjects('org-1')).rejects.toMatchObject({ why: 'refused' })
    await expect(cloud.saveProject('org-1', ITEM)).rejects.toMatchObject({ why: 'refused' })
    await expect(supabase.fetchSharedUnit('t')).rejects.toMatchObject({ status: 0 })
    await auth.signOut()
    expect(f).not.toHaveBeenCalled()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    vi.resetModules()
  })
})
