/**
 * What an architect's material names mean for the outside (session 31 ifcmap; Docs/review/outside/INVENTORY.md §4, §5.5):
 * an IFC names every layer of every wall — "Puuverhous", "SIA_PA_Crépi beige, texturé", "Dach - Titanzink", "Mursten -
 * Beklædning Grå" — and no IFC of the 48 measured carries a picture. Plotline's own outside options (furnish/finishes.ts
 * OUTSIDE_SLOT, FRAMES_SLOT, ROOF_COVERINGS) and low-wall kinds (core LowWallKind) are chosen here from the WORDS in those
 * names, in the languages the corpus has: English, German, Finnish, Swedish, Norwegian, Danish, Dutch, French, Spanish,
 * Italian, Portuguese. Pure: a name (and the colour its style gives) in, an option id out.
 *
 * A name is lower-cased with its accents dropped and read word class by word class, the first that matches wins: what is
 * never seen from outside (plasterboard, insulation, air, membranes, studs, screed, floors, ceilings, a placeholder name) is
 * `skip` — never dresses anything and is never listed as unknown; then glass, fibre-cement, render (over brick or concrete:
 * "Ziegel, verputzt" is rendered), block, timber, brick, stone, concrete ("Stahlbeton" is no steel), metal, paint, and
 * masonry with no other word as brick. Anything else is unknown: the wall
 * keeps the plaster and the name is listed once in "What was read from the file", where a person maps it (remembered).
 */
import type { LowWallKind } from '../core'

/** what a name is made of; `skip`: never seen on the outside (or names nothing) */
export type MaterialClass = 'skip' | 'glass' | 'fibre' | 'render' | 'block' | 'timber' | 'brick' | 'stone' | 'metal' | 'concrete' | 'paint'

/** lower case, accents and ß / ø / æ / å spelt plainly, underscores as spaces, so one pattern reads every spelling ("Crépi" = "crepi", "Træ" = "trae", "SIA_PA_Crépi" = "sia pa crepi") */
export const plain = (s: string): string =>
  s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

