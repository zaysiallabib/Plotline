import { describe, expect, it } from 'vitest'

// session 31: every question is the marble box (lib/ask.ts ask / askText); the browser's grey confirm(), prompt() and alert()
// never come back
const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const code = Object.entries(sources).map(([f, s]) => [f, s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')] as const)

describe('ask', () => {
  it('no window.confirm, prompt or alert anywhere in src', () => {
    expect(code.length).toBeGreaterThan(100)
    for (const box of ['confirm', 'prompt', 'alert']) expect(code.filter(([, s]) => new RegExp(`\\b${box}\\s*\\(`).test(s)).map(([f]) => `${box}: ${f}`)).toEqual([])
  })

  it("the Studio's Start over asks before it empties the Studio (it wiped the drawing without a word), red, naming what goes", () => {
    const s = code.find(([f]) => f.endsWith('/studio/StudioApp.tsx'))![1]
    const at = s.indexOf('const startOver')
    const body = s.slice(at, s.indexOf("dispatch({ type: 'reset' })", at))
    expect(body).toContain("await ask('Start over? The drawing, its picture and its furniture go. Undo cannot bring them back.', 'Start over', true)")
  })
})
