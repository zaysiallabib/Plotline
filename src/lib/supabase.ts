/**
 * Supabase: the one client (auth.ts signs staff in, cloud.ts saves their work, events.ts the buyers' change list; the
 * SQL is supabase/migrations/). `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` come from .env.local / Vercel
 * env (never git) — the publishable key only, never a secret one (vite.config.ts refuses it).
 * Not configured (no env) = `getSb()` gives null: every caller keeps its browser-only path, exactly as before accounts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** read from the env alone: never loads the client */
export const configured = !!(SB_URL && KEY)
/** where supabase-js keeps this browser's session: its own default name, written out so maySignIn() can look without it */
const STORE = configured ? `sb-${new URL(SB_URL!).hostname.split('.')[0]}-auth-token` : ''

let client: Promise<SupabaseClient | null> | undefined
/**
 * The one client, its code (56 kB gz) fetched on the first call that needs it — a share link, sign-in, a cloud save, the
 * library online — so the walk of a flat by someone never signed in never loads it (session 31 tidy). null = not
 * configured, or its code could not be fetched (offline: asked again on the next call).
 * PKCE: the emailed link signs in only the browser that asked for it (the code needs the verifier this browser keeps),
 * so a forwarded or intercepted email is useless; the session is kept and refreshed in this browser's storage.
 */
export function getSb(): Promise<SupabaseClient | null> {
  client ??= configured
    ? import('@supabase/supabase-js').then(
        ({ createClient }) => createClient(SB_URL!, KEY!, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: STORE } }),
        () => ((client = undefined), null),
      )
    : Promise.resolve(null)
  return client
}

/** This browser may be signed in: it keeps a session, or the address holds the emailed link's code. No: nothing to load. */
export function maySignIn(): boolean {
  if (!configured) return false
  try {
    return !!localStorage.getItem(STORE) || new URLSearchParams(location.search).has('code')
  } catch {
    return true // no storage to look in (a test, a locked-down browser): ask the client
  }
}

/** A file's address in a public Storage bucket — what the client's getPublicUrl gives, without the client; '' = not configured. */
export const publicUrl = (bucket: string, path: string): string =>
  configured ? encodeURI(`${SB_URL!.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, '')}`) : ''

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
  const sb = await getSb()
  if (!sb) throw new RpcError(0, configured ? 'no connection' : 'Supabase is not configured')
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

/** A share link as the Studio's Links card lists it: views = opens by anyone outside the company (session 31). */
export interface ProjectLink {
  token: string
  unit_name: string
  stem: string | null
  floor: number | null
  created_at: string
  created_by: string | null
  by_email: string | null
  revoked_at: string | null
  views: number
  last_viewed_at: string | null
  /** notes and finish choices buyers sent on it */
  events: number
}
/** Every link made from cloud row `project` (a project or a loose drawing), newest first. */
export const projectLinks = (project: string): Promise<ProjectLink[]> => rpc<ProjectLink[]>('project_links', { p_project: project })
