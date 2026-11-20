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
    expect(whyNoRow({ version: 7, deleted_at: null }, 5)).toMatchObject({ why: 'stale', message: 'someone else saved it after you opened it (their version 7)' })
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
    expect(words()).toEqual(['Saving…', 'Saved · just now'])
    expect(links.get(ITEM.key)).toMatchObject({ id: 'c1', version: 1 })
    s.touch()
    await vi.advanceTimersByTimeAsync(2100)
    expect(save).toHaveBeenCalledTimes(1) // unchanged: nothing sent
    s.stop()
  })

  it('offline: "Offline · will retry", tried again by itself, then Saved', async () => {
    vi.useFakeTimers()
    const { CloudError } = await import('./cloud')
    const save = vi.fn().mockRejectedValueOnce(new CloudError('offline', 'no connection')).mockResolvedValue({ id: 'c1', version: 2 })
    const { s, words } = await setup(save)
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(words().at(-1)).toBe('Offline · will retry')
    await vi.advanceTimersByTimeAsync(15000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(words().at(-1)).toBe('Saved · just now')
    s.stop()
  })

  it('stale: "Someone else saved", no more saves of it until Keep mine', async () => {
    vi.useFakeTimers()
    const { CloudError } = await import('./cloud')
    let data = 1
    const save = vi.fn().mockRejectedValueOnce(new CloudError('stale', 'someone else saved it after you opened it (their version 5)')).mockResolvedValue({ id: 'c1', version: 6 })
    const { s, words } = await setup(save, () => ({ ...ITEM, data: { n: data } }))
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(words().at(-1)).toBe('Someone else saved')
    data = 2
    s.touch()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1) // waits for the person
    await s.keepMine()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][2]).toBe(true) // over the cloud's copy
    expect(words().at(-1)).toBe('Saved · just now')
    s.stop()
  })

  it('stale, then their newer copy opened (the link moves to their version): saving starts again by itself', async () => {
    vi.useFakeTimers()
    const { CloudError } = await import('./cloud')
    let data = 1
    const save = vi.fn().mockRejectedValueOnce(new CloudError('stale', 'someone else saved it after you opened it (their version 5)')).mockResolvedValue({ id: 'c1', version: 6 })
    const { s, links, words } = await setup(save, () => ({ ...ITEM, data: { n: data } }))
    links.set(ITEM.key, { id: 'c1', version: 3, hash: '' })
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(words().at(-1)).toBe('Someone else saved')
    links.set(ITEM.key, { id: 'c1', version: 5, hash: 'theirs' }) // what Open theirs does
    data = 2
    s.touch()
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][1]).toMatchObject({ version: 5 })
    expect(save.mock.calls[1][2]).toBe(false)
    expect(words().at(-1)).toBe('Saved · just now')
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
    expect(words().at(-1)).toBe('Saved · just now')
  })
})

describe('the word in the top bar, and two tabs of one browser', () => {
  it('Saved says how long ago; the other states say what happened in a few words', async () => {
    const { statusWord } = await import('./cloud')
    const at = Date.parse('2026-11-20T14:05:00Z')
    expect(statusWord({ kind: 'saved', at }, at + 30_000)).toBe('Saved · just now')
    expect(statusWord({ kind: 'saved', at }, at + 4 * 60_000 + 5_000)).toBe('Saved · 4 min ago')
    expect(statusWord({ kind: 'saved', at }, at + 3 * 3600_000)).toMatch(/^Saved · \d\d:\d\d$/)
    expect(statusWord({ kind: 'saved' })).toBe('Saved') // already in the cloud when it was opened: no time to say
    expect(statusWord({ kind: 'offline' })).toBe('Offline · will retry')
    expect(statusWord({ kind: 'stale', reason: 'x' })).toBe('Someone else saved')
    expect(statusWord({ kind: 'gone', reason: 'x' })).toBe('Deleted in the cloud')
    expect(statusWord({ kind: 'refused', reason: 'too big for the cloud' })).toBe('Not saved: too big for the cloud')
  })

  it("another tab's save never moves this tab's version (its next save is refused as stale, not saved over theirs)", async () => {
    const { linkStore } = await import('./cloud')
    const shared = (() => {
      const m = new Map<string, string>()
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    })()
    shared.setItem('plotline.cloud.u1', JSON.stringify({ 'unit:a': { id: 'c1', version: 3, hash: 'h3' } }))
    // two tabs = two page loads of one browser: each reads the browser's memory once (the module, per page)
    const tab1 = linkStore('u1', shared)
    vi.resetModules()
    const tab2 = (await import('./cloud')).linkStore('u1', shared)
    expect(tab1.get('unit:a')?.version).toBe(3)
    expect(tab2.get('unit:a')?.version).toBe(3)
    tab1.set('unit:a', { id: 'c1', version: 4, hash: 'h4' }) // tab 1 saved
    expect(tab2.get('unit:a')?.version).toBe(3) // tab 2 still names the version IT opened
    tab2.set('unit:b', { id: 'c2', version: 1, hash: 'hb' })
    expect(JSON.parse(shared.getItem('plotline.cloud.u1')!)).toEqual({ 'unit:a': { id: 'c1', version: 4, hash: 'h4' }, 'unit:b': { id: 'c2', version: 1, hash: 'hb' } }) // both kept for the next load
    vi.resetModules()
    expect((await import('./cloud')).linkStore('u1', shared).get('unit:a')?.version).toBe(4) // a reload starts from the newest
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
    expect(await supabase.getSb()).toBeNull()
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

describe('the client is fetched only when a call needs it (session 31 tidy: 56 kB gz off every walk)', () => {
  it('its session kept under supabase-js own default name (no one signed out); a public file address without the client', async () => {
    vi.resetModules()
    const { createClient } = await import('@supabase/supabase-js')
    const s = await import('./supabase')
    const c = (await s.getSb())!
    const keyOf = (x: typeof c) => (x.auth as unknown as { storageKey: string }).storageKey
    expect(keyOf(c)).toBe('sb-x-auth-token')
    expect(keyOf(createClient('https://x.supabase.co', 'sb_publishable_test'))).toBe('sb-x-auth-token')
    expect(await s.getSb()).toBe(c) // one client
    expect(s.publicUrl('library', 'org-1/ab cd.glb')).toBe(c.storage.from('library').getPublicUrl('org-1/ab cd.glb').data.publicUrl)
  })

  it('never signed in here (no kept session, no emailed code in the address): no session, no client asked for', async () => {
    vi.resetModules()
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null })
    vi.stubGlobal('location', { search: '' })
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const s = await import('./supabase')
    const auth = await import('./auth')
    expect(s.maySignIn()).toBe(false)
    expect(await auth.session()).toBeNull()
    expect(await auth.myOrg()).toBeNull()
    expect(f).not.toHaveBeenCalled()
    vi.stubGlobal('location', { search: '?code=abc' }) // the emailed link came back
    expect(s.maySignIn()).toBe(true)
    vi.stubGlobal('location', { search: '' })
    kept.set('sb-x-auth-token', '{}') // a session kept from before
    expect(s.maySignIn()).toBe(true)
  })
})
