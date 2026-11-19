/**
 * Each project drawing's plan picture, by its unit id, in this browser's IndexedDB: the draft keeps only the open drawing's
 * picture (localStorage holds ~5 MB), so switching drawings brings each one's picture back from here.
 */
import type { Id } from '../core'
import type { PlanImage } from './model'

let db: Promise<IDBDatabase> | null = null
const open = () =>
  (db ??= new Promise((ok, no) => {
    const r = indexedDB.open('plotline', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('pictures')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  }))
const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest) =>
  open().then(
    (d) =>
      new Promise<T>((ok, no) => {
        const q = f(d.transaction('pictures', mode).objectStore('pictures'))
        q.onsuccess = () => ok(q.result as T)
        q.onerror = () => no(q.error)
      }),
  )

export const putPicture = (id: Id, pic: PlanImage) => run<void>('readwrite', (s) => s.put(pic, id))
export const getPicture = (id: Id) => run<PlanImage | undefined>('readonly', (s) => s.get(id))
export const deletePicture = (id: Id) => run<void>('readwrite', (s) => s.delete(id))
/** drawing `from`'s picture kept for drawing `to` too (a copy of the drawing); never fails */
export const copyPicture = (from: Id, to: Id): Promise<void> =>
  getPicture(from)
    .then((pic) => pic && putPicture(to, pic))
    .catch(() => {})
