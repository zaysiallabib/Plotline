/**
 * Supabase, Phase 0: two RPCs over plain fetch (supabase/migrations/20261003120000_share_links.sql).
 * ponytail: no supabase-js — two POSTs don't need a client library; add it with auth (Phase A).
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` come from .env.local / Vercel env (never git).
 */
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configured = !!(URL && KEY)

export class RpcError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function rpc<T>(fn: string, args: object): Promise<T> {
  if (!URL || !KEY) throw new RpcError(0, 'Supabase is not configured')
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new RpcError(r.status, `${fn}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

/** The unit JSON a share link points at; null = no such link (a malformed token is a 400 → null too). */
export async function fetchSharedUnit(token: string): Promise<unknown> {
  try {
    return await rpc<unknown>('unit_by_token', { p_token: token })
  } catch (e) {
    if (e instanceof RpcError && e.status === 400) return null
    throw e
  }
}

/** Staff: stores the unit and mints a share token (the staff key is checked server-side; a wrong one is a 401). */
export const publishUnit = (unit: object, staffKey: string): Promise<string> => rpc<string>('publish_unit', { p_unit: unit, p_key: staffKey })
