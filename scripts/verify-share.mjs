// After the founder's SQL paste (supabase/paste-into-sql-editor.sql): checks the live Supabase project in .env.local —
// share links AND the change list. Never prints a key. Exit code 1 when anything is off.
// usage (from the repo root): node scripts/verify-share.mjs [staffKey]
//   without the key: anon reads nothing, bad tokens / keys are refused;
//   with it: publishes a test unit ("Verify script test — ignore"), reads it back, writes 3 change-list rows to its
//   link and reads them back as staff (they stay: the table is append-only; the link shows in /changes as that name).
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const call = async (path, init) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H, ...init })
  const text = await r.text()
  return { status: r.status, text, short: text.slice(0, 120) }
}
const rpc = (fn, args) => call(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
let bad = 0
const check = (name, ok, got) => {
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(44)} ${got}`)
}
const denied = (r) => r.status === 401 || r.status === 403 || (r.status === 200 && r.text.trim() === '[]')

console.log('project', URL_.replace(/^https:\/\/([^.]+).*/, '$1'))
for (const t of ['units', 'share_links', 'events']) {
  const r = await call(`${t}?select=*&limit=1`)
  check(`anon GET ${t} reads nothing`, denied(r), `${r.status} ${r.short}`)
}
let r = await rpc('unit_by_token', { p_token: crypto.randomUUID() })
check('unit_by_token random → null', r.status === 200 && r.text.trim() === 'null', `${r.status} ${r.short}`)
r = await rpc('unit_by_token', { p_token: 'garbage' })
check('unit_by_token garbage → 400', r.status === 400, `${r.status}`)
r = await rpc('publish_unit', { p_unit: { name: 'x' }, p_key: 'wrong' })
check('publish_unit wrong key → 403', r.status === 403, `${r.status}`)
const ev = (token, kind, ref, payload, id = crypto.randomUUID()) =>
  rpc('add_event', { p_id: id, p_token: token, p_kind: kind, p_ref: ref, p_buyer: 'verify-script', p_name: 'Verify script', p_payload: payload })
r = await ev(crypto.randomUUID(), 'comment', 'x', { text: 'x' })
check('add_event unknown link → 409', r.status === 409, `${r.status}`)
r = await rpc('events_for_staff', { p_key: 'wrong' })
check('events_for_staff wrong key → 403', r.status === 403, `${r.status}`)

const staffKey = process.argv[2]
if (staffKey) {
  const unit = { ...JSON.parse(readFileSync(new URL('../src/data/units/type-a.json', import.meta.url), 'utf8')), name: 'Verify script test — ignore' }
  const pub = await rpc('publish_unit', { p_unit: unit, p_key: staffKey })
  check('publish_unit right key → a token', pub.status === 200, pub.status === 200 ? '(token minted)' : `${pub.status} ${pub.short}`)
  const token = pub.status === 200 ? JSON.parse(pub.text) : null
  if (token) {
    const back = await rpc('unit_by_token', { p_token: token })
    // jsonb keeps its own key order: compare with keys sorted
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v)
    const same = back.status === 200 && JSON.stringify(canon(JSON.parse(back.text))) === JSON.stringify(canon(unit))
    check('unit_by_token → the same unit JSON', same, `${back.status}`)
    const sel = (optionId, priceDeltaBdt) => ({ slotId: 's_floor_beds', slotLabel: 'Bedroom floors', optionId, label: optionId, brand: 'test', sku: 'test', priceDeltaBdt })
    const c = crypto.randomUUID()
    const s1 = crypto.randomUUID()
    const s2 = crypto.randomUUID()
    const rows = [await ev(token, 'comment', 'verify-note', { text: 'Verify script note', object: 'Wall · Bed-1' }, c), await ev(token, 'selection', 's_floor_beds', sel('fo_beds_marble', 185000), s1)]
    rows.push(await ev(token, 'selection', 's_floor_beds', sel('fo_beds_walnut', 45000), s2))
    rows.push(await ev(token, 'selection', 's_floor_beds', sel('fo_beds_walnut', 45000), s2)) // a resend: no second row
    check('add_event × 4 (one a resend) → 200', rows.every((x) => x.status === 200), rows.map((x) => x.status).join(' '))
    const st = await rpc('events_for_staff', { p_key: staffKey })
    const data = st.status === 200 ? JSON.parse(st.text) : { links: [], events: [] }
    const mine = data.events.filter((e) => e.token === token)
    check('events_for_staff → the link, 3 rows', st.status === 200 && data.links.some((l) => l.token === token) && mine.length === 3, `${st.status} rows ${mine.length}`)
    check('newest first; the older choice superseded', mine.map((e) => e.id).join() === [s2, s1, c].join() && mine.map((e) => !!e.superseded).join() === 'false,true,false', mine.map((e) => `${e.kind}${e.superseded ? '(superseded)' : ''}`).join(', '))
    console.log(`link                                           https://plotline-flax.vercel.app/s/${token}  (also listed in /changes)`)
  }
}
console.log(bad ? `\n${bad} check(s) FAILED` : '\nall checks passed')
process.exitCode = bad ? 1 : 0
