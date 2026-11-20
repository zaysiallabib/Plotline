import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adoptPictures, bytesOf, dataUrlOf, forgetPictures, pathOf, pictureFromCloud, putOnline, withPictures, type Picture } from './pictures'

// before the imports below: supabase.ts reads them when it loads
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})
beforeEach(() => forgetPictures())
afterEach(() => vi.unstubAllGlobals())

const ORG = '0e1e0000-0000-4000-8000-000000000001'
const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 250, 0, 255])
const PIC: Picture = { dataUrl: dataUrlOf('image/webp', BYTES), naturalW: 2400, naturalH: 1600, name: 'img_3.webp' }

/** a stand-in for Supabase Storage: uploads kept by path, a second upload of one path answered as Storage does */
function storage() {
  const files = new Map<string, Uint8Array>()
  const calls: { method: string; path: string; upsert: string | null }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const u = new URL(url)
      const path = decodeURIComponent(u.pathname.replace('/storage/v1/object/plans/', ''))
      const method = init.method ?? 'GET'
      calls.push({ method, path, upsert: new Headers(init.headers).get('x-upsert') })
      if (method === 'POST') {
        if (files.has(path)) return new Response(JSON.stringify({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }), { status: 400 })
        const f = (init.body as FormData).get('') ?? [...(init.body as FormData).values()].find((v) => v instanceof Blob)
        files.set(path, new Uint8Array(await (f as Blob).arrayBuffer()))
        return new Response(JSON.stringify({ Key: `plans/${path}`, Id: 'x' }), { status: 200 })
      }
      const f = files.get(path)
      return f ? new Response(f as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'content-type': 'image/webp' } }) : new Response(JSON.stringify({ statusCode: '404', message: 'Object not found' }), { status: 400 })
    }),
  )
  return { files, calls }
}

describe('plan pictures online: named by their bytes, in the company folder', () => {
  it('a data: URL gives its bytes back, and the bytes the same URL; anything else is not a picture to send', () => {
    expect(bytesOf(PIC.dataUrl)).toEqual({ type: 'image/webp', bytes: BYTES })
    expect(dataUrlOf('image/webp', bytesOf(PIC.dataUrl)!.bytes)).toBe(PIC.dataUrl)
    expect(bytesOf('/plans/img_3.webp')).toBeNull()
    expect(bytesOf('data:image/gif;base64,R0lGOD')).toBeNull()
    const big = new Uint8Array(70_000).map((_, i) => i % 251) // past the 32 KB chunk
    expect(bytesOf(dataUrlOf('image/png', big))!.bytes).toEqual(big)
  })

  it('the path is <org>/<sha-256>.<ext>: the same picture, the same name', async () => {
    const p = await pathOf(ORG, 'image/webp', BYTES)
    expect(p).toMatch(new RegExp(`^${ORG}/[0-9a-f]{64}\\.webp$`))
    expect(await pathOf(ORG, 'image/webp', BYTES)).toBe(p)
    expect(await pathOf(ORG, 'image/webp', new Uint8Array([1]))).not.toBe(p)
    expect(await pathOf(ORG, 'image/jpeg', BYTES)).toMatch(/\.jpg$/)
    expect(p.split('/')[1].slice(0, 64)).toBe(createHash('sha256').update(BYTES).digest('hex'))
  })

  it('put online once: sent with upsert off, then known (the same picture on another drawing is not sent again)', async () => {
    const s = storage()
    expect(await putOnline(ORG, 'd1', PIC)).toBe(true)
    expect(s.calls).toEqual([{ method: 'POST', path: await pathOf(ORG, 'image/webp', BYTES), upsert: 'false' }])
    expect(s.files.get(s.calls[0].path)).toEqual(BYTES)
    expect(await putOnline(ORG, 'd1', PIC)).toBe(false) // nothing new
    expect(await putOnline(ORG, 'd2', PIC)).toBe(true) // a copy of the drawing: its map entry, no second upload
    expect(s.calls).toHaveLength(1)
    expect(withPictures({ id: 'p' }, ['d1', 'd2', 'd3'])).toEqual({ id: 'p', pictures: { d1: { path: s.calls[0].path, w: 2400, h: 1600, name: 'img_3.webp' }, d2: { path: s.calls[0].path, w: 2400, h: 1600, name: 'img_3.webp' } } })
    expect(withPictures({ id: 'p' }, ['d3'])).toEqual({ id: 'p' }) // none online: the data as it was
  })

  it('already there (another browser sent it): taken as sent; offline or refused: not known, tried again next time', async () => {
    const s = storage()
    s.files.set(await pathOf(ORG, 'image/webp', BYTES), BYTES)
    expect(await putOnline(ORG, 'd1', PIC)).toBe(true)
    forgetPictures()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await putOnline(ORG, 'd1', PIC)).toBe(false)
    expect(withPictures({}, ['d1'])).toEqual({})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ statusCode: '403', message: 'new row violates row-level security policy' }), { status: 400 })))
    expect(await putOnline(ORG, 'd1', PIC)).toBe(false)
    expect(await putOnline(ORG, 'd1', { ...PIC, dataUrl: '/plans/img_3.webp' })).toBe(false) // a deployed file: nothing to send
  })

  it('a colleague opens it: the pictures come off the data, and each drawing gets its picture from the cloud', async () => {
    const s = storage()
    const path = await pathOf(ORG, 'image/webp', BYTES)
    s.files.set(path, BYTES)
    const saved = { id: 'p', units: {}, pictures: { d1: { path, w: 2400, h: 1600, name: 'img_3.webp' }, bad: { path: '../../etc', w: 1, h: 1, name: 'x' } } }
    expect(adoptPictures(saved)).toEqual({ id: 'p', units: {} })
    expect(await pictureFromCloud('d1', null)).toEqual(PIC)
    expect(await pictureFromCloud('bad', null)).toBeNull() // a path that is not a company picture is never fetched
    expect(await pictureFromCloud('d9', null)).toBeNull() // no picture online
    const n = s.calls.length
    expect(await pictureFromCloud('d1', PIC)).toBeNull() // this browser has the very same one: nothing fetched
    expect(s.calls).toHaveLength(n)
    expect(await pictureFromCloud('d1', { ...PIC, dataUrl: dataUrlOf('image/webp', new Uint8Array([9])) })).toEqual(PIC) // another one here: the cloud's wins
    expect(withPictures({ id: 'p' }, ['d1'])).toMatchObject({ pictures: { d1: { path } } }) // and the next save keeps it
    expect(adoptPictures({ id: 'u' })).toEqual({ id: 'u' })
  })
})
