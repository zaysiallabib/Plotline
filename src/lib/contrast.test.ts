import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The tokens' colours measured as WCAG contrast (Docs/DESIGN.md "Contrast"): fails when a token change makes text that a
 * person must read too faint. AA = 4.5 for text, AAA = 7 for body text.
 */
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')))
type Rgba = [number, number, number, number]
const token = (name: string): Rgba => {
  const v = root.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()
  if (!v) throw new Error(`no token --${name}`)
  const hex = v.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (hex) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba
  const rgba = v.match(/^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/)
  if (rgba) return rgba.slice(1).map(Number) as Rgba
  throw new Error(`--${name}: cannot read ${v}`)
}
/** a see-through colour laid over an opaque one */
const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1]
const lum = ([r, g, b]: Rgba) => {
  const c = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (fg: Rgba, bg: Rgba) => {
  const [a, b] = [lum(over(fg, bg)), lum(bg)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('the tokens read (WCAG contrast)', () => {
  const bg = token('bg')
  const surface = token('surface')
  const sunk = token('surface-2')
  const black: Rgba = [0, 0, 0, 1]
  const white: Rgba = [255, 255, 255, 1]
  it('body text passes AAA on marble and on white', () => {
    expect(ratio(token('ink'), bg)).toBeGreaterThanOrEqual(7)
    expect(ratio(token('ink'), surface)).toBeGreaterThanOrEqual(7)
    expect(ratio(token('ink-2'), bg)).toBeGreaterThanOrEqual(7)
  })
  it('labels and hints pass AA on marble, white and the sunken rows', () => {
    for (const b of [bg, surface, sunk]) expect(ratio(token('muted'), b)).toBeGreaterThanOrEqual(4.5)
  })
  it('the accent: white on it, and it as a link on marble and white', () => {
    expect(ratio(token('accent-ink'), token('accent'))).toBeGreaterThanOrEqual(6.5) // button text: AA (4.5) with room
    expect(ratio(token('accent'), bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('accent'), surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('terracotta (a refusal) reads as text', () => {
    expect(ratio(token('danger'), bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('danger'), surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('the glass over the 3D: ink and second text read over a black night and a white wall; labels over a light room', () => {
    for (const behind of [black, white]) {
      const glass = over(token('glass'), behind)
      expect(ratio(token('ink'), glass)).toBeGreaterThanOrEqual(7)
      expect(ratio(token('ink-2'), glass)).toBeGreaterThanOrEqual(4.5)
    }
    // ponytail: muted on the glass over a black night is ~3.3:1 (DESIGN.md says so); a label that must be read there uses ink-2
    expect(ratio(token('muted'), over(token('glass'), white))).toBeGreaterThanOrEqual(4.5)
  })
})
