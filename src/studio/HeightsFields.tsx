/**
 * A building's heights as fields (session 31 Stage 3): floor to floor, the top floor's ceiling, the slab, the roof's kind and
 * its levels (a flat roof's slab and parapet, a pitched one's eave and ridge). One component for both places a person types
 * them: under a section or elevation in the Set panel before Build, and the project column's Heights line after it.
 */
import { heightFields, type HeightField, type Heights } from '../data/building/storeys'

export const FIELD_WORDS: Record<HeightField, string> = { storeys: 'Floor to floor', ceiling: 'Ceiling', slab: 'Slab', roof: 'Roof level', parapet: 'Parapet', eave: 'Eave', ridge: 'Ridge', kind: 'Roof' }
const FIELD_TIPS: Partial<Record<HeightField, string>> = {
  storeys: 'Metres from one floor to the next: one number for every storey, or by floor — G 4.50, 1-9 3.05 (feet and inches with their marks)',
  ceiling: "The top floor's ceiling, as the drawing prints its level (+5.79)",
  slab: "How thick the floor slab is (m): each storey's walls stop this far under the next floor",
  roof: "The roof slab's top, as printed (+13.42)",
  parapet: 'How high the parapet stands over the roof (m)',
  eave: 'The eave, as printed (+6.10)',
  ridge: 'The ridge, as printed (+8.89)',
}

interface Props {
  /** the heights as read (each field shows them until typed over) */
  heights: Heights | null
  /** what the person typed, by field */
  typed?: Partial<Record<HeightField, string>>
  /** the heights as they will be built (typedHeights): a field not typed over shows its height there (a ceiling moved with the floors) */
  now?: Heights | null
  /** the fields that do not read as a length */
  bad?: HeightField[]
  onType: (f: HeightField, v: string) => void
}

/** each a field over what was read; a field as read is muted, one typed is ink */
export function HeightsFields({ heights, typed, now, bad, onType }: Props) {
  const shown = heightFields(heights)
  const built = now === undefined ? shown : heightFields(now)
  const val = (f: HeightField) => typed?.[f] ?? built[f]
  const kind = val('kind')
  const field = (f: HeightField) => (
    <label key={f} className={typed?.[f] !== undefined && typed[f] !== shown[f] ? 'yours' : ''}>
      <span className="label">{FIELD_WORDS[f]} m</span>
      <input className={bad?.includes(f) ? 'bad' : ''} value={val(f)} placeholder="—" title={FIELD_TIPS[f]} onChange={(e) => onType(f, e.target.value)} />
    </label>
  )
  return (
    <div className="set-heights">
      {(['storeys', 'ceiling', 'slab'] as const).map(field)}
      <label>
        <span className="label">Roof</span>
        <select value={kind} title="Flat (a slab with a parapet), pitched (two slopes from the eaves to the ridge, a gable at each end) or hipped (sloped at the ends too)" onChange={(e) => onType('kind', e.target.value)}>
          <option value="flat">Flat</option>
          <option value="pitched">Pitched</option>
          <option value="hip">Hipped</option>
        </select>
      </label>
      {(kind === 'flat' ? (['roof', 'parapet'] as const) : (['eave', 'ridge'] as const)).map(field)}
    </div>
  )
}
