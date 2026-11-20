import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { landingOrViewer } from './landing/route'

// ponytail: pathname switch instead of a router — four routes don't need one.
/** the staff's own pieces and finishes known before a flat is built (lib/library.ts; never fails, at most a few seconds) */
const own = () => import('./lib/library').then((l) => l.ready)
const Studio = lazy(() => Promise.all([import('./studio/StudioApp'), own()]).then(([m]) => m))
const Viewer = lazy(() => Promise.all([import('./viewer/ViewerApp'), own()]).then(([m]) => m))
const Changes = lazy(() => Promise.all([import('./viewer/ChangeList'), own()]).then(([m]) => m)) // its own options' prices
const Landing = lazy(() => import('./landing/Landing'))
const path = location.pathname

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Loading…</div>}>
      {path.startsWith('/studio') ? <Studio /> : path.startsWith('/changes') ? <Changes /> : landingOrViewer(path, location.search) === 'landing' ? <Landing /> : <Viewer />}
    </Suspense>
  </StrictMode>,
)
