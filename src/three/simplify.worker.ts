/**
 * A furniture part simplified off the page's thread (furniture.ts simplified, Lite and Low's light copies): meshoptimizer
 * through three's SimplifyModifier, as the page did it — on Lite's first visit the page spent ~0.25 s of its start in it
 * (session 31 open lane). One part a message, its arrays copied in and handed back.
 */
import { BufferAttribute, BufferGeometry } from 'three'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { CutIn, CutOut, Part } from './furniture'

const simplifier = new SimplifyModifier()
const geometry = ({ index, attrs }: Part): BufferGeometry => {
  const g = new BufferGeometry()
  for (const [name, array, size, normalized] of attrs) g.setAttribute(name, new BufferAttribute(array, size, normalized))
  if (index) g.setIndex(new BufferAttribute(index, 1))
  return g
}

onmessage = async ({ data: { id, part, keep, tris } }: MessageEvent<CutIn>) => {
  try {
    const g = part.index ? geometry(part) : mergeVertices(geometry(part))
    const out = await simplifier.modify(g, Math.round(g.attributes.position.count * (1 - keep / tris)))
    const back: Part = { index: out.index!.array as Uint16Array | Uint32Array, attrs: Object.entries(out.attributes).map(([n, x]) => [n, (x as BufferAttribute).array as Part['attrs'][number][1], x.itemSize, x.normalized]) }
    postMessage({ id, part: back } satisfies CutOut, { transfer: [back.index!.buffer, ...back.attrs.map((a) => a[1].buffer)] })
  } catch (e) {
    postMessage({ id, error: String(e) } satisfies CutOut)
  }
}
