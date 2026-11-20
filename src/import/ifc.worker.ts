/**
 * The IFC reader off the page (session 31): a big file (60 MB+) used to freeze the Studio while web-ifc parsed it. The
 * page posts the bytes here, this posts back `{ stage, fraction }` as it goes, then the result (the shell's GLB moved, not
 * copied) or `{ error }`. The page's Cancel ends the worker.
 */
import { importIfc } from './ifc'

onmessage = async (e: MessageEvent<{ bytes: ArrayBuffer; name: string }>) => {
  try {
    const result = await importIfc(e.data.bytes, e.data.name, (stage, fraction) => postMessage({ stage, fraction }))
    postMessage({ result }, { transfer: result.shell ? [result.shell.glb] : [] })
  } catch (err) {
    postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
