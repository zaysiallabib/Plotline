import { landingOrViewer } from '../landing/route'

/** The site's five pages; `missing` = an address that leads nowhere (the not-found page, no app chunk loaded). */
export type Route = 'landing' | 'viewer' | 'studio' | 'changes' | 'missing'

/** Which app an address opens: the Studio, the change list, the front page, a flat (`/u/…`, `/s/…`), or not found. */
export function routeOf(pathname: string, search: string): Route {
  if (/^\/studio(\/|$)/.test(pathname)) return 'studio'
  if (/^\/changes\/?$/.test(pathname)) return 'changes'
  if (pathname === '/') return landingOrViewer(pathname, search)
  return /^\/[us]\/[^/]+/.test(pathname) ? 'viewer' : 'missing'
}

/** The browser tab's name: "Plotline" alone, or "Type A · Plotline". */
export const pageTitle = (name?: string): string => (name?.trim() ? `${name.trim()} · Plotline` : 'Plotline')

/** The tab's name before an app knows more (the viewer names its flat once it has it). */
export const routeTitle = (r: Route): string => pageTitle({ landing: '', viewer: '', studio: 'Studio', changes: 'Change list', missing: 'Not found' }[r])
