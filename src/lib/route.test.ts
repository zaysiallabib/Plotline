import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pageTitle, routeOf, routeTitle } from './route'

describe('routeOf', () => {
  it('the Studio, the change list, the front page', () => {
    expect(routeOf('/studio', '')).toBe('studio')
    expect(routeOf('/studio/', '?x=1')).toBe('studio')
    expect(routeOf('/changes', '')).toBe('changes')
    expect(routeOf('/', '')).toBe('landing')
  })
  it('a flat, a level, the preview, a share link — and an old link on / — open the viewer', () => {
    for (const p of ['/u/type-a', '/u/preview', '/u/sheltech-banani-ground', '/s/3f2b8c1e-0000-4000-8000-000000000000', '/u/type-a/']) expect(routeOf(p, '')).toBe('viewer')
    expect(routeOf('/', '?c=abc')).toBe('viewer')
  })
  it('anything else is not found (it used to open the first flat in the list)', () => {
    for (const p of ['/nope', '/u', '/u/', '/s/', '/studios', '/changes/x', '/index.htm', '/assets']) expect(routeOf(p, '')).toBe('missing')
  })
})

describe('titles', () => {
  it('names the page in the tab', () => {
    expect(pageTitle()).toBe('Plotline')
    expect(pageTitle('  ')).toBe('Plotline')
    expect(pageTitle('Type A')).toBe('Type A · Plotline')
    expect(routeTitle('studio')).toBe('Studio · Plotline')
    expect(routeTitle('landing')).toBe('Plotline')
    expect(routeTitle('missing')).toBe('Not found · Plotline')
  })
})

describe('a real 404: vercel.json sends only the pages of the app to it, public/404.html answers the rest', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const { rewrites } = JSON.parse(read('../../vercel.json')) as { rewrites: { source: string; destination: string }[] }
  // Vercel reads a source as path-to-regexp; these are plain regular expressions too (as vite.config.ts reads the headers')
  const toApp = (path: string) => rewrites.some((r) => r.destination === '/index.html' && new RegExp(`^${r.source}$`).test(path))
  it('every page of the app reaches it ("/" is index.html itself); an address no page has does not (Vercel: 404.html, status 404)', () => {
    for (const p of ['/u/type-a', '/u/preview', '/u/type-a/', '/s/3f2b8c1e-0000-4000-8000-000000000000', '/studio', '/studio/', '/changes', '/changes/']) {
      expect(routeOf(p, '')).not.toBe('missing')
      expect(toApp(p), p).toBe(true)
    }
    for (const p of ['/nope', '/about', '/u', '/u/', '/s/', '/index.htm', '/x/u/type-a', '/assets', '/api/nothing']) {
      expect(routeOf(p, '')).toBe('missing')
      expect(toApp(p), p).toBe(false)
    }
  })
  it("the static page says what the app's not-found page says, on the same tokens", () => {
    const page = read('../../public/404.html')
    const pages = read('./pages.tsx')
    for (const words of ['Not found', 'Nothing stands at this address.', 'It may be mistyped, or the page has moved.', 'Go to the front page', 'Plotline, front page']) {
      expect(page).toContain(words)
      expect(pages).toContain(words)
    }
    const tokens = (css: string) => new Map([...(/:root \{([\s\S]*?)\n\s*\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '').matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
    const app = tokens(read('../index.css'))
    const mine = tokens(page)
    expect(mine.size).toBeGreaterThan(20)
    for (const [k, v] of mine) expect(app.get(k), `--${k}`).toBe(v)
  })
})
