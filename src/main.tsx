import { StrictMode, lazy, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ErrorCard, NotFound, Skeleton } from './lib/pages'
import { routeOf, routeTitle } from './lib/route'

// ponytail: pathname switch instead of a router — five routes don't need one.
/** the staff's own pieces and finishes known before a flat is built (lib/library.ts; never fails, at most a few seconds) */
const own = () => import('./lib/library').then((l) => l.ready)
const Studio = lazy(() => Promise.all([import('./studio/StudioApp'), own()]).then(([m]) => m))
const Viewer = lazy(() => Promise.all([import('./viewer/ViewerApp'), own()]).then(([m]) => m))
const Changes = lazy(() => Promise.all([import('./viewer/ChangeList'), own()]).then(([m]) => m)) // its own options' prices
const Landing = lazy(() => import('./landing/Landing'))
const route = routeOf(location.pathname, location.search)
const App = { studio: Studio, viewer: Viewer, changes: Changes, landing: Landing, missing: NotFound }[route]
document.title = routeTitle(route)

/** Dev only (gone from a production build): `?boom=1` breaks the page 3 s after it opens, to see the error card. */
const BOOM = import.meta.env.DEV && new URLSearchParams(location.search).has('boom')
function Boom() {
  const [now, setNow] = useState(false)
  useEffect(() => void setTimeout(() => setNow(true), 3000), [])
  if (now) throw new Error('?boom=1 — a test of the error card')
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorCard>
      <Suspense fallback={<Skeleton kind={route === 'studio' || route === 'viewer' ? route : 'page'} />}>
        {BOOM && <Boom />}
        <App />
      </Suspense>
    </ErrorCard>
  </StrictMode>,
)
