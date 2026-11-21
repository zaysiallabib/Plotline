import { describe, expect, test } from 'vitest'
import { filesOfDrop } from './drop'

// A folder dragged from the desktop, as the browser hands it over: one item whose entry is a folder; its reader answers
// in batches (100 in Chrome; 2 here), then an empty one. Firefox reads the same tree; headless it cannot be dragged in.
type Node = { name: string; kids?: Node[] }
const entry = (n: Node): FileSystemEntry =>
  (n.kids
    ? {
        name: n.name,
        isFile: false,
        isDirectory: true,
        createReader: () => {
          let i = 0
          return { readEntries: (ok: (b: FileSystemEntry[]) => void) => setTimeout(() => ok(n.kids!.slice(i, (i += 2)).map(entry))) }
        },
      }
    : { name: n.name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => setTimeout(() => ok(new File([n.name], n.name))) }) as unknown as FileSystemEntry
const drop = (items: { entry?: Node; file?: string }[]): DataTransfer =>
  ({
    items: items.map((it) => ({ kind: 'file', webkitGetAsEntry: () => (it.entry ? entry(it.entry) : null), getAsFile: () => (it.file ? new File(['x'], it.file) : null) })),
    files: [],
  }) as unknown as DataTransfer

describe('a dropped folder is walked, its files named by their path in it (session 31: "your own piece" from a folder)', () => {
  test('every file of every folder, in batches, with the folder path; a loose file beside it as it is', async () => {
    const chair: Node = {
      name: 'armchair_01',
      kids: [{ name: 'ArmChair_01.bin' }, { name: 'ArmChair_01_1k.gltf' }, { name: 'textures', kids: [{ name: 'a.jpg' }, { name: 'b.jpg' }, { name: 'c.jpg' }] }],
    }
    const got = await filesOfDrop(drop([{ entry: chair }, { file: 'notes.txt' }]))
    expect(got.map((f) => f.path).sort()).toEqual(['armchair_01/ArmChair_01.bin', 'armchair_01/ArmChair_01_1k.gltf', 'armchair_01/textures/a.jpg', 'armchair_01/textures/b.jpg', 'armchair_01/textures/c.jpg', 'notes.txt'])
    expect(await got.find((f) => f.path.endsWith('b.jpg'))!.data.text()).toBe('b.jpg')
  })
})
