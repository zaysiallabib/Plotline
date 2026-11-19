/**
 * Supabase: the one client (auth.ts signs staff in, cloud.ts saves their work, events.ts the buyers' change list; the
 * SQL is supabase/migrations/). `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` come from .env.local / Vercel
 * env (never git) — the publishable key only, never a secret one (vite.config.ts refuses it).
 * Not configured (no env) = `sb` is null: every caller keeps its browser-only path, exactly as before accounts.
 */
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const configured = !!(URL && KEY)

/**
 * PKCE: the emailed link signs in only the browser that asked for it (the code needs the verifier this browser keeps),
 * so a forwarded or intercepted email is useless; the session is kept and refreshed in this browser's storage.
 */
export const sb = configured ? createClient(URL!, KEY!, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

export class RpcError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** A database function; status 0 = no network (or not configured), else the HTTP status PostgREST answered. */
export async function rpc<T>(fn: string, args: object): Promise<T> {
  if (!sb) throw new RpcError(0, 'Supabase is not configured')
  const { data, error, status } = await sb.rpc(fn, args)
  if (error) throw new RpcError(status, `${fn}: ${status} ${error.message}`)
  return data as T
}

/** The unit JSON a share link points at; null = no such link, or turned off (a malformed token is a 400 → null too). */
export async function fetchSharedUnit(token: string): Promise<unknown> {
  try {
    return await rpc<unknown>('unit_by_token', { p_token: token })
  } catch (e) {
    if (e instanceof RpcError && e.status === 400) return null
    throw e
  }
}

/** Old path (no account): stores the unit and mints a share token; the staff key is checked server-side (a wrong one: 403). */
export const publishUnit = (unit: object, staffKey: string): Promise<string> => rpc<string>('publish_unit', { p_unit: unit, p_key: staffKey })

/** Signed in: the same, as a member of `org` (checked server-side); `at` says what it was made from, for the change list. */
export const shareUnit = (org: string, unit: object, at: { project?: string; stem?: string; floor?: number } = {}): Promise<string> =>
  rpc<string>('share_unit', { p_org: org, p_unit: unit, p_project: at.project ?? null, p_stem: at.stem ?? null, p_floor: at.floor ?? null })

/** Turns a link of the member's company off for good (its notes stay); false = not theirs, or off already. */
export const revokeLink = (token: string): Promise<boolean> => rpc<boolean>('revoke_link', { p_token: token })
