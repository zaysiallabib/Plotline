import { describe, expect, it } from 'vitest'

// session 31: every yes / no question is the marble box (lib/ask.ts); the browser's grey confirm() never comes back
const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

describe('ask', () => {
  it('no window.confirm anywhere in src', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100)
    const left = Object.entries(sources).filter(([, s]) => /\bconfirm\s*\(/.test(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
    expect(left.map(([f]) => f)).toEqual([])
  })
})
