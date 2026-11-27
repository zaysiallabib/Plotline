/**
 * The architect's file read off the page (session 31): a big IFC (60 MB+) or DXF used to freeze the Studio while it was
 * parsed (a 22 MB DXF kept the page busy for minutes). The page posts the bytes here, this posts back `{ stage, fraction }`
 * as it goes, then the result (an IFC shell's GLB moved, not copied) or `{ error }`. The page's Cancel ends the worker.
 * The readers load lazily: a DXF never loads web-ifc.
 */
import type { LayerRoles } from './plan2d'
import type { MaterialPicks } from './ifc'

onmessage = async (e: MessageEvent<{ bytes: ArrayBuffer; name: string; layerRoles?: LayerRoles; unitScale?: number; materials?: MaterialPicks }>) => {
  const { bytes, name, layerRoles, unitScale, materials } = e.data
  const progress = (stage: string, fraction: number | null) => postMessage({ stage, fraction })
  try {
    const result = /\.dxf$/i.test(name)
      ? await (await import('./dxf')).importDxf(new TextDecoder().decode(bytes), name, { layerRoles, progress, unitScale })
      : await (await import('./ifc')).importIfc(bytes, name, progress, materials)
    postMessage({ result }, { transfer: result.shell ? [result.shell.glb] : [] })
  } catch (err) {
    postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
