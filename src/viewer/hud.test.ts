// The HUD's rules (sessions 30–31): what shows when (rest, Clean view), the bottom hint by mode, the Building rail's words, the compass's turn, the day's colours.
import { describe, expect, it } from 'vitest'
import * as bti from '../data/building/demo-tower'
import * as banani from '../data/building/banani-tower'
import * as sheltech from '../data/building/sheltech-tower'
import { chromeOf, cleanKey, floorTitle, floorWord, hintOf, lowWallAt, railWord, towerCard, wakes } from './Hud'
import { noteAt } from './Notes'
import { dayGradient, roseTurn, skyColor } from './SunPill'

const base = { mode: 'walk' as const, locked: false, staff: false, arranging: false, editingOpenings: false, holding: false }

describe('hud', () => {
  it('what shows: all of it, the room’s name alone at rest in Walk, nothing in Clean view', () => {
    const s = { clean: false, idle: false, mode: 'walk' as const, busy: false }
    expect(chromeOf(s)).toBe('all')
    expect(chromeOf({ ...s, idle: true })).toBe('room') // 3 s without the mouse in Walk
    expect(chromeOf({ ...s, idle: true, busy: true })).toBe('all') // a panel / menu open, or a piece in hand: never rests
    expect(chromeOf({ ...s, idle: true, mode: 'orbit' })).toBe('all') // the Dollhouse: you drag it, it never rests
    expect(chromeOf({ ...s, idle: true, mode: 'building' })).toBe('all') // the Building view neither
    expect(chromeOf({ ...s, clean: true })).toBe('none') // Clean view hides everything …
    expect(chromeOf({ ...s, clean: true, busy: true, mode: 'building' })).toBe('none') // … whatever else is going on
  })

  it('the keys and Clean view: H on and off, Esc only off, F / C / G off and on to their job; walking never wakes the HUD', () => {
    expect(cleanKey(false, 'h')).toEqual({ clean: true, stop: true })
    expect(cleanKey(true, 'H')).toEqual({ clean: false, stop: true }) // Shift+H too
    expect(cleanKey(true, 'Escape')).toEqual({ clean: false, stop: true }) // that Esc does nothing else (no panel closes behind it)
    expect(cleanKey(false, 'Escape')).toEqual({ clean: false, stop: false }) // not in Clean view: Esc goes on to the app
    for (const k of ['f', 'c', 'g']) expect(cleanKey(true, k)).toEqual({ clean: false, stop: false }) // the panel or the piece must be seen
    for (const k of ['w', 'o', 'p', 'm']) expect(cleanKey(true, k)).toEqual({ clean: true, stop: false }) // walk, switch view, wind, map: stays clean
    expect(['w', 'A', 'ArrowUp', 'Shift'].map(wakes)).toEqual([false, false, false, false]) // walking is looking
    expect(['f', 'Escape', 'g', 'Tab'].map(wakes)).toEqual([true, true, true, true])
  })

  it('the Building view names the floor picked, not the room the walk stood in', () => {
    expect(floorTitle(bti, 2, 'type-a')).toEqual({ label: 'Floor 2', name: 'Type A · 2703 sft' }) // its name has the area
    expect(floorTitle(bti, 3, 'type-a')).toEqual({ label: 'Floor 3', name: 'Type B · 1747 sft, Type C · 2254 sft' }) // the flats there
    expect(floorTitle(bti, 1, 'type-a')).toEqual({ name: 'Floor 1' }) // massing only
    expect(floorTitle(bti, 0, 'type-a')).toEqual({ name: 'Ground floor' })
    expect(floorTitle(bti, 9, 'type-a')).toEqual({ name: 'Rooftop' })
    expect(floorTitle(sheltech, 0, 'sheltech-a')).toEqual({ name: 'Ground floor' }) // the level's name says it: once
    expect(floorTitle(sheltech, -1, 'sheltech-a')).toEqual({ name: 'Basement 1' })
    expect(floorTitle(banani, 0, 'banani-typical')).toEqual({ label: 'Ground floor', name: 'Ground level' })
    const own = { ...bti, FLATS: { ...bti.FLATS, 'type-a': { ...bti.FLATS['type-a'], unit: { ...bti.FLATS['type-a'].unit, name: 'Type A' } } } }
    expect(floorTitle(own, 2, 'type-a')).toEqual({ label: 'Floor 2', name: 'Type A', size: '2703 sft' }) // a Studio flat's bare name: the area under it
  })

  it('the hint tells the keys of what is on', () => {
    expect(hintOf(base)).toMatch(/^Double-click to look with the mouse · click the floor to walk there · WASD to walk$/)
    expect(hintOf({ ...base, staff: true })).toMatch(/G picks up the piece under the mouse$/)
    expect(hintOf({ ...base, locked: true })).toMatch(/Esc frees the mouse$/)
    expect(hintOf({ ...base, mode: 'orbit' })).toMatch(/^Drag to turn/)
    expect(hintOf({ ...base, mode: 'building' })).toMatch(/^Point at a floor to name it · click to open it/)
    expect(hintOf({ ...base, arranging: true })).toMatch(/^Drag a piece.*WASD to walk$/)
    expect(hintOf({ ...base, arranging: true, mode: 'orbit' })).not.toMatch(/WASD/)
    expect(hintOf({ ...base, editingOpenings: true, arranging: true })).toMatch(/^Click a door/) // openings win
    expect(hintOf({ ...base, holding: true })).toBeNull() // the piece's own tag says it
    expect(hintOf({ ...base, holding: true, mode: 'building' })).toMatch(/^Point at a floor/)
  })

  it('under a finger the hint says what a finger does and never names a key', () => {
    const f = { ...base, finger: true }
    expect(hintOf(f)).toBe('Drag to look · tap the floor to walk there')
    expect(hintOf({ ...f, mode: 'orbit' })).toBe('Drag to turn · pinch to zoom · tap a room’s floor to walk in it')
    expect(hintOf({ ...f, mode: 'building' })).toBe('Tap a floor to name it, again to open it · drag to turn · pinch to zoom')
    expect(hintOf({ ...f, holding: true })).toBeNull()
    const keys = /WASD|Esc|Ctrl|Del\b|\bG\b|\bR\b|\bO\b|Double-click|scroll|mouse/
    for (const mode of ['walk', 'orbit', 'building'] as const)
      for (const staff of [{}, { staff: true }, { arranging: true }, { editingOpenings: true }, { locked: true }]) expect(hintOf({ ...f, mode, ...staff }) ?? '').not.toMatch(keys)
  })

  it('the note being written never leaves the screen: beside its pin on a desktop, over or under it on a phone', () => {
    expect(noteAt(600, 400, 1600, 1000, 280, 150)).toEqual({ dx: 16, dy: -8 }) // as before: right of the pin
    expect(noteAt(1500, 400, 1600, 1000, 280, 150)).toEqual({ dx: -296, dy: -8 }) // the right edge: its left
    expect(noteAt(600, 950, 1600, 1000, 280, 150).dy).toBe(1000 - 8 - 150 - 950) // the bottom edge: lifted
    const phone = noteAt(258, 400, 390, 844, 280, 150) // 390 wide: neither side fits
    expect(258 + phone.dx).toBeGreaterThanOrEqual(8)
    expect(258 + phone.dx + 280).toBeLessThanOrEqual(390 - 8)
    expect(phone.dy).toBe(-166) // over the pin, away from the keyboard
    expect(noteAt(200, 100, 390, 844, 280, 150)).toEqual({ dx: -140, dy: 16 }) // near the top: under it, centred on it
    // never over the room's name top left (its box ends at 91): above a phone's pin at 160 the note would start at 39
    expect(noteAt(195, 160, 390, 844, 280, 105, 91)).toEqual({ dx: -140, dy: 16 })
    expect(noteAt(600, 60, 1600, 1000, 280, 150, 100).dy).toBe(40) // a desktop pin up there: the note starts under the name
  })

  it('the Building rail says Roof and Ground in words; a number in the serif, the words as inscriptions', () => {
    expect(['R', '8', 'G', 'B1'].map(floorWord)).toEqual(['Roof', '8', 'Ground', 'B1'])
    expect(['R', '8', 'G', 'B1', '12'].map(railWord)).toEqual([
      { text: 'Roof', serif: false },
      { text: '8', serif: true },
      { text: 'Ground', serif: false },
      { text: 'B1', serif: false },
      { text: '12', serif: true },
    ])
  })

  it('staff over a balcony edge of a project’s flat: "Click to choose what it is made of"; a buyer, a storey-high wall, a built-in tower: as before (qa4fix)', async () => {
    const { makeProject, projectTower } = await import('../data/building/projects')
    const a = { ...bti.FLATS['type-a'].unit, id: 'a' }
    const low = a.walls.find((w) => w.heightM > 0.2 && w.heightM < 2.4)!
    const full = a.walls.find((w) => w.heightM >= 2.7)!
    const t = projectTower(makeProject('p', a, 1, 3, 'none'))
    const at = (id: string) => ({ k: 2, flat: { stem: 'a', floor: 2 }, wall: { drawing: 'a', run: id, id, stem: 'a' } })
    expect(lowWallAt(t, at(low.id))?.wall.id).toBe(low.id)
    expect(towerCard(t, at(low.id), false, false, true).act).toBe('Click to choose what it is made of')
    expect(towerCard(t, at(low.id), false, false, false).act).toBe('Click to open it') // a buyer: the flat
    expect(towerCard(t, at(full.id), false, false, true).act).toBe('Click to open it')
    expect(lowWallAt(bti, { k: 2, flat: { stem: 'type-a', floor: 2 }, wall: { drawing: a.id, run: low.id, id: low.id, stem: 'type-a' } })).toBeNull() // a built-in tower: no project to keep it in
  })

  it('the card beside the pointer on the tower: the floor as its title, the flat under it with its size, what a click does', () => {
    const flat = (stem: string, floor: number) => ({ stem, floor })
    expect(towerCard(bti, { k: 4, flat: flat('type-b', 4) }, false)).toEqual({ title: 'Floor 4', line: 'Type B · 1747 sft', act: 'Click to open it' })
    expect(towerCard(bti, { k: 4, flat: flat('type-b', 4) }, true).act).toBe('Tap again to open it') // a finger: the first tap named it
    expect(towerCard(bti, { k: 1, flat: null }, false)).toEqual({ title: 'Floor 1', act: 'Click to pick this floor' }) // massing: no flat to open
    expect(towerCard(bti, { k: 6, flat: null }, false)).toEqual({ title: 'Floor 6', act: 'Click to pick this floor' }) // the core between the flats
    expect(towerCard(bti, { k: 9, flat: null }, false).title).toBe('Rooftop')
    expect(towerCard(bti, { k: 0, flat: null }, false).title).toBe('Ground floor')
    expect(towerCard(sheltech, { k: 0, flat: null }, false)).toEqual({ title: 'Ground floor', act: 'Click to walk it' }) // a level: walked; its name says no more
    expect(towerCard(sheltech, { k: -1, flat: null }, true)).toEqual({ title: 'Basement 1', act: 'Tap again to walk it' })
    expect(towerCard(banani, { k: 0, flat: null }, false)).toEqual({ title: 'Ground floor', line: 'Ground level', act: 'Click to walk it' })
    const own = { ...bti, FLATS: { ...bti.FLATS, 'type-a': { ...bti.FLATS['type-a'], unit: { ...bti.FLATS['type-a'].unit, name: 'Type A' } } } }
    expect(towerCard(own, { k: 2, flat: flat('type-a', 2) }, false).line).toBe('Type A · 2703 sft') // a Studio flat's bare name: its size from the plan
    // staff with Finishes open: a click chooses for the building's outside there (session 31 facade) — on the roof, its roof
    expect(towerCard(bti, { k: 4, flat: flat('type-b', 4), wall: { drawing: 'd', run: 'w' } }, false, true).act).toBe('Click to choose its outside')
    expect(towerCard(bti, { k: 0, flat: null }, true, true).act).toBe('Tap again to choose its outside')
    expect(towerCard(bti, { k: 9, flat: null }, false, true).act).toBe('Click to change the roof')
    expect(towerCard(bti, { k: 9, flat: null, wall: { drawing: 'd', run: 'w' } }, false, true).act).toBe('Click to choose its outside') // its parapet
  })

  it('the compass: true north as you look now, clockwise from straight ahead', () => {
    expect(roseTurn(0, 0, -1)).toBe(0) // facing plan-up, north = plan-up: straight ahead
    expect(roseTurn(0, 1, 0)).toBe(270) // facing plan-right (east): north on the left
    expect(roseTurn(0, 0, 1)).toBe(180) // facing plan-down: north behind
    expect(roseTurn(90, 0, -1)).toBe(90) // north is plan-right: on the right while facing plan-up
    expect(roseTurn(304, 0.6, -0.8)).toBeCloseTo(304 - 36.87, 1) // any angle, always 0–360
  })

  it('the hour slider is coloured by the sun’s height at the site through the day', () => {
    expect(skyColor(-30)).toBe('rgb(38, 43, 61)') // night
    expect(skyColor(60)).toBe('rgb(233, 213, 166)') // day
    expect(skyColor(1)).not.toBe(skyColor(-30)) // dawn sits between
    const g = dayGradient(undefined, '2026-06-21') // Dhaka
    expect(g.match(/rgb\(/g)).toHaveLength(25)
    expect(g).toContain('rgb(38, 43, 61) 0.00%') // midnight is night
    expect(g).toContain('rgb(233, 213, 166) 50.00%') // noon is day
  })
})
