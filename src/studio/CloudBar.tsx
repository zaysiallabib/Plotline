/**
 * The Studio top bar's account (session 30): Sign in → an email → "Check your email"; signed in, the save word
 * (Saved · Saving… · Offline, will retry · Not saved: …), the company's projects in the cloud (open, rename, delete,
 * earlier saves) and Sign out. What is open is saved to the cloud 2 s after the last change (lib/cloud.ts autosaver);
 * the browser's own copy keeps working as before. Nothing here shows when the site has no database (configured false).
 */
import { useEffect, useRef, useState } from 'react'
import { myOrg, signIn, signOut, useSession, type Org } from '../lib/auth'
import { autosaver, deleteProject, hashOf, itemKey, linkStore, listProjects, loadProject, loadVersion, projectHistory, renameProject, saveProject, statusWord } from '../lib/cloud'
import type { Autosaver, CloudItem, CloudRow, Kind, SavedVersion, Status } from '../lib/cloud'
import { configured } from '../lib/supabase'

interface Props {
  /** what is open, to save (null: nothing worth saving, e.g. an empty drawing); read when a save starts */
  snapshot: () => CloudItem | null
  /** changes whenever what is open may have changed */
  changed: unknown
  /** put a cloud project / drawing into the Studio in place of what is open; false = it could not be read */
  onOpen: (kind: Kind, data: unknown) => boolean
  /** rename what is open (its name lives in the Studio; the next save takes it to the cloud) */
  onRenameOpen: (name: string) => void
  toast: (text: string) => void
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function CloudBar(p: Props) {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const [org, setOrg] = useState<Org | null | undefined>(undefined)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const saver = useRef<Autosaver | null>(null)
  const props = useRef(p)
  props.current = p
  const user = session?.user.id

  // the company, once per person signed in
  useEffect(() => {
    setOrg(undefined)
    if (!user) return
    let live = true
    myOrg()
      .then((o) => live && setOrg(o))
      .catch(() => live && setOrg(null))
    return () => void (live = false)
  }, [user])

  // signed in and in a company: save what is open, 2 s after each change
  useEffect(() => {
    setStatus({ kind: 'idle' })
    if (!user || !org) return
    const s = autosaver({
      snapshot: () => props.current.snapshot(),
      save: (item, link, over) => saveProject(org.id, item, link, over),
      links: linkStore(user),
      onStatus: setStatus,
    })
    saver.current = s
    s.touch()
    const online = () => s.touch()
    addEventListener('online', online)
    return () => {
      removeEventListener('online', online)
      s.stop()
      saver.current = null
    }
  }, [user, org])
  useEffect(() => saver.current?.touch(), [p.changed])

  if (!configured || session === undefined) return null
  const word = session && org === null ? 'Not saved: not in a company yet' : statusWord(status)
  return (
    <>
      {word && (
        <span className={`cloud-status ${status.kind}`} title={status.kind === 'saved' ? 'In the cloud for your company, and in this browser' : undefined}>
          {word}
        </span>
      )}
      <button title={session ? 'Your account and your company’s projects in the cloud' : 'Sign in to keep your work in the cloud for your company'} onClick={() => setOpen((v) => !v)}>
        {session ? (session.user.email ?? 'Account') : 'Sign in'}
      </button>
      {open && (
        <div className="popover project cloud" onKeyDown={(e) => e.stopPropagation()}>
          <div className="head">
            <strong>{session ? 'Your account' : 'Sign in'}</strong>
            <button className="link" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {session ? <SignedIn email={session.user.email ?? ''} user={session.user.id} org={org} status={status} saver={saver.current} bar={p} /> : <SignInForm />}
        </div>
      )}
    </>
  )
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (sent)
    return (
      <>
        <p>
          <b>Check your email.</b> We sent a sign-in link to {sent}. Open it on this computer, in this browser: the Studio opens signed in.
        </p>
        <p className="muted">No email after a few minutes? Look in spam, then try again.</p>
        <button onClick={() => setSent(null)}>Use another email</button>
      </>
    )
  const send = async () => {
    const e = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError('Type your whole email address')
    setBusy(true)
    setError(null)
    try {
      await signIn(e)
      setSent(e)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <p>Your work is kept in this browser. Sign in to also keep it in the cloud for your company — saved as you work, every save kept. No password: we email you a link.</p>
      <label>
        <span>Email</span>
        <input type="email" autoFocus autoComplete="email" value={email} placeholder="you@company.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} />
      </label>
      {error && <p className="cloud-error">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send me a link'}
        </button>
      </div>
    </>
  )
}

function SignedIn({ email, user, org, status, saver, bar }: { email: string; user: string; org: Org | null | undefined; status: Status; saver: Autosaver | null; bar: Props }) {
  const [rows, setRows] = useState<CloudRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ row: CloudRow; saves: SavedVersion[] } | null>(null)
  const openKey = bar.snapshot()?.key
  const links = linkStore(user)
  const openId = openKey ? links.get(openKey)?.id : undefined
  const isOpen = (r: CloudRow) => r.id === openId

  const refresh = () => {
    if (!org) return
    setError(null)
    listProjects(org.id)
      .then(setRows)
      .catch((e: Error) => setError(`Could not read the cloud: ${e.message}`))
  }
  useEffect(refresh, [org?.id, status.kind === 'saved']) // eslint-disable-line react-hooks/exhaustive-deps

  /** into the Studio: what is open is saved first; then this browser remembers where the opened one lives */
  const open = async (id: string, version?: number) => {
    try {
      await saver?.flush()
      const left = saver?.status().kind
      const theirs = left === 'stale' && id === openId // "Open theirs": dropping mine is the point
      if (bar.snapshot() && left !== 'saved' && !theirs && !window.confirm('What is open now is not saved in the cloud yet. Replace it anyway? (Export it first if you need it.)')) return
      const row = await loadProject(id)
      const data = version === undefined ? row.data : await loadVersion(id, version)
      if (!bar.onOpen(row.kind, data)) return setError('That one could not be read: it may be from a newer Plotline')
      // an earlier save opens on top of the newest, unsaved: its next save makes it the newest again (nothing is lost)
      const key = itemKey(row.kind, (data as { id?: string }).id ?? row.id)
      links.set(key, { id: row.id, version: row.version, hash: version === undefined ? hashOf(JSON.stringify(data)) : '' })
      setHistory(null)
      bar.toast(version === undefined ? `Opened ${row.name} from the cloud` : `Opened the save of ${row.name} from version ${version} — it becomes the newest when it saves`)
    } catch (e) {
      setError(`Could not open it: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const rename = async (r: CloudRow) => {
    const name = window.prompt('New name', r.name)?.trim()
    if (!name || name === r.name) return
    if (isOpen(r)) return bar.onRenameOpen(name)
    try {
      await renameProject(r.id, name)
      refresh()
    } catch (e) {
      setError(`Could not rename it: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const remove = async (r: CloudRow) => {
    if (!window.confirm(`Delete "${r.name}" from the cloud for everyone in ${org?.name ?? 'your company'}? This browser keeps its own copy, and every save stays in the history.`)) return
    try {
      await deleteProject(r.id)
      refresh()
    } catch (e) {
      setError(`Could not delete it: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <>
      <p>
        {email}
        {org && (
          <span className="muted">
            {' '}
            · {org.name} ({org.role})
          </span>
        )}
      </p>
      {org === null && <p>Your account is not in a company yet. Ask your company’s owner to add {email} — your work stays in this browser until then.</p>}
      {(status.kind === 'stale' || status.kind === 'gone') && (
        <div className="cloud-conflict">
          <p>
            <b>Not saved:</b> {status.reason}.
          </p>
          <div className="actions">
            {status.kind === 'stale' && openId && (
              <button onClick={() => void open(openId!)} title="Their newer copy replaces yours here (yours is not in the cloud)">
                Open theirs
              </button>
            )}
            <button className="primary" onClick={() => void saver?.keepMine()} title={status.kind === 'stale' ? 'Saved on top: theirs stays in the history' : 'Saved to the cloud again, as a new project'}>
              {status.kind === 'stale' ? 'Keep mine' : 'Save as new'}
            </button>
          </div>
        </div>
      )}
      {org && (
        <>
          <span className="cloud-h">Projects in the cloud</span>
          {rows === null && !error && <p className="muted">Loading…</p>}
          {rows?.length === 0 && <p className="muted">None yet. What you open in the Studio is saved here as you work.</p>}
          <ul className="cloud-list">
            {rows?.map((r) => (
              <li key={r.id} className={isOpen(r) ? 'here' : ''}>
                <span className="name" title={r.name}>
                  {r.name}
                </span>
                <span className="muted small">
                  {r.kind === 'project' ? 'Building' : 'Drawing'} · {when(r.updated_at)}
                  {r.updated_by && r.updated_by !== user ? ' · by a colleague' : ''}
                  {isOpen(r) ? ' · open now' : ''}
                </span>
                <span className="acts">
                  {!isOpen(r) && <button onClick={() => void open(r.id)}>Open</button>}
                  <button onClick={() => void rename(r)}>Rename</button>
                  <button onClick={() => void projectHistory(r.id).then((saves) => setHistory({ row: r, saves }), (e: Error) => setError(e.message))}>Earlier saves</button>
                  {!isOpen(r) && <button onClick={() => void remove(r)}>Delete</button>}
                </span>
              </li>
            ))}
          </ul>
          {history && (
            <div className="cloud-history">
              <span className="cloud-h">Earlier saves of {history.row.name}</span>
              <ul className="cloud-list">
                {history.saves.map((v) => (
                  <li key={v.version}>
                    <span className="name">
                      Version {v.version}
                      {v.deleted ? ' (deleted)' : ''}
                    </span>
                    <span className="muted small">
                      {when(v.saved_at)} · {v.saved_by === user ? 'you' : 'a colleague'}
                    </span>
                    <span className="acts">
                      <button onClick={() => void open(history.row.id, v.version)}>Open this save</button>
                    </span>
                  </li>
                ))}
              </ul>
              <button className="link" onClick={() => setHistory(null)}>
                Hide earlier saves
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="cloud-error">{error}</p>}
      <div className="actions">
        <button
          onClick={async () => {
            await saver?.flush()
            await signOut()
          }}
        >
          Sign out
        </button>
      </div>
    </>
  )
}
