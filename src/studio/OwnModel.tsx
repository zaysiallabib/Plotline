/**
 * "Add your own…" (the library's top, Studio tool F and the 3D view's Add): a 3D model of the staff's own into the
 * library in one box — drop or choose the file, see it turn with its size, say its name, kind, front, where it sits and
 * its real size (the measured one filled in; one side typed scales the rest), Add. The same box edits a piece added
 * before (⋯ → Rename / Change size). Rules: furnish/own.ts; where it is kept: lib/library.ts. Esc or × closes it.
 */
import { useEffect, useRef, useState } from 'react'
import { formatFeetInches, newId, parseLength } from '../core'
import { CATEGORIES, facing, furnitureScale, MAX_MODEL_BYTES, modelRefusal, nameOf, scaledTo, type Front, type OwnModel, type Sits } from '../furnish/own'
import type { DropFile } from '../import/bundle'
import { filesOfDrop } from '../import/drop'
import { fileOf, hashOf, saveOwn } from '../lib/library'
import type { Turntable } from './turntable'
import './own.css'

type Size3 = { x: number; y: number; z: number }
const MODEL = /\.(glb|gltf|obj|fbx|dae|stl)$/i
/** a model, or the files it keeps beside it (a .gltf's .bin and pictures, an .obj's .mtl), or a .zip of them */
const ACCEPT = '.glb,.gltf,.obj,.fbx,.dae,.stl,.zip,.bin,.mtl,.png,.jpg,.jpeg,.webp'
const SITS: { id: Sits; label: string }[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'wall', label: 'Wall' },
  { id: 'ceiling', label: 'Ceiling' },
  { id: 'table', label: 'On a table' },
]
/** the four arrows: the side of the model as it first turns toward you (glTF +z), its back, its right and left sides */
const FRONTS: { id: Front; arrow: string; title: string; at: string }[] = [
  { id: '-z', arrow: '↑', title: 'The side away from you', at: 'up' },
  { id: '-x', arrow: '←', title: 'The side on your left', at: 'left' },
  { id: '+x', arrow: '→', title: 'The side on your right', at: 'right' },
  { id: '+z', arrow: '↓', title: 'The side facing you', at: 'down' },
]
const AXES: { k: keyof Size3; label: string }[] = [
  { k: 'x', label: 'Width' },
  { k: 'z', label: 'Depth' },
  { k: 'y', label: 'Height' },
]
const ft = formatFeetInches
const m2 = (v: number) => v.toFixed(2)
/** "a .gltf that keeps its parts in other files", "Draco", or the loader's own words, in plain words */
function readError(name: string, e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/\.gltf$/i.test(name) && /keeps its 3D|buffer|fetch|load|404|uri/i.test(m))
    return 'This .gltf keeps its parts in other files (.bin, pictures). Drop them together: its whole folder, a .zip of it, or all its files at once.'
  return `Plotline could not read ${name}: ${m}`
}

