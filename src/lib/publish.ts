/**
 * A buyer link (`/s/<token>`): the flat as given goes to the online database and the link comes back — the Studio's ⋯ → Share
 * link (the drawing, with its own picks) and staff's Share in the 3D view (this flat on its floor, with what is kept for it).
 * Every call makes a new link (append-only: a client keeps seeing what he was sent). Signed in to a company: made as its
 * member (lib/auth); else the old staff key, asked for once per browser (until the founder deletes it: Docs/SETUP_ACCOUNTS.md).
 */
import type { Configuration, Id, Unit } from '../core'
import { projectWith, readProjects } from '../data/building/projects'
import { askText } from './ask'
import { myOrg, session } from './auth'
import { itemKey, linkStore } from './cloud'
import { forShare } from './library'
import { RpcError, publishUnit, shareUnit } from './supabase'

/**
 * The cloud row this browser saved drawing `unitId` in — its Studio project's, else the loose drawing's own (the keys the
 * Studio's autosave uses) — or undefined (signed out, never saved): a link made in the 3D view names it, so the Studio's
 * Links list shows that link with the ones made in the Studio.
 */
export async function savedIn(unitId: Id): Promise<string | undefined> {
  const me = await session()
  const p = me && projectWith(readProjects(), unitId)
  return me ? linkStore(me.user.id).get(itemKey(p ? 'project' : 'unit', p ? p.id : unitId))?.id : undefined
}

/** the staff key, kept in this browser once typed (ChangeList reads it too) */
export const PUBLISH_KEY = 'plotline.staffKey'

/** the staff key was wrong: forgotten, so the next Share asks again */
export class WrongKey extends Error {}

/** What a link stores: the flat with its furniture as laid out, the staff's own pieces' records, the finishes it opens with (none: the catalog's). */
export const linkUnit = (unit: Unit, finishes: Configuration | null, library: unknown[] = []): Unit & { library?: unknown[]; finishes?: Configuration } => ({
  ...unit,
  ...(library.length ? { library } : {}),
  ...(finishes && Object.keys(finishes).length ? { finishes } : {}),
})

/**
 * Publishes `unit` (its furniture baked in) opening with `finishes`; `at()` (signed in only): what it was made from, for the
 * change list. The link's address; null when the staff key was asked for and he cancelled. Throws WrongKey, or as the
 * database does.
 */
export async function publishLink(unit: Unit, finishes: Configuration | null, at: () => Promise<{ project?: string; stem?: string; floor?: number }> = async () => ({})): Promise<string | null> {
  const org = await myOrg().catch(() => null)
  let key = ''
  if (!org) {
    key = localStorage.getItem(PUBLISH_KEY) ?? ''
    if (!key) {
      key = (await askText('Type the staff key (printed when the online database was set up). Or Cancel, then Sign in at the top right to share as your company.', { placeholder: 'Staff key' }, 'Share'))?.trim() ?? ''
      if (!key) return null
      localStorage.setItem(PUBLISH_KEY, key)
    }
  }
  // the staff's own pieces / finishes are not in a buyer's browser: their records go with it (their files online first: lib/library.ts)
  const u = linkUnit(unit, finishes, await forShare(unit))
  try {
    const token = org ? await shareUnit(org.id, u, await at()) : await publishUnit(u, key)
    return `${location.origin}/s/${token}`
  } catch (e) {
    if (!org && e instanceof RpcError && (e.status === 401 || e.status === 403)) {
      localStorage.removeItem(PUBLISH_KEY)
      throw new WrongKey('Wrong staff key — click Share again to retype it.')
    }
    throw e
  }
}
