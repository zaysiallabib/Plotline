import { describe, expect, test } from 'vitest'
import { FT, formatFeetInches, parseLength } from './index'

const ft = (f: number, i = 0) => (f + i / 12) * FT

describe('parseLength', () => {
  test.each([
    [`14'-5"`, ft(14, 5)],
    [`14'5"`, ft(14, 5)],
    [`14' 5"`, ft(14, 5)],
    [`14'5`, ft(14, 5)],
    [`14'-5`, ft(14, 5)],
    [`14'`, ft(14)],
    [`14.4`, ft(14.4)],
    [`14.4ft`, ft(14.4)],
    [`14.4'`, ft(14.4)],
    [`4.4m`, 4.4],
    [`4.4 m`, 4.4],
    [`440cm`, 4.4],
    [`440 mm`, 0.44],
    [`5"`, ft(0, 5)],
    [`  14’-5” `, ft(14, 5)],
    [`14′5″`, ft(14, 5)],
  ])('%s', (s, m) => {
    expect(parseLength(s)).toBeCloseTo(m, 9)
  })

  test.each([`14'-5" x 14'-4"`, `14'-5" × 14'-4"`, ``, `abc`, `'5"`, `14''`])('rejects %s', (s) => {
    expect(parseLength(s)).toBeNull()
  })
})

describe('formatFeetInches', () => {
  test('4.394 → 14\'-5"', () => expect(formatFeetInches(4.394)).toBe(`14'-5"`))
  test('rolls 12" over', () => expect(formatFeetInches(ft(13, 11.7))).toBe(`14'-0"`))
  test('zero', () => expect(formatFeetInches(0)).toBe(`0'-0"`))
  test('round trips every form', () => {
    for (const s of [`14'-5"`, `14'5"`, `14' 5"`, `14'5`, `14'`, `9'-11"`, `0'-7"`]) {
      const m = parseLength(s)!
      expect(parseLength(formatFeetInches(m))).toBeCloseTo(m, 9)
    }
  })
})