export function OwnModelDialog({ edit, focus, onClose, onSaved }: { edit?: OwnModel; focus?: 'name' | 'size'; onClose: () => void; onSaved: (m: OwnModel, where: 'online' | 'here' | 'page') => void }) {
  const dlg = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const view = useRef<Turntable | null>(null)
  const nameBox = useRef<HTMLInputElement>(null)
  const widthBox = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [read, setRead] = useState<{ glb: ArrayBuffer; triangles: number; name: string } | null>(null)
  /** the model's box in its file's axes, m, at the size it will have (one side typed scales it) */
  const [box, setBox] = useState<Size3 | null>(null)
  const [label, setLabel] = useState(edit?.label ?? '')
  const [category, setCategory] = useState(edit?.category ?? 'other')
  const [front, setFront] = useState<Front>(edit?.front ?? '+z')
  const [sits, setSits] = useState<Sits>(edit?.sits ?? 'floor')
  const [light, setLight] = useState(edit?.light ?? false)
  const [typed, setTyped] = useState<Partial<Record<keyof Size3, string>>>({})
  const size = box && facing(box, front)

  useEffect(() => {
    dlg.current?.showModal()
    return () => view.current?.dispose()
  }, [])
  // edit: the piece's own file, at the size it has now
  useEffect(() => {
    if (!edit) return
    setBusy('Opening…')
    void fileOf(edit.file).then(async (b) => {
      setBusy(null)
      if (b) await show(await b.arrayBuffer(), edit.triangles, edit.label, edit.front)
      setBox(facing(edit.sizeM, edit.front)) // its record's size, back in the file's axes
      setTimeout(() => (focus === 'size' ? widthBox : nameBox).current?.select())
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** the turntable of `glb`; its measured box (as metres, a centimetre file read as such) unless editing */
  async function show(glb: ArrayBuffer, triangles: number, name: string, f: Front) {
    view.current?.dispose()
    view.current = null
    setRead({ glb, triangles, name })
    await new Promise(requestAnimationFrame) // the canvas is in the page now
    if (!canvas.current) return
    const { turntable } = await import('./turntable')
    const t = await turntable(canvas.current, glb, f)
    view.current = t.view
    const k = furnitureScale(Math.max(t.box.x, t.box.y, t.box.z))
    if (!edit) setBox({ x: t.box.x * k, y: t.box.y * k, z: t.box.z * k })
  }

  /** one drop or pick: a model alone, or a folder, a .zip or several files — the model among them opens with the rest beside it */
  async function take(dropped: DropFile[]) {
    if (!dropped.length) return
    const { expandZips, mainFile, siblingsOf } = await import('../import/bundle')
    const files = dropped.some((f) => /\.zip$/i.test(f.path)) ? await expandZips(dropped).catch(() => null) : dropped
    if (!files) return setRefused('That .zip could not be opened.')
    const at = mainFile(files.map((f) => f.path).filter((p) => MODEL.test(p)))
    const main = files.find((f) => f.path === at)
    if (!main) return setRefused('Choose a 3D model: a .glb, .gltf, .obj, .fbx, .dae or .stl file (or its folder, or a .zip of it).')
    const file = { name: main.path.split('/').pop()!, size: main.data.size }
    setRefused(modelRefusal({ bytes: file.size }))
    if (file.size > MAX_MODEL_BYTES) return
    setBusy(`Reading ${file.name}…`)
    try {
      const { importMesh } = await import('../import/mesh')
      const r = await importMesh(await main.data.arrayBuffer(), file.name, files.length > 1 ? siblingsOf(files, main.path) : undefined)
      const sh = r.shell!
      const no = modelRefusal({ triangles: sh.triangles, bytes: sh.glb.byteLength })
      setBusy(null)
      if (no) return setRefused(no)
      setLabel((l) => l || nameOf(file.name))
      await show(sh.glb, sh.triangles, file.name, front)
      setTimeout(() => nameBox.current?.select())
    } catch (e) {
      setBusy(null)
      setRefused(readError(file.name, e))
    }
  }

  const turnFront = (f: Front) => {
    setFront(f)
    view.current?.setFront(f)
  }
  /** one side typed (feet-inches, or "1.9 m", "190 cm"): the other two follow; nonsense puts the field back */
  const typeSide = (k: keyof Size3) => {
    const v = typed[k]
    setTyped((t) => ({ ...t, [k]: undefined }))
    const m = v === undefined ? null : parseLength(v)
    if (!size || !m || m <= 0) return
    setBox(facing(scaledTo(size, k, m), front))
  }
  const pickCategory = (c: OwnModel['category']) => {
    if (c === 'lamp' && category !== 'lamp') setLight(true)
    setCategory(c)
  }

  async function save() {
    if (!read || !size) return
    setBusy('Saving…')
    const at = new Date().toISOString()
    const rec: OwnModel = edit
      ? { ...edit, label: label.trim() || edit.label, category, front, sits, sizeM: size, light, at }
      : {
          id: `own_${newId()}`,
          type: 'model',
          label: label.trim() || nameOf(read.name),
          category,
          front,
          sits,
          sizeM: size,
          light,
          triangles: read.triangles,
          file: { hash: await hashOf(read.glb), ext: 'glb', bytes: read.glb.byteLength },
          at,
        }
    const where = await saveOwn(rec, edit ? undefined : new Blob([read.glb], { type: 'model/gltf-binary' }))
    setBusy(null)
    onSaved(rec, where)
    onClose()
  }

  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation() // the Studio sheet takes a dropped model as the building's outside shape: not this one
    if (!edit) void filesOfDrop(e.dataTransfer).then(take) // a dropped folder walked (drop.ts): its files must be taken now
  }
  return (
    <dialog
      ref={dlg}
      className="own own-model"
      aria-label={edit ? `Change ${edit.label}` : 'Add your own piece'}
      onClose={onClose}
      onKeyDown={(e) => e.stopPropagation() /* typing a name never walks, turns or picks a tool */}
      onDragOver={(e) => (e.preventDefault(), e.stopPropagation())}
      onDrop={drop}
    >
      <header className="own-head">
        <h2 className="display">{edit ? edit.label : 'Your own piece'}</h2>
        <button className="own-x" aria-label="Close" title="Close (Esc)" onClick={() => dlg.current?.close()}>
          ×
        </button>
      </header>
      {!read && !edit ? (
        <label className={`own-drop${busy ? ' busy' : ''}`}>
          <input type="file" accept={ACCEPT} multiple hidden onChange={(e) => void take([...(e.target.files ?? [])].map((f) => ({ path: f.name, data: f })))} />
          <span className="own-drop-title">{busy ?? 'Drop a 3D model here'}</span>
          {!busy && <span className="own-button">Choose a file…</span>}
          <span className="muted small">GLB, glTF, OBJ, FBX, DAE or STL, or its folder or .zip · up to 30 MB and 2 million triangles</span>
        </label>
      ) : (
        <div className="own-body">
          <figure className="own-view">
            <canvas ref={canvas} aria-label="The model, turning" />
            <figcaption className="muted small">
              {size ? (
                <>
                  {ft(size.x)} wide · {ft(size.z)} deep · {ft(size.y)} high
                  <br />
                  {m2(size.x)} × {m2(size.z)} × {m2(size.y)} m{read ? ` · ${read.triangles.toLocaleString()} triangles` : ''}
                </>
              ) : (
                (busy ?? 'Measuring…')
              )}
            </figcaption>
          </figure>
          <div className="own-form">
            <label className="own-field">
              <span className="label">Name</span>
              <input ref={nameBox} value={label} maxLength={80} placeholder="Rahim's teak sofa" onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label className="own-field">
              <span className="label">Kind</span>
              <select value={category} onChange={(e) => pickCategory(e.target.value as OwnModel['category'])}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="own-field">
              <span className="label">Which side is the front</span>
              <div className="own-row">
                <div className="own-fronts" role="group" aria-label="Which side is the front">
                  {FRONTS.map((f) => (
                    <button key={f.id} className={`own-front at-${f.at}${front === f.id ? ' on' : ''}`} aria-pressed={front === f.id} title={f.title} onClick={() => turnFront(f.id)}>
                      {f.arrow}
                    </button>
                  ))}
                </div>
                <span className="muted small">Pick the arrow until the front faces you in the picture.</span>
              </div>
            </div>
            <div className="own-field">
              <span className="label">Where it sits</span>
              <div className="own-seg" role="group" aria-label="Where it sits">
                {SITS.map((s) => (
                  <button key={s.id} className={sits === s.id ? 'on' : ''} aria-pressed={sits === s.id} onClick={() => setSits(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="own-field">
              <span className="label">Real size</span>
              <div className="own-sizes">
                {AXES.map(({ k, label: l }) => (
                  <label key={k}>
                    <span className="muted small">{l}</span>
                    <input
                      ref={k === 'x' ? widthBox : undefined}
                      value={typed[k] ?? (size ? ft(size[k]) : '')}
                      disabled={!size}
                      onChange={(e) => setTyped((t) => ({ ...t, [k]: e.target.value }))}
                      onBlur={() => typeSide(k)}
                      onKeyDown={(e) => e.key === 'Enter' && typeSide(k)}
                    />
                  </label>
                ))}
              </div>
              <span className="muted small">Type one side (6'2", 1.9 m or 190 cm): the other two follow.</span>
            </div>
            <label className="own-check">
              <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
              It gives light (a lamp: it lights the room at night)
            </label>
          </div>
        </div>
      )}
      {refused && <p className="own-refused">{refused}</p>}
      <footer className="own-foot">
        <button className="own-button" onClick={() => dlg.current?.close()}>
          Cancel
        </button>
        <button className="own-button primary" disabled={!size || !!busy} onClick={() => void save()}>
          {edit ? 'Save' : 'Add to the library'}
        </button>
      </footer>
    </dialog>
  )
}
