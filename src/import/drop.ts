/**
 * The files of one drop on the Studio, folders walked (browser only: DataTransferItem.webkitGetAsEntry, in every browser
 * despite the name). The entries must be taken while the drop event runs — the DataTransfer is emptied after it — so this
 * reads them at once and walks the folders afterwards.
 */
import type { DropFile } from './bundle'

export function filesOfDrop(dt: DataTransfer): Promise<DropFile[]> {
  const entries: FileSystemEntry[] = []
  const loose: File[] = []
  for (const item of [...dt.items]) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry?.isDirectory) entries.push(entry)
    else {
      const f = item.getAsFile()
      if (f) loose.push(f)
    }
  }
  if (!dt.items.length) loose.push(...dt.files)
  return (async () => {
    const out: DropFile[] = loose.map((f) => ({ path: f.name, data: f }))
    const walk = async (e: FileSystemEntry, at: string): Promise<void> => {
      if (e.isFile) {
        const f = await new Promise<File>((ok, no) => (e as FileSystemFileEntry).file(ok, no))
        out.push({ path: at + e.name, data: f })
        return
      }
      const reader = (e as FileSystemDirectoryEntry).createReader()
      // a folder answers in batches (100 in Chrome) until it gives an empty one
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, no) => reader.readEntries(ok, no))
        if (!batch.length) break
        for (const c of batch) await walk(c, `${at}${e.name}/`)
      }
    }
    for (const e of entries) await walk(e, '')
    return out
  })()
}
