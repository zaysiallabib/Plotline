import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// ponytail: pathname switch instead of a router — two routes don't need one.
const Studio = lazy(() => import('./studio/StudioApp'))
const Viewer = lazy(() => import('./viewer/ViewerApp'))
const isStudio = location.pathname.startsWith('/studio')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot">Loading…</div>}>
      {isStudio ? <Studio /> : <Viewer />}
    </Suspense>
  </StrictMode>,
)
