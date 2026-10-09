import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BuyerEvent, SelectionPayload, StaffData } from './events'

beforeAll(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})
afterEach(() => vi.unstubAllGlobals())

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
/** fetch answering each call from `replies` in turn (a status, or 'offline' = the network is gone) */
const mockFetch = (...replies: (number | 'offline')[]) => {
  const f = vi.fn(async () => {
    const r = replies.length > 1 ? replies.shift()! : replies[0]
    if (r === 'offline') throw new TypeError('Failed to fetch')
    return new Response(r === 200 ? '"ok"' : 'nope', { status: r })
  })
  vi.stubGlobal('fetch', f)
  return f
}
const bodies = (f: ReturnType<typeof mockFetch>) => (f.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => ({ url, ...JSON.parse(init.body as string) }))
const SEL: SelectionPayload = { slotId: 's_floor_beds', slotLabel: 'Bedroom floors', optionId: 'fo_beds_marble', label: 'White marble', brand: 'Mir Ceramic', sku: 'MIR-MARBLE-WHITE', priceDeltaBdt: 185000 }

describe('change list: the buyer side', () => {
  it('a choice on a link is one add_event row: its own id, the link, the slot, this browser, the option as chosen', async () => {
    const { pending, sendEvent } = await import('./events')
    const store = memory()
    const f = mockFetch(200)
    await sendEvent('tok-1', 'selection', 's_floor_beds', SEL, store)
    const [b] = bodies(f)
    expect(b.url).toBe('https://x.supabase.co/rest/v1/rpc/add_event')
    expect(b).toMatchObject({ p_token: 'tok-1', p_kind: 'selection', p_ref: 's_floor_beds', p_name: null, p_payload: SEL })
    expect(b.p_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(b.p_buyer).toMatch(/^[0-9a-f-]{36}$/)
    expect(pending(store)).toBe(0)
  })

  it('offline: the row waits in the outbox and goes later with the SAME id (a resend never doubles it), in order', async () => {
    const { flushOutbox, pending, sendEvent } = await import('./events')
    const store = memory()
    mockFetch('offline')
    await sendEvent('tok-1', 'comment', 'pin-1', { text: 'Wider door', object: 'Door · Bed 1' }, store)
    await sendEvent('tok-1', 'selection', 's_floor_beds', SEL, store)
    expect(pending(store)).toBe(2)
    mockFetch(503) // the server is down: still kept
    await flushOutbox(store)
    expect(pending(store)).toBe(2)
    const queued = JSON.parse(store.getItem('plotline.outbox')!) as BuyerEvent[]
    const f = mockFetch(200)
    await flushOutbox(store)
    expect(pending(store)).toBe(0)
    expect(bodies(f).map((b) => [b.p_id, b.p_kind])).toEqual(queued.map((e) => [e.id, e.kind]))
  })

  it('a row the server refuses (4xx: a dead link) is dropped, the next one still goes', async () => {
    const { flushOutbox, pending, sendEvent } = await import('./events')
    const store = memory()
    mockFetch('offline')
    await sendEvent('dead', 'comment', 'pin-1', { text: 'x' }, store)
    await sendEvent('tok-1', 'comment', 'pin-2', { text: 'y' }, store)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = mockFetch(409, 200)
    await flushOutbox(store)
    expect(f).toHaveBeenCalledTimes(2)
    expect(pending(store)).toBe(0)
    warn.mockRestore()
  })

  it('this browser keeps one buyer id; the name typed goes with every row after', async () => {
    const { buyer, sendEvent, setBuyerName } = await import('./events')
    const store = memory()
    const id = buyer(store).id
    expect(buyer(store).id).toBe(id)
    setBuyerName('  Rahim ', store)
    const f = mockFetch(200)
    await sendEvent('tok-1', 'comment', 'pin-1', { removed: true }, store)
    expect(bodies(f)[0]).toMatchObject({ p_buyer: id, p_name: 'Rahim' })
  })
})

const at = (s: number) => new Date(Date.UTC(2026, 9, 4, 12, 0, s)).toISOString()
const DATA: StaffData = {
  links: [
    { token: 't2', unit_name: 'Auto-trace draft', created_at: at(0) },
    { token: 't1', unit_name: 'Type A · 2703 sft', created_at: at(0) },
  ],
  events: [
    { id: 'e5', token: 't1', kind: 'comment', ref: 'p1', buyer: 'b1aa', name: null, payload: { removed: true }, created_at: at(50), superseded: false },
    { id: 'e4', token: 't1', kind: 'selection', ref: 's_floor_beds', buyer: 'b1aa', name: 'Rahim', payload: { ...SEL, optionId: 'fo_beds_walnut', label: 'Dark walnut wood', priceDeltaBdt: 1 }, created_at: at(40), superseded: false },
    { id: 'e3', token: 't1', kind: 'selection', ref: 's_floor_beds', buyer: 'b1aa', name: null, payload: SEL, created_at: at(30), superseded: true },
    { id: 'e2', token: 't1', kind: 'comment', ref: 'p2', buyer: 'c2bb', name: null, payload: { text: 'Can the "kitchen" wall go?\nThanks, R', object: 'Wall · Kitchen' }, created_at: at(20), superseded: false },
    { id: 'e1', token: 't1', kind: 'comment', ref: 'p1', buyer: 'b1aa', name: null, payload: { text: 'Move the bed', object: 'Bed · Bed 1' }, created_at: at(10), superseded: true },
  ],
}

describe('change list: the staff side', () => {
  it('events_for_staff posts the key; a wrong key is a 403 RpcError', async () => {
    const { eventsForStaff } = await import('./events')
    const { RpcError } = await import('./supabase')
    const f = mockFetch(200)
    await eventsForStaff('k')
    expect(bodies(f)[0]).toMatchObject({ url: 'https://x.supabase.co/rest/v1/rpc/events_for_staff', p_key: 'k' })
    mockFetch(403)
    await expect(eventsForStaff('bad')).rejects.toBeInstanceOf(RpcError)
  })

  it('per link: the current choice per slot (superseded ones out), the catalog price (not what a browser sent), open notes', async () => {
    const { byLink } = await import('./events')
    const [t2, t1] = byLink(DATA)
    expect(t2).toMatchObject({ token: 't2', events: [], current: [], totalBdt: 0, notes: 0 })
    expect(t1.current.map((p) => p.optionId)).toEqual(['fo_beds_walnut'])
    expect(t1.totalBdt).toBe(45000) // fo_beds_walnut in the catalog, the row said 1
    expect(t1.notes).toBe(1) // e2; e1 was removed (e5)
  })

  it('one room / one wall (session 23): the row names where, is its own ref; taking it back is a row too, out of the current choices', async () => {
    const { byLink, describe: say, selectionPayload } = await import('./events')
    const { FINISH_CATALOG } = await import('../furnish/finishes')
    const slot = { ...FINISH_CATALOG.find((s) => s.id === 's_floor_beds')!, roomIds: ['r_bed1', 'r_bed2'] }
    const where = { key: 'room:r_bed1:floor', scope: 'Bed-1 · floor' }
    const marble = selectionPayload(slot, 'fo_beds_marble', where)!
    expect(marble).toEqual({ ...SEL, ...where })
    const back = selectionPayload(slot, null, where)!
    expect(back).toMatchObject({ ...where, slotId: 's_floor_beds', removed: true, label: 'Same as the group', priceDeltaBdt: 0 })
    expect(selectionPayload(slot, null)).toBeNull() // a group can't be "taken back": it has a default
    expect(selectionPayload(slot, null, { key: 'wall:w1:r_bed1', scope: 'Bed-1 · north wall' })?.label).toBe('Same as the room')
    const row = (id: string, payload: typeof SEL, s: number, superseded: boolean): BuyerEvent => ({ id, token: 't1', kind: 'selection', ref: payload.key ?? payload.slotId, buyer: 'b1aa', name: null, payload, created_at: at(s), superseded })
    const group = { ...SEL, optionId: 'fo_beds_walnut', label: 'Dark walnut wood' }
    const links = [{ token: 't1', unit_name: 'Type A · 2703 sft', created_at: at(0) }]
    const chosen = byLink({ links, events: [row('e2', marble, 20, false), row('e1', group, 10, false)] })[0]
    expect(chosen.current.map((p) => p.scope ?? p.slotLabel)).toEqual(['Bed-1 · floor', 'Bedroom floors'])
    expect(chosen.totalBdt).toBe(185000 + 45000)
    expect(say(row('e2', marble, 20, false))).toMatchObject({ what: 'Bed-1 · floor', detail: 'White marble', deltaBdt: 185000 })
    // the server flags e2 superseded by e3 (same link, kind, ref = the room's key); the group row stands
    const after = byLink({ links, events: [row('e3', back, 30, false), row('e2', marble, 20, true), row('e1', group, 10, false)] })[0]
    expect(after.current.map((p) => p.optionId)).toEqual(['fo_beds_walnut'])
    expect(after.totalBdt).toBe(45000)
    expect(say(row('e3', back, 30, false))).toMatchObject({ what: 'Bed-1 · floor', detail: 'Same as the group', deltaBdt: null })
  })

  it('who: the latest name that browser typed, else "Buyer" + its id', async () => {
    const { whoNames } = await import('./events')
    const who = whoNames(DATA.events)
    expect(DATA.events.map(who)).toEqual(['Rahim', 'Rahim', 'Rahim', 'Buyer c2bb', 'Rahim'])
  })

  it('CSV: BOM, one row per event newest first, quotes / commas / newlines escaped, superseded marked', async () => {
    const { toCsv } = await import('./events')
    const csv = toCsv(DATA, 'https://plotline.test')
    expect(csv.startsWith('\uFEFFWhen,Unit,Link,Who,Buyer id,Type,What,Comment / choice,Brand,SKU,BDT delta,Superseded\r\n')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines).toHaveLength(6)
    expect(lines[1]).toBe(`${at(50)},Type A · 2703 sft,https://plotline.test/s/t1,Rahim,b1aa,Note,Note,Removed this note,,,,no`)
    expect(lines[2]).toContain(',Finish choice,Bedroom floors,Dark walnut wood,RAK Ceramics,RAK-WOOD-WALNUT,45000,no')
    expect(lines[3]).toMatch(/,White marble,Mir Ceramic,MIR-MARBLE-WHITE,185000,yes$/)
    expect(csv).toContain('"Can the ""kitchen"" wall go?\nThanks, R"')
  })
})

describe('the SQL the founder pastes', () => {
  const dir = new URL('../../supabase/', import.meta.url)
  const m1 = readFileSync(new URL('migrations/20261003120000_share_links.sql', dir), 'utf8')
  const m2 = readFileSync(new URL('migrations/20261004120000_events.sql', dir), 'utf8')
  const paste = readFileSync(new URL('paste-into-sql-editor.sql', dir), 'utf8')

  it('is one file: both migrations, in order, unchanged (regenerate it when a migration changes)', () => {
    expect(paste.endsWith(m1 + '\n' + m2)).toBe(true)
    expect(paste.trimEnd().endsWith("select value as staff_key from private.config where key = 'staff_key';")).toBe(true)
  })

  it('is safe to run twice and keeps anon out (the real run: E:/dev/tmp/s18/laneD/pg/sqltest.mjs, PGlite)', () => {
    for (const sql of [m1, m2]) {
      expect(sql).not.toMatch(/create table (?!if not exists)/i)
      expect(sql).not.toMatch(/\bdrop\b|create policy|grant (select|insert|update|delete|all) on (table )?public\./i)
      expect(sql).not.toMatch(/create (trigger|function) /i) // only `create or replace`
    }
    expect(m1).toMatch(/insert into private\.config[^;]*on conflict \(key\) do nothing;/)
    expect(m2).toMatch(/alter table public\.events enable row level security;/)
    expect(m2).toMatch(/revoke all on public\.events from anon, authenticated;/)
  })
})
