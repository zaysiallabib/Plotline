/** The word table on material names as the 48 measured IFCs write them (Docs/review/outside/TABLES.md). */
import { describe, expect, test } from 'vitest'
import { classOf, coveringOption, frameOption, outerOf, outsideOption, railColor, railKind, toneGlass } from './materials'

describe('material names → the outside finish (session 31 ifcmap)', () => {
  test.each([
    ['Puuverhous', 'fo_out_timber_slats'], // Finnish timber cladding (Nordic housing, 75 outer walls)
    ['Puu - mänty rae vaakasuora', 'fo_out_clapboard'], // horizontal pine boards
    ['Stukko - valkoinen hieno', 'fo_out_render_white'],
    ['SIA_PA_Crépi beige, texturé', 'fo_out_render_sand'],
    ['Render, Beige, Textured', 'fo_out_render_sand'],
    ['Zementputz', 'fo_out_render_white'],
    ['MW - Ziegel, verputzt', 'fo_out_render_white'], // rendered brick is render
    ['Ortbeton - bewehrt Verputzt', 'fo_out_render_white'],
    ['Ziegel', 'fo_out_brick_red'],
    ['tegel, std.', 'fo_out_brick_red'],
    ['Mursten - Beklædning Grå', 'fo_out_brick_grey'],
    ['Kalkkihiekkatiili', 'fo_out_brick_white'], // sand-lime brick
    ['DD Steen - Kalkzandsteen', 'fo_out_brick_white'],
    ['Fábrica LP cerámico perforado', 'fo_out_brick_red'],
    ['Masonry - Brick', 'fo_out_brick_red'],
    ['Kivi', 'fo_out_stone'],
    ['SIA_PA_Petit Granit, coupé, poli', 'fo_out_stone'],
    ['Mauerwerk - Naturstein', 'fo_out_stone'],
    ['Dallage - Pierre', 'fo_out_stone'],
    ['Metall - Paneel, verzinkt', 'fo_out_zinc'],
    ['Blech', 'fo_out_zinc'],
    ['Kupari', 'fo_out_acp_rust'], // copper
    ['Concrete - C30/37', 'fo_out_concrete'],
    ['Stahlbeton Wand', 'fo_out_concrete'], // reinforced concrete is no steel
    ['Betoniverhous', 'fo_out_concrete'],
    ['Panel prefabricado de hormigón de 4 cm', 'fo_out_precast'],
    ['DD prefabbeton gevel', 'fo_out_precast'],
    ['Masonry - Concrete Masonry Units', 'fo_out_precast'],
    ['Maçonnerie - Béton', 'fo_out_precast'],
    ['Panel Viroc', 'fo_out_fibre_cement'],
    ['SIA - PA - Peinture appearance Eternit', 'fo_out_fibre_cement'],
    ['Maali - titaanivalkoinen', 'fo_out_render_white'],
    ['Finishes - Exterior - Timber Cladding', 'fo_out_timber_slats'],
    ['Rupanel', 'fo_out_timber_slats'],
    ['Lasi - kirkas nopea', 'glass'],
    ['Profilit', 'glass'],
  ])('%s → %s', (name, want) => expect(outsideOption(name)).toBe(want))

  test('what is never seen from outside is skipped, a name that says nothing is unknown', () => {
    for (const n of ['Våtromsplate', 'Kipsilevy', 'Eriste, villa', 'Gipskarton', 'Mineralwolle weich', 'Tuuletusväli', 'Luft', 'Default Wall', 'Material_10', '<Unnamed>', 'Generic Material', 'Metal - Stud Layer', 'tomt mönster', 'SIA_2310_IS_Panneau EPS', 'Isokorf', 'beklädnad, invändig'])
      expect([n, classOf(n)]).toEqual([n, 'skip'])
    for (const n of ['BEKLEIDUNG', 'Verhous', 'Clad - White', 'beklädnad, utvändig']) expect([n, classOf(n)]).toEqual([n, null])
  })

  test("a render's colour: its words first, else the style's colour, else white; a default grey says nothing", () => {
    expect(outsideOption('Putz', [196, 135, 106])).toBe('fo_out_render_terracotta')
    expect(outsideOption('Putz', [127, 127, 127])).toBe('fo_out_render_white')
    expect(outsideOption('Putz anthrazit', [250, 250, 250])).toBe('fo_out_render_charcoal')
  })

  test('the outer layer: an end of the layer set, the first before the last, concrete only when no cladding', () => {
    expect(outerOf(['Kipsilevy', 'Eriste, villa', 'Betoni', 'Tuuletusväli', 'Puuverhous'], true)).toBe(4)
    expect(outerOf(['Puuverhous', 'Tuuletusväli', 'Betoni', 'Kipsilevy'], true)).toBe(0)
    expect(outerOf(['Betoni', 'Eriste, villa', 'Stukko - valkoinen hieno'], true)).toBe(2)
    expect(outerOf(['Zementputz', 'Ziegel', 'Gipsputz'], true)).toBe(0)
    expect(outerOf(['Concrete - C30/37'], true)).toBe(0)
    expect(outerOf(['Gipskarton', 'Mineralwolle weich'], true)).toBe(-1)
    expect(outerOf(['Betoni', 'Kivi'], false)).toBe(1) // a list: the first that is no concrete
  })
})

