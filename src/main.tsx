import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// ponytail: pathname switch instead of a router — three routes don't need one.
const Studio = lazy(() => import('./studio/StudioApp'))
const Viewer = lazy(() => import('./viewer/ViewerApp'))
const Changes = lazy(() => import('./viewer/ChangeList'))
const path = location.pathname

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Loading…</div>}>
      {path.startsWith('/studio') ? <Studio /> : path.startsWith('/changes') ? <Changes /> : <Viewer />}
    </Suspense>
  </StrictMode>,
)
