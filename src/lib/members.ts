/**
 * The company's people (session 31): Studio → account card → Members. The rules below are the database's own
 * (supabase/migrations/20261120180000_members_pictures.sql: invite_member, remove_member, set_member_role); the card asks
 * them first so a button that would be refused says why instead, and the database refuses the same things anyway.
 * An invite is a pending row keyed by the email: that person's first sign-in with it joins them (accept_invites, called
 * by auth.ts myOrg), so Plotline never sends an email of its own.
 */
import { rpc } from './supabase'

export type Role = 'owner' | 'staff'
export interface Member {
  user_id: string
  email: string
  role: Role
  since: string
}
export interface Invite {
  email: string
  role: Role
  since: string
}
export interface People {
  members: Member[]
  invites: Invite[]
}

/** an email as the database keeps it (trimmed, lower case) */
export const normEmail = (s: string): string => s.trim().toLowerCase()
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const owners = (p: People) => p.members.filter((m) => m.role === 'owner').length
const roleOf = (p: People, me: string): Role | undefined => p.members.find((m) => m.user_id === me)?.role

/** Why `me` may not invite `email`; null = allowed. */
export function whyNotInvite(p: People, me: string, email: string): string | null {
  if (roleOf(p, me) !== 'owner') return 'Only an owner can invite people'
  const e = normEmail(email)
  if (!EMAIL.test(e) || e.length > 254) return 'Type their whole email address'
  if (p.members.some((m) => normEmail(m.email) === e)) return 'Already in the company'
  return null
}

/** Why `me` may not remove `who`; null = allowed. */
export function whyNotRemove(p: People, me: string, who: Member): string | null {
  if (roleOf(p, me) !== 'owner') return 'Only an owner can remove people'
  if (who.user_id === me) return 'You cannot remove yourself: another owner can'
  if (who.role === 'owner' && owners(p) <= 1) return 'A company needs at least one owner'
  return null
}

/** Why `me` may not make `who` a `role`; null = allowed (the same role again is no change, so not offered). */
export function whyNotSetRole(p: People, me: string, who: Member, role: Role): string | null {
  if (roleOf(p, me) !== 'owner') return 'Only an owner can change roles'
  if (who.role === role) return `Already ${role}`
  if (who.role === 'owner' && role === 'staff' && owners(p) <= 1) return 'A company needs at least one owner: make someone else owner first'
  return null
}

export const orgPeople = (org: string): Promise<People> => rpc<People>('org_people', { p_org: org })
/** resolves to the email as kept (lower case) */
export const inviteMember = (org: string, email: string, role: Role): Promise<string> => rpc<string>('invite_member', { p_org: org, p_email: email, p_role: role })
export const cancelInvite = (org: string, email: string): Promise<boolean> => rpc<boolean>('cancel_invite', { p_org: org, p_email: email })
export const removeMember = (org: string, user: string): Promise<boolean> => rpc<boolean>('remove_member', { p_org: org, p_user: user })
export const setMemberRole = (org: string, user: string, role: Role): Promise<boolean> => rpc<boolean>('set_member_role', { p_org: org, p_user: user, p_role: role })
/** the signed-in person's pending invites become memberships; how many */
export const acceptInvites = (): Promise<number> => rpc<number>('accept_invites', {})

/** "invite_member: 403 only an owner of this company can do that" → "Only an owner of this company can do that" */
export function plainError(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e)).replace(/^\w+: \d+ /, '')
  return m.charAt(0).toUpperCase() + m.slice(1)
}