const CLASSES: [MaterialClass, RegExp][] = [
  [
    'skip',
    /gyps|gips|kipsi|plasterboard|drywall|wall ?board|yeso|rigips|trockenbau|gu ?plate|platre|plafonnage|insul|isol|dämm|damm|eriste|\bvilla\b|mineral|steinul|stenull|steenwol|rockwool|\bwool|\beps\b|\bxps\b|\bpur\b|polystyr|poliest|polyureth|foam|mousse|\bair\b|luft|ilma|tuuletus|camara de|cavity|spouw|membran|folie|kalvo|vapou?r|damp|sperr|barrier|bitum|epdm|underlay|\bstud|stander|bindv|furring|firring|ranka|bindingsverk|lekter|sloyfer|batten|\blath|\bosb\b|plywood|vaneri|kryssfiner|multiplex|spon|chipboard|\bclt\b|joist|rafter|bjelkelag|screed|estrich|chape|afwerk|pastop|tegels? - vloer|vloer|\btile|fliese|flise|\bflis\b|alicatado|parquet|parket|floor|gulv|dielen|carpet|ceiling|himling|plafond|interior|invandig|binnen|innen|palosuojaus|brandschutz|tuulensuoja|rakennuslevy|varmeisol|empty|tomt|default|vorgabe|par defaut|generic|generisk|standard|unnamed|unbenannt|^layer$|^material[ _]?\d*$|^\d+ ?%$|solid fill|concept|controle|mockup|isokor|\bhsb\b|mortier|colle\b|\bglue|kleber|lijm|\bfill\b|yleinen|tilavaraus|tyhja|\bmaa\b|\bkies\b|asphalt|gravel|\bgrava\b|\bsoil\b|erde|\bluft|leather|laminate|textile|\bfabrics?\b|rubber|kunststoff|plast(ic)?\b/,
  ],
  ['glass', /glass|\bglas|lasi|verre|vidrio|vetro|vidro|glazing|vitrage|verglas|profilit|polycarb/],
  ['fibre', /eternit|fib(re|er) ?-?cement|faserzement|kuitusement|fibercement|vezelcement|fibrocement|fibrociment|viroc|equitone|cembrit|swisspearl|trespa|\bhpl\b/],
  ['render', /render|stucco|stukko|stuck\b|putz|crepi|enduit|revoco|enlucido|enfoscado|intonaco|rasante|\bpuss\b|\bputs\b|pleister|\bstuc\b|rappatura|reboco|monocapa|\bplaster\b|\betics\b|\bwdvs\b|\brapping/],
  ['block', /concrete (masonry|block)|(masonry|mauerwerk|maconnerie|metselwerk).*(beton|concrete)|\bcmu\b|betonstein|betonblock|ytong|gasbeton|porenbeton|leichtbeton|letbeton|kevytsora|lightweight concrete|aircrete|\baac\b|bloque de hormigon|parpaing|bloc beton/],
  [
    'timber',
    /timber|wood|holz|\bpuu|(^|\W)tra(e)?\b|\btre\b|hout\b|houten|madera|\bbois\b|legno|madeira|lumber|cedar|zeder|ceder|larch|larche|lark|lariks|pine\b|kiefer|manty|fichte|spruce|kuusi|\boak\b|eiche|tammi|birch|birke|koivu|bjork|teak|bamboo|naaldhout|vurenhout|plank|\blauta|\blames?\b|rupanel|glespanel|lockpanel|weatherboard|clapboard|siding|shingle|frondosa|kestopuu/,
  ],
  ['brick', /brick|ziegel|klinker|tiili|tegel|tegl\b|baksteen|mursten|murstein|ladrillo|brique|mattone|tijolo|ceramico (perforado|hueco|macizo)|kalksandstein|kalkzandsteen|kalkkihiekka|silico-calcaire|silico calcaire|sand-?lime|\bcs ?\d\d\b|fabrica de/],
  ['stone', /stone|(?<!beton)stein|\bsten\b|\bsteen\b|kunststeen|\bkivi|piedra|pierre|pietra|pedra|granit|marble|marmor|marmo|marbre|limestone|sandstone|basalt|travertin|schiefer|skiffer|liuske|pizarra|ardoise|ardesia|\bslate\b/],
  ['concrete', /beton|concrete|hormigon|calcestruzzo|\bcls\b|\bc\d\d ?\/ ?\d\d\b|prefab|precast|fertig|elementti|ihwg/],
  ['metal', /zinc|zink|sinkki|blech|sheet metal|\bplat\b|metal|alumi|\balu\b|steel|stahl|\bstal\b|staal|\bteras|acier|acero|acciaio|\baco\b|copper|kupfer|kupari|koppar|kobber|cuivre|cobre|\brame\b|corten|cor-ten|corrugat|trapez|well(blech|platte)|aaltopelti|profiilipelti|\bpelti|\bplaat\b|stehfalz|standing seam/],
  ['paint', /paint|maali|farbe|anstrich|peinture|pintura|\bverf\b|maling|farg|\black\b|vernice|lasur/],
  ['brick', /masonry|mauerwerk|metselwerk|maconnerie|muratura|\bmuro\b/], // (masonry with no other word: brick)
]

/**
 * The word class of one material name; null: not known (the person may map it). `loose`: a type's name ("Basiswand: … WDVS
 * … EPS 0160") — what it is clad in counts, its insulation and studs do not stop it.
 */
export function classOf(name: string, loose = false): MaterialClass | null {
  const s = plain(name).trim()
  if (!s || s === '<unnamed>') return 'skip'
  for (const [c, re] of CLASSES) if (!(loose && c === 'skip') && re.test(s)) return c
  return null
}

type Rgb = [number, number, number]
const WORDS = {
  white: /white|weiss|valk|\bvit\b|\bhvit|\bhvid|blanc|blanco|bianco|branco|\bwit\b|9010|9016|9003|titaani|ncs s? ?0[0-5]\d\d/,
  sand: /sand|beige|cream|creme|kerma|ock?er|ochre|ocre|gelb|yellow|keltai|jaune|amarillo|giallo|\bgeel|sable|arena|1015|1013/,
  red: /terra ?cotta|terrakotta|\bred\b|\brot\b|rouge|\brojo|rosso|punai|\brod\b|orange|pink|\brosa|\brose\b|3009|8004/,
  dark: /anthra|antra|charcoal|dark|dunkel|tumma|black|schwarz|musta|noir|negro|\bnero|zwart|\bsort\b|svart|graphit|7016|7021|7022|9005|9011|9004|ncs s? ?[5-9]\d{3}/,
  grey: /grey|gray|grau|harmaa|\bgris|grigio|grijs|\bgra\b|\bgraa/,
  light: /light|\bhell|vaalea|clair|claro|licht|ljus|\blys/,
  horizontal: /horizont|vaaka|waagerecht|liggande|liggende|vandret|clapboard|weatherboard|siding|\blap\b/,
  precast: /prefab|precast|fertig|elementti|sandwich|panel|paneel|platte|placa|plaque/,
  corrugated: /corrugat|trapez|well(blech|platte)|aaltopelti|profiilipelti|wellprofil|ondul/,
  copper: /copper|kupfer|kupari|koppar|kobber|cuivre|cobre|\brame\b|corten|cor-ten|weathering|\brost\b|\brust/,
  painted: /paint|maali|farbe|gestrichen|peint|pintad|geverfd|malet|malad|kalksand|kalkzand|kalkkihiekka|silico|sand-?lime|\bcs ?\d\d\b/,
}

