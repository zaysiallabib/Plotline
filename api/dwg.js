/**
 * POST /api/dwg — a .dwg's bytes in, its DXF out (session 31). The Studio calls it when VITE_DWG_CONVERT_URL=/api/dwg.
 * DWG's only free reader (LibreDWG) is GPL and cannot ship in the page, so CloudConvert converts it: its free plan (10
 * conversions a day, no card) through its synchronous API. The key is CLOUDCONVERT_API_KEY, a server setting in Vercel —
 * it never reaches the browser. Setup in plain words: Docs/SETUP_FORMATS.md.
 *
 * Guard rails: only a POST from this site's own pages (Origin = this host), only a DWG (it starts with "AC10"), at most 4 MB
 * (Vercel takes 4.5 MB a request). Whoever reaches it can spend the day's 10 conversions at worst: the free plan cannot be
 * charged.
 */
const MAX_BYTES = 4 * 1024 * 1024
const SYNC = 'https://sync.api.cloudconvert.com/v2/jobs'

const say = (status, text) => new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export async function POST(request) {
  const key = process.env.CLOUDCONVERT_API_KEY
  if (!key) return say(501, 'The DWG converter is not set up on this site (Docs/SETUP_FORMATS.md)')
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) return say(403, 'Only Plotline\'s own pages may use this converter')
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length > MAX_BYTES) return say(413, `The DWG is ${(bytes.length / 1e6).toFixed(1)} MB; the converter takes 4 MB at most`)
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'AC10') return say(415, 'This is not a DWG file')
  const name = decodeURIComponent(request.headers.get('x-file-name') || 'plan.dwg').replace(/[^\w .()-]/g, '_')
  const job = await fetch(SYNC, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        in: { operation: 'import/base64', file: Buffer.from(bytes).toString('base64'), filename: name },
        dxf: { operation: 'convert', input: 'in', input_format: 'dwg', output_format: 'dxf' },
        out: { operation: 'export/url', input: 'dxf' },
      },
    }),
  })
  const body = await job.json().catch(() => null)
  if (!job.ok || body?.data?.status !== 'finished') {
    const failed = body?.data?.tasks?.find((t) => t.status === 'error')
    return say(502, `The converter refused it: ${failed?.message || body?.message || job.status}`)
  }
  const url = body.data.tasks.find((t) => t.name === 'out')?.result?.files?.[0]?.url
  if (!url) return say(502, 'The converter gave no DXF back')
  const dxf = await fetch(url)
  if (!dxf.ok) return say(502, `The converted DXF could not be fetched (${dxf.status})`)
  return new Response(await dxf.text(), { headers: { 'Content-Type': 'application/dxf; charset=utf-8', 'Cache-Control': 'no-store' } })
}
