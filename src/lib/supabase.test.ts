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
    expect((init.headers as Record<string, string>).apikey).toBe('sb_publishable_test')
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
})
