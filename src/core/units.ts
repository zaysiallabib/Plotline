/** Printed-dimension parsing/formatting. Feet are the default unit. */

export const FT = 0.3048
export const sqmToSqft = (sqm: number): number => sqm / (FT * FT)

const NUM = String.raw`(\d+(?:\.\d+)?)`
const METRIC = new RegExp(`^${NUM}\\s*(m|cm|mm)$`)
const FEET_INCHES = new RegExp(`^${NUM}\\s*'\\s*-?\\s*${NUM}\\s*(?:"|in)?$`)
const FEET = new RegExp(`^${NUM}\\s*(?:'|ft|feet)?$`)
const INCHES = new RegExp(`^${NUM}\\s*(?:"|in)$`)

/**
 * "14'-5\"", "14'5\"", "14' 5\"", "14'5", "14'", "14.4" (feet), "14.4ft", "4.4m",
 * "440cm", "5\"" → meters. Curly quotes are normalised. Anything else (including
 * a "W x H" pair) → null.
 */
export function parseLength(s: string): number | null {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
  let m: RegExpMatchArray | null
  if ((m = t.match(METRIC))) {
    const v = Number(m[1])
    return m[2] === 'm' ? v : m[2] === 'cm' ? v / 100 : v / 1000
  }
  if ((m = t.match(FEET_INCHES))) return (Number(m[1]) + Number(m[2]) / 12) * FT
  if ((m = t.match(INCHES))) return (Number(m[1]) / 12) * FT
  if ((m = t.match(FEET))) return Number(m[1]) * FT
  return null
}

/** 4.394 → "14'-5\"" (rounded to the nearest inch; 12" rolls over). */
export function formatFeetInches(m: number): string {
  const totalIn = Math.round((m / FT) * 12)
  return `${Math.floor(totalIn / 12)}'-${totalIn % 12}"`
}
