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
