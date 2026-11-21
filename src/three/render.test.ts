/** The sky's light by the sun's altitude, the lamps' auto rule and the shadow-casting pick (render.ts): pure, no WebGL. */
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { aoSize, assignPool, DAY_EXPOSURE, drawWide, EDGE_FADE, EDGE_FADE_Z, widenEdge, fitSunBox, lampCandela, lampShares, lightsOn, LITE_PIXELS, markSharp, NIGHT_EXPOSURE, pickCasters, pixelRatioFor, SITE_REACH_M, skyLight, sunLit, TIERS, towerLevel, twilight, WIDE_EVERY, WIDE_M, WIDE_UP_M, wideOnly } from './render'
import { LAMP_RANGE } from './daylight'
import type { Room } from '../core'

describe('what each quality tier draws (session 31)', () => {
  test('Lite: no shadow maps at all, no lamp light in the shader (every lamp baked into the rooms), no corner shading', () =>
    expect(TIERS.lite).toMatchObject({ sun: 0, lamps: 0, lampShadows: 0, ao: false, bake: true }))
  test('the furniture: High the scans in 8 m cells; Low and Lite stand-ins (Lite the lighter) in one batch per material for the flat', () => {
    expect([TIERS.high.standIn, TIERS.high.cell]).toEqual([0, 8])
    expect(TIERS.lite.standIn).toBeGreaterThan(0)
    expect(TIERS.lite.standIn).toBeLessThan(TIERS.low.standIn)
    expect([TIERS.low.cell, TIERS.lite.cell]).toEqual([Infinity, Infinity])
    expect([TIERS.high.bake, TIERS.low.bake]).toEqual([false, false])
  })
  test('Low: the sun’s 1024 shadow map only (no lamp shadows), four lamps', () => expect(TIERS.low).toMatchObject({ sun: 1024, lamps: 4, lampShadows: 0, ao: false }))
  test('High as before: 2048 sun, twelve lamps, three casting, corner shading', () => expect(TIERS.high).toMatchObject({ sun: 2048, lamps: 12, lampShadows: 3, ao: true }))
  test('scanned plants and live mirrors on High only; pictures at most 512 px on Lite, 1024 on Low, the chip’s own on High', () => {
    expect([TIERS.high.extras, TIERS.low.extras, TIERS.lite.extras]).toEqual([true, false, false])
    expect([TIERS.high.maxTexture, TIERS.low.maxTexture, TIERS.lite.maxTexture]).toEqual([0, 1024, 512])
  })
  test('a lighter tier never draws more', () => {
    for (const [a, b] of [['high', 'low'], ['low', 'lite']] as const) {
      expect(TIERS[b].sun).toBeLessThanOrEqual(TIERS[a].sun)
      expect(TIERS[b].lamps).toBeLessThanOrEqual(TIERS[a].lamps)
      expect(TIERS[b].lampShadows).toBeLessThanOrEqual(TIERS[a].lampShadows)
      expect(TIERS[b].wide).toBeLessThanOrEqual(TIERS[a].wide)
    }
  })
})

describe('the sun without shadow maps (Lite: sunLit)', () => {
  const lite = { shadows: false, under: true, outside: false, openSky: false }
  test('inside the flat: off (it would light every floor through the slab)', () => expect(sunLit(lite)).toBe(false))
  test('in the Dollhouse (camera above), the Building view, or standing on an open lawn / deck: on', () =>
    expect([sunLit({ ...lite, under: false }), sunLit({ ...lite, outside: true }), sunLit({ ...lite, openSky: true })]).toEqual([true, true, true]))
  test('with shadow maps (Low, High): always on', () => expect(sunLit({ ...lite, shadows: true })).toBe(true))
})