/** the render options by their tint (finishes.ts OUTSIDE_SLOT): the nearest one to a style's own colour */
const RENDERS: [string, Rgb][] = [
  ['fo_out_render_white', [0xf1, 0xee, 0xe8]],
  ['fo_out_plaster', [0xdb, 0xd3, 0xc6]],
  ['fo_out_render_sand', [0xd8, 0xc6, 0xa6]],
  ['fo_out_render_terracotta', [0xc4, 0x87, 0x6a]],
  ['fo_out_render_charcoal', [0x57, 0x59, 0x5c]],
]
/** a style colour that says nothing: a CAD program's default greys (Revit 127 / 120, Archicad's) and pure white / black */
const says = (c: Rgb | undefined): c is Rgb => {
  if (!c) return false
  const [r, g, b] = c.map((v) => v / 255)
  return !(Math.max(r, g, b) - Math.min(r, g, b) < 0.03 && ((r > 0.33 && r < 0.66) || r > 0.97 || r < 0.03))
}
const nearest = (c: Rgb, list: [string, Rgb][]): string =>
  list.reduce((best, x) => (Math.hypot(...x[1].map((v, i) => v - c[i])) < Math.hypot(...best[1].map((v, i) => v - c[i])) ? x : best))[0]

/**
 * The outside option (finishes.ts OUTSIDE_SLOT) a wall's or cladding's material name stands for; 'glass' for a glass skin;
 * null when the name says nothing known. `rgb`: the colour the file's style gives it (0–255), for a render's or paint's tint;
 * `loose`: a type's name (classOf).
 */
export function outsideOption(name: string, rgb?: Rgb, loose = false): string | 'glass' | null {
  const c = classOf(name, loose)
  const s = plain(name)
  const w = (k: keyof typeof WORDS) => WORDS[k].test(s)
  switch (c) {
    case 'glass':
      return 'glass'
    case 'fibre':
      return w('dark') ? 'fo_out_acp_charcoal' : 'fo_out_fibre_cement'
    case 'render':
    case 'paint':
      if (w('white') || (w('light') && w('grey'))) return 'fo_out_render_white'
      if (w('sand')) return 'fo_out_render_sand'
      if (w('red')) return 'fo_out_render_terracotta'
      if (w('dark') || w('grey')) return 'fo_out_render_charcoal'
      return says(rgb) ? nearest(rgb, RENDERS) : 'fo_out_render_white'
    case 'block':
      return 'fo_out_precast'
    case 'timber':
      return w('horizontal') ? 'fo_out_clapboard' : 'fo_out_timber_slats'
    case 'brick':
      if (w('white') || w('painted') || w('sand')) return 'fo_out_brick_white'
      if (w('grey') || w('dark')) return 'fo_out_brick_grey'
      return 'fo_out_brick_red'
    case 'stone':
      return 'fo_out_stone'
    case 'metal':
      if (w('copper')) return 'fo_out_acp_rust'
      if (w('corrugated')) return 'fo_out_corrugated'
      return w('dark') || (says(rgb) && Math.max(...rgb) < 90) ? 'fo_out_metal_dark' : 'fo_out_zinc'
    case 'concrete':
      return w('precast') ? 'fo_out_precast' : 'fo_out_concrete'
    default:
      return null
  }
}

/**
 * Which of a wall's material names (its layers in the file's order, a list, or one material) is its OUTSIDE: of a layer set
 * the end layers, the first before the last (CAD programs write them outside → inside), a concrete core only when the
 * other end is no cladding (nor a name not known: a cladding no word tells); of a list or constituents, the first that dresses,
 * concrete last. `option`: a name's option (a
 * person's own word for it first). Returns its index, or −1.
 */
