/**
 * The architect's outside shapes (core Shell: the Unit keeps only the id and where it stands), each a GLB by its id in
 * this browser's IndexedDB — the pictures.ts pattern, in its own database so pictures.ts's version stays as it is.
 */
import type { Id } from '../core'

let db: Promise<IDBDatabase> | null = null
const open = () =>
  (db ??= new Promise((ok, no) => {
    const r = indexedDB.open('plotline-shells', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('shells')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  }))
const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest) =>
  open().then(
    (d) =>
      new Promise<T>((ok, no) => {
        const q = f(d.transaction('shells', mode).objectStore('shells'))
        q.onsuccess = () => ok(q.result as T)
        q.onerror = () => no(q.error)
      }),
  )

export const putShell = (id: Id, glb: ArrayBuffer) => run<void>('readwrite', (s) => s.put(glb, id))
export const getShell = (id: Id) => run<ArrayBuffer | undefined>('readonly', (s) => s.get(id))
export const deleteShell = (id: Id) => run<void>('readwrite', (s) => s.delete(id))
