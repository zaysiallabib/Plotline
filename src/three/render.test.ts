/** The sky's light by the sun's altitude, the lamps' auto rule and the shadow-casting pick (render.ts): pure, no WebGL. */
import { describe, expect, test } from 'vitest'
import { lampCandela, lightsOn, NIGHT_EXPOSURE, pickCasters, skyLight, twilight } from './render'

describe('skyLight', () => {
  test('noon down to 10°: the day look unchanged (exposure 1, full fill, no night)', () => {
    for (const alt of [80, 45, 20, 10]) expect(skyLight(alt)).toMatchObject({ exposure: 1, fill: 1, night: 0 })
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
  test('candela: 100 lm per m² of floor, 800–3500 lm, Lambertian peak Φ/π, 1 scene lux = 100 lux', () => {
    expect(lampCandela(20)).toBeCloseTo(2000 / Math.PI / 100)
    expect(lampCandela(3)).toBeCloseTo(800 / Math.PI / 100)
    expect(lampCandela(60)).toBeCloseTo(3500 / Math.PI / 100)
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
})
