/**
 * Staff accounts (session 30): sign in with an email link — no password to leak or forget. Who is in which company
 * (org) is the database's business (org_members, added by the owner in the SQL editor: Docs/SETUP_ACCOUNTS.md);
 * this browser only keeps the session Supabase gives it. Not configured: no session, ever, and nothing is sent.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './supabase'

/**
 * Emails a sign-in link. It comes back to this site's Studio only: `emailRedirectTo` is this origin, and Supabase
 * refuses any address not on its Redirect URLs list (no open redirect). The email address is never logged here.
 */
export async function signIn(email: string): Promise<void> {
  if (!sb) throw new Error('Accounts are not set up on this site')
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/studio`, shouldCreateUser: true } })
  if (error) throw new Error(error.status === 429 ? 'Too many emails asked for: wait a minute and try again' : error.message)
}

export async function signOut(): Promise<void> {
  await sb?.auth.signOut()
}

export async function session(): Promise<Session | null> {
  return sb ? (await sb.auth.getSession()).data.session : null
}

/** The session as it changes (sign in, sign out, the hourly refresh, another tab); undefined while it is being read. */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(sb ? undefined : null)
  useEffect(() => {
    if (!sb) return
    const { data } = sb.auth.onAuthStateChange((_event, next) => setS(next)) // fires INITIAL_SESSION at once
    return () => data.subscription.unsubscribe()
  }, [])
  return s
}

export interface Org {
  id: string
  name: string
  role: 'owner' | 'staff'
}

let mine: { user: string; org: Promise<Org | null> } | null = null
/**
 * The signed-in person's company; null = not signed in, or in no company yet (the owner adds them).
 * ponytail: one company per person (the first); a picker when someone works for two developers.
 */
export async function myOrg(): Promise<Org | null> {
  const user = (await session())?.user.id
  if (!sb || !user) return null
  if (mine?.user !== user) {
    const org = (async () => {
      // orgs(...) is many-to-one: PostgREST gives one object (supabase-js, without the schema's types, guesses an array)
      const { data, error } = await sb.from('org_members').select('role, orgs(id, name)').eq('user_id', user).limit(1)
      if (error) throw new Error(error.message)
      const m = data?.[0] as unknown as { role: Org['role']; orgs: { id: string; name: string } | null } | undefined
      return m?.orgs ? { id: m.orgs.id, name: m.orgs.name, role: m.role } : null
    })()
    const entry = { user, org }
    mine = entry
    org.catch(() => mine === entry && (mine = null)) // a failed read (offline) is asked again next time
  }
  return mine.org
}