export function outerOf(names: string[], layered: boolean, option: (name: string) => string | null = (n) => outsideOption(n)): number {
  const at = layered ? [...new Set([0, names.length - 1])] : names.map((_, i) => i)
  const known = at.filter((i) => i >= 0 && i < names.length && option(names[i]) !== null && option(names[i]) !== 'glass')
  const clad = known.find((i) => classOf(names[i]) !== 'concrete')
  if (clad !== undefined) return clad
  // concrete alone with a name not known beside it: that one is the cladding (Vienna's "BEKLEIDUNG" over its concrete)
  return at.some((i) => names[i] && classOf(names[i]) === null && option(names[i]) === null) ? -1 : (known[0] ?? -1)
}

/** The roof covering (finishes.ts ROOF_COVERINGS) a roof's material name stands for, of a pitched or a flat roof; null: not known. */
export function coveringOption(name: string, pitched: boolean): string | null {
  const s = plain(name)
  if (/beton|concrete|hormigon|calcestruzzo/.test(s)) return null
  if (/sedum|green roof|grass|\bgras\b|begrun|nurmi|viherkat|\bgras|gron|vegetal|\bverde\b|\bturf\b|\bsod\b|extensiv/.test(s)) return 'rc_green'
  if (/gravel|\bkies|\bsora\b|\bgrus\b|grind\b|grava|gravier|ghiaia|pebble|shingle ballast|singel/.test(s)) return 'rc_gravel'
  if (/slate|schiefer|liuske|skiffer|leisteen|pizarra|ardoise|ardesia|ardois/.test(s)) return pitched ? 'rc_slate' : null
  if (/shingle|schindel|paanu|\bspan\b|shingel|bardeau|tegola canadese|holz|timber|wood|\bpuu\b|\btre\b/.test(s)) return pitched ? 'rc_shingles' : null
  if (/corrugat|trapez|well(blech|platte)|aaltopelti|profiilipelti|ondul/.test(s)) return pitched ? 'rc_corrugated' : null
  if (/zinc|zink|sinkki|stehfalz|standing seam|\bfalz|konesauma|\bplat\b|blech|metal|alumin|\balu\b|alumi|steel|stahl|\bstal\b|teras|pelti|copper|kupfer|kupari|koppar|lead|\bblei\b/.test(s)) return pitched ? 'rc_zinc' : null
  if (/terrace|terrass|terraz|dalle|platten|laatta|plattor|baldosa|ceramic|keram|carreau|tegels/.test(s)) return pitched ? 'rc_clay' : 'rc_terrace'
  if (/\btile|\btiles|ziegel|tiili|\btegel|pannu|dakpan|\bpan\b|teja|tuile|coppo|tegola|telha|\btegl|roof ?tile|clay|\bton\b/.test(s)) return pitched ? 'rc_clay' : 'rc_terrace'
  return null
}

/** What a railing (its material and type names) is made of: a glass infill, else metal, else timber; null: not told. */
export function railKind(names: string[]): LowWallKind | null {
  const s = names.map(plain).join(' | ')
  if (/glass|\bglas|lasi|verre|vidrio|vetro|vidro|panneau de verre|glazed|glazing/.test(s)) return 'glass'
  if (/timber|wood|holz|\bpuu|\btre\b|hout|madera|\bbois\b|legno/.test(s)) return 'timber'
  if (/steel|stahl|\bstal\b|staal|teras|metal|alumin|\balu\b|acier|acero|acciaio|inox|edelstahl|wrought|iron|eisen|rautaa|\bjern|\bijzer|\bfer\b|hierro|ferro/.test(s)) return 'railing'
  return null
}

/** A window's or a curtain wall's frame (finishes.ts FRAMES_SLOT) from its material / style names; null: not told. */
export function frameOption(names: string[]): string | null {
  const s = names.map(plain).join(' | ')
  if (/timber|wood|holz|\bpuu|\btra\b|\btre\b|hout|madera|\bbois\b|legno|\boak\b|eiche|pine|manty|naaldhout/.test(s) && !/holz-?alu|alu-?holz/.test(s)) return 'fo_frame_timber'
  if (WORDS.dark.test(s) && /anthra|antra|grau|grey|gray|gris|harmaa|graphit|7016|7021|7022/.test(s)) return 'fo_frame_anthracite'
  if (WORDS.dark.test(s)) return /black|schwarz|musta|noir|negro|nero|zwart|svart|\bsort\b|9005|9004|9011/.test(s) ? 'fo_frame_black' : 'fo_frame_anthracite'
  if (WORDS.white.test(s) || /pvc|upvc|kunststoff|vinyl/.test(s)) return 'fo_frame_white'
  if (/alumin|\balu\b|steel|stahl|metal|silver|silber|hopea|argent/.test(s)) return 'fo_frame_silver'
  return null
}
