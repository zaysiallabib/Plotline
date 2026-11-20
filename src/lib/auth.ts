/**
 * Staff accounts (session 30): sign in with an email link — no password to leak or forget. Who is in which company
 * (org) is the database's business (org_members: the founder adds the first owner in the SQL editor, owners invite the
 * rest from the Studio's Members card — lib/members.ts); this browser only keeps the session Supabase gives it.
 * Not configured: no session, ever, and nothing is sent.
 */
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { acceptInvites } from './members'
import { configured, getSb, maySignIn } from './supabase'

/**
 * Emails a sign-in link. It comes back to this site's Studio only: `emailRedirectTo` is this origin, and Supabase
 * refuses any address not on its Redirect URLs list (no open redirect). The email address is never logged here.
 */
export async function signIn(email: string): Promise<void> {
  const sb = await getSb()
  if (!sb) throw new Error(configured ? 'No connection: try again in a moment' : 'Accounts are not set up on this site')
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/studio`, shouldCreateUser: true } })
  if (error) throw new Error(error.status === 429 ? 'Too many emails asked for: wait a minute and try again' : error.message)
}

export async function signOut(): Promise<void> {
  if (maySignIn()) await (await getSb())?.auth.signOut()
}

export async function session(): Promise<Session | null> {
  const sb = maySignIn() ? await getSb() : null // never signed in here: the client is not even loaded
  return sb ? (await sb.auth.getSession()).data.session : null
}

/** The session as it changes (sign in, sign out, the hourly refresh, another tab); undefined while it is being read. */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(configured ? undefined : null)
  useEffect(() => {
    let stop: (() => void) | undefined
    let gone = false
    void getSb().then((sb) => {
      if (gone) return
      if (!sb) return setS(null)
      const { data } = sb.auth.onAuthStateChange((_event, next) => setS(next)) // fires INITIAL_SESSION at once
      stop = () => data.subscription.unsubscribe()
    })
    return () => {
      gone = true
      stop?.()
    }
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
 * The signed-in person's company; null = not signed in, or in no company yet (no invite for their email).
 * ponytail: one company per person (the first); a picker when someone works for two developers.
 */
export async function myOrg(): Promise<Org | null> {
  const user = (await session())?.user.id
  const c = user ? await getSb() : null
  if (!c || !user) return null
  if (mine?.user !== user) {
    const read = async (): Promise<Org | null> => {
      // orgs(...) is many-to-one: PostgREST gives one object (supabase-js, without the schema's types, guesses an array)
      const { data, error } = await c.from('org_members').select('role, orgs(id, name)').eq('user_id', user).limit(1)
      if (error) throw new Error(error.message)
      const m = data?.[0] as unknown as { role: Org['role']; orgs: { id: string; name: string } | null } | undefined
      return m?.orgs ? { id: m.orgs.id, name: m.orgs.name, role: m.role } : null
    }
    // in no company yet: an owner's invite for this email joins it now (Members, session 31); a database without that
    // part yet (the founder's paste) answers 404 — read as "no invite"
    const org = read().then(async (o) => o ?? ((await acceptInvites().catch(() => 0)) ? read() : null))
    const entry = { user, org }
    mine = entry
    org.catch(() => mine === entry && (mine = null)) // a failed read (offline) is asked again next time
  }
  return mine.org
}
