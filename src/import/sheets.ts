/**
 * What kind of drawing is this page? (session 31, Stage 1 of Docs/PLAN_DRAWING_SETS.md; founder 2026-11-26: "it has no
 * system to read documents like elevations … the system just blindly chose to draw lines on everything".) Pure and
 * deterministic, no AI: words first, then the sheet number, then the drawing's shape.
 *
 *  words   the view titles printed under (or over) each drawing — "1 2ND FLOOR PLAN SCALE 1/4" = 1'-0"", "FRONT ELEVATION
 *          (SOUTH)", "CORTE A-A", "PLANTA SEGUNDO NIVEL", "GRUNDRISS 1. OG", "Level-02, Level-03 … Plan" — in the languages
 *          the layer table reads (plan2d.ts). A title is a short text that names a kind, at the size of the page's biggest
 *          such texts (a room's "1ST FLOOR (FINISH)" level mark or a sheet index entry is smaller, and a level mark is no title).
 *  number  a sheet number in the US / ISO way (A-201, A2.0, M-501): its first digit says plans (1), elevations (2),
 *          sections (3), large-scale views and details (4, 5), schedules (6), general sheets (0) — used when no title is read
 *          (a print whose words are drawn as lines still carries its file name "M-501.dwg" in the plot stamp).
 *  shape   when nothing is written: door swings and parallel wall pairs make a plan, a table's ruled grid a schedule, a page
 *          that is mostly words a general sheet.
 *
 * A page with several titled views is split: the drawing's lines are grouped into islands (lines that touch or nearly
 * do), each island goes to the title next to it (titles sit under their drawings on most sheets, over them on some — the
 * page's own habit decides), and a view's frame is its islands' box with its title. Two plans of the same floor on one page
 * (a floor drawn as its two flats) are one view: a whole floor is one drawing (founder 2026-10-05).
 *
 * Frame: the page as it is shown (pdf.ts turns a rotated page), y up, PDF points. Nothing here knows pdf.js.
 */
import { flatTypeOf, type Pt } from '../core'
import type { ArcPrim, Seg } from './plan2d'
import { printedScale } from './plan2d'

/** 'roof': a plan of the roof's slopes (a house's ROOF PLAN: SLOPE 4/12, RIDGE, GUTTER) — kept like an elevation, never a floor (qa4fix) */
export type SheetKind = 'plan' | 'elevation' | 'section' | 'roof' | 'site' | 'schedule' | 'detail' | 'interior' | 'title' | 'other'
export const SHEET_KINDS: SheetKind[] = ['plan', 'elevation', 'section', 'roof', 'site', 'schedule', 'interior', 'detail', 'title', 'other']

/** A floor as a sheet names it: 0 the ground floor, n ≥ 1 the n-th as printed, −n basement n, 'R' the roof, 'attic', 'mezz' (mezzanine). */
export type Floor = number | 'R' | 'attic' | 'mezz'
export interface Level {
  at: Floor[]
  /** "TYPICAL FLOOR" with no floor numbers: which floors is for the set (or the person) to say */
  typical?: boolean
  /** the words count from the ground up whatever the set does ("1. OG", "R+1", "1er étage"): never moved down */
  above?: boolean
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** a text of the page: its middle, its height, its length along its baseline and that baseline's direction */
export interface SheetText {
  text: string
  at: Pt
  height: number
  width: number
  dir: Pt
}

export interface SheetPage {
  box: Box
  texts: SheetText[]
  segs: Seg[]
  arcs: ArcPrim[]
}

export interface View {
  kind: SheetKind
  /** the view's title as printed (or the sheet's when it has none) */
  title: string
  level?: Level
  /** an elevation's side: north / south / east / west / front / back / side */
  facade?: string
  /** a section's mark: A-A, 1-1 */
  mark?: string
  /** a plan of something else than the floor's rooms: ceiling, electrical, plumbing, mechanical, fire, structure, foundation, finishes */
  use?: string
  /** as printed: 1 : scale */
  scale?: number
  /** its frame on the page */
  box: Box
  /** what told its kind */
  by: 'words' | 'number' | 'shape'
  /** the flat a page of one plan draws, as it prints it ("TYPE-A", "TYPE-C/G/K"): a brochure's page a flat */
  flat?: string
}

export interface SheetRead {
  views: View[]
  /** the sheet number in the title block (A2.5, M-501), when read */
  number?: string
  /** how tall the building is, when the page says it (storeysOf) */
  storeys?: Storeys
}

/** how tall the building is: basements, floors over the ground (a mezzanine counted), and the words that said it */
export interface Storeys {
  basements: number
  floors: number
  words: string
}

// ---------- words ----------

/** capitals, no accents, one space: "Planta  baja" → "PLANTA BAJA", "BASEMENT_1" → "BASEMENT 1" */
export const norm = (s: string): string =>
  s
    .replace(/ß/g, 'SS')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[_\s]+/g, ' ')
    .trim()

const ORD_WORDS: Record<string, number> = {
  FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10, ELEVENTH: 11, TWELFTH: 12,
  PRIMER: 1, PRIMERO: 1, PRIMERA: 1, SEGUNDO: 2, SEGUNDA: 2, TERCER: 3, TERCERO: 3, TERCERA: 3, CUARTO: 4, CUARTA: 4, QUINTO: 5, QUINTA: 5, SEXTO: 6, SEXTA: 6,
  PRIMO: 1, TERZO: 3, EERSTE: 1, TWEEDE: 2, DERDE: 3, PREMIER: 1, DEUXIEME: 2, TROISIEME: 3,
}
const ORD = `(?:${Object.keys(ORD_WORDS).join('|')})`
/** a number as a floor: "2", "2ND", "02", "SECOND" */
const floorNo = (s: string): number | null => {
  const w = ORD_WORDS[s]
  if (w) return w
  const m = /^(\d{1,3})(?:ST|ND|RD|TH|ER|EME|E|O|A|º|ª)?$/.exec(s)
  return m ? Number(m[1]) : null
}
/** a run of floor numbers: "2ND & 4TH", "2, 4, 6 & 8", "5/7/9", "1 TO 11", "2ND-8TH" */
function floorList(s: string): number[] {
  const out: number[] = []
  const toks = s.replace(/\s*(?:&|,|\/|\+|\b(?:AND|Y|UND|ET|E)\b)\s*/g, ' , ').replace(/\s*(?:-|–|\b(?:TO|BIS|A|AU)\b)\s*/g, ' - ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < toks.length; i++) {
    const n = floorNo(toks[i])
    if (n === null) continue
    if (toks[i + 1] === '-' && toks[i + 2] && floorNo(toks[i + 2]) !== null) {
      const m = floorNo(toks[i + 2])!
      for (let k = Math.min(n, m); k <= Math.max(n, m) && k - Math.min(n, m) < 80; k++) out.push(k)
      i += 2
    } else out.push(n)
  }
  return [...new Set(out)]
}

const NUM = `(?:\\d{1,3}(?:ST|ND|RD|TH)?|${ORD})`
const LIST = `${NUM}(?:\\s*(?:,|&|\\/|\\+|AND|-|–|TO)\\s*${NUM})*`

/**
 * The floor(s) a title names, or null. "GROUND FLOOR PLAN" → 0; "2ND FLOOR PLAN" → 2; "PLANTA SEGUNDO NIVEL" → 2;
 * "GRUNDRISS 1. OG" → 1 (above); "PLAN R+1" → 1 (above); "BASEMENT 02" → −2; "ROOF PLAN" → R; "TYPICAL FLOOR" → typical;
 * "Level-02, Level-03 & Level-09 Plan" → 2, 3, 9; "5/7/9 FLOOR PLAN" → 5, 7, 9; "LEVEL 1 to 11" → 1…11.
 */
