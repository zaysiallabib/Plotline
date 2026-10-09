/**
 * The change list, Phase 0 (session 18, ask 8). What a buyer does on a share link (`/s/<token>`) — a note, a finish
 * choice — becomes an append-only `events` row (supabase/migrations/20261004120000_events.sql) through add_event;
 * staff read every link's rows with the staff key (events_for_staff). A newer row about the same thing (same link,
 * kind and ref) supersedes the older one: the server flags it on read, nothing is ever rewritten (invariant 6).
 * Offline: a row that cannot reach the server (no network, a 5xx) waits in this browser's outbox and goes with the next
 * send, the next load or when the browser is back online. Its id is minted here, so a resend never makes a second row.
 */
import { newId, type FinishSlot, type Id } from '../core'
import { FINISH_CATALOG } from '../furnish/finishes'
import { RpcError, rpc } from './supabase'

export type EventKind = 'comment' | 'selection'

export interface SelectionPayload {
  slotId: Id
  slotLabel: string
  optionId: Id
  label: string
  brand: string
  sku: string
  priceDeltaBdt: number
  /** a choice for ONE room or ONE wall face (session 23): its configuration key — also the row's ref — and its name ("Bed-1 · floor") */
  key?: string
  scope?: string
  /** that room / wall went back to the group's choice ("Same as the group"): no option of its own, no price */
  removed?: true
}

export interface CommentPayload {
  text?: string
  /** what was clicked, as the buyer saw it ("Door handle · Bed 1") */
  object?: string
  /** invariant 4: the entity id + local offset the note hangs on */
  anchor?: { kind: string; entityId: Id; offset?: { u: number; v: number } }
  roomId?: Id
  /** a later row with the same ref and `removed` = the buyer took the note back */
  removed?: true
}

