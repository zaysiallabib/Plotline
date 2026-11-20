/**
 * Finishes → "Add option" (staff): a finish option of the staff's own in the group of rooms it was added in — its name,
 * brand, code, the price difference in taka, and its look: a colour, a texture of the list (tinted or not), or a picture
 * dropped here (JPG / PNG up to 4 MB, kept at most 2048 pixels across) tiled at its real size ("60 × 60 cm"). The same form
 * edits or removes one added before. Rules: furnish/own.ts; where it is kept: lib/library.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { formatFeetInches, newId, parseLength, type FinishSlot } from '../core'
import { PICTURE_PX, pictureRefusal, type Look, type OwnFile, type OwnFinish } from '../furnish/own'
import { TEXTURES } from '../furnish/textures'
import { fileOf, hashOf, removeOwn, saveOwn } from '../lib/library'
import '../studio/own.css'

type Kind = 'color' | 'texture' | 'picture'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'color', label: 'Colour' },
  { id: 'texture', label: 'Texture' },
  { id: 'picture', label: 'Picture' },
]
const LIST = Object.values(TEXTURES).sort((a, b) => a.label.localeCompare(b.label))
/** "52,000", "-12000", "−8 000" → whole taka; null = not a number */
export const parseTaka = (s: string): number | null => {
  const t = s.replace(/[\s,৳]/g, '').replace(/^[−–]/, '-')
  return /^[-+]?\d+$/.test(t) ? Number(t) : null
}
const cm = (m: number) => `${Math.round(m * 100)} cm`

/** A dropped picture, at most PICTURE_PX across (a bigger one or a PNG photo is written again as a JPG). */
async function prepare(file: File): Promise<{ blob: Blob; ext: OwnFile['ext']; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const { width: w, height: h } = bmp
  const k = Math.min(1, PICTURE_PX / Math.max(w, h))
  if (k === 1 && file.type === 'image/jpeg') return { blob: file, ext: 'jpg', w, h }
  if (k === 1 && file.type === 'image/png') return { blob: file, ext: 'png', w, h }
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.9))
  if (!blob) throw new Error('the picture could not be written again')
  return { blob, ext: 'jpg', w: c.width, h: c.height }
}

