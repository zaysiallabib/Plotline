/** The sky's light by the sun's altitude, the lamps' auto rule and the shadow-casting pick (render.ts): pure, no WebGL. */
import { describe, expect, test } from 'vitest'
import { assignPool, DAY_EXPOSURE, lampCandela, lampShares, lightsOn, NIGHT_EXPOSURE, pickCasters, skyLight, TIERS, twilight } from './render'
import { LAMP_RANGE } from './daylight'
import type { Room } from '../core'

describe('what each quality tier draws (session 31)', () => {
  test('Lite: no shadow maps at all, two lamps in the pool, no corner shading', () =>
    expect(TIERS.lite).toMatchObject({ sun: 0, lamps: 2, lampShadows: 0, ao: false }))
  test('Low: the sun’s 1024 shadow map only (no lamp shadows), four lamps', () => expect(TIERS.low).toMatchObject({ sun: 1024, lamps: 4, lampShadows: 0, ao: false }))
  test('High as before: 2048 sun, twelve lamps, three casting, corner shading', () => expect(TIERS.high).toMatchObject({ sun: 2048, lamps: 12, lampShadows: 3, ao: true }))
  test('a lighter tier never draws more', () => {
    for (const [a, b] of [['high', 'low'], ['low', 'lite']] as const) {
      expect(TIERS[b].sun).toBeLessThanOrEqual(TIERS[a].sun)
      expect(TIERS[b].lamps).toBeLessThanOrEqual(TIERS[a].lamps)
      expect(TIERS[b].lampShadows).toBeLessThanOrEqual(TIERS[a].lampShadows)
    }
  })
})

describe('skyLight', () => {
  test('noon down to 10°: the day exposure, 20 % over the old 1 (founder 2026-11-20); the sky’s fill as seen the full day’s; no night', () => {
    expect(DAY_EXPOSURE).toBeCloseTo(1 * 1.2)
    for (const alt of [80, 45, 20, 10]) {
      const k = skyLight(alt)
      expect(k).toMatchObject({ exposure: DAY_EXPOSURE, night: 0 })
      expect(k.fill * k.exposure).toBeCloseTo(1)
    }
  })
  test('golden only while the sun is low', () => {
    expect(skyLight(60).golden).toBe(0)
    expect(skyLight(5).golden).toBe(1)
  })
  test('as the sun sets the sky dims (as seen) and the exposure opens up, never back', () => {
    const alts = [10, 5, 2, 0, -2, -4, -6, -9, -12, -20]
    const seen = alts.map((a) => skyLight(a).fill * skyLight(a).exposure)
    const exp = alts.map((a) => skyLight(a).exposure)
    for (let i = 1; i < alts.length; i++) {
      expect(seen[i]).toBeLessThanOrEqual(seen[i - 1])
      expect(exp[i]).toBeGreaterThanOrEqual(exp[i - 1])
    }
    expect(skyLight(-12).exposure).toBe(NIGHT_EXPOSURE)
  })
  test('night: unlit rooms dark — the sky gives a few % of the day as seen, a city glow, not black', () => {
    const k = skyLight(-20)
    expect(k.fill * k.exposure).toBeGreaterThan(0.01)
    expect(k.fill * k.exposure).toBeLessThan(0.05)
    expect(k.night).toBe(1)
  })
  test('the dome: deep blue at dusk, near black overhead at night', () => {
    const dusk = twilight(-4).zenith
    expect(dusk.b).toBeGreaterThan(2 * dusk.r)
    const night = twilight(-20).zenith
    expect(Math.max(night.r, night.g, night.b)).toBeLessThan(0.01)
  })
})

