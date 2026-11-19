/**
 * The staff change list (`/changes`, session 18 ask 8): per share link, newest first, who asked what — notes on objects
 * and finish choices with their BDT deltas — the buyer's current choices and their total on top, replaced / removed rows
 * greyed (never rewritten: invariant 6), Export CSV. Signed in (the Studio's Sign in, session 30): the company's links,
 * each can be turned off. Not signed in: the links made before accounts, with the staff key (the one the Studio's
 * Share link asks for, kept in this browser as `plotline.staffKey`).
 */
import { useCallback, useEffect, useState } from 'react'
import { myOrg, useSession, type Org } from '../lib/auth'
import { byLink, choiceOf, describe, eventsForOrg, eventsForStaff, toCsv, whoNames, type CommentPayload, type StaffData } from '../lib/events'
import { RpcError, configured, revokeLink } from '../lib/supabase'
import { formatDelta } from './share'
import './viewer.css'

const KEY = 'plotline.staffKey'
const getKey = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export default function ChangeList() {
  const session = useSession()
  const [org, setOrg] = useState<Org | null | undefined>(undefined)
  const [key, setKey] = useState(getKey)
  const [data, setData] = useState<StaffData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session === undefined) return
    if (!session) return setOrg(null)
    let live = true
    myOrg()
      .then((o) => live && setOrg(o))
      .catch(() => live && setOrg(null))
    return () => void (live = false)
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** the company's list when signed in to one, else the old staff key's */
  const load = useCallback(async (k: string, member: boolean) => {
    if (!member && !k) return
    setBusy(true)
    setError(null)
    try {
      setData(await (member ? eventsForOrg() : eventsForStaff(k)))
    } catch (e) {
      if (!member && e instanceof RpcError && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem(KEY)
        setKey('')
        setError('Wrong staff key — type it again.')
      } else setError(`Could not load the change list: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => void (org !== undefined && load(key, !!org)), [key, org, load])

  const turnOff = async (token: string, name: string) => {
    if (!window.confirm(`Turn off this link to ${name}? Whoever has it sees "This unit isn't available" from now on; what they wrote stays here. It cannot be turned back on — make a new link instead.`)) return
    try {
      if (!(await revokeLink(token))) setError('That link could not be turned off (it is off already, or not your company’s).')
      await load(key, true)
    } catch (e) {
      setError(`Could not turn it off: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const exportCsv = () => {
    if (!data) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCsv(data, location.origin)], { type: 'text/csv;charset=utf-8' }))
    a.download = `plotline-change-list-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  if (!configured)
    return <div className="boot">The change list needs the database: add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (Vercel → Environment variables), then redeploy.</div>
  if (org === undefined) return <div className="boot">Loading…</div>
  if (!org && !key)
    return (
      <form
        className="boot changes-key"
        onSubmit={(e) => {
          e.preventDefault()
          const k = String(new FormData(e.currentTarget).get('key') ?? '').trim()
          if (!k) return
          localStorage.setItem(KEY, k)
          setKey(k)
        }}
      >
        <div>
          <h1>Change list</h1>
          <p className="muted">{session ? 'Your account is not in a company yet, so this list cannot show your company’s links. ' : 'Signed-in staff: sign in in the Studio (top right) and this list shows your company’s links. '}Links made before accounts open with the staff key (the one printed when the database was set up):</p>
          <input name="key" type="password" autoFocus autoComplete="off" />
          <button className="btn primary">Open</button>
          {error && <p className="refused">{error}</p>}
        </div>
      </form>
    )

  const links = data ? byLink(data) : []
  const who = whoNames(data?.events ?? [])
  const notes = links.reduce((t, l) => t + l.notes, 0)
  const choices = links.reduce((t, l) => t + l.current.length, 0)
  return (
    <div className="changes">
      <header>
        <h1>Change list{org ? ` · ${org.name}` : ''}</h1>
        <span className="muted">{data ? `${links.length} link${links.length === 1 ? '' : 's'} · ${notes} open note${notes === 1 ? '' : 's'} · ${choices} finish choice${choices === 1 ? '' : 's'}` : busy ? 'Loading…' : ''}</span>
        <span className="grow" />
        <button className="btn" disabled={busy} onClick={() => void load(key, !!org)}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
        <button className="btn primary" disabled={!data?.events.length} onClick={exportCsv}>
          Export CSV
        </button>
      </header>
      {error && <p className="refused">{error}</p>}
      {data && !links.length && <p className="muted">No links yet. In the Studio, Share link publishes a draft and copies its buyer link.</p>}
      {links.map((l) => (
        <section key={l.token} className="glass link-card">
          <div className="link-head">
            <div>
              <div className="unit-title">{l.unit_name}</div>
              <div className="muted small">
                Link made {when(l.created_at)}
                {l.revoked_at && <span className="tag">turned off {when(l.revoked_at)}</span>}
              </div>
            </div>
            <span className="grow" />
            <a className="btn" href={`/s/${l.token}`} target="_blank" rel="noreferrer">
              Open link
            </a>
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(`${location.origin}/s/${l.token}`)}>
              Copy link
            </button>
            {org && !l.revoked_at && (
              <button className="btn" title="The link stops opening; what the buyer wrote stays" onClick={() => void turnOff(l.token, l.unit_name)}>
                Turn off
              </button>
            )}
          </div>
          {!l.events.length ? (
            <p className="muted small">No notes or finish choices on this link yet.</p>
          ) : (
            <>
              {l.current.length > 0 && (
                <div className="chosen">
                  <span className="label">Chosen finishes</span>
                  {l.current.map((p) => {
                    const c = choiceOf(p)
                    return (
                      <span key={p.key ?? p.slotId} className="chosen-item">
                        {p.scope ?? p.slotLabel}: <b>{c.label}</b> {formatDelta(c.deltaBdt)}
                      </span>
                    )
                  })}
                  <span className="chosen-item">
                    Options total: <b>{formatDelta(l.totalBdt)}</b>
                  </span>
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>About</th>
                    <th>Note / choice</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {l.events.map((e) => {
                    const d = describe(e)
                    const removed = e.kind === 'comment' && (e.payload as CommentPayload).removed
                    return (
                      <tr key={e.id} className={e.superseded ? 'superseded' : ''} title={e.superseded ? (e.kind === 'selection' ? 'Replaced by a later choice' : 'Removed or replaced by the buyer') : undefined}>
                        <td className="nowrap">{when(e.created_at)}</td>
                        <td>{who(e)}</td>
                        <td>{d.what}</td>
                        <td className={removed ? 'muted' : ''}>
                          {e.kind === 'selection' ? `${d.detail} · ${d.brand}` : d.detail}
                          {e.superseded && <span className="tag">{e.kind === 'selection' ? 'replaced' : 'removed'}</span>}
                        </td>
                        <td className="num nowrap">{d.deltaBdt === null ? '' : formatDelta(d.deltaBdt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      ))}
    </div>
  )
}
