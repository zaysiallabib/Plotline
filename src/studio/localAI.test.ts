/**
 * s27 Local AI: one call to the model on this PC (askLocalAI, fetch stubbed), parsed strictly; a row's pick applied by
 * applyAnswer and logged tagged by the AI; never a server off this PC or a paid cloud model.
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import type { Opening, Unit, Vertex, Wall } from '../core'
import { emptyUnit, initialState, studioIssues, type StudioState } from './model'
import { ANSWERS_KEY, LOOKS_RIGHT, applyAnswer, openReview, studioReducer } from './review'
import { fixesOf, markIssues, rowAnswers } from './issues'
import { askLocalAI, askRow, isLocalUrl, testLocalAI } from './localAI'

// the AI-prep test's plan (issues.test.ts): a 4 × 3 m box split by a guessed zone line, its row on that line
const v = (id: string, x: number, y: number): Vertex => ({ id, x, y })
const w = (id: string, a: string, b: string, openings: Opening[] = []): Wall => ({ id, a, b, thicknessM: 0.127, heightM: 3.048, openings })
const u: Unit = {
  ...emptyUnit(),
  id: 'u',
  name: 'test',
  planImage: { src: 'plan.png', pxPerM: 100, originPx: { x: 0, y: 0 } },
  vertices: [v('v1', 0, 0), v('v2', 4, 0), v('v3', 4, 3), v('v4', 0, 3), v('p1', 2, 3), v('p0', 2, 0)],
  walls: [
    w('t1', 'v1', 'p0', [{ id: 'd', kind: 'door', offsetM: 1, widthM: 0.6, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' }]),
    w('t2', 'p0', 'v2'),
    w('right', 'v2', 'v3'),
    w('b1', 'v3', 'p1'),
    w('b2', 'p1', 'v4'),
    w('left', 'v4', 'v1'),
    { ...w('z', 'p0', 'p1'), thicknessM: 0.05, heightM: 0 },
  ],
}
const row = { id: 'r', at: { x: 2, y: 1.5 }, kind: 'low-confidence' as const, entityId: 'z', message: 'Drew a zone line to close Dining. Right?' }
const stats = { ms: 0, pxPerM: 100, scaleFrom: 'given' as const, walls: 6, rooms: 2, labelled: 0 }
const s0: StudioState = { ...initialState(), unit: u, planImage: { dataUrl: '', naturalW: 1000, naturalH: 800, name: 'plan.png' }, review: { unitId: u.id, items: [row], stats } }
const rooms = deriveRooms(u), issues = studioIssues(u, rooms), marks = markIssues(u, rooms, issues, openReview(s0, rooms))
const s1 = studioReducer(s0, { type: 'answers', unit: u, rows: rowAnswers(u, marks, fixesOf(u, marks, issues), { w: 1000, h: 800 }) })

const LOCAL = { url: 'http://localhost:11434', model: 'qwen2.5vl:7b' }
/** a stub Ollama: /api/tags lists `models`; /api/chat replies `content`; every request kept */
function ollama(content: string, models = ['qwen2.5vl:7b']) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: models.map((name) => ({ name })) }))
    return new Response(JSON.stringify({ model: LOCAL.model, message: { role: 'assistant', content }, done: true }))
  }) as typeof fetch
  return { f, calls }
}
const memory = () => {
  const mem = new Map<string, string>()
  return { mem, store: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, x: string) => void mem.set(k, x) } }
}