export function OwnFinishForm({ slots, slotId, edit, onDone }: { slots: FinishSlot[]; slotId: string; edit?: OwnFinish; onDone: (saved?: OwnFinish) => void }) {
  const look0 = edit?.look
  const [label, setLabel] = useState(edit?.label ?? '')
  const [brand, setBrand] = useState(edit?.brand ?? '')
  const [sku, setSku] = useState(edit?.sku ?? '')
  const [price, setPrice] = useState(edit ? String(edit.priceDeltaBdt) : '0')
  const [slot, setSlot] = useState(edit?.slotId ?? slotId)
  const [kind, setKind] = useState<Kind>(!look0 || 'color' in look0 ? 'color' : 'textureId' in look0 ? 'texture' : 'picture')
  const [color, setColor] = useState(look0 && 'color' in look0 ? look0.color : '#d8cfc0')
  const [textureId, setTextureId] = useState(look0 && 'textureId' in look0 ? look0.textureId : 'tile_floor_ceramic')
  const [tint, setTint] = useState(look0 && 'textureId' in look0 ? (look0.tint ?? '') : '')
  /** the picture: new (its blob) or the one kept (edit) */
  const [pic, setPic] = useState<{ blob?: Blob; file?: OwnFile; url: string; w: number; h: number } | null>(null)
  const [tile, setTile] = useState(look0 && 'tileM' in look0 ? look0.tileM : { x: 0.6, y: 0.6 })
  const [typed, setTyped] = useState<{ x?: string; y?: string }>({})
  const [why, setWhy] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // edit: the picture kept, shown again
  useEffect(() => {
    if (!look0 || !('file' in look0)) return
    let url = ''
    void fileOf(look0.file).then((b) => b && setPic({ file: look0.file, url: (url = URL.createObjectURL(b)), w: 1, h: tile.y / tile.x }))
    return () => URL.revokeObjectURL(url)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const taka = parseTaka(price)
  const ready = label.trim() && brand.trim() && taka !== null && (kind !== 'picture' || pic)
  const swatch = useMemo(() => {
    if (kind === 'color') return { background: color }
    if (kind === 'picture') return pic ? { backgroundImage: `url(${pic.url})` } : {}
    const t = TEXTURES[textureId]
    return t ? { backgroundImage: `${tint ? `linear-gradient(${tint}, ${tint}), ` : ''}url(${t.albedo})`, backgroundBlendMode: 'multiply' } : {}
  }, [kind, color, pic, textureId, tint])

  async function takePicture(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    const no = pictureRefusal({ bytes: f.size, type: f.type })
    setWhy(no)
    if (no) return
    try {
      const p = await prepare(f)
      setPic({ blob: p.blob, url: URL.createObjectURL(p.blob), w: p.w, h: p.h })
      setTile((t) => ({ x: t.x, y: Math.round(((t.x * p.h) / p.w) * 1000) / 1000 })) // its height from the picture's shape
      if (!label.trim()) setLabel(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    } catch (e) {
      setWhy(`Plotline could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  /** one side of the tile typed ("60 cm", "2'", "0.6 m"): the other follows the picture's own shape */
  const typeTile = (k: 'x' | 'y') => {
    const m = typed[k] !== undefined ? parseLength(typed[k]!) : null
    setTyped((t) => ({ ...t, [k]: undefined }))
    if (!m || m <= 0 || m > 20) return
    const r = Math.round(m * 1000) / 1000
    const down = pic ? pic.h / pic.w : tile.y / tile.x // down per across
    setTile(k === 'x' ? { x: r, y: Math.round(r * down * 1000) / 1000 } : { x: Math.round((r / down) * 1000) / 1000, y: r })
  }

  async function save() {
    if (!ready || taka === null) return
    setBusy(true)
    let look: Look
    let blob: Blob | undefined
    if (kind === 'color') look = { color }
    else if (kind === 'texture') look = { textureId, ...(tint ? { tint } : {}) }
    else if (pic!.blob) {
      blob = pic!.blob
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      look = { file: { hash: await hashOf(await blob.arrayBuffer()), ext, bytes: blob.size }, tileM: tile }
    } else look = { file: pic!.file!, tileM: tile }
    const rec: OwnFinish = {
      id: edit?.id ?? `own_${newId()}`,
      type: 'finish',
      slotId: slot,
      label: label.trim(),
      brand: brand.trim(),
      sku: sku.trim() || `OWN-${(edit?.id ?? newId()).slice(-6).toUpperCase()}`,
      priceDeltaBdt: taka,
      look,
      at: new Date().toISOString(),
    }
    await saveOwn(rec, blob)
    setBusy(false)
    onDone(rec)
  }
  const remove = async () => {
    if (!edit) return
    setBusy(true)
    await removeOwn(edit)
    onDone()
  }

  return (
    <div className="own own-finish" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), kind === 'picture' && void takePicture(e.dataTransfer.files))}>
      <span className="label">{edit ? 'Your option' : 'A new option'}</span>
      <label className="own-field">
        <span className="label">Name</span>
        <input value={label} maxLength={80} placeholder="Teak parquet" onChange={(e) => setLabel(e.target.value)} />
      </label>
      <div className="own-two">
        <label className="own-field">
          <span className="label">Brand</span>
          <input value={brand} maxLength={80} placeholder="Akij Ceramics" onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="own-field">
          <span className="label">Code</span>
          <input value={sku} maxLength={40} placeholder="Optional" onChange={(e) => setSku(e.target.value)} />
        </label>
      </div>
      <div className="own-two">
        <label className="own-field">
          <span className="label">Price difference ৳</span>
          <input value={price} inputMode="numeric" className={taka === null ? 'bad' : ''} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="own-field">
          <span className="label">Offered in</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="muted small">0 = included in the price; a minus for cheaper (−12000).</span>
      <div className="own-field">
        <span className="label">Its look</span>
        <div className="own-seg" role="group" aria-label="Its look">
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="own-look">
        <span className="own-swatch" style={swatch} />
        {kind === 'color' && (
          <label className="own-row">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
            <span className="muted small">{color}</span>
          </label>
        )}
        {kind === 'texture' && (
          <div className="own-field grow">
            <select value={textureId} onChange={(e) => setTextureId(e.target.value)} aria-label="Texture">
              {LIST.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="own-check small">
              <input type="checkbox" checked={!!tint} onChange={(e) => setTint(e.target.checked ? '#e6dccb' : '')} />
              Tinted
              {tint && <input type="color" value={tint} onChange={(e) => setTint(e.target.value)} aria-label="Tint" />}
            </label>
          </div>
        )}
        {kind === 'picture' && (
          <div className="own-field grow">
            <label className="own-drop">
              <input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => void takePicture(e.target.files)} />
              <span className="own-drop-title">{pic ? 'Another picture…' : 'Drop a picture of the surface'}</span>
              <span className="muted small">JPG or PNG, up to 4 MB: one tile, one plank, a piece of the stone</span>
            </label>
            <span className="label">One picture covers</span>
            <div className="own-two">
              {(['x', 'y'] as const).map((k) => (
                <input
                  key={k}
                  aria-label={k === 'x' ? 'Width of the picture on the floor or wall' : 'Height of the picture on the floor or wall'}
                  value={typed[k] ?? cm(tile[k])}
                  onChange={(e) => setTyped((t) => ({ ...t, [k]: e.target.value }))}
                  onBlur={() => typeTile(k)}
                  onKeyDown={(e) => e.key === 'Enter' && typeTile(k)}
                />
              ))}
            </div>
            <span className="muted small">
              Across × down, as laid ({formatFeetInches(tile.x)} × {formatFeetInches(tile.y)}).
            </span>
          </div>
        )}
      </div>
      {why && <p className="own-refused">{why}</p>}
      <div className="own-foot">
        {edit && (
          <button className="own-button danger" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        )}
        <span className="grow" />
        <button className="own-button" onClick={() => onDone()}>
          Cancel
        </button>
        <button className="own-button primary" disabled={!ready || busy} onClick={() => void save()}>
          {edit ? 'Save' : 'Add option'}
        </button>
      </div>
    </div>
  )
}
