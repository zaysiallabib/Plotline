import { describe, expect, test } from 'vitest'
import { axisLines, glazingFrames, thinFaces } from './faces'
import type { Gray, OpeningGuess, Px, WallSeg } from './types'
import { glassMask } from './solve'

const K = 50 // px per m
const TH = 6 // wall thickness, px

/** a blank sheet with these walls drawn black (centre lines, TH thick) */
function sheet(walls: WallSeg[], w = 460, h = 400): Gray {
  const g: Gray = { width: w, height: h, data: new Uint8Array(w * h).fill(255) }
  for (const s of walls) {
    const x0 = Math.round(Math.min(s.a.x, s.b.x) - s.thicknessPx / 2), x1 = Math.round(Math.max(s.a.x, s.b.x) + s.thicknessPx / 2)
    const y0 = Math.round(Math.min(s.a.y, s.b.y) - s.thicknessPx / 2), y1 = Math.round(Math.max(s.a.y, s.b.y) + s.thicknessPx / 2)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.data[y * w + x] = 0
  }
  return g
}
const W = (ax: number, ay: number, bx: number, by: number): WallSeg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessPx: TH, conf: 1 })
/** a 1 px grey pen line (every `on` of `on + off` pixels inked: a dashed grille when off > 0) */
function pen(g: Gray, a: Px, b: Px, grey = 150, on = 1, off = 0): void {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  for (let i = 0; i <= n; i++) if (i % (on + off) < on) g.data[Math.round(a.y + ((b.y - a.y) * i) / n) * g.width + Math.round(a.x + ((b.x - a.x) * i) / n)] = grey
}
/** a 4 × 4 m room (100 … 300 px), a 1.2 × 2 m shaft on its right between two wall stubs, open to the right */
const box = [W(100, 100, 300, 100), W(300, 100, 300, 300), W(300, 300, 100, 300), W(100, 300, 100, 100)]
const stubs = [W(300, 150, 360, 150), W(300, 250, 360, 250)]