describe('Local AI (session 27): the model on this PC answers a Check-these row', () => {
  it('one picture and the choices go to /api/chat; the reply is parsed strictly', async () => {
    const { f, calls } = ollama('{"answer":"b","why":"the sheet draws a wall there"}')
    const r = await askLocalAI({ image: 'data:image/png;base64,AAAA', question: 'Q?', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, LOCAL, f)
    expect(r).toMatchObject({ answer: 'b', why: 'the sheet draws a wall there' })
    const body = JSON.parse(calls[0].init!.body as string)
    expect(calls[0].url).toBe('http://localhost:11434/api/chat')
    expect(body).toMatchObject({ model: 'qwen2.5vl:7b', stream: false, messages: [{ role: 'user', images: ['AAAA'] }] })
    expect(body.messages[0].content).toContain('- b: B')
    // an id not on the list, or not JSON: not sure
    expect((await askLocalAI({ image: '', question: '', choices: [{ id: 'a', label: 'A' }] }, LOCAL, ollama('{"answer":"z","why":"?"}').f)).answer).toBeNull()
    expect((await askLocalAI({ image: '', question: '', choices: [{ id: 'a', label: 'A' }] }, LOCAL, ollama('a, I think').f)).answer).toBeNull()
  })

  it("a row's pick is logged tagged by the AI and applied by applyAnswer (one undo step); a Looks right is logged, never applied", async () => {
    const { mem, store } = memory()
    const { f, calls } = ollama('{"answer":"make-it-a-wall","why":"a full wall is drawn"}')
    const { note, fix } = await askRow(s1, 'r', 'data:image/png;base64,AAAA', row.message, () => s1, store, LOCAL, f)
    expect(calls[0].init!.body as string).toContain('make-it-a-wall: Make it a wall')
    expect(fix).toBe('make-it-a-wall')
    expect(note).toMatchObject({ row: row.message, label: 'Make it a wall', why: 'a full wall is drawn', before: u })
    const t = applyAnswer(s1, 'r', fix!)
    expect(t.unit.walls.find((x) => x.id === 'z')!.heightM).toBeGreaterThan(3)
    expect(studioReducer(t, { type: 'undo' }).unit).toBe(u)
    expect(JSON.parse(mem.get(ANSWERS_KEY)!)).toEqual([expect.objectContaining({ rowId: 'r', answerId: 'make-it-a-wall', by: 'ai', model: 'qwen2.5vl:7b', why: 'a full wall is drawn' })])

    const lr = await askRow(s1, 'r', '', row.message, () => s1, store, LOCAL, ollama(`{"answer":"${LOOKS_RIGHT}","why":"open plan"}`).f)
    expect(lr.fix).toBeUndefined()
    expect(lr.note).toMatchObject({ label: 'Looks right', why: 'open plan' })
    expect(lr.note.before).toBeUndefined()
    const log = JSON.parse(mem.get(ANSWERS_KEY)!)
    expect(log).toHaveLength(2) // appended, the first entry unchanged
    expect(log[1]).toMatchObject({ answerId: LOOKS_RIGHT, by: 'ai' })

    // not sure: nothing logged or applied; the plan moved on meanwhile: refused
    expect((await askRow(s1, 'r', '', row.message, () => s1, store, LOCAL, ollama('{"answer":"not-sure","why":"cannot see"}').f)).fix).toBeUndefined()
    expect(JSON.parse(mem.get(ANSWERS_KEY)!)).toHaveLength(2)
    await expect(askRow(s1, 'r', '', row.message, () => t, store, LOCAL, ollama('{"answer":"take-it-out","why":"x"}').f)).rejects.toThrow(/plan changed/)
    expect(JSON.parse(mem.get(ANSWERS_KEY)!)).toHaveLength(2)
  })

  it('Test says what it found, or the plain reason with its fix; never a server off this PC or a cloud model', async () => {
    expect(await testLocalAI(LOCAL, ollama('', ['moondream:latest', 'qwen2.5vl:7b']).f)).toBe('found qwen2.5vl:7b')
    await expect(testLocalAI(LOCAL, ollama('', ['moondream:latest']).f)).rejects.toThrow(/not pulled.*ollama\.exe pull qwen2\.5vl:7b/)
    const down = (async () => {
      throw new TypeError('NetworkError')
    }) as typeof fetch
    await expect(testLocalAI(LOCAL, down)).rejects.toThrow(/not running.*start-ollama.cmd/)
    // the CORS check: the plain call fails, an opaque one goes through
    const cors = (async (_: string, init?: RequestInit) => {
      if (init?.mode !== 'no-cors') throw new TypeError('NetworkError')
      return new Response(null)
    }) as typeof fetch
    await expect(testLocalAI(LOCAL, cors)).rejects.toThrow(/Blocked by CORS/)
    const { f, calls } = ollama('')
    await expect(testLocalAI({ ...LOCAL, url: 'https://ollama.com' }, f)).rejects.toThrow(/not a local server/)
    await expect(testLocalAI({ ...LOCAL, model: 'qwen3-vl:235b-cloud' }, f)).rejects.toThrow(/cloud model/)
    expect(calls).toHaveLength(0)
    expect(await testLocalAI({ ...LOCAL, url: 'http://gpu-box.example:11434', remote: true }, f)).toBe('found qwen2.5vl:7b') // ticked on purpose
    expect(['http://127.0.0.1:11434', 'http://192.168.0.7:11434', 'http://[::1]:11434'].every(isLocalUrl)).toBe(true)
    expect(['https://ollama.com', 'http://8.8.8.8', 'nonsense'].some(isLocalUrl)).toBe(false)
  })
})