describe('the picture’s pixels per tier (pixelRatioFor)', () => {
  test('High: the screen’s own up to 2×; Low: 1× (a retina screen draws a quarter of its pixels)', () => {
    expect([pixelRatioFor('high', 1, 1600, 1000), pixelRatioFor('high', 3, 390, 844)]).toEqual([1, 2])
    expect([pixelRatioFor('low', 2, 1600, 1000), pixelRatioFor('low', 1, 1600, 1000)]).toEqual([1, 1])
  })
  test('Lite: three quarters of a 1600 × 1000 window, whatever the screen’s density', () => {
    expect(pixelRatioFor('lite', 1, 1600, 1000)).toBeCloseTo(0.75)
    expect(pixelRatioFor('lite', 2, 1600, 1000)).toBeCloseTo(0.75)
  })
  test('Lite: a bigger window still draws about LITE_PIXELS; never under half; a phone draws its own CSS pixels', () => {
    const r = pixelRatioFor('lite', 1, 1920, 1080)
    expect(1920 * r * 1080 * r).toBeCloseTo(LITE_PIXELS, -3)
    expect(pixelRatioFor('lite', 1, 5120, 2880)).toBe(0.5)
    expect(pixelRatioFor('lite', 3, 390, 844)).toBe(1)
  })
  test('Lite still slow: half the budget', () => expect(pixelRatioFor('lite', 1, 1600, 1000, null, 0.5)).toBeCloseTo(0.75 / Math.SQRT2))
  test('?scale= forces it: Lite’s own, a multiplier on Low and High', () => {
    expect(pixelRatioFor('lite', 1, 1600, 1000, 1)).toBe(1)
    expect(pixelRatioFor('high', 2, 1600, 1000, 0.5)).toBe(1)
    expect(pixelRatioFor('low', 2, 1600, 1000, 0.5)).toBe(0.5)
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

describe('the corner shading on a sharp screen (session 31 perf)', () => {
  test('worked out at the CSS pixels, never more: a 2× screen shades a quarter of the pixels it draws, a 1× screen as before', () => {
    expect(aoSize(1440, 900, 2)).toEqual([1440, 900])
    expect(aoSize(1440, 900, 1.5)).toEqual([1440, 900])
    expect(aoSize(1440, 900, 1)).toEqual([1440, 900])
    expect(aoSize(1440, 900, 0.75)).toEqual([1080, 675]) // a smaller picture: its own pixels
  })
})

describe('the tower round the flat (towerLevel, session 31: "i couldn’t see the playground on the ground floor")', () => {
  const floors = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7]
  const drawn = (tier: 'high' | 'low' | 'lite', floor: number, dollhouse = false) => floors.filter((k) => towerLevel(k, { tier, floor, dollhouse }))
  test('High and Low: every floor round a flat, but no basement (nothing on a flat sees one)', () => {
    expect(drawn('high', 2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(drawn('low', 6)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
  test('Lite: the ground with its zones and the storeys next to the flat’s, no further', () => {
    expect(drawn('lite', 2)).toEqual([0, 1, 2, 3])
    expect(drawn('lite', 6)).toEqual([0, 5, 6, 7])
  })
  test('the Dollhouse looks in from above: nothing over the flat’s own floor; on Lite the ground and the flat’s floor only', () => {
    expect(drawn('high', 2, true)).toEqual([0, 1, 2])
    expect(drawn('low', 6, true)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(drawn('lite', 6, true)).toEqual([0, 6])
  })
  test('the ground floor or a basement walked: the basements too (a ramp goes down to them)', () => {
    expect(drawn('high', 0)).toEqual(floors)
    expect(drawn('lite', 0)).toEqual([-1, 0, 1])
    expect(drawn('lite', -1)).toEqual([-2, -1, 0])
  })
  test('the tower throws the sun’s shadow on High only (Low: the street’s still does; Lite has none)', () =>
    expect([TIERS.high.towerShadows, TIERS.low.towerShadows, TIERS.lite.towerShadows]).toEqual([true, false, false]))
})

describe('the sun’s two shadow maps (session 31 shade: the grounds and the road in the sun’s shadow)', () => {
  test('the wide map over the site on High only: Low and Lite keep today’s look and pay nothing', () =>
    expect([TIERS.high.wide, TIERS.low.wide, TIERS.lite.wide]).toEqual([2048, 0, 0]))

  // a 20 × 15 m flat on floor 2 (its floor at y 0, the street 6.6 m under it), the sun by azimuth (from +x) and altitude
  const flat = new THREE.Box3(new THREE.Vector3(-0.5, -0.2, -0.5), new THREE.Vector3(20.5, 3.2, 15.5))
  const street = -6.6
  const site = new THREE.Box3(new THREE.Vector3(10 - WIDE_M, street, 7.5 - WIDE_M), new THREE.Vector3(10 + WIDE_M, street + WIDE_UP_M, 7.5 + WIDE_M))
  const fitted = (box: THREE.Box3, azDeg: number, altDeg: number) => {
    const [az, alt] = [THREE.MathUtils.degToRad(azDeg), THREE.MathUtils.degToRad(altDeg)]
    const toSun = new THREE.Vector3(Math.cos(az) * Math.cos(alt), Math.sin(alt), Math.sin(az) * Math.cos(alt))
    const cam = new THREE.OrthographicCamera()
    cam.position.set(10, 1.5, 7.5).addScaledVector(toSun, 60 + SITE_REACH_M) // as PlotlineScene places the sun
    cam.lookAt(10, 1.5, 7.5)
    cam.updateMatrixWorld()
    fitSunBox(cam, box, toSun, SITE_REACH_M)
    /** p inside the map: what the shader reads it from (three's frustum test) */
    const covers = (x: number, y: number, z: number) => {
      const c = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix)
      return Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1 && c.z <= 1
    }
    return { cam, covers, texel: Math.max(cam.right - cam.left, cam.top - cam.bottom) / 2048 }
  }
  const hours: [number, number][] = [[100, 20], [160, 45], [200, 70], [250, 30], [270, 8]]

  test('the flat’s own map stays round the flat: under 3 cm a texel at every hour, the flat’s rooms all in it', () => {
    for (const [az, alt] of hours) {
      const sharp = fitted(flat, az, alt)
      expect(sharp.texel).toBeLessThan(alt < 10 ? 0.06 : 0.03)
      for (const [x, z] of [[0, 0], [20, 0], [0, 15], [20, 15], [10, 7.5]]) for (const y of [0, 3]) expect(sharp.covers(x, y, z)).toBe(true)
    }
  })
  test('which map covers what: the lawn under the tower, the road 40 m off and a neighbour’s wall are the wide map’s; the flat is the sharp one’s', () => {
    for (const [az, alt] of hours) {
      const [sharp, wide] = [fitted(flat, az, alt), fitted(site, az, alt)]
      for (const [x, y, z] of [[-15, street, 7.5], [10, street, 55], [-40, street + 12, -20], [70, street + 30, 40]]) {
        expect(sharp.covers(x, y, z)).toBe(false)
        expect(wide.covers(x, y, z)).toBe(true)
      }
      expect(wide.covers(10, 1.5, 7.5)).toBe(true) // (the shader takes the sharp one there)
      expect(wide.texel).toBeLessThan(0.2) // about a real sun's soft edge 20 m from what throws it
    }
  })
  test('both reach toward the sun for what shades them: a block 250 m off toward a low sun still throws its shadow', () => {
    for (const box of [flat, site]) {
      const { cam } = fitted(box, 270, 8)
      expect(cam.near).toBeLessThan(cam.far - SITE_REACH_M)
    }
  })
  test('the hour dragged: the wide map drawn again every WIDE_EVERY-th frame, and at once when the hour rests', () => {
    const drawn = (changes: boolean[]) => {
      let waited = 0
      return changes.flatMap((moved, f) => ((moved || waited > 0) && drawWide(moved, ++waited) ? ((waited = 0), [f]) : []))
    }
    expect(WIDE_EVERY).toBe(4)
    expect(drawn([...Array(12).fill(true), false, false])).toEqual([3, 7, 11]) // drawn on the 12th: nothing left at rest
    expect(drawn([...Array(10).fill(true), false, false])).toEqual([3, 7, 10]) // two frames out of date, then at rest at once
    expect(drawn([true, false, false])).toEqual([1]) // one change (an hour picked): one frame later
    expect(drawn([false, false])).toEqual([])
  })
  test('the grounds’ trees and benches round the flat cast into the wide map only, never the sharp one nor a lamp’s (wideOnly, polish2)', () => {
    const lit = () => {
      const l = new THREE.DirectionalLight()
      l.position.set(0, 10, 0)
      l.updateMatrixWorld()
      l.shadow.updateMatrices(l) // (three's own, before it draws a map: its frustum over the origin)
      return l.shadow.getFrustum()
    }
    const sun = new THREE.DirectionalLight()
    markSharp(sun)
    sun.position.set(0, 10, 0)
    sun.updateMatrixWorld()
    sun.shadow.updateMatrices(sun)
    const [sharp, wide] = [sun.shadow.getFrustum(), lit()]
    const lamp = new THREE.SpotLight()
    lamp.position.set(0, 10, 0)
    lamp.updateMatrixWorld()
    lamp.shadow.updateMatrices(lamp)
    markSharp(lamp)
    const tree = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1)), new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), undefined, 3))
    const meshes = tree.children as THREE.Mesh[]
    for (const m of meshes) (m.updateMatrixWorld(), expect([m.intersectsFrustum(sharp), m.intersectsFrustum(wide)]).toEqual([true, true]))
    wideOnly(tree, true)
    for (const m of meshes) expect([m.intersectsFrustum(sharp), m.intersectsFrustum(lamp.shadow.getFrustum()), m.intersectsFrustum(wide)]).toEqual([false, false, true])
    wideOnly(tree, false) // (the Building view: as built)
    for (const m of meshes) expect([m.intersectsFrustum(sharp), m.intersectsFrustum(wide)]).toEqual([true, true])
  })
  test('one map only (Low; a flat on its own): the box widened, its shadow fading into lit over the margin, the flat clear of it (polish2)', () => {
    for (const [az, alt] of hours) {
      const { cam } = fitted(flat, az, alt)
      const near = cam.near, far = cam.far, width = cam.right - cam.left
      widenEdge(cam)
      const uvz = (x: number, y: number, z: number) => {
        const c = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix)
        return [(c.x + 1) / 2, (c.y + 1) / 2, (c.z + 1) / 2]
      }
      // every corner of the flat's box stays out of the fading margin: lit exactly as before
      for (let i = 0; i < 8; i++) {
        const [u, v, z] = uvz(i & 1 ? flat.max.x : flat.min.x, i & 2 ? flat.max.y : flat.min.y, i & 4 ? flat.max.z : flat.min.z)
        for (const t of [u, v]) expect(Math.min(t, 1 - t)).toBeGreaterThanOrEqual(EDGE_FADE - 1e-6)
        expect(1 - z).toBeGreaterThanOrEqual(EDGE_FADE_Z - 1e-6)
      }
      expect(cam.near).toBe(near)
      const band = EDGE_FADE * (cam.right - cam.left) // the fade across, in metres
      expect(band).toBeGreaterThan(0.8)
      expect(band).toBeLessThan(3)
      expect(EDGE_FADE_Z * (cam.far - near)).toBeLessThan(3.5) // and in depth
      expect(cam.far).toBeGreaterThan(far)
      expect(cam.right - cam.left).toBeLessThan(width * 1.1) // ≤ 10 % coarser
    }
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toContain('float sharpOrLit(')
    expect(THREE.ShaderChunk.lights_fragment_begin).toContain('#elif NUM_DIR_LIGHT_SHADOWS == 1 && UNROLLED_LOOP_INDEX == 0')
    expect(THREE.ShaderChunk.lights_fragment_begin).toContain('? sharpOrLit( getShadow( directionalShadowMap[ i ],')
  })
  test('three’s light chunks read the wide map past the sharp one, and light 1 lights nothing (wideChunks)', () => {
    expect(THREE.ShaderChunk.shadowmap_pars_fragment).toContain('float sharpOrWide(')
    expect(THREE.ShaderChunk.lights_fragment_begin).toContain('sharpOrWide( directionalLightShadow, vDirectionalShadowCoord[ i ] )')
    expect(THREE.ShaderChunk.lights_fragment_begin).toContain('#if !( NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 1 )')
    expect(THREE.ShaderChunk.shadowmask_pars_fragment).toContain('#if !( NUM_DIR_LIGHT_SHADOWS > 1 && UNROLLED_LOOP_INDEX == 1 )')
  })
})
