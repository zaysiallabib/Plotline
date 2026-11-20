import { afterEach, describe, expect, it, vi } from 'vitest'
import { normEmail, plainError, whyNotInvite, whyNotRemove, whyNotSetRole, type Member, type People } from './members'

// before the imports below: supabase.ts reads them when it loads
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})
afterEach(() => vi.unstubAllGlobals())

const m = (user_id: string, email: string, role: Member['role']): Member => ({ user_id, email, role, since: '2026-11-20T00:00:00Z' })
const RAHIM = m('u-rahim', 'Rahim@BTI.com', 'owner')
const KARIM = m('u-karim', 'karim@bti.com', 'staff')
const SALMA = m('u-salma', 'salma@bti.com', 'owner')
const one: People = { members: [RAHIM, KARIM], invites: [] }
const two: People = { members: [RAHIM, SALMA, KARIM], invites: [] }

describe('who may do what on the Members card (the database refuses the same: two_tenants.sql)', () => {
  it('only an owner invites; a whole email; never someone already in (any case, any spaces)', () => {
    expect(whyNotInvite(one, RAHIM.user_id, 'new@bti.com')).toBeNull()
    expect(whyNotInvite(one, KARIM.user_id, 'new@bti.com')).toBe('Only an owner can invite people')
    expect(whyNotInvite(one, RAHIM.user_id, 'new@bti')).toBe('Type their whole email address')
    expect(whyNotInvite(one, RAHIM.user_id, 'not an email')).toBe('Type their whole email address')
    expect(whyNotInvite(one, RAHIM.user_id, '  rahim@bti.COM ')).toBe('Already in the company')
    expect(whyNotInvite(one, 'u-stranger', 'new@bti.com')).toBe('Only an owner can invite people')
    expect(normEmail('  New@BTI.com ')).toBe('new@bti.com')
  })

  it('an owner removes someone else; never themself; never the last owner', () => {
    expect(whyNotRemove(one, RAHIM.user_id, KARIM)).toBeNull()
    expect(whyNotRemove(one, RAHIM.user_id, RAHIM)).toBe('You cannot remove yourself: another owner can')
    expect(whyNotRemove(one, KARIM.user_id, RAHIM)).toBe('Only an owner can remove people')
    expect(whyNotRemove(two, RAHIM.user_id, SALMA)).toBeNull()
    expect(whyNotRemove(two, RAHIM.user_id, RAHIM)).toBe('You cannot remove yourself: another owner can') // even with another owner
    expect(whyNotRemove({ members: [RAHIM, { ...SALMA, role: 'owner' }], invites: [] }, RAHIM.user_id, SALMA)).toBeNull()
  })

  it('only an owner changes roles; the last owner cannot step down; two owners can', () => {
    expect(whyNotSetRole(one, RAHIM.user_id, KARIM, 'owner')).toBeNull()
    expect(whyNotSetRole(one, RAHIM.user_id, RAHIM, 'staff')).toBe('A company needs at least one owner: make someone else owner first')
    expect(whyNotSetRole(two, RAHIM.user_id, RAHIM, 'staff')).toBeNull()
    expect(whyNotSetRole(two, RAHIM.user_id, SALMA, 'staff')).toBeNull()
    expect(whyNotSetRole(one, KARIM.user_id, KARIM, 'owner')).toBe('Only an owner can change roles')
    expect(whyNotSetRole(one, RAHIM.user_id, KARIM, 'staff')).toBe('Already staff')
  })

  it("a refusal from the database reads as words, without the function's name and status", async () => {
    const { RpcError } = await import('./supabase')
    expect(plainError(new RpcError(403, 'invite_member: 403 only an owner of this company can do that'))).toBe('Only an owner of this company can do that')
    expect(plainError(new Error('Failed to fetch'))).toBe('Failed to fetch')
  })

  it('the calls name the company, the person and the role; an invite keeps the email as the database answers it', async () => {
    const { inviteMember, orgPeople, removeMember, setMemberRole, cancelInvite, acceptInvites } = await import('./members')
    const calls: { url: string; body: unknown }[] = []
    const answers = ['"new@bti.com"', JSON.stringify(one), 'true', 'true', 'true', '1']
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string) })
        return new Response(answers.shift(), { status: 200 })
      }),
    )
    expect(await inviteMember('org-1', ' New@BTI.com', 'staff')).toBe('new@bti.com')
    expect(await orgPeople('org-1')).toEqual(one)
    await removeMember('org-1', 'u-karim')
    await setMemberRole('org-1', 'u-karim', 'owner')
    await cancelInvite('org-1', 'new@bti.com')
    expect(await acceptInvites()).toBe(1)
    expect(calls.map((c) => c.url.split('/rpc/')[1])).toEqual(['invite_member', 'org_people', 'remove_member', 'set_member_role', 'cancel_invite', 'accept_invites'])
    expect(calls[0].body).toEqual({ p_org: 'org-1', p_email: ' New@BTI.com', p_role: 'staff' })
    expect(calls[3].body).toEqual({ p_org: 'org-1', p_user: 'u-karim', p_role: 'owner' })
  })
})