describe('roofs, railings, frames', () => {
  test.each([
    ['Dach - Titanzink', true, 'rc_zinc'],
    ['Metallipinnoite', true, 'rc_zinc'],
    ['Roofing, Tile', true, 'rc_clay'],
    ['Dachdeckung - Ziegeldach', true, 'rc_clay'],
    ['Schiefer', true, 'rc_slate'],
    ['Capa de grava', false, 'rc_gravel'],
    ['Flachdach Kies', false, 'rc_gravel'],
    ['Nurmi', false, 'rc_green'],
    ['Dachdeckung - Begrünung', false, 'rc_green'],
    ['Carreau céramique', false, 'rc_terrace'],
    ['Stahlbeton Dach', false, null],
    ['Default Roof', true, null],
  ])('%s (pitched %s) → %s', (name, pitched, want) => expect(coveringOption(name, pitched)).toBe(want))

  test('a railing is glass when its infill is, else metal, else timber', () => {
    expect(railKind(['Railing:Glass Panel - Bottom Fill', 'Metal - Stainless Steel,Polished', 'Glass'])).toBe('glass')
    expect(railKind(['Railing:Panneau de verre - Remplissage Inférieur', 'Métal - Acier inoxydable, poli'])).toBe('glass')
    expect(railKind(['Geländer - Stahl', 'Metall - Edelstahl, poliert', 'Glas'])).toBe('glass')
    expect(railKind(['KAITEET', 'Metalli', 'Alumiini'])).toBe('railing')
    expect(railKind(['Aluminio'])).toBe('railing')
    expect(railKind(['Railing:1100mm [GUARDRAIL]', 'Default'])).toBeNull()
  })

  test("a railing's colour from its names, as its kind offers it (its kind's own colour: none kept)", () => {
    expect(railColor(['Steel, Paint Finish, Dark Gray'], 'railing')).toBe('anthracite')
    expect(railColor(['Iron, Cast'], 'railing')).toBe('black')
    expect(railColor(['Geländer RAL 9016', 'Stahl'], 'railing')).toBe('white')
    expect(railColor(['Metall - schwarz'], 'glass')).toBe('black')
    expect(railColor(['Metal - Stainless Steel,Polished', 'Glass'], 'glass')).toBeNull() // (silver: a glass front's own)
    expect(railColor(['Metall - Edelstahl, poliert'], 'grille')).toBe('silver') // (a grille is black by its own)
    expect(railColor(['Holz - Birke'], 'timber')).toBe('oak')
    expect(railColor(['Walnut'], 'timber')).toBe('walnut')
    expect(railColor(['Teak'], 'timber')).toBeNull() // (teak: a timber railing's own)
    expect(railColor(['Holz - Birke'], 'railing')).toBeNull() // (no timber colour on metal)
    expect(railColor(['Railing:1100mm [GUARDRAIL]', 'Default'], 'railing')).toBeNull()
  })

  test("a window's frame from its names", () => {
    expect(frameOption(['White RAL 9010', 'Glass'])).toBe('fo_frame_white')
    expect(frameOption(['SIA_Chassis PVC gris anthracite'])).toBe('fo_frame_anthracite')
    expect(frameOption(['Aluminio carpinteria blanca', 'Vidrio'])).toBe('fo_frame_white')
    expect(frameOption(['Lasi - kirkas nopea', 'Puu - mänty rae vaakasuora'])).toBe('fo_frame_timber')
    expect(frameOption(['Aluminium. Color NCS 7500-N'])).toBe('fo_frame_anthracite')
    expect(frameOption(['Window Frame', 'Glass'])).toBeNull()
  })
})

describe('glass', () => {
  test("a file's see-through colour is toned to Plotline's glass: a saturated blue goes grey-green, 18–40 % opaque", () => {
    const [r, , b, a] = toneGlass([0, 0, 1, 0.25])
    expect(b - r).toBeLessThan(0.25) // was 1: no longer a blue panel
    expect(a).toBe(0.25)
    expect(toneGlass([0.6, 0.6, 0.6, 0.05])[3]).toBe(0.18)
    expect(toneGlass([0.6, 0.6, 0.6, 0.9])[3]).toBe(0.4)
  })
})
