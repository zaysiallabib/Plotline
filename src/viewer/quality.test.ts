import { describe, expect, test } from 'vitest'
import { lean } from '../furnish/procedural'
import { buildFurniture } from '../three/furniture'
import { JUDGE_MS, needsFrame, slowFrames } from '../three/render'
import { chosen, lower, recommend } from './quality'

const strong = { gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)', webgl2: true, memoryGb: 8, cores: 12 }

describe('the device check recommends a tier with a plain reason', () => {
  test('a capable machine: High, no reason', () => expect(recommend(strong)).toEqual({ tier: 'high', why: null }))
  test.each([
    ['software drawing', { ...strong, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }, 'no graphics chip in use (software drawing)'],
    ['llvmpipe', { ...strong, gpu: 'llvmpipe (LLVM 15.0.7, 256 bits)' }, 'no graphics chip in use (software drawing)'],
    ['Windows basic driver', { ...strong, gpu: 'Microsoft Basic Render Driver' }, 'no graphics chip in use (software drawing)'],
    ['Intel UHD', { ...strong, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' }, 'integrated graphics'],
    ['Intel Iris', { ...strong, gpu: 'Intel(R) Iris(R) Xe Graphics, or similar' }, 'integrated graphics'],
    ['a phone chip', { ...strong, gpu: 'Adreno (TM) 610' }, 'integrated graphics'],
    ['an iPhone', { ...strong, gpu: 'Apple GPU', phone: true }, 'a phone or tablet'],
    ['any phone, whatever its chip is called', { ...strong, gpu: 'Samsung Xclipse 940', phone: true }, 'a phone or tablet'],
    ['a phone named like a desktop card', { ...strong, phone: true }, 'a phone or tablet'],
    ['4 GB memory', { ...strong, memoryGb: 4 }, '4 GB memory'],
    ['4 threads', { ...strong, cores: 4 }, '4 processor threads'],
    ['no WebGL 2', { ...strong, webgl2: false, gpu: '' }, 'no WebGL 2 in this browser'],
  ])('%s: Lite', (_, d, why) => expect(recommend(d)).toEqual({ tier: 'lite', why }))
  test('a Mac (Apple GPU, not a phone) and an Intel Arc card stay High', () => {
    expect(recommend({ ...strong, gpu: 'Apple GPU' }).tier).toBe('high')
    expect(recommend({ ...strong, gpu: 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)' }).tier).toBe('high')
  })
  test('unknown memory and threads (Firefox, Safari) say nothing', () => expect(recommend({ ...strong, memoryGb: undefined, cores: undefined }).tier).toBe('high'))
  test('a slow-frames drop stored for this browser is the recommendation, with its reason', () => {
    expect(recommend(strong, 'low')).toEqual({ tier: 'low', why: 'slow frames' })
    expect(recommend(strong, 'junk').tier).toBe('high')
  })
  test('one tier down', () => expect([lower('high'), lower('low'), lower('lite')]).toEqual(['low', 'lite', 'lite']))
})

describe('who sets the tier: GPU fallback > the link > the person > the device', () => {
  const none = { fallback: null, link: null, picked: null, rec: 'lite' as const }
  test('nothing chosen: the recommendation', () => expect(chosen(none)).toEqual({ tier: 'lite', by: 'device' }))
  test('the person’s pick wins over the device', () => expect(chosen({ ...none, picked: 'high' })).toEqual({ tier: 'high', by: 'you' }))
  test('?quality= forces it over the pick', () => expect(chosen({ ...none, picked: 'high', link: 'low' })).toEqual({ tier: 'low', by: 'link' }))
  test('a GPU failure this session falls to Lite over everything', () => expect(chosen({ ...none, picked: 'high', link: 'high', fallback: 'lite' })).toEqual({ tier: 'lite', by: 'fallback' }))
  test('a value that is not a tier is ignored', () => expect(chosen({ ...none, picked: 'ultra', link: '' })).toEqual({ tier: 'lite', by: 'device' }))
})

describe('Lite and Low draw no idle frames', () => {
  const idle = { tier: 'lite' as const, xr: false, moved: false, now: 5000, wakeUntil: 4000 }
  test('nothing moved, nothing woke it: no frame, on Lite and on Low', () => expect([needsFrame(idle), needsFrame({ ...idle, tier: 'low' })]).toEqual([false, false]))
  test('the camera moved', () => expect(needsFrame({ ...idle, moved: true })).toBe(true))
  test('input or a load within the wake window', () => expect(needsFrame({ ...idle, wakeUntil: 5001 })).toBe(true))
  test('VR draws every frame', () => expect(needsFrame({ ...idle, xr: true })).toBe(true))
  test('the wind’s lines drift on their own: drawn while shown', () => expect(needsFrame({ ...idle, animating: true })).toBe(true))
  test('High draws every frame', () => expect(needsFrame({ ...idle, tier: 'high' })).toBe(true))
})

describe('slow frames: worse than 30 fps, judged within ~3 s', () => {
  const at = (ms: number, n: number) => Array(n).fill(ms)
  test('60 fps and 30 fps are fine, once 1.5 s of frames are in', () => expect([slowFrames(at(16.7, 90)), slowFrames(at(33.4, 45))]).toEqual([false, false]))
  test('20 fps is slow after 1.5 s; 5 fps after 8 frames (1.6 s); 2 fps after 5 frames (2.5 s)', () => {
    expect([slowFrames(at(50, 30)), slowFrames(at(200, 8)), slowFrames(at(500, 5))]).toEqual([true, true, true])
  })
  test('not enough yet: no verdict (under 1.5 s of frames, or under 5 frames)', () => {
    expect([slowFrames(at(16.7, 80)), slowFrames(at(50, 29)), slowFrames(at(400, 4))]).toEqual([null, null, null])
    expect(JUDGE_MS).toBe(1500)
  })
  test('a few hitches (shader compiles, pictures uploading) in smooth frames are not slow', () => expect(slowFrames([...at(16.7, 60), ...at(400, 10)])).toBe(false))
})

describe('Lite and Low leave the scanned plant models out', () => {
  test('a potted plant (6 MB model) is an empty piece: nothing loaded, still in the layout with its id', async () => {
    lean.on = true
    try {
      const o = await buildFurniture({ id: 'p1', assetId: 'potted_plant_01', roomId: 'r', x: 1, y: 2, rotationDeg: 0 })
      expect(o.children).toHaveLength(0)
      expect(o.userData).toMatchObject({ kind: 'furniture', id: 'p1' })
    } finally {
      lean.on = false
    }
  })
})