export function levelOf(raw: string): Level | null {
  const t = norm(raw)
  const at: Floor[] = []
  let above = false
  const typical = /\bTYP(?:ICAL|\.)?\b|\bTIPIC[OA]\b|\b(?:PLANTA|PISO|PAVIMENTO|NIVEL) TIPO\b(?!\s+[A-Z0-9]\b)|\bREGELGESCHOSS\b|\bETAGE COURANT\b/.test(t)
  // basements
  for (const m of t.matchAll(/\b(?:BASEMENT|CELLAR|SOTANO|SUBSUELO|KELDER|SEMINTERRATO)\b\s*[-:]?\s*(\d{1,2})?|\bB-?(\d)\b|\b(\d)?\s*\.?\s*(?:UG|UNTERGESCHOSS)\b|\bSOUS[- ]SOL\s*(\d)?|\bR\s*-\s*(\d)\b|\bLEVEL\s+-\s?(\d)\b|\bLOWER GROUND\b/g)) {
    const n = Number(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? 1)
    at.push(-Math.max(1, n))
  }
  if (/\bGROUND\b|\bG\.F\.?|\bGF\b|\bPLANTA BAJA\b|\bERDGESCHOSS\b|\bEG\b|\bREZ[- ]DE[- ]CHAUSSEE\b|\bRDC\b|\bR\s*\+\s*0\b|\bPIANO TERRA\b|\bBEGANE GROND|\bSTREET LEVEL\b|\bLEVEL\s*0+\b|\bPISO\s*0\b/.test(t)) at.push(0)
  if (/\bROOF\s*(?:TOP|FLOOR|LEVEL|PLAN|TERRACE)?\b|\bROOFTOP\b|\bTERRACE (?:FLOOR|LEVEL|PLAN)\b|\bAZOTEA\b|\bCUBIERTA\b|\bTOITURE\b|\bDACHAUFSICHT\b|\bDACHDRAUFSICHT\b/.test(t) && !/\bROOF (?:RIDGE|EAVE|LINE|SLOPE|DRAIN|DETAIL)/.test(t)) at.push('R')
  if (/\bATTIC\b|\bDACHGESCHOSS\b|\bDG\b|\bLOFT\b/.test(t)) at.push('attic')
  if (/\bMEZZ(?:ANINE)?\b|\bENTRESUELO\b|\bENTREPISO\b/.test(t)) at.push('mezz')
  // numbered floors, explicitly above the ground
  for (const m of t.matchAll(/\b(\d{1,2})\s*\.?\s*(?:OG|OBERGESCHOSS)\b|\bOG\s*(\d{1,2})\b|\bR\s*\+\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:ER|EME|E)\s+ETAGE\b|\b(\d{1,2})\s*E\s+VERDIEPING\b|\b(PRIMO|SECONDO|TERZO|EERSTE|TWEEDE|DERDE|PREMIER|DEUXIEME|TROISIEME)\s+(?:PIANO|VERDIEPING|ETAGE)\b/g)) {
    const n = m[6] ? ({ PRIMO: 1, SECONDO: 2, TERZO: 3, EERSTE: 1, TWEEDE: 2, DERDE: 3, PREMIER: 1, DEUXIEME: 2, TROISIEME: 3 } as Record<string, number>)[m[6]] : Number(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5])
    if (n > 0) at.push(n), (above = true)
  }
  if (!above) {
    // "2ND FLOOR", "2ND & 4TH FLOOR", "SECOND FLOOR", "PRIMER NIVEL", "SEGUNDO Y TERCER NIVEL", "5/7/9 FLOOR PLAN"
    for (const m of t.matchAll(new RegExp(`\\b(${LIST}(?:\\s*(?:Y|E)\\s*${NUM})*)\\s*(?:FLOORS?|FLR|STOREYS?|STORIES|STORY|NIVEL(?:ES)?|PISOS?|PLANTA)\\b`, 'g')))
      at.push(...floorList(m[1]))
    // "FLOOR 2", "FLOOR : 2", "LEVEL-02", "LEVEL 1 TO 11", "L1", "NIVEL 2", "PISO 2", "FLOORS 2-8"
    for (const m of t.matchAll(new RegExp(`\\b(?:FLOORS?|LEVELS?|NIVEL|PISO|STOREY|L)\\s*[-:.]?\\s*(\\d{1,3}(?:ST|ND|RD|TH)?(?:\\s*(?:,|&|\\/|AND|-|–|TO)\\s*(?:(?:LEVEL|FLOOR|L)\\s*[-:.]?\\s*)?\\d{1,3}(?:ST|ND|RD|TH)?)*)`, 'g')))
      at.push(...floorList(m[1].replace(/(?:LEVEL|FLOOR|L)\s*[-:.]?\s*/g, '')))
    // "5/7/9/11 FLOOR PLAN", "6/8/10/12/14/16/18" — a slashed run of numbers is a list of floors
    for (const m of t.matchAll(/\b(\d{1,2}(?:\s*\/\s*\d{1,2}){2,})\b/g)) at.push(...floorList(m[1]))
    // a typical floor's floors as a run of ordinals of their own: "TYPICAL FLOOR PLAN 3RD–8TH", "(2ND-9TH)", "(1ST TO 13TH)"
    if (typical) for (const m of t.matchAll(/\b(\d{1,3}(?:ST|ND|RD|TH)(?:\s*(?:,|&|\/|AND|-|–|TO)\s*\d{1,3}(?:ST|ND|RD|TH))+)\b/g)) at.push(...floorList(m[1]))
    // "PRESENTATION PLAN- 2A, 3A, 5A": flats named by floor and letter
    const flats = [...t.matchAll(/\b(\d{1,2})[A-H]\b/g)].map((m) => Number(m[1]))
    if (flats.length >= 2 && /\bPLAN\b/.test(t)) at.push(...flats)
  }
  const uniq = [...new Set(at)].sort((a, b) => rankOf(a) - rankOf(b))
  if (!uniq.length && !typical) return null
  return { at: uniq, ...(typical ? { typical } : {}), ...(above ? { above } : {}) }
}
const rankOf = (f: Floor): number => (f === 'R' ? 1000 : f === 'attic' ? 999 : f === 'mezz' ? 0.5 : f)

/**
 * How tall the building is, as a brochure or a cover sheet says it: "2B+G+12" (two basements, the ground, 12 floors over
 * it), "B+G+M+12" (a mezzanine is floor 1: 13 over the ground), "G+9", "Basement + Ground Floor + 9"; "10 STORIED",
 * "Number of Storied : 10", "Floors: 09", "14-STOREY" count the ground as a storey (Dhaka's way: "B + G + 9 (10 storied)"),
 * so 9 over it. Null when the words say nothing of it.
 */
