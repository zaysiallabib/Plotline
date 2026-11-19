// The HUD's rules (session 30): the bottom hint by mode, the Building rail's words, the compass's turn, the day's colours.
import { describe, expect, it } from 'vitest'
import * as bti from '../data/building/demo-tower'
import * as banani from '../data/building/banani-tower'
import * as sheltech from '../data/building/sheltech-tower'
import { floorTitle, floorWord, hintOf } from './Hud'
import { dayGradient, roseTurn, skyColor } from './SunPill'

const base = { mode: 'walk' as const, locked: false, staff: false, arranging: false, editingOpenings: false, holding: false }

describe('hud', () => {
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
    expect(hintOf({ ...base, mode: 'building' })).toMatch(/^Click a flat to open it/)
    expect(hintOf({ ...base, arranging: true })).toMatch(/^Drag a piece.*WASD to walk$/)
    expect(hintOf({ ...base, arranging: true, mode: 'orbit' })).not.toMatch(/WASD/)
    expect(hintOf({ ...base, editingOpenings: true, arranging: true })).toMatch(/^Click a door/) // openings win
    expect(hintOf({ ...base, holding: true })).toBeNull() // the piece's own tag says it
    expect(hintOf({ ...base, holding: true, mode: 'building' })).toMatch(/^Click a flat/)
  })

  it('the Building rail says Roof and Ground in words', () => {
    expect(['R', '8', 'G', 'B1'].map(floorWord)).toEqual(['Roof', '8', 'Ground', 'B1'])
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