describe('coloured glazing on dark floors', () => {
  test('partial readings of one pane share a junction axis; disconnected strokes keep their own axes', () => {
    const common={horiz:true,th:1,fill:1,glass:true,colourGlass:true}
    const lines=[{...common,c:115.5,u0:0,u1:200},{...common,c:116,u0:140,u1:200},{...common,c:116,u0:250,u1:310}]
    const result=glazingFrames(lines,K)
    expect(result.filter(l=>l.u0<201).map(l=>l.c)).toEqual([115.5,115.5])
    expect(result.find(l=>l.u0===250)?.c).toBe(116)
    // No colour evidence: partial grey lines alone do not get this interpretation.
    expect(glazingFrames(lines.map(l=>({...l,colourGlass:false})),K).filter(l=>l.u0<201).map(l=>l.c)).toEqual([115.5,116])
  })
  const glazed = () => {
    const walls = [W(100, 100, 100, 300), W(100, 300, 300, 300)]
    const g = sheet(walls)
    // The blue pen is lighter in grey than the floor and lighter than the absolute grey cut in its antialiased rim.
    for (let y = 101; y < 297; y++) for (let x = 104; x < 300; x++) g.data[y * g.width + x] = 185
    const glass = new Uint8Array(g.width * g.height)
    for (let u = 100; u <= 300; u++) {
      g.data[100 * g.width + u] = 220
      g.data[u * g.width + 300] = 220
      glass[100 * g.width + u] = glass[u * g.width + 300] = 1
    }
    return { walls, g, glass }
  }
  test('two blue window fronts meet at a corner and close the room at the drawn lines', () => {
    const { walls, g, glass } = glazed()
    const r = thinFaces(g, { k: K, walls, openings: [], glass, labels: [{ at: {x:200,y:200}, name:'BED 1' }] })
    expect(r.walls).toHaveLength(2)
    expect(r.walls.every((w) => w.glass)).toBe(true)
    expect(r.faces).toHaveLength(1)
    expect(r.faces[0].areaSqm).toBeCloseTo(16, 0)
    expect(r.walls.some((w) => Math.abs(w.a.y-100)<1 && Math.abs(w.b.y-100)<1)).toBe(true)
    expect(r.walls.some((w) => Math.abs(w.a.x-300)<1 && Math.abs(w.b.x-300)<1)).toBe(true)
  })
  test('drawn outer glazing may contain a fitted open kitchen in living space, without cutting the fit or merging a bedroom',()=>{
    const {walls,g,glass}=glazed()
    const labels=[{at:{x:160,y:160},name:'LIVING',kind:'living'},{at:{x:220,y:220},name:'OPEN KITCHEN',kind:'kitchen'}]
    const fit={x0:180,y0:180,x1:250,y1:250,kind:'kitchen'}
    const run=(fits:typeof fit[],names=labels)=>thinFaces(g,{k:K,walls,openings:[],glass,labels:names,fits})
    expect(run([fit]).walls).toHaveLength(2)
    expect(run([{...fit,kind:'bed'}]).walls).toHaveLength(0)
    expect(run([{...fit,x0:250,x1:350}]).walls).toHaveLength(0)
    expect(thinFaces(g,{k:K,walls,openings:[],glass,labels,fits:[{...fit,x0:250,x1:350,openPlan:true,at:{x:220,y:220}}]}).walls).toHaveLength(2)
    expect(thinFaces(g,{k:K,walls,openings:[],glass,labels,fits:[{...fit,x0:250,x1:350,openPlan:true,at:{x:320,y:220}}]}).walls).toHaveLength(0)
    expect(run([fit],[{...labels[0],name:'BEDROOM',kind:'bed'},labels[1]]).walls).toHaveLength(0)
  })
  test('clear coloured glazing backed by real walls also survives when the reader missed the room name', () => {
    const { walls, g, glass } = glazed()
    const r = thinFaces(g, { k: K, walls, openings: [], glass })
    expect(r.walls).toHaveLength(2)
    expect(r.faces).toHaveLength(1)
    expect(r.review).toHaveLength(2)
  })
  test('a break in the glazing is left open', () => {
    const { walls, g, glass } = glazed()
    for (let y=175;y<=225;y++) glass[y*g.width+300]=0
    const r=thinFaces(g,{k:K,walls,openings:[],glass})
    expect(r.walls).toEqual([])
    expect(r.faces).toEqual([])
  })
  test('a dangling fragment beside a glazed T does not destroy its surviving connection', () => {
    const { walls, g } = glazed()
    const glass = new Uint8Array(g.width * g.height)
    // A room's top pane continues across its veranda. The shared pane meets that long line at a T.
    for (let x=100;x<=350;x++) { g.data[100*g.width+x]=220; glass[100*g.width+x]=1 }
    for (let y=100;y<=300;y++) { g.data[y*g.width+301]=220; glass[y*g.width+301]=1 }
    pen(g,{x:300,y:100},{x:350,y:100})
    pen(g,{x:350,y:100},{x:350,y:250})
    pen(g,{x:300,y:250},{x:350,y:250})
    for (let x=300;x<=350;x++) glass[250*g.width+x]=1
    // The closer grey fragment has no second connection. It must not take the complete blue pane down with it.
    pen(g,{x:300,y:101},{x:300,y:150})
    const r=thinFaces(g,{k:K,walls,openings:[],glass,labels:[{at:{x:200,y:200},name:'BED 1'},{at:{x:325,y:175},name:'VERANDA'}]})
    expect(r.faces.some(f=>f.areaSqm>14 && f.areaSqm<18)).toBe(true)
    expect(r.walls.some(w=>Math.abs(w.a.x-300)<3 && Math.abs(w.b.x-300)<3 && Math.abs(w.a.y-w.b.y)>190)).toBe(true)
  })
  test('a partial grey reading half a pixel from a blue pane does not break its corner', () => {
    const { walls, g } = glazed(), glass = new Uint8Array(g.width * g.height)
    for (let x=100;x<=350;x++) for (const y of [100,101]) { g.data[y*g.width+x]=220; glass[y*g.width+x]=1 }
    for (let y=101;y<=300;y++) { g.data[y*g.width+301]=220; glass[y*g.width+301]=1 }
    for (let y=101;y<=250;y++) { g.data[y*g.width+350]=220; glass[y*g.width+350]=1 }
    for (let x=300;x<=350;x++) { g.data[250*g.width+x]=220; glass[250*g.width+x]=1 }
    pen(g,{x:300,y:101},{x:350,y:101})
    const r=thinFaces(g,{k:K,walls,openings:[],glass,labels:[{at:{x:200,y:200},name:'BED 1'},{at:{x:325,y:175},name:'VERANDA'}]})
    expect(r.walls.some(w=>w.a.x<105 && w.b.x>345 && Math.abs(w.a.y-100.5)<1)).toBe(true)
    expect(r.faces.some(f=>f.areaSqm>14 && f.areaSqm<18)).toBe(true)
  })
  test('a free blue rectangle with no supporting real walls is not a room', () => {
    const { g } = glazed()
    const glass=new Uint8Array(g.width*g.height)
    for(let u=150;u<=250;u++) {
      glass[150*g.width+u]=glass[250*g.width+u]=1
      glass[u*g.width+150]=glass[u*g.width+250]=1
    }
    const r=thinFaces(g,{k:K,walls:box,openings:[],glass})
    expect(r.walls).toEqual([])
  })
  test('a broad blue bathroom floor does not become four glazing walls', () => {
    const g=sheet(box),rgb={width:g.width,height:g.height,data:new Uint8Array(g.width*g.height*4).fill(255)}
    for(let y=104;y<297;y++) for(let x=104;x<297;x++) {
      g.data[y*g.width+x]=185
      rgb.data.set([140,190,240,255],(y*g.width+x)*4)
    }
    const r=thinFaces(g,{k:K,walls:box,openings:[],glass:glassMask(rgb,K),labels:[{at:{x:200,y:200},name:'TOILET'}]})
    expect(r.walls).toEqual([])
    expect(r.faces).toEqual([])
  })
})

