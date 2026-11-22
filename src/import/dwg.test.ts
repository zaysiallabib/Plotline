import { afterEach, describe, expect, it, vi } from 'vitest'
import { convertDwg, looksLikeDxf } from './dwg'

describe('a .dwg through the converter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('knows a DXF when it sees one (LibreDWG writes a 999 comment first)', () => {
    expect(looksLikeDxf('  0\nSECTION\n  2\nHEADER')).toBe(true)
    expect(looksLikeDxf('999\nLibreDWG 0.13\n  0\r\nSECTION\r\n')).toBe(true)
    expect(looksLikeDxf('<html>error</html>')).toBe(false)
  })

  it('posts the bytes with the name and gives back the DXF; a refusal or a non-DXF answer is said in plain words', async () => {
    const seen: { body?: unknown; name?: string | null }[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.push({ body: init.body, name: new Headers(init.headers).get('X-File-Name') })
      return new Response('  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n')
    })
    const bytes = new Uint8Array([65, 67, 49, 48]).buffer
    expect(await convertDwg(bytes, 'Floor 2.dwg', '/api/dwg')).toMatch(/SECTION/)
    expect(seen[0]).toEqual({ body: bytes, name: 'Floor%202.dwg' })
    vi.stubGlobal('fetch', async () => new Response('daily limit reached', { status: 429 }))
    await expect(convertDwg(bytes, 'a.dwg', '/api/dwg')).rejects.toThrow(/daily limit reached.*save it as DXF/)
    vi.stubGlobal('fetch', async () => new Response('<html>oops</html>'))
    await expect(convertDwg(bytes, 'a.dwg', '/api/dwg')).rejects.toThrow(/did not send a DXF/)
    vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('network')))
    await expect(convertDwg(bytes, 'a.dwg', '/api/dwg')).rejects.toThrow(/could not be reached/)
  })
})

describe('a .dwg with no converter set up (no CloudConvert key)', () => {
  it('is refused with how to save it as DXF in the three common programs, so nobody is stuck', async () => {
    const { lockedFormatOf } = await import('./index')
    const m = lockedFormatOf('Floor 2.DWG')!
    expect(m).toMatch(/save it as DXF and drop the \.dxf/)
    for (const how of ['AutoCAD: type SAVEAS', 'DraftSight: File → Save As → DXF', 'LibreCAD (free) opens the .dwg']) expect(m).toContain(how)
  })
})