export function storeysOf(raw: string): Storeys | null {
  const t = norm(raw)
  const words = raw.trim().replace(/\s+/g, ' ')
  const bg = /\b(\d)?\s*B\s*\+\s*G\s*(\+\s*M\s*)?\+\s*(\d{1,2})\b/.exec(t)
  if (bg) return { basements: Number(bg[1] ?? 1), floors: Number(bg[3]) + (bg[2] ? 1 : 0), words }
  const named = /\bBASEMENTS?\s*\+\s*GROUND(?:\s+FLOOR)?\s*\+\s*(\d{1,2})\b/.exec(t)
  if (named) return { basements: 1, floors: Number(named[1]), words }
  const g = /(?:^|[\s(])G\s*\+\s*(\d{1,2})\b/.exec(t)
  if (g) return { basements: 0, floors: Number(g[1]), words }
  const n = /\b(\d{1,2})\s*-?\s*(?:STORIED|STOREYED|STOREYS?|STORIES|STORY)\b/.exec(t) ?? /\b(?:STORIED|NO\.? OF (?:FLOORS|STOREYS|STORIES)|FLOORS)\s*:\s*(\d{1,2})\b/.exec(t)
  if (n && Number(n[1]) >= 2) return { basements: 0, floors: Number(n[1]) - 1, words }
  return null
}

/** a level mark on an elevation or a section ("1ST FLOOR (FINISH)", "F.F.L. +3.00", "T.O. SLAB"): never a title */
const LEVEL_MARK = /\(FINISH\)|\bF\.?F\.?L\b|\bT\.O\.|\bB\.O\.|\bEL\.|\bELEV\.\s*[+-]?\d|[+±]\s*\d+[.,]\d|\bCEILING \(/

const COVER = /\b(?:COVER(?: SHEET| PAGE)?|TITLE (?:SHEET|PAGE)|SHEET INDEX|DRAWING (?:INDEX|LIST|SCHEDULE)|(?:LIST|INDEX) OF DRAWINGS|TABLE OF CONTENTS|INDICE DE PLANOS|PLANVERZEICHNIS|DECKBLATT|PORTADA|CARATULA)\b/
const NOTES = /\b(?:NOTES?|LEGEND|REPORT|ABBREVIATIONS?|SYMBOLS?(?: LEGEND)?|PROJECT (?:INFORMATION|DATA|SUMMARY|DESCRIPTION)|CONTACT INFORMATION|LICENSE|DISCLAIMER|SPECIFICATIONS?|GENERAL INFORMATION|CODE (?:ANALYSIS|SUMMARY)|NOTAS|LEYENDA|SIMBOLOGIA|LEGENDE|HINWEISE|ZEICHENERKLARUNG)\b/
const DETAIL = /\bDETAILS?\b|\bDETALLES?\b|\bDETTAGLI?O?\b|\bENLARGED\b|\bTYPICAL (?:EXTERIOR|INTERIOR) WALL\b|\bWALL (?:TYPE|ASSEMBL)/
const SCHEDULE = /\bSCHEDULES?\b|\bPLANILLAS?\b|\bCUADRO DE\b|\b(?:TUR|FENSTER|RAUM|TUREN|BAUTEIL)LISTE\b|\bTABLEAU DES\b|\bNOMENCLATURE\b|\bAREA (?:TABLE|STATEMENT)\b/
const ELEV = /\bELEVATIONS?\b|\bELEVACION(?:ES)?\b|\bALZADOS?\b|\bFACHADAS?\b|\bANSICHT(?:EN)?\b|\b(?:NORD|SUD|SUED|OST|WEST)ANSICHT\b|\bFASSADEN?\b|\bFACADES?\b|\bPROSPETT[OI]\b|\bAANZICHT(?:EN)?\b|\bGEVELS?\b/
const INTERIOR = /\bINTERIOR\b|\bINTERNAL\b|\bKITCHEN\b|\bBATH(?:ROOM)?\b|\bW\.?C\.?\b|\bTOILET\b|\bWATER CLOSET\b|\bPOWDER\b|\bLAUNDRY\b|\bUTILITY\b|\bCLOSET\b|\bPANTRY\b|\bCABINET|\bVANITY\b|\bSHOWER\b|\bENSUITE\b|\bBEDROOM\b|\bLIVING\b|\bDINING\b|\bFIREPLACE\b|\bMILLWORK\b|\bCOCINA\b|\bBANO\b|\bKUCHE\b/
const SECTION = /\bSECTIONS?\b|\bCROSS[- ]SECTION\b|\bCORTES?\b|\bSECCION(?:ES)?\b|\bSCHNITT(?:E)?\b|\bCOUPES?\b|\bDOORSNEDE\b|\bSEZION[EI]\b/
const SITE = /\bSITE ?(?:PLAN|SURVEY|LAYOUT|MAP|ANALYSIS)\b|^SITE$|\bLOCATION (?:PLAN|MAP)\b|\bVICINITY MAP\b|\bKEY (?:PLAN|MAP)\b|\bPLOT PLAN\b|\bMASTER ?PLAN\b|\bLANDSCAPE PLAN\b|\bLAGEPLAN\b|\bPLAN DE (?:MASSE|SITUATION)\b|\b(?:PLANTA|PLANO) DE (?:UBICACION|EMPLAZAMIENTO|SITUACION|CONJUNTO)\b|\bEMPLAZAMIENTO\b|\bUBICACION\b|\bPLANIMETRIA\b|\bSITUATIE\b/
const PLAN = /(?<![-\w])PLANS?\b|\bPLANTAS?\b|\bGRUNDRISS(?:E)?\b|\bPIANTA\b|\bPLATTEGROND\b|\bLAYOUT\b|\bFLOOR ?PLAN\b/
const USE: [RegExp, string][] = [
  [/\bREFLECTED\b|\bCEILING\b|\bR\.?C\.?P\b/, 'ceiling'],
  [/\bELECTRICAL\b|\bLIGHTING\b|\bPOWER\b|\bELEC\b/, 'electrical'],
  [/\bPLUMBING\b|\bSANITARY\b|\bDRAINAGE\b/, 'plumbing'],
  [/\bMECHANICAL\b|\bHVAC\b|\bDUCT|\bRADIANT\b/, 'mechanical'],
  [/\bFIRE\b|\bSPRINKLER/, 'fire'],
  [/\bFRAMING\b|\bSTRUCTUR|\bSLAB\b|\bBEAM\b/, 'structure'],
  [/\bFOUNDATION\b|\bFOOTING/, 'foundation'],
  [/\bFINISH(?:ES)? PLAN\b|\bFLOORING\b/, 'finishes'],
]
const FACADES: [RegExp, string][] = [
  [/\bNORTH ?EAST\b|\bNORESTE\b|\bNORDOST\b|\bNORD-EST\b/, 'north-east'],
  [/\bNORTH ?WEST\b|\bNOROESTE\b|\bNORDWEST\b|\bNORD-OUEST\b/, 'north-west'],
  [/\bSOUTH ?EAST\b|\bSURESTE\b|\bSUDOST\b|\bSUD-EST\b/, 'south-east'],
  [/\bSOUTH ?WEST\b|\bSUROESTE\b|\bSUDWEST\b|\bSUD-OUEST\b/, 'south-west'],
  [/\bNORTH(?:ERN)?\b|\bNORTE\b|\bNORD(?:ANSICHT)?\b|\bNOORD\b/, 'north'],
  [/\bSOUTH(?:ERN)?\b|\bSUR\b|\bSUD(?:ANSICHT)?\b|\bSUED\b|\bZUID\b/, 'south'],
  [/\bEAST(?:ERN)?\b|\bESTE\b|\bEST\b|\bOST(?:ANSICHT)?\b|\bORIENTE\b|\bOOST\b/, 'east'],
  [/\bWEST(?:ERN)?\b|\bOESTE\b|\bOUEST\b|\bWEST(?:ANSICHT)?\b|\bPONIENTE\b/, 'west'],
  [/\bFRONT(?:AL)?\b|\bPRINCIPAL\b|\bSTREET\b|\bROAD\b|\bMAIN\b|\bENTRANCE\b|\bVORDER/, 'front'],
  [/\bREAR\b|\bBACK\b|\bPOSTERIOR\b|\bARRIERE\b|\bRUCK|\bACHTER/, 'back'],
  [/\bSIDE\b|\bLATERAL\b|\bLEFT\b|\bRIGHT\b|\bSEITEN/, 'side'],
]

/** what a title names, by its words alone; null when it names no kind of drawing */
export function kindOfTitle(raw: string): Omit<View, 'box' | 'by' | 'scale'> | null {
  const t = norm(raw)
  // (a scale bar's caption: "PLAN GRAPHIC SCALE", "Metric scale - to match plan exports"; a title's own "SCALE 1:50" stays)
  if (!t || LEVEL_MARK.test(t) || /\bGRAPHIC SCALE\b|\bSCALE BAR\b|^SCALE\b|\bSCALE\b(?!\s*[:=]?\s*(?:1\s*:|\d+(?:\/\d+)?\s*"|N\.?T\.?S|AS (?:NOTED|SHOWN)))/.test(t)) return null
  const title = raw.trim().replace(/\s+/g, ' ')
  if (COVER.test(t)) return { kind: 'title', title }
  if (DETAIL.test(t)) return { kind: 'detail', title }
  if (SCHEDULE.test(t)) return { kind: 'schedule', title }
  if (ELEV.test(t)) {
    if (INTERIOR.test(t)) return { kind: 'interior', title }
    // a compass word in brackets says it best: "FRONT ELEVATION (SOUTH)"
    const said = /\(([^)]*)\)/.exec(t)?.[1] ?? ''
    const facade = FACADES.find(([re]) => re.test(said))?.[1] ?? FACADES.find(([re]) => re.test(t))?.[1]
    return { kind: 'elevation', title, ...(facade ? { facade } : {}) }
  }
  if (SECTION.test(t)) {
    const mark = /\b([A-Z0-9]{1,2})\s*-\s*\1\b/.exec(t)?.[0].replace(/\s+/g, '') ?? /\b(?:SECTION|CORTE|SCHNITT|COUPE|SECCION)\s+([A-Z0-9]{1,2})\b/.exec(t)?.[1]
    return { kind: 'section', title, ...(mark ? { mark } : {}) }
  }
  if (SITE.test(t) && !/\bFLOOR\b/.test(t)) return { kind: 'site', title }
  const level = levelOf(t)
  // a floor named on its own is a title ("GROUND FLOOR", "BASEMENT 01", "LEVEL 1 TO 11"), a note is not ("DUCT OPEN TO BASEMENT")
  const note = /\b(?:TO|FROM|OPEN|ABOVE|BELOW|UP|DN|DOWN|RAMP|DUCT|PIPE|RISER|SHAFT|VENT|LINE|SLAB|FINISH|EXISTING|NEW|AT|ON|IN|OF|THE|WITH|FOR|OVER|UNDER|THROUGH|CONDITIONED|PER|NUMBER|NO|TOTAL|LOCATION|PARKING|HEIGHT|AREA|SIZE|VIEW|PERSPECTIVE|RENDER|PHOTO|IMAGE|SEATING)\b|@|\bFLOORS\s*:/.test(t.replace(/(\d(?:ST|ND|RD|TH)?)\s*(?:TO|-)\s*(?=\d)/g, '$1 '))
  if (PLAN.test(t) || (level && !note && t.split(' ').filter((w) => !/^\d|^[&,/]$|^AND$/.test(w)).length <= 6 && /\bFLOORS?\b|\bLEVELS?\b|\bBASEMENT\b|\bGROUND\b|\bROOF ?TOP\b|\bMEZZANINE\b|\bTYPICAL\b|\bSTOREY\b|\bNIVEL\b|\bPISO\b|\bGESCHOSS\b|\bETAGE\b/.test(t))) {
    const use = USE.find(([re]) => re.test(t))?.[1]
    return { kind: 'plan', title, ...(level ? { level } : {}), ...(use ? { use } : {}) }
  }
  if (NOTES.test(t)) return { kind: 'title', title }
  return null
}

/**
 * What a file of a set is (session 31 levels: a folder of DXFs / SVGs is a set — one drawing a file): its biggest title
 * inside ("Internal walls, first floor", "East Elevation") or its file name with the short codes architects name files by
 * ("GF", "1F", "RF", "TYP", "B1", "E-1" an elevation, "S-2" a section, a sheet number "A-101"), whichever names more; a
 * plan's floors from either. Neither: a plan when its lines make two or more closed rooms, else other. `texts`: the file's
 * words biggest first (ImportResult.texts).
 */
export function fileView(name: string, texts: { text: string }[], rooms = 0): Pick<View, 'kind' | 'title' | 'level' | 'facade' | 'mark' | 'use' | 'by'> {
  const base = name.replace(/\.[^.]+$/, '')
  const said = norm(base.replace(/[_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'))
    .replace(/\bG\.?F\b/g, 'GROUND FLOOR')
    .replace(/\b(\d{1,2})\s?F\b/g, '$1 FLOOR')
    .replace(/\bR\.?F\b/g, 'ROOF')
    .replace(/\bTYP\b/g, 'TYPICAL FLOOR')
    .replace(/^E\s?-?\s?(\d{1,2})$/, 'ELEVATION $1')
    .replace(/^S\s?-?\s?(\d{1,2})$/, 'SECTION $1')
  const byName = kindOfTitle(said) ?? (levelOf(said) ? { kind: 'plan' as const, title: base, level: levelOf(said)! } : null)
  const t = texts.map((x) => x.text).find((x) => !notATitle(x) && kindOfTitle(x) && kindOfTitle(x)!.kind !== 'title')
  const byText = t ? kindOfTitle(t) : null
  const byNo = SHEET_NO.test(said.replace(/\s+/g, '')) ? kindOfNumber(said.replace(/\s+/g, '')) : null
  // the inside's title when it names a floor or the name names nothing; else the name, with the inside's floor or side
  const pick = byText && (byText.level || byText.facade || !byName) ? byText : byName ? { ...byName, ...(byText?.kind === byName.kind && byText.level && !byName.level ? { level: byText.level } : {}) } : null
  if (pick) {
    const facade = pick.kind === 'elevation' && !pick.facade ? (kindOfTitle(`${said} ELEVATION`)?.facade ?? byText?.facade) : pick.facade
    return { ...pick, title: pick === byText ? t! : base, ...(facade ? { facade } : {}), by: 'words' }
  }
  if (byNo) return { kind: byNo, title: base, by: 'number' }
  return { kind: rooms >= 2 ? 'plan' : 'other', title: base, by: 'shape' }
}

/** the words that name a part of a floor drawn in halves: "(LEFT PART)", "PART B", "EAST WING", "SHEET 2 OF 2" */
const PART = /\b(?:(?:LEFT|RIGHT|NORTH|SOUTH|EAST|WEST|UPPER|LOWER)\s+(?:PART|HALF|SIDE|WING|PORTION)|(?:PART|HALF|PORTION|SECTOR|ZONE)\s*[-:]?\s*[A-Z0-9]{1,2}|MATCH\s*LINE|SHEET\s*\d+\s*OF\s*\d+)\b/g

/** a note, a sentence, a dimension: never a view's title */
const notATitle = (s: string): boolean => {
  const t = norm(s)
  const words = t.split(' ').filter((w) => !/^(?:LEVEL-?)?\d|^[&,/]$|^AND$/.test(w)).length // (a run of floor numbers counts as none)
  // a sentence: ends with a full stop, starts with a bullet, or runs on with small words in lower case ("There is no … of …")
  const prose = (s.match(/(?:^|\s)(?:the|of|with|is|are|in|on|for|and|to|a|an|by|every|our|your|its)(?=\s|$)/g) ?? []).length >= 2
  return words > 12 || t.length > 90 || (/[.,;:]$/.test(t) &&!/^[A-Z]{1,4}\.$/.test(t)) || (words > 8 && /,/.test(t)) || /^\d+[.)]\s/.test(t) || /^[•·*\-–]/.test(t) || prose || /\b(?:SEE|REFER|REFERENCE|SHALL|PROVIDE|ALL |TYP\. AT|WHERE|FOR )\b/.test(t) || /^[\d'" -]+$/.test(t)
}

// ---------- the sheet number ----------

/** "A2.5", "A-201", "M-501", "F-001" — a discipline letter or two and the sheet's number; in a plot stamp "…\M-501.dwg" */
const SHEET_NO = /^([A-Z]{1,2})\s?-?\s?(\d)(\d{0,2}|\.\d{1,2})$/
export function sheetNumberOf(texts: SheetText[]): string | null {
  // the biggest such text on the page (the title block prints it large), else a plot stamp's drawing file name
  const cands = texts.map((t) => ({ t, s: norm(t.text) })).filter(({ s }) => SHEET_NO.test(s)).sort((a, b) => b.t.height - a.t.height)
  const others = (t: SheetText) => texts.filter((x) => x !== t).map((x) => x.height).sort((a, b) => a - b)
  const median = (t: SheetText) => others(t)[Math.floor(others(t).length / 2)] ?? 0
  if (cands[0] && cands[0].t.height >= 1.8 * median(cands[0].t)) return cands[0].s.replace(/\s+/g, '')
  for (const t of texts) {
    const m = /(?:^|[\\/\s])([A-Z]{1,2}-?\d{3})(?:[-_ ][A-Z0-9]{1,3})?\.DWG/.exec(norm(t.text))
    if (m) return m[1]
  }
  return null
}
/** a sheet number's kind by its first digit (the US National CAD Standard's sheet types); null for an unknown digit */
export function kindOfNumber(no: string): SheetKind | null {
  const m = SHEET_NO.exec(no.replace(/(\D)(\d)/, '$1$2'))
  if (!m) return null
  return ({ '0': 'title', '1': 'plan', '2': 'elevation', '3': 'section', '4': 'detail', '5': 'detail', '6': 'schedule' } as Record<string, SheetKind>)[m[2]] ?? null
}

// ---------- geometry ----------

const boxOf = (pts: Pt[]): Box => {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const p of pts) (b.x0 = Math.min(b.x0, p.x)), (b.y0 = Math.min(b.y0, p.y)), (b.x1 = Math.max(b.x1, p.x)), (b.y1 = Math.max(b.y1, p.y))
  return b
}
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })
/** the box a text covers (along its baseline, its height across) */
export const textBox = (t: SheetText): Box => {
  const hx = (t.dir.x * t.width) / 2, hy = (t.dir.y * t.width) / 2
  const nx = (-t.dir.y * t.height) / 2, ny = (t.dir.x * t.height) / 2
  return boxOf([
    { x: t.at.x - hx - nx, y: t.at.y - hy - ny },
    { x: t.at.x + hx + nx, y: t.at.y + hy + ny },
    { x: t.at.x - hx + nx, y: t.at.y - hy + ny },
    { x: t.at.x + hx - nx, y: t.at.y + hy - ny },
  ])
}

/**
 * The page's lines in islands: lines closer than `gap` to each other are one island. Lines nearly as long as the page
 * (the border, the title block's rules) join nothing and belong to no island.
 */
export function islands(segs: Seg[], page: Box, gap: number): { box: Box; segs: number[] }[] {
  const W = page.x1 - page.x0, H = page.y1 - page.y0
  const parent = segs.map((_, i) => i)
  const find = (i: number): number => {
    let r = i
    while (parent[r] !== r) r = parent[r]
    while (parent[i] !== r) [parent[i], i] = [r, parent[i]]
    return r
  }
  const cells = new Map<string, number>()
  const key = (x: number, y: number) => `${Math.floor(x / gap)},${Math.floor(y / gap)}`
  const skip = (g: Seg) => Math.abs(g.b.x - g.a.x) > 0.85 * W || Math.abs(g.b.y - g.a.y) > 0.85 * H
  segs.forEach((g, i) => {
    if (skip(g)) return
    const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
    const n = Math.max(1, Math.ceil(L / (gap / 2)))
    for (let k = 0; k <= n; k++) {
      const x = g.a.x + ((g.b.x - g.a.x) * k) / n, y = g.a.y + ((g.b.y - g.a.y) * k) / n
      for (const dx of [-1, 0, 1])
        for (const dy of [-1, 0, 1]) {
          const c = cells.get(key(x + dx * gap, y + dy * gap))
          if (c !== undefined) parent[find(c)] = find(i)
        }
      cells.set(key(x, y), i)
    }
  })
  const groups = new Map<number, number[]>()
  segs.forEach((g, i) => !skip(g) && (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(i))
  return [...groups.values()].map((ix) => ({ segs: ix, box: boxOf(ix.flatMap((i) => [segs[i].a, segs[i].b])) }))
}

/**
 * How many quarter-circle arcs are door swings: a radius 0.4–3 % of the page's long side (a door at 1:50–1:200) and a leaf —
 * a straight line from the hinge (the arc's centre) as long as the radius to one of its ends. A circle drawn as four
 * quarters has no leaf.
 */
const swings = (arcs: ArcPrim[], segs: Seg[], page: Box): number => {
  const L = Math.max(page.x1 - page.x0, page.y1 - page.y0)
  const quarter = arcs.filter((a) => {
    const sweep = (((a.a1 - a.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    return Math.abs(sweep - Math.PI / 2) < 0.15 && a.r > 0.004 * L && a.r < 0.03 * L
  })
  if (!quarter.length) return 0
  // every line's two ends in a grid, so each swing looks only at the lines starting near its hinge
  const C = 4
  const grid = new Map<string, [Pt, Pt][]>()
  for (const g of segs)
    for (const [p, q] of [[g.a, g.b], [g.b, g.a]] as [Pt, Pt][]) {
      const k = `${Math.floor(p.x / C)},${Math.floor(p.y / C)}`
      ;(grid.get(k) ?? grid.set(k, []).get(k)!).push([p, q])
    }
  const at = (p: Pt, q: Pt, tol: number) => Math.hypot(p.x - q.x, p.y - q.y) <= tol
  return quarter.filter((a) => {
    const ends = [a.a0, a.a1].map((t) => ({ x: a.c.x + a.r * Math.cos(t), y: a.c.y + a.r * Math.sin(t) }))
    const tol = 0.1 * a.r
    const n = Math.ceil(tol / C)
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++)
        for (const [p, q] of grid.get(`${Math.floor(a.c.x / C) + i},${Math.floor(a.c.y / C) + j}`) ?? []) if (at(p, a.c, tol) && ends.some((e) => at(q, e, tol))) return true
    return false
  }).length
}

/**
 * The shape's verdict when nothing is written: a plan (door swings, or many short parallel pairs), a schedule (a ruled
 * grid: many long horizontal lines of one length), a general sheet (mostly words), else other.
 */
export function shapeKind(segs: Seg[], arcs: ArcPrim[], texts: SheetText[], page: Box): SheetKind {
  const f = shapeFacts(segs, arcs, texts, page)
  if (f.swings >= 3) return 'plan'
  if (f.ruled >= 40 || (f.ruled >= 16 && f.ruled * 40 > segs.length)) return 'schedule'
  if (f.words > 0.08 && segs.length < 40 * texts.length) return 'title'
  return 'other'
}
/** what shapeKind weighs: door swings, horizontal rules of a table (≥ 8 sharing their two ends), the share of the page under words */
export function shapeFacts(segs: Seg[], arcs: ArcPrim[], texts: SheetText[], page: Box): { swings: number; ruled: number; words: number } {
  const W = page.x1 - page.x0
  const rows = new Map<string, number>()
  for (const g of segs) if (Math.abs(g.a.y - g.b.y) < 0.5 && Math.abs(g.b.x - g.a.x) > 0.08 * W) {
    const k = `${Math.round(Math.min(g.a.x, g.b.x))},${Math.round(Math.max(g.a.x, g.b.x))}`
    rows.set(k, (rows.get(k) ?? 0) + 1)
  }
  const area = (page.x1 - page.x0) * (page.y1 - page.y0)
  return {
    swings: swings(arcs, segs, page),
    ruled: [...rows.values()].filter((n) => n >= 8).reduce((a, n) => a + n, 0),
    words: texts.reduce((a, t) => a + t.width * t.height, 0) / area,
  }
}

// ---------- the page ----------

interface Title {
  t: SheetText
  box: Box
  view: Omit<View, 'box' | 'by' | 'scale'>
}

/**
 * Every view on a page: its kind (and level / facade / mark), its scale and its frame. One view (the whole page) when the
 * page has no title or one; a cover sheet is one view of kind 'title' whatever small plans it shows. With how tall the
 * building is when the page says so (storeysOf: a brochure's "2B+G+12", a cover's "10 STORIED").
 */
export function readSheet(page: SheetPage): SheetRead {
  const r = viewsOf(page)
  const storeys = page.texts.map((t) => storeysOf(t.text)).find((s) => s)
  // a page of one plan that names its flat in big letters ("TYPE-A" over "TOWER-1 LEVEL 1 to 11"): a flat's page
  const plans = r.views.filter((v) => v.kind === 'plan')
  const flat = plans.length === 1 ? [...page.texts].sort((a, b) => b.height - a.height).find((t) => t.text.trim().length <= 24 && flatTypeOf({ name: t.text, kind: 'other' })) : undefined
  const views = (flat ? r.views.map((v) => (v === plans[0] ? { ...v, flat: flat.text.trim() } : v)) : r.views).map((v) => (ofSlopes(v, page.texts) ? { ...v, kind: 'roof' as const } : v))
  return { ...r, views, ...(storeys ? { storeys } : {}) }
}

/** the words of a roof of slopes: slope, a pitch (4/12, 30°), ridge, hip, gable, eaves, gutter, shingles, roof panels / tiles / sheets (the languages the titles read) */
const SLOPES = /\b(slopes?|pitch|ridge|hip|gable|eaves?|gutters?|shingles?|downspouts?|pendiente|cumbrera|gef(?:ä|ae)lle|pente|pendenza)\b|\b\d{1,2}\s*\/\s*12\b|\broof (panels?|tiles?|sheets?|sheeting)\b/i
/** the words of a rooftop one walks on (Dhaka): its stair and lift, the tanks, the machine room, a garden */
const ROOFTOP = /\b(stairs?|lift|lobby|tank|o\.?h\.?w\.?t|machine room|garden|terrace|toilet|guard|up|dn)\b/i
/**
 * A plan of the roof alone ("ROOF PLAN") whose words speak of its slopes (two or more) and of nothing one walks on: the roof
 * of a house, kept with the project as a drawing of the roof — never a floor (the farmhouse's became a Rooftop floor of a
 * picture of slopes, qa4 problem 15). A Dhaka rooftop plan (its stair, lift, tanks) stays a floor.
 */
function ofSlopes(v: View, texts: SheetText[]): boolean {
  if (v.kind !== 'plan' || v.level?.at.join() !== 'R') return false
  const words = texts.filter((t) => t.at.x >= v.box.x0 && t.at.x <= v.box.x1 && t.at.y >= v.box.y0 && t.at.y <= v.box.y1).map((t) => t.text)
  return words.filter((w) => SLOPES.test(w)).length >= 2 && !words.some((w) => ROOFTOP.test(w))
}
function viewsOf(page: SheetPage): SheetRead {
  const { texts, segs, arcs, box } = page
  const number = sheetNumberOf(texts) ?? undefined
  // stacked lines of one heading ("GROUND" over "FLOOR PLAN") read as one
  const joined = stackLines(texts)
  // the value of a label ("Parking Location:" over "Ground Floor", "Floors:" before "09") is no title
  const valueOf = (t: SheetText) =>
    joined.some((l) => l !== t && /:\s*$/.test(l.text) && Math.abs(l.height - t.height) < 0.3 * t.height && ((Math.abs(l.at.y - t.at.y) < 0.3 * t.height && l.at.x < t.at.x && t.at.x - l.at.x < l.width / 2 + t.width / 2 + 4 * t.height) || (l.at.y - t.at.y > 0.6 * t.height && l.at.y - t.at.y < 1.8 * t.height && (Math.abs(l.at.x - l.width / 2 - (t.at.x - t.width / 2)) < t.height || Math.abs(l.at.x - t.at.x) < t.height))))
  const cands: Title[] = []
  for (const t of joined) {
    if (notATitle(t.text) || valueOf(t)) continue
    const view = kindOfTitle(t.text)
    if (view) cands.push({ t, box: textBox(t), view })
  }
  // a title is at the size of the page's biggest drawing titles (a sheet index entry, a level mark, a room's note are smaller)
  const named = cands.filter((c) => c.view.kind !== 'title' || COVER.test(norm(c.t.text)))
  const top = Math.max(0, ...(named.length ? named : cands).map((c) => c.t.height))
  const titles = cands.filter((c) => c.t.height >= 0.75 * top)
  const scaleNear = (c: Title): number | undefined => {
    const near = texts
      .filter((s) => printedScale(s.text) !== null)
      .map((s) => ({ s, d: Math.hypot(s.at.x - c.t.at.x, s.at.y - c.t.at.y) }))
      .filter(({ d }) => d < 6 * c.t.height + c.t.width)
      .sort((a, b) => a.d - b.d)[0]
    return near ? printedScale(near.s.text)! : undefined
  }
  // one drawing on the page: its frame is the page's drawing area (the border, the title block and a notes column left out)
  const onePage = (v: Omit<View, 'box' | 'by' | 'scale'>, by: View['by'], scale?: number): SheetRead => ({
    views: [detailByScale({ ...v, box: within(drawingArea(page), 0.5), by, ...(scale ? { scale } : {}) })],
    ...(number ? { number } : {}),
  })
  const pageScale = (): number | undefined => {
    const all = [...new Set(texts.map((s) => printedScale(s.text)).filter((n): n is number => n !== null))]
    return all.length === 1 ? all[0] : undefined
  }
  // a cover sheet
  const cover = titles.find((c) => COVER.test(norm(c.t.text)))
  if (cover) return onePage({ kind: 'title', title: cover.view.title }, 'words')
  const drawings = titles.filter((c) => c.view.kind !== 'title')
  if (!drawings.length) {
    if (titles.length) return onePage({ kind: 'title', title: titles[0].view.title }, 'words')
    const byNo = number ? kindOfNumber(number) : null
    if (byNo) return onePage({ kind: byNo, title: '' }, 'number', pageScale())
    return onePage({ kind: shapeKind(segs, arcs, texts, box), title: '' }, 'shape', pageScale())
  }
  // a sheet numbered as details or schedules (M-501, E-601) whose words name neither: its words are labels inside a detail
  const series = number ? /\d/.exec(number)?.[0] : undefined
  if ((series === '5' || series === '6') && !drawings.some((c) => c.view.kind === 'detail' || c.view.kind === 'schedule'))
    return onePage({ kind: kindOfNumber(number!)!, title: '' }, 'number')
  if (drawings.length === 1) {
    // its own title, the title's underline and scale line are not the drawing: the frame stops at the title when it sits
    // in the outer quarter of the drawing area, under the drawing (or over it)
    const c = drawings[0]
    const r = onePage(c.view, 'words', scaleNear(c) ?? pageScale())
    const b = r.views[0].box, H = b.y1 - b.y0
    const under = titleUnder(c, segs)
    if (under && c.box.y1 < b.y0 + 0.25 * H) r.views[0].box = { ...b, y0: c.box.y1 }
    else if (!under && c.box.y0 > b.y1 - 0.25 * H) r.views[0].box = { ...b, y1: c.box.y0 }
    return r
  }
  // a sheet of details (most of its titles say so, or its number does and one does): one page of details, not split
  const details = drawings.filter((c) => c.view.kind === 'detail').length
  if (details * 2 > drawings.length || (details && number && kindOfNumber(number) === 'detail'))
    return onePage({ kind: 'detail', title: drawings.find((c) => c.view.kind === 'detail')!.view.title }, 'words')
  if (drawings.every((c) => c.view.kind === 'schedule')) return onePage(drawings[0].view, 'words')
  return { views: split(page, titles, drawings, scaleNear), ...(number ? { number } : {}) }
}

/** a title sits under its drawing (true) or over it: the nearer lines, just over it or just under it (an underline right at it aside) */
function titleUnder(c: Title, segs: Seg[]): boolean {
  const nearest = (up: boolean) => {
    let d = Infinity
    for (const g of segs) {
      const m = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
      if (m.x < c.box.x0 - c.t.width * 0.25 || m.x > c.box.x1 + c.t.width * 0.25) continue
      const e = up ? m.y - c.box.y1 : c.box.y0 - m.y
      if (e > c.t.height && e < d) d = e
    }
    return d
  }
  return nearest(true) <= nearest(false)
}

/**
 * Where the drawings are on a sheet: inside its border, short of its title block and a notes column — strips cut off by a
 * single rule nearly as tall (or wide) as the page, in the outer 30 % of it. The page itself when it has no such rules (a
 * brochure page, a plot with no frame). A plan's own wall is never that long a single line.
 */
export function drawingArea(page: SheetPage): Box {
  const { box, segs } = page
  const W = box.x1 - box.x0, H = box.y1 - box.y0
  const tall = segs.filter((g) => Math.abs(g.a.x - g.b.x) < 0.5 && Math.abs(g.b.y - g.a.y) > 0.85 * H).map((g) => g.a.x)
  const wide = segs.filter((g) => Math.abs(g.a.y - g.b.y) < 0.5 && Math.abs(g.b.x - g.a.x) > 0.85 * W).map((g) => g.a.y)
  const edge = (xs: number[], lo: number, hi: number) => {
    const inner = xs.filter((x) => x > lo + 0.5 && x < hi - 0.5)
    return { lo: Math.max(lo, ...inner.filter((x) => x < lo + 0.3 * (hi - lo))), hi: Math.min(hi, ...inner.filter((x) => x > hi - 0.3 * (hi - lo))) }
  }
  const ex = edge(tall, box.x0, box.x1), ey = edge(wide, box.y0, box.y1)
  return { x0: ex.lo, x1: ex.hi, y0: ey.lo, y1: ey.hi }
}
/** a box a little inside another: the sheet's own rules on its edge stay out */
const within = (b: Box, d: number): Box => ({ x0: b.x0 + d, y0: b.y0 + d, x1: b.x1 - d, y1: b.y1 - d })

/** a view that says detail by its scale: finer than 1 : 20 with no floor named (a 1 : 10 wall section, a 1 : 5 sill) */
const detailByScale = (v: View): View => (v.scale && v.scale <= 20 && v.kind !== 'detail' && v.kind !== 'schedule' && v.kind !== 'title' && !v.level ? { ...v, kind: 'detail' } : v)

/** headings set in two lines ("GROUND" over "FLOOR PLAN", "TYPICAL" over "FLOOR PLAN") joined; a line already joined is not used twice */
function stackLines(texts: SheetText[]): SheetText[] {
  const out: SheetText[] = []
  const used = new Set<SheetText>()
  const horiz = (t: SheetText) => Math.abs(t.dir.y) < 0.2 && t.dir.x > 0
  for (const a of texts) {
    if (used.has(a)) continue
    const b = horiz(a) && a.text.trim().split(/\s+/).length <= 3
      ? texts.find((b) => b !== a && !used.has(b) && horiz(b) && Math.abs(b.height - a.height) <= 0.2 * a.height && a.at.y - b.at.y > 0.6 * a.height && a.at.y - b.at.y < 1.8 * a.height && Math.abs(b.at.x - a.at.x) < 0.5 * Math.max(a.width, b.width) + a.height && b.text.trim().split(/\s+/).length <= 4)
      : undefined
    // a floor title with its floors in a smaller line under it: "Typical Floor" over "2nd, 4th, 6th & 8th"
    const list = !b && horiz(a) && kindOfTitle(a.text)?.kind === 'plan' && !levelOf(a.text)?.at.length
      ? texts.find((b) => b !== a && !used.has(b) && horiz(b) && /^\s*\d{1,3}(?:st|nd|rd|th)?(?:\s*(?:,|&|and|\/)\s*\d{1,3}(?:st|nd|rd|th)?)+\s*$/i.test(b.text) && a.at.y - b.at.y > 0.5 * a.height && a.at.y - b.at.y < 2.5 * a.height && Math.abs(b.at.x - b.width / 2 - (a.at.x - a.width / 2)) < 2 * a.height)
      : undefined
    if (list) {
      used.add(a), used.add(list)
      const bx = union(textBox(a), textBox(list))
      out.push({ text: `${a.text.trim()} ${list.text.trim()}`, at: { x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 }, height: a.height, width: bx.x1 - bx.x0, dir: a.dir })
    } else if (b && kindOfTitle(`${a.text} ${b.text}`) && !kindOfTitle(a.text)) {
      used.add(a), used.add(b)
      const bx = union(textBox(a), textBox(b))
      out.push({ text: `${a.text.trim()} ${b.text.trim()}`, at: { x: (bx.x0 + bx.x1) / 2, y: (bx.y0 + bx.y1) / 2 }, height: a.height, width: bx.x1 - bx.x0, dir: a.dir })
    } else out.push(a)
  }
  return out
}

/**
 * A page of several views: each island of lines goes to the title beside it — titles under their drawings on most sheets,
 * over them on some (the page's own habit: where most titles have lines just beside them); an island beside no title (the
 * title block, a notes column) joins none. Notes headings take their islands and are then left out.
 */
function split(page: SheetPage, titles: Title[], drawings: Title[], scaleNear: (c: Title) => number | undefined): View[] {
  const { box, segs } = page
  const diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0)
  const gap = Math.max(2, 0.006 * diag)
  const isl = islands(segs, box, gap)
  const area = drawingArea(page)
  const outside = (b: Box) => b.x1 <= area.x0 + gap || b.x0 >= area.x1 - gap || b.y1 <= area.y0 + gap || b.y0 >= area.y1 - gap
  // each title's own habit: its drawing is the nearer side's lines, over it or under it (an underline right at it aside)
  const under = new Map(titles.map((c) => [c, titleUnder(c, segs)]))
  const lift = 0.02 * diag
  const cost = (c: Title, b: Box) => {
    const dx = Math.max(0, c.box.x0 - b.x1, b.x0 - c.box.x1)
    const dy = Math.max(0, c.box.y0 - b.y1, b.y0 - c.box.y1)
    const wrongSide = under.get(c) ? c.box.y0 > b.y1 : c.box.y1 < b.y0 // a title over the island when it sits under its drawing, or the other way
    return dx + (dx > 0 ? lift : 0) + dy * (wrongSide ? 3 : 1)
  }
  const reach = 0.15 * diag
  const frames = new Map<Title, Box>(titles.map((c) => [c, c.box]))
  for (const i of isl) {
    if (outside(i.box)) continue
    let best: Title | null = null
    let bc = Infinity
    for (const c of titles) {
      const k = cost(c, i.box)
      if (k < bc) (bc = k), (best = c)
    }
    if (best && bc <= reach) frames.set(best, union(frames.get(best)!, i.box))
  }
  // a view's scale line under its title belongs to it
  let views: View[] = drawings.map((c) => {
    const s = scaleNear(c)
    const f = frames.get(c)!
    const inner = within(area, 0.5) // (never past the border or into the title block)
    const box = { x0: Math.max(f.x0, inner.x0), y0: Math.max(f.y0, inner.y0), x1: Math.min(f.x1, inner.x1), y1: Math.min(f.y1, inner.y1) }
    return detailByScale({ ...c.view, box: box.x1 > box.x0 && box.y1 > box.y0 ? box : f, by: 'words', ...(s ? { scale: s } : {}) })
  })
  // one floor drawn as two halves (its two flats, each under the same "FLOOR : 2"; "GROUND FLOOR PLAN (LEFT PART)" beside its
  // "(RIGHT PART)") is one view: the whole floor. Two plans of one floor titled apart otherwise ("Ground Floor", "Ground Floor –
  // Enhanced Accessible") are two ways to build it: two views
  const key = (v: View) => (v.kind === 'plan' && v.level ? `${v.level.at.join()} ${norm(v.title).replace(PART, ' ').replace(/[()[\]–-]+/g, ' ').replace(/\s+/g, ' ').trim()}` : null)
  const out: View[] = []
  for (const v of views) {
    const same = key(v) && out.find((o) => key(o) === key(v) && o.use === v.use)
    if (same) same.box = union(same.box, v.box)
    else out.push({ ...v })
  }
  views = out
  return views
}

// ---------- the set ----------

/** A project floor (data/building/projects.ts Slot): 0 ground, n ≥ 1 floor n, −n basement n, 'R' the rooftop. */
export type SetSlot = number | 'R'

/**
 * Where each plan of a set goes, by the floors its title names. A set that names a ground floor (or counts from the ground
 * up in its words: "1. OG", "R+1") numbers its upper floors from 1; a set that does not starts at 1 on the ground (the US
 * "1ST FLOOR", the Chilean "PRIMER NIVEL", Dhaka's "Level-01" lobby): its floor n goes on project floor n − 1. A mezzanine
 * takes floor 1 when nothing else does; an attic the floor over the highest; a typical floor with no numbers every floor
 * from 1 up to the highest floor the set names, or `floors` when the set says how tall the building is (storeysOf: "G+9"),
 * else only floor 1. `levels[i]` null: nothing named.
 */
export function slotsFor(levels: (Level | null | undefined)[], floors = 0): SetSlot[][] {
  const all = levels.filter((l): l is Level => !!l)
  const nums = all.flatMap((l) => l.at.filter((f): f is number => typeof f === 'number' && f >= 1))
  const ground = all.some((l) => l.at.includes(0) || l.above)
  // (a house of a ground floor and a "2ND FLOOR" over it, no 1st, no mezzanine and nothing higher — Canada's fourplex —
  // counts its ground floor as the 1st: its 2nd floor is floor 1)
  const house = ground && !all.some((l) => l.above || l.at.includes('mezz')) && nums.length > 0 && nums.every((n) => n === 2)
  const shift = (!ground && nums.length > 0 && Math.min(...nums) === 1) || house ? 1 : 0
  const placed = (f: number) => (f >= 1 ? f - shift : f)
  const top = Math.max(0, ...nums.map(placed))
  const taken = new Set(all.flatMap((l) => l.at.filter((f): f is number => typeof f === 'number').map(placed)))
  return levels.map((l) => {
    if (!l) return []
    const out: SetSlot[] = []
    for (const f of l.at) {
      if (typeof f === 'number') out.push(placed(f))
      else if (f === 'R') out.push('R')
      else if (f === 'attic') out.push(top + 1)
      else if (f === 'mezz' && !taken.has(1)) out.push(1)
    }
    if (l.typical && !l.at.some((f) => typeof f === 'number' && f >= 1)) {
      let lo = 1
      while (taken.has(lo)) lo++
      for (let k = lo; k <= Math.max(lo, top, floors); k++) if (!taken.has(k)) out.push(k)
    }
    return [...new Set(out)]
  })
}

/** floors in short for the Set panel: "B1, G, 2–8, Roof" (runs of three or more as a range) */
export function slotsWords(ss: SetSlot[]): string {
  const nums = ss.filter((s): s is number => typeof s === 'number').sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < nums.length; ) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1 && Math.sign(nums[j + 1]) === Math.sign(nums[j])) j++ // (basements, G and floors apart)
    const w = (n: number) => (n === 0 ? 'G' : n < 0 ? `B${-n}` : String(n))
    parts.push(j - i >= 2 ? `${w(nums[i])}–${w(nums[j])}` : nums.slice(i, j + 1).map(w).join(', '))
    i = j + 1
  }
  if (ss.includes('R')) parts.push('Roof')
  return parts.join(', ')
}

/** what a person types for floors back to slots: "G", "B1", "2-8", "3, 5", "Roof" / "R"; null when a piece is not a floor */
export function parseSlots(text: string): SetSlot[] | null {
  const out: SetSlot[] = []
  const one = (p: string): number | null => (p === 'G' || p === 'GROUND' ? 0 : /^B\d{1,2}$/.test(p) ? -Number(p.slice(1)) : /^\d{1,3}$/.test(p) ? Number(p) : null)
  for (const part of text.replace(/\s*[-–]\s*/g, '-').split(/[\s,;]+/).filter(Boolean)) {
    const p = part.toUpperCase()
    if (p === 'R' || p === 'ROOF' || p === 'ROOFTOP') {
      out.push('R')
      continue
    }
    const [a, b = a] = p.split('-').map(one)
    if (a === null || b === null || p.split('-').length > 2) return null
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) out.push(k)
  }
  return [...new Set(out)]
}

/** what a view of the set is, as the Set panel holds it: its kind, the floors its title names, a plan's use, and what the person set */
export interface SetPick {
  kind: SheetKind
  level?: Level | null
  use?: string
  /** floors the person typed (a plan) */
  slots?: SetSlot[] | null
  /** ticked or not by the person */
  tick?: boolean | null
  /** its closed rooms, when it was read already (a DXF / SVG of the set): of two plans for one floor the richer is ticked */
  rooms?: number
  /** the flat its page draws (View.flat) */
  flat?: string
}
/** the kinds kept with the project as pictures when the set is built (plans become drawings; details, title pages and the rest are left out) */
export const KEPT: SheetKind[] = ['elevation', 'section', 'roof', 'site', 'schedule', 'interior']

/**
 * The set as it will be built: each plan's floors (as typed, else from its title through slotsFor, else the lowest floor
 * still free) and every view's tick — a plan is ticked when it is the first floor plan (not a ceiling, services or
 * foundation plan) for one of its floors, so a floor gets one drawing; elevations, sections, the site, schedules and
 * interior elevations are kept; the rest is left out. The person's own tick always stands. `floors`: how many floors over
 * the ground the set says the building has (storeysOf), for a typical floor that names none. `joinFlats`: plans of other flats
 * for exactly the same floors (a brochure's page a flat: "TYPE-A", "TYPE-B" … all "LEVEL 1 to 11") join the first one's
 * floor drawing (`with`: its index) instead of being left out.
 */
export function setChoices(picks: SetPick[], floors = 0, joinFlats = false): { slots: SetSlot[]; tick: boolean; with?: number }[] {
  const auto = slotsFor(
    picks.map((p) => (p.kind === 'plan' && !p.slots ? p.level : null)),
    floors,
  )
  const claimed = new Set<SetSlot>()
  // a plan naming no floor: in a set whose plans name theirs it is no floor's plan (a page read by its shape alone, a
  // diagram); in a set where none does, only the first is ticked (on the ground) — the person types the others' floors
  const named = picks.some((p, i) => p.kind === 'plan' && (p.slots ?? auto[i]).length)
  let first = true
  const out: { slots: SetSlot[]; tick: boolean; with?: number }[] = []
  // (in the set's order, but a plan read already with more rooms first: "Internal walls, first floor" before "External walls")
  const order = picks.map((_, i) => i).sort((a, b) => (picks[b].rooms ?? 0) - (picks[a].rooms ?? 0) || a - b)
  for (const i of order) {
    const p = picks[i]
    if (p.kind !== 'plan') {
      out[i] = { slots: [], tick: p.tick ?? KEPT.includes(p.kind) }
      continue
    }
    const slots = p.slots ?? auto[i]
    const tick = p.tick ?? (!p.use && (slots.length ? slots.some((s) => !claimed.has(s)) : !named && first))
    if (!slots.length && tick && p.tick == null) first = false
    if (tick) for (const s of slots) claimed.add(s)
    // another flat's page for the very same floors: one floor drawing with the first (when asked)
    const lead = joinFlats && !tick && p.tick == null && p.flat && slots.length ? order.slice(0, order.indexOf(i)).find((j) => out[j]?.tick && picks[j].flat && picks[j].flat !== p.flat && out[j].with === undefined && out[j].slots.join() === slots.join()) : undefined
    out[i] = lead !== undefined ? { slots, tick: true, with: lead } : { slots, tick }
  }
  // a ticked plan with no floor named goes on the lowest floor still free, from the ground up
  for (const o of out)
    if (o.tick && !o.slots.length && picks[out.indexOf(o)].kind === 'plan') {
      let k = 0
      while (claimed.has(k)) k++
      o.slots = [k]
      claimed.add(k)
    }
  return out
}
