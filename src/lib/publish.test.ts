import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Unit } from '../core'

// the database, the company and the card stood in: what reaches them is what is checked
const calls: { fn: string; unit: Record<string, unknown>; at?: unknown; key?: string }[] = []
let org: { id: string } | null = null
let answer: string | null = 'k1'
let refuse = false
let me: { user: { id: string } } | null = null
vi.mock('./auth', () => ({ myOrg: async () => org, session: async () => me }))
vi.mock('./library', () => ({ forShare: async () => [] }))
vi.mock('./ask', () => ({ askText: async () => answer }))
vi.mock('./supabase', () => {
  class RpcError extends Error {
    constructor(readonly status: number, m: string) {
      super(m)
    }
  }
  return {
    RpcError,
    publishUnit: async (unit: Record<string, unknown>, key: string) => {
      if (refuse) throw new RpcError(403, 'publish_unit: 403 wrong key')
      calls.push({ fn: 'publish_unit', unit, key })
      return 'tok1'
    },
    shareUnit: async (_org: string, unit: Record<string, unknown>, at: unknown) => (calls.push({ fn: 'share_unit', unit, at }), 'tok2'),
  }
})

const store = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
vi.stubGlobal('location', { origin: 'https://plotline.test' })

const flat = { id: 'sheltech_a', name: 'Type A', floor: 3, furniture: [{ id: 'bed', assetId: 'bed_double', x: 1, y: 2, rotationDeg: 0, roomId: 'r1' }] } as unknown as Unit

describe('a buyer link (lib/publish): the flat as given, opening with the finishes given', () => {
  beforeEach(() => {
    calls.length = 0
    store.clear()
    org = null
    answer = 'k1'
    refuse = false
  })
  it("Share in the 3D view: this floor's flat with its kept finishes (floor 3's beige), its furniture as laid out", async () => {
    const { publishLink } = await import('./publish')
    const url = await publishLink(flat, { paint: 'beige', 'room:r1:floor': 'oak' })
    expect(url).toBe('https://plotline.test/s/tok1')
    expect(calls[0].unit).toMatchObject({ floor: 3, finishes: { paint: 'beige', 'room:r1:floor': 'oak' }, furniture: flat.furniture })
    expect(calls[0].key).toBe('k1')
    expect(store.get('plotline.staffKey')).toBe('k1') // asked once: kept for the next Share
  })
  it('signed in: made as the company, with what it was made from for the change list; no finishes: the catalog’s', async () => {
    org = { id: 'o1' }
    const { publishLink } = await import('./publish')
    expect(await publishLink(flat, {}, async () => ({ stem: 'sheltech_a', floor: 3 }))).toBe('https://plotline.test/s/tok2')
    expect(calls[0]).toMatchObject({ fn: 'share_unit', at: { stem: 'sheltech_a', floor: 3 } })
    expect('finishes' in calls[0].unit).toBe(false)
  })
  it('the staff key cancelled: no link; a wrong one: forgotten, so the next Share asks again', async () => {
    const { publishLink, WrongKey } = await import('./publish')
    answer = null
    expect(await publishLink(flat, null)).toBeNull()
    expect(calls).toHaveLength(0)
    answer = 'bad'
    refuse = true
    await expect(publishLink(flat, null)).rejects.toBeInstanceOf(WrongKey)
    expect(store.has('plotline.staffKey')).toBe(false)
  })
  it("a link made in the 3D view names the cloud row its drawing was saved in (the Studio's keys): its project's — a mirrored flat too — else its own; signed out or never saved: none", async () => {
    const { savedIn } = await import('./publish')
    expect(await savedIn('flat_a')).toBeUndefined() // signed out
    me = { user: { id: 'u1' } }
    const drawing = { id: 'flat_a', vertices: [], walls: [], roomLabels: [] }
    store.set('plotline.projects', JSON.stringify([{ id: 'p1', name: 'Tower', units: { flat_a: drawing }, flats: { flat_a: { unitId: 'flat_a', offset: { x: 0, y: 0 } } }, floors: [{ from: 2, to: 8, flats: ['flat_a'] }] }]))
    store.set('plotline.cloud.u1', JSON.stringify({ 'project:p1': { id: 'c-tower', version: 3, hash: 'h' }, 'unit:loose': { id: 'c-loose', version: 1, hash: 'h' } }))
    expect(await savedIn('flat_a')).toBe('c-tower')
    expect(await savedIn('flat_a-m')).toBe('c-tower')
    expect(await savedIn('loose')).toBe('c-loose')
    expect(await savedIn('never_saved')).toBeUndefined()
    me = null
  })
})
