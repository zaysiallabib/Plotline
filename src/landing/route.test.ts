import { describe, expect, it } from 'vitest'
import { landingOrViewer } from './route'

describe('landingOrViewer', () => {
  it('a bare / is the front page, also with a marketing tag or a #section', () => {
    expect(landingOrViewer('/', '')).toBe('landing')
    expect(landingOrViewer('/', '?fbclid=abc&utm_source=fb')).toBe('landing')
  })
  it('an old share link or staff bookmark on / still opens the viewer', () => {
    for (const s of ['?c=abc', '?floor=3', '?staff=1', '?staff=0', '?view=building', '?x=1&c=']) expect(landingOrViewer('/', s)).toBe('viewer')
  })
  it('every other path is the viewer (main.tsx sends /studio and /changes before asking)', () => {
    for (const p of ['/u/type-a', '/s/tok', '/u/preview', '/anything']) expect(landingOrViewer(p, '')).toBe('viewer')
  })
})
