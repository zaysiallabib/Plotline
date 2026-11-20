/**
 * Two panes of the account card (CloudBar.tsx, session 31): Members — the company's people, owner or staff, the invites
 * not taken up yet, and for an owner Invite / Make owner / Make staff / Remove / Take back (lib/members.ts says which are
 * allowed and why not; the database refuses the same) — and Links: every buyer link made from what is open, when, by
 * whom, how often buyers opened it, with Copy link and Turn off. Only shown signed in to a company.
 */
import { useEffect, useState } from 'react'
import type { Org } from '../lib/auth'
import { cancelInvite, inviteMember, orgPeople, plainError, removeMember, setMemberRole, whyNotInvite, whyNotRemove, whyNotSetRole, type People, type Role } from '../lib/members'
import { projectLinks, revokeLink, type ProjectLink } from '../lib/supabase'
import { ask } from '../lib/ask'

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function Members({ org, me }: { org: Org; me: string }) {
  const [people, setPeople] = useState<People | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [invited, setInvited] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => orgPeople(org.id).then(setPeople, (e: unknown) => setError(`Could not read the members: ${plainError(e)}`))
  useEffect(() => void load(), [org.id]) // eslint-disable-line react-hooks/exhaustive-deps
  /** one change, then the list as the database has it now */
  const act = async (f: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await f()
    } catch (e) {
      setError(plainError(e))
    } finally {
      await load()
      setBusy(false)
    }
  }

  const owner = people?.members.find((m) => m.user_id === me)?.role === 'owner'
  const whyInvite = people && email.trim() ? whyNotInvite(people, me, email) : null
  const invite = () =>
    act(async () => {
      if (!people || whyNotInvite(people, me, email)) return
      setInvited(await inviteMember(org.id, email, role))
      setEmail('')
    })
  const studio = `${location.origin}/studio`

  return (
    <>
      <span className="cloud-h">People in {org.name}</span>
      {people === null && !error && <p className="muted">Loading…</p>}
      <ul className="cloud-list">
        {people?.members.map((m) => {
          const flip: Role = m.role === 'owner' ? 'staff' : 'owner'
          const whyRole = whyNotSetRole(people, me, m, flip)
          const whyRemove = whyNotRemove(people, me, m)
          return (
            <li key={m.user_id} className={m.user_id === me ? 'here' : ''}>
              <span className="name" title={m.email}>
                {m.email}
                {m.user_id === me ? ' (you)' : ''}
              </span>
              <span className="muted small">
                {m.role === 'owner' ? 'Owner' : 'Staff'} · since {day(m.since)}
              </span>
              {/* only what may be done shows (yourself: never Remove; the only owner: never Make staff) */}
              {owner && (!whyRole || !whyRemove) && (
                <span className="acts">
                  {!whyRole && (
                    <button
                      disabled={busy}
                      title={flip === 'owner' ? 'Owners can also invite and remove people' : 'Staff do the work; only owners invite and remove people'}
                      onClick={async () => {
                        if (m.user_id === me && !(await ask('Make yourself staff? You will no longer be able to invite or remove people.', 'Make me staff'))) return
                        void act(() => setMemberRole(org.id, m.user_id, flip))
                      }}
                    >
                      {flip === 'owner' ? 'Make owner' : 'Make staff'}
                    </button>
                  )}
                  {!whyRemove && (
                    <button
                      className="danger"
                      disabled={busy}
                      title="They keep their account but reach nothing of the company’s; everything they saved stays"
                      onClick={async () => {
                        if (!(await ask(`Remove ${m.email} from ${org.name}? They keep their account but reach nothing of the company’s from now on. Everything they saved stays with the company.`, 'Remove', true))) return
                        void act(() => removeMember(org.id, m.user_id))
                      }}
                    >
                      Remove
                    </button>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {!!people?.invites.length && (
        <>
          <span className="cloud-h">Invited, not signed in yet</span>
          <ul className="cloud-list">
            {people.invites.map((i) => (
              <li key={i.email}>
                <span className="name" title={i.email}>
                  {i.email}
                </span>
                <span className="muted small">
                  {i.role === 'owner' ? 'Owner' : 'Staff'} · invited {day(i.since)}
                </span>
                {owner && (
                  <span className="acts">
                    <button disabled={busy} title="They will not join when they sign in" onClick={() => void act(() => cancelInvite(org.id, i.email))}>
                      Take back
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {people &&
        (owner ? (
          <>
            <span className="cloud-h">Invite someone</span>
            <label>
              <span>Their work email</span>
              <input type="email" autoComplete="off" value={email} placeholder="name@company.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void invite()} />
            </label>
            <div className="seg" role="group" aria-label="Their role">
              {(['staff', 'owner'] as const).map((r) => (
                <button
                  key={r}
                  className={role === r ? 'on' : ''}
                  aria-pressed={role === r}
                  title={r === 'owner' ? 'Can also invite and remove people' : 'Does the work: tracing, saving, sharing'}
                  onClick={() => setRole(r)}
                >
                  {r === 'owner' ? 'Owner' : 'Staff'}
                </button>
              ))}
            </div>
            {whyInvite && <p className="muted">{whyInvite}</p>}
            <div className="actions">
              <button className="primary" disabled={busy || !email.trim() || !!whyInvite} onClick={() => void invite()}>
                Invite
              </button>
            </div>
            {invited && (
              <div className="cloud-note">
                <p>
                  <b>Invited {invited}.</b> Plotline sends no email of its own: tell them to open {studio}, click ⋯ → Sign in and use this email. They join {org.name} the moment they sign in.
                </p>
                <button className="link" onClick={() => void navigator.clipboard?.writeText(`Open ${studio}, click ⋯ → Sign in and use ${invited}: you join ${org.name} on Plotline when you sign in.`)}>
                  Copy this for them
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="muted">Only an owner can invite or remove people.</p>
        ))}
      {error && <p className="cloud-error">{error}</p>}
    </>
  )
}

export function Links({ project, me }: { project: string | undefined; me: string }) {
  const [links, setLinks] = useState<ProjectLink[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const load = () => {
    if (project) projectLinks(project).then(setLinks, (e: unknown) => setError(`Could not read the links: ${plainError(e)}`))
  }
  useEffect(load, [project]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!project) return <p className="muted">What is open is not in the cloud yet. Once it has saved, the buyer links made from it show here.</p>

  const url = (t: string) => `${location.origin}/s/${t}`
  const turnOff = async (l: ProjectLink) => {
    if (!(await ask(`Turn off this link to ${l.unit_name}? Whoever has it is told it no longer works; what they wrote stays in the Change list. It cannot be turned back on — make a new link instead.`, 'Turn off', true))) return
    setError(null)
    try {
      if (!(await revokeLink(l.token))) setError('That link could not be turned off (it is off already).')
    } catch (e) {
      setError(`Could not turn it off: ${plainError(e)}`)
    }
    load()
  }

  return (
    <>
      <span className="cloud-h">Buyer links made from this</span>
      {links === null && !error && <p className="muted">Loading…</p>}
      {links?.length === 0 && <p className="muted">None yet. ⋯ → Share link makes one.</p>}
      <ul className="cloud-list">
        {links?.map((l) => (
          <li key={l.token} className={l.revoked_at ? 'off' : ''}>
            <span className="name" title={url(l.token)}>
              {l.unit_name}
              {l.floor !== null ? ` · floor ${l.floor}` : ''}
            </span>
            <span className="muted small">
              Made {when(l.created_at)} by {l.created_by === me ? 'you' : (l.by_email ?? 'a colleague')}
            </span>
            <span className="muted small">
              {l.views ? `Opened ${plural(l.views, 'time')}, last ${when(l.last_viewed_at ?? l.created_at)}` : 'Not opened yet'} · {plural(l.events, 'note or choice', 'notes or choices')}
              {l.revoked_at ? ` · turned off ${when(l.revoked_at)}` : ''}
            </span>
            {!l.revoked_at && (
              <span className="acts">
                <button onClick={() => void navigator.clipboard?.writeText(url(l.token)).then(() => setCopied(l.token))}>{copied === l.token ? 'Copied' : 'Copy link'}</button>
                <button className="danger" onClick={() => void turnOff(l)}>
                  Turn off
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!!links?.length && (
        <p className="muted small">
          Opens by your own company are not counted. Every note and choice, with prices:{' '}
          <a href="/changes" target="_blank" rel="noreferrer">
            Change list
          </a>
          .
        </p>
      )}
      {error && <p className="cloud-error">{error}</p>}
    </>
  )
}