describe('lamps', () => {
  test('auto: on once the sun is under 5°, off by day; a pick wins', () => {
    expect(lightsOn('auto', 30)).toBe(false)
    expect(lightsOn('auto', 6)).toBe(false)
    expect(lightsOn('auto', 4)).toBe(true)
    expect(lightsOn('auto', -20)).toBe(true)
    expect(lightsOn('on', 60)).toBe(true)
    expect(lightsOn('off', -20)).toBe(false)
  })
  test('candela: 150 lm per m² of floor, 900–4500 lm, Lambertian peak Φ/π, 1 scene lux = 100 lux', () => {
    expect(lampCandela(20)).toBeCloseTo(3000 / Math.PI / 100)
    expect(lampCandela(3)).toBeCloseTo(900 / Math.PI / 100)
    expect(lampCandela(60)).toBeCloseTo(4500 / Math.PI / 100)
  })
  test('shadow casters: the camera’s room first, then the nearest, k of them', () => {
    const lamps = [
      { x: 0, z: 0, here: false },
      { x: 9, z: 0, here: true },
      { x: 2, z: 0, here: false },
      { x: 5, z: 0, here: false },
    ]
    expect(pickCasters(lamps, { x: 1, z: 0 }, 2)).toEqual([1, 0])
    expect(pickCasters(lamps, { x: 1, z: 0 }, 3)).toEqual([1, 0, 2])
    expect(pickCasters(lamps.slice(0, 1), { x: 1, z: 0 }, 3)).toEqual([0])
  })
  test('the lamps’ bounce by room: a lit room 1, a table lamp alone ≈ 0.17; a room with none gets some through its opening, else 0', () => {
    const room = (id: string, areaSqm: number) => ({ id, areaSqm }) as Room
    const rooms = [room('liv', 30), room('din', 20), room('bed', 14), room('bath', 4), room('store', 3)]
    const lamp = 350 / Math.PI / 100
    const s = lampShares(
      [
        { roomId: 'liv', cd: lampCandela(30) },
        { roomId: 'bed', cd: lamp },
        ...[1, 2, 3].map(() => ({ roomId: 'bath', cd: lampCandela(4) })),
      ],
      rooms,
      [['liv', 'din', 0.3], ['bed', 'store', 0.1]],
    )
    expect(s.get('liv')).toBeCloseTo(1)
    expect(s.get('bed')).toBeCloseTo(350 / 2100)
    expect(s.get('bath')).toBe(LAMP_RANGE)
    expect(s.get('din')).toBeCloseTo(0.3) // its pendant deleted: the living's light through the passage
    expect(s.get('store')).toBeCloseTo(0.1 * (350 / 2100))
    expect(lampShares([], rooms).size).toBe(0)
  })
  test('the lamps’ pool: the camera’s room and the nearest first; the shadow-casting lights take ceiling fixtures only', () => {
    const fx = [
      { x: 0, z: 0, here: false, ceiling: true },
      { x: 9, z: 0, here: true, ceiling: true },
      { x: 1, z: 0, here: false, ceiling: false }, // a table lamp
      { x: 5, z: 0, here: false, ceiling: true },
      { x: 30, z: 0, here: false, ceiling: true },
    ]
    // room for all: the 2 casters take the camera's room's and the nearest ceiling light, then the rest by distance, then dark
    expect(assignPool(fx, { x: 1, z: 0 }, 7, 2)).toEqual([1, 0, 2, 3, 4, -1, -1])
    // too few: the farthest goes dark, never the lamp beside the camera
    expect(assignPool(fx, { x: 1, z: 0 }, 4, 2)).toEqual([1, 0, 2, 3])
    // a lamp never in a caster's place, even with no ceiling light left for it
    expect(assignPool([fx[2]], { x: 1, z: 0 }, 4, 3)).toEqual([-1, -1, -1, 0])
    expect(assignPool([], { x: 1, z: 0 }, 4, 3)).toEqual([-1, -1, -1, -1])
  })
})

describe('the tower at night', () => {
  test('about 45 % of the other flats’ windows lit, the same ones every time', async () => {
    const { litWindow } = await import('./building')
    const keys = Array.from({ length: 2000 }, (_, i) => `flat-${i % 7}|${i % 9}|o${i}`)
    const lit = keys.filter(litWindow).length / keys.length
    expect(lit).toBeGreaterThan(0.4)
    expect(lit).toBeLessThan(0.5)
    expect(keys.map(litWindow)).toEqual(keys.map(litWindow))
  })
})