export interface BuyerEvent {
  id: Id
  token: string
  kind: EventKind
  /** what the row is about: the slot id or one-room / one-wall key (selection), or the note's id (comment) */
  ref: string
  /** this browser (a random id it keeps) and the name the buyer typed, if any */
  buyer: string
  name: string | null
  payload: SelectionPayload | CommentPayload
  /** server-side: when it arrived; a newer row about the same thing exists */
  created_at?: string
  superseded?: boolean
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const OUTBOX = 'plotline.outbox'
const BUYER = 'plotline.buyer'
const local = (): Store | null => {
  try {
    return localStorage
  } catch {
    return null // storage blocked (or no DOM): nothing is queued, a send still goes out
  }
}
const read = <T>(s: Store | null, k: string, fallback: T): T => {
  try {
    return (JSON.parse(s?.getItem(k) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}
const write = (s: Store | null, k: string, v: unknown): void => {
  try {
    s?.setItem(k, JSON.stringify(v))
  } catch {
    /* full or blocked: the row still goes out if the network is there */
  }
}

/** this browser as a buyer: a random id kept for good, the name typed on a share link */
export function buyer(store: Store | null = local()): { id: string; name: string } {
  const b = read<{ id?: string; name?: string }>(store, BUYER, {})
  if (b.id) return { id: b.id, name: b.name ?? '' }
  const fresh = { id: newId(), name: '' }
  write(store, BUYER, fresh)
  return fresh
}
export const setBuyerName = (name: string, store: Store | null = local()): void => write(store, BUYER, { ...buyer(store), name: name.slice(0, 80) })

/**
 * A finish choice as a row. `where`: a one-room / one-wall choice (its key and name); there `optionId` null = back to the
 * group's choice (a wall: the room's), logged so the change list never keeps a choice the buyer took back.
 */
export const selectionPayload = (slot: FinishSlot, optionId: Id | null, where?: { key: string; scope: string }): SelectionPayload | null => {
  if (optionId === null) {
    const label = where?.key.startsWith('wall:') ? 'Same as the room' : 'Same as the group'
    return where ? { slotId: slot.id, slotLabel: slot.label, optionId: '', label, brand: '', sku: '', priceDeltaBdt: 0, ...where, removed: true } : null
  }
  const o = slot.options.find((x) => x.id === optionId)
  return o ? { slotId: slot.id, slotLabel: slot.label, optionId: o.id, label: o.label, brand: o.brand, sku: o.sku, priceDeltaBdt: o.priceDeltaBdt, ...where } : null
}

async function drain(store: Store | null): Promise<void> {
  for (;;) {
    const [e] = read<BuyerEvent[]>(store, OUTBOX, [])
    if (!e) return
    try {
      await rpc('add_event', { p_id: e.id, p_token: e.token, p_kind: e.kind, p_ref: e.ref, p_buyer: e.buyer, p_name: e.name, p_payload: e.payload })
    } catch (err) {
      if (!(err instanceof RpcError && err.status >= 400 && err.status < 500)) return // offline / server down: try later
      console.warn('[plotline] change list refused a row', err.message)
    }
    write(store, OUTBOX, read<BuyerEvent[]>(store, OUTBOX, []).filter((x) => x.id !== e.id))
  }
}

let flushing: Promise<void> | null = null

/** Sends the outbox in order; stops at the first row the server cannot take now (kept), drops one it refuses (4xx). */
export function flushOutbox(store: Store | null = local()): Promise<void> {
  flushing ??= drain(store).finally(() => (flushing = null))
  return flushing
}

/** rows still waiting in this browser's outbox (offline) */
export const pending = (store: Store | null = local()): number => read<BuyerEvent[]>(store, OUTBOX, []).length

/** One buyer action on share link `token`: queued in this browser, then sent (with anything still waiting). */
export function sendEvent(token: string, kind: EventKind, ref: string, payload: SelectionPayload | CommentPayload, store: Store | null = local()): Promise<void> {
  const me = buyer(store)
  const e: BuyerEvent = { id: newId(), token, kind, ref, buyer: me.id, name: me.name.trim() || null, payload }
  write(store, OUTBOX, [...read<BuyerEvent[]>(store, OUTBOX, []), e])
  return flushing ? flushing.then(() => flushOutbox(store)) : flushOutbox(store)
}

// ── staff side ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StaffData {
  links: { token: string; unit_name: string; created_at: string }[]
  events: BuyerEvent[]
}

/** Every link and every event, newest first (a wrong key is a 403 RpcError). */
export const eventsForStaff = (staffKey: string): Promise<StaffData> => rpc<StaffData>('events_for_staff', { p_key: staffKey })

const CATALOG = new Map(FINISH_CATALOG.flatMap((s) => s.options.map((o) => [o.id, o])))
/** A choice's BDT delta: the catalog's own price for a catalog option (a buyer's browser could send any number), else as sent. */
export const deltaOf = (p: SelectionPayload): number => CATALOG.get(p.optionId)?.priceDeltaBdt ?? (Number.isInteger(p.priceDeltaBdt) ? p.priceDeltaBdt : 0)
/** a chosen option as the catalog has it (label, brand, sku, delta); one outside the catalog as the buyer's browser sent it */
export const choiceOf = (p: SelectionPayload) => {
  const o = CATALOG.get(p.optionId) ?? p
  return { label: o.label, brand: o.brand, sku: o.sku, deltaBdt: deltaOf(p) }
}

/** "Rahim" (the latest name that browser typed anywhere) or "Buyer 3f2a" */
export function whoNames(events: BuyerEvent[]): (e: BuyerEvent) => string {
  const named = new Map<string, string>()
  for (const e of [...events].reverse()) if (e.name) named.set(e.buyer, e.name) // oldest → newest: the latest wins
  return (e) => named.get(e.buyer) ?? `Buyer ${e.buyer.slice(0, 4)}`
}

/** What a row is about and what it says, in plain words, for the staff list and the CSV. */
export function describe(e: BuyerEvent): { what: string; detail: string; brand: string; sku: string; deltaBdt: number | null } {
  if (e.kind === 'selection') {
    const p = e.payload as SelectionPayload
    const c = choiceOf(p)
    return { what: p.scope ?? p.slotLabel, detail: c.label, brand: c.brand, sku: c.sku, deltaBdt: p.removed ? null : c.deltaBdt }
  }
  const p = e.payload as CommentPayload
  return { what: p.object || 'Note', detail: p.removed ? 'Removed this note' : (p.text ?? ''), brand: '', sku: '', deltaBdt: null }
}

/** Per link, newest first: its rows, the buyer's current choice per finish slot / room / wall (taken back ones out) and their total. */
export function byLink(data: StaffData) {
  return data.links.map((l) => {
    const events = data.events.filter((e) => e.token === l.token)
    const current = events.filter((e) => e.kind === 'selection' && !e.superseded && !(e.payload as SelectionPayload).removed).map((e) => e.payload as SelectionPayload)
    return { ...l, events, current, totalBdt: current.reduce((t, p) => t + deltaOf(p), 0), notes: events.filter((e) => e.kind === 'comment' && !e.superseded && !(e.payload as CommentPayload).removed).length }
  })
}

const cell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The change list as CSV (UTF-8 with a BOM so Excel reads ৳ and Bangla names): one row per event, newest first. */
export function toCsv(data: StaffData, origin: string): string {
  const who = whoNames(data.events)
  const unit = new Map(data.links.map((l) => [l.token, l.unit_name]))
  const head = ['When', 'Unit', 'Link', 'Who', 'Buyer id', 'Type', 'What', 'Comment / choice', 'Brand', 'SKU', 'BDT delta', 'Superseded']
  const rows = data.events.map((e) => {
    const d = describe(e)
    return [e.created_at, unit.get(e.token), `${origin}/s/${e.token}`, who(e), e.buyer, e.kind === 'selection' ? 'Finish choice' : 'Note', d.what, d.detail, d.brand, d.sku, d.deltaBdt, e.superseded ? 'yes' : 'no']
  })
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