describe('axisLines', () => {
  test('a dashed grille is one line, inked about half; a light 8 px band is one line 8 px thick', () => {
    const g = sheet([])
    pen(g, { x: 20, y: 50 }, { x: 220, y: 50 }, 90, 3, 2)
    pen(g, { x: 20, y: 51 }, { x: 220, y: 51 }, 90, 3, 2)
    for (let y = 100; y < 108; y++) pen(g, { x: 20, y }, { x: 220, y }, 180)
    const C = Uint8Array.from(g.data, (v) => (v <= 215 ? 1 : 0))
    const ls = axisLines(C, g.width, g.height, true, 20, 3, 18)
    expect(ls.length).toBe(2)
    const [dash, band] = ls.sort((p, q) => p.c - q.c)
    expect(dash.c).toBeCloseTo(50.5, 1)
    expect(dash.fill).toBeLessThan(0.8)
    expect(band.th).toBe(8)
    expect(band.fill).toBeGreaterThan(0.95)
    expect([band.u0, band.u1]).toEqual([20, 220])
  })
})

describe('thinFaces', () => {
  test('a shaft closed by one thin line between two wall stubs: a 1.1 m low wall on the wall stubs\' ends, the face offered as an AOD', () => {
    const walls = [...box, ...stubs]
    const g = sheet(walls)
    pen(g, { x: 360, y: 150 }, { x: 360, y: 250 })
    const r = thinFaces(g, { k: K, walls, openings: [], labels: [{ at: { x: 200, y: 200 }, name: 'BED 1' }] })
    expect(r.walls.length).toBe(1)
    expect(r.walls[0]).toMatchObject({ a: { x: 360, y: 150 }, b: { x: 360, y: 250 }, heightM: 1.1 })
    expect(r.faces.length).toBe(1)
    expect(r.faces[0].aod).toBe(true)
    expect(r.faces[0].areaSqm).toBeGreaterThan(2)
    expect(r.faces[0].areaSqm).toBeLessThan(2.5)
    expect(r.review.length).toBe(2) // the low wall + the AOD offered
  })

  test('furniture is not building (founder 2026-10-15): a wardrobe strip 0.6 m deep closed by its front line is no AOD and gets no low wall', () => {
    // the same shaft made a wardrobe: 0.6 m deep (300 … 330 px), 2 m long, its front a thin line
    const walls = [...box, W(300, 150, 330, 150), W(300, 250, 330, 250)]
    const g = sheet(walls)
    pen(g, { x: 330, y: 150 }, { x: 330, y: 250 })
    const r = thinFaces(g, { k: K, walls, openings: [], labels: [{ at: { x: 200, y: 200 }, name: 'BED 1' }] })
    expect(r.walls).toEqual([])
    expect(r.faces).toEqual([])
    expect(r.lines.some((l) => /cupboard/.test(l.fate))).toBe(true)
  })

  test('beside plant green the line is a planter edge (0.45 m); a green face with no label is no AOD', () => {
    const walls = [...box, ...stubs]
    const g = sheet(walls)
    pen(g, { x: 360, y: 150 }, { x: 360, y: 250 })
    const green = new Uint8Array(g.width * g.height)
    for (let y = 154; y < 247; y++) for (let x = 304; x < 358; x++) green[y * g.width + x] = 1
    const r = thinFaces(g, { k: K, walls, openings: [], green })
    expect(r.walls.map((w) => w.heightM)).toEqual([0.45])
    expect(r.faces[0]).toMatchObject({ planter: true, aod: false })
  })

  test('a planter box with no edge line drawn (foliage over it): the green\'s own edge closes it, a 0.45 m planter edge', () => {
    const walls = [...box, ...stubs]
    const g = sheet(walls)
    const green = new Uint8Array(g.width * g.height)
    for (let y = 154; y < 247; y++) for (let x = 304; x < 351; x++) green[y * g.width + x] = 1
    const r = thinFaces(g, { k: K, walls, openings: [], green })
    expect(r.walls.length).toBe(1)
    expect(r.walls[0]).toMatchObject({ a: { x: 350.5, y: 150 }, b: { x: 350.5, y: 250 }, heightM: 0.45 })
    expect(r.faces[0]).toMatchObject({ planter: true, aod: false })
  })

  test('furniture: a line across a fitted room, or a bed drawn against a wall, closes nothing', () => {
    const g = sheet(box)
    pen(g, { x: 104, y: 200 }, { x: 296, y: 200 })
    const fit = thinFaces(g, { k: K, walls: box, openings: [], fits: [{ x0: 103, y0: 103, x1: 297, y1: 297 }], labels: [{ at: { x: 200, y: 150 }, name: 'BED 1' }] })
    expect(fit.walls).toEqual([])
    expect(fit.lines.find((l) => l.horiz && Math.abs(l.c - 200) < 1)?.fate).toBe('inside a fitted room')
    const bed = sheet(box)
    pen(bed, { x: 150, y: 200 }, { x: 150, y: 297 })
    pen(bed, { x: 250, y: 200 }, { x: 250, y: 297 })
    pen(bed, { x: 150, y: 200 }, { x: 250, y: 200 })
    expect(thinFaces(bed, { k: K, walls: box, openings: [], labels: [{ at: { x: 200, y: 150 }, name: 'BED 1' }] }).walls).toEqual([])
  })

  test('a shower screen / tub edge: a thin line in a closed bathroom (a wc drawn in it, its name not read) closes no face', () => {
    // a 2.4 × 2 m toilet, a pen line 0.8 m from its right wall: the shower bay
    const walls = [W(100, 100, 220, 100), W(220, 100, 220, 200), W(220, 200, 100, 200), W(100, 200, 100, 100)]
    const g = sheet(walls)
    pen(g, { x: 180, y: 104 }, { x: 180, y: 196 })
    const wc = { at: { x: 130, y: 150 }, r: 20 }
    const bath = thinFaces(g, { k: K, walls, openings: [], fixtures: [{ ...wc, kind: 'bath' }] })
    expect(bath.walls).toEqual([])
    expect(bath.lines.some((l) => /bay of a bathroom/.test(l.fate))).toBe(true)
    // the same line beside a fixture that is no wc / basin: a small space closed by a thin line, offered as an AOD
    expect(thinFaces(g, { k: K, walls, openings: [], fixtures: [{ ...wc, kind: 'kitchen' }] }).walls.length).toBe(1)
  })

  test('an undecided gap stays open under a solid thin line; a dashed grille across it closes the room', () => {
    const walls = [W(100, 100, 170, 100), W(230, 100, 300, 100), W(300, 100, 300, 300), W(300, 300, 100, 300), W(100, 300, 100, 100)]
    const gap: OpeningGuess = { a: { x: 170, y: 100 }, b: { x: 230, y: 100 }, kind: 'unknown', conf: 0.2, thicknessPx: TH }
    const labels = [{ at: { x: 200, y: 200 }, name: 'AOD' }]
    const solid = sheet(walls)
    pen(solid, { x: 170, y: 100 }, { x: 230, y: 100 })
    const s = thinFaces(solid, { k: K, walls, openings: [gap], labels })
    expect(s.walls).toEqual([])
    expect(s.lines.some((l) => l.fate === 'solid line on an undecided gap')).toBe(true)
    const dashed = sheet(walls)
    for (const y of [99, 100, 101]) pen(dashed, { x: 170, y }, { x: 230, y }, 90, 2, 2)
    const d = thinFaces(dashed, { k: K, walls, openings: [gap], labels })
    expect(d.walls.length, JSON.stringify(d.lines)).toBe(1)
    expect(d.faces[0]).toMatchObject({ labelled: true, aod: false })
  })

  test('Level 1: three pen lines a frame apart are one glass front — a full-height wall that is all glazing; two strokes 2 px apart are one railing', () => {
    const walls = [...box, ...stubs]
    const glass = sheet(walls)
    for (const x of [356, 360, 364]) pen(glass, { x, y: 150 }, { x, y: 250 })
    const r = thinFaces(glass, { k: K, walls, openings: [] })
    expect(r.walls.length).toBe(1)
    expect(r.walls[0]).toMatchObject({ a: { x: 360, y: 150 }, b: { x: 360, y: 250 }, glass: true })
    expect(r.walls[0].heightM).toBeUndefined()
    expect(r.review.some((x) => /Glass front/.test(x.message))).toBe(true)
    const rail = sheet(walls)
    for (const x of [359, 361]) pen(rail, { x, y: 150 }, { x, y: 250 })
    expect(thinFaces(rail, { k: K, walls, openings: [] }).walls.map((w) => [w.glass, w.heightM])).toEqual([[undefined, 1.1]])
  })

  test('Level 1: a room printed VER closed by thin lines on three sides (its railing) is a face; unnamed it is too thin-rimmed', () => {
    const g = sheet(box)
    pen(g, { x: 300, y: 150 }, { x: 360, y: 150 })
    pen(g, { x: 360, y: 150 }, { x: 360, y: 250 })
    pen(g, { x: 300, y: 250 }, { x: 360, y: 250 })
    const ver = thinFaces(g, { k: K, walls: box, openings: [], labels: [{ at: { x: 200, y: 200 }, name: 'BED 1' }, { at: { x: 330, y: 200 }, name: 'VER' }] })
    expect(ver.walls.map((w) => w.heightM)).toEqual([1.1, 1.1, 1.1])
    expect(ver.faces[0]).toMatchObject({ labelled: true, aod: false })
    expect(thinFaces(g, { k: K, walls: box, openings: [], labels: [{ at: { x: 200, y: 200 }, name: 'BED 1' }] }).walls).toEqual([])
  })
})
