// The HUD's rules (session 30): the bottom hint by mode, the Building rail's words, the compass's turn, the day's colours.
import { describe, expect, it } from 'vitest'
import { floorWord, hintOf } from './Hud'
import { dayGradient, roseTurn, skyColor } from './SunPill'

const base = { mode: 'walk' as const, locked: false, staff: false, arranging: false, editingOpenings: false, holding: false }

describe('hud', () => {
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
