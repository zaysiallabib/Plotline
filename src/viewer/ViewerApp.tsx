// Minimal dev mount for PlotlineScene. The real viewer UI replaces this.
import { useEffect, useRef, useState } from 'react'
import type { Unit } from '../core'
import { PlotlineScene, type PickHit, type SceneMode } from '../three/PlotlineScene'
import { TEST_UNIT } from '../three/testUnit'

const units = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>
const unit = Object.values(units)[0] ?? TEST_UNIT

export default function ViewerApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vrRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PlotlineScene | null>(null)
  const [hit, setHit] = useState<PickHit | null>(null)
  const [mode, setMode] = useState<SceneMode>('walk')
  const [hour, setHour] = useState(13)

  useEffect(() => {
    const scene = new PlotlineScene(canvasRef.current!)
    sceneRef.current = scene
    scene.onPick(setHit)
    try {
      scene.setUnit(unit)
    } catch (e) {
      console.error('[plotline] setUnit failed (core not implemented yet?)', e)
    }
    vrRef.current?.replaceChildren(scene.enableXR())
    return () => scene.dispose()
  }, [])

  const switchMode = (m: SceneMode) => {
    setMode(m)
    sceneRef.current?.setMode(m)
  }

  return (
    <>
      <canvas ref={canvasRef} style={{ width: '100vw', height: '100vh', display: 'block' }} />
      <div style={{ position: 'fixed', top: 12, left: 12, display: 'grid', gap: 8, background: 'var(--surface)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => switchMode('walk')} disabled={mode === 'walk'}>Walk</button>
          <button onClick={() => switchMode('orbit')} disabled={mode === 'orbit'}>Orbit</button>
          <div ref={vrRef} style={{ position: 'relative' }} />
        </div>
        <label>
          Hour {hour}
          <input type="range" min={6} max={18} step={0.5} value={hour} style={{ width: '100%' }}
            onChange={(e) => { const h = Number(e.target.value); setHour(h); sceneRef.current?.setTimeOfDay(h) }} />
        </label>
        <div style={{ color: 'var(--muted)' }}>WASD/arrows walk · shift run · double-click = mouse look (Esc frees) · click floor = go there</div>
        <pre style={{ margin: 0, maxWidth: 320, whiteSpace: 'pre-wrap' }}>{hit ? JSON.stringify(hit, null, 1) : 'click something'}</pre>
      </div>
    </>
  )
}
