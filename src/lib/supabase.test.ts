import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

beforeAll(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})
afterEach(() => vi.unstubAllGlobals())

const mockFetch = (status: number, body: string) => {
  const f = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal('fetch', f)
  return f
}

describe('supabase rpc', () => {
  it('fetchSharedUnit posts the token with the key and returns the JSON', async () => {
    const { fetchSharedUnit } = await import('./supabase')
    const f = mockFetch(200, '{"id":"u1"}')
    expect(await fetchSharedUnit('t')).toEqual({ id: 'u1' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/unit_by_token')
    expect(new Headers(init.headers).get('apikey')).toBe('sb_publishable_test') // the publishable key only (never a secret one)
    expect(init.body).toBe('{"p_token":"t"}')
  })
  it('a malformed token (400) is "no such link", a server error throws', async () => {
    const { fetchSharedUnit } = await import('./supabase')
    mockFetch(400, 'invalid input syntax for type uuid')
    expect(await fetchSharedUnit('garbage')).toBeNull()
    mockFetch(500, 'boom')
    await expect(fetchSharedUnit('t')).rejects.toThrow('500')
  })
  it('publishUnit returns the token; a wrong staff key is a 403 RpcError', async () => {
    const { publishUnit, RpcError } = await import('./supabase')
    mockFetch(200, '"abc-token"')
    expect(await publishUnit({ name: 'U' }, 'k')).toBe('abc-token')
    mockFetch(403, 'wrong staff key')
    await expect(publishUnit({ name: 'U' }, 'bad')).rejects.toBeInstanceOf(RpcError)
  })
  it('signed in: shareUnit names the company and where it came from; revokeLink the token', async () => {
    const { revokeLink, shareUnit } = await import('./supabase')
    let f = mockFetch(200, '"tok"')
    expect(await shareUnit('org-1', { name: 'U' }, { project: 'p1', stem: 'u1', floor: 3 })).toBe('tok')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/share_unit')
    expect(JSON.parse(init.body as string)).toEqual({ p_org: 'org-1', p_unit: { name: 'U' }, p_project: 'p1', p_stem: 'u1', p_floor: 3 })
    f = mockFetch(200, 'true')
    expect(await revokeLink('tok')).toBe(true)
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ p_token: 'tok' })
  })
})
