import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Vercel holds them as SUPABASE_URL / SUPABASE_KEY (founder, 2026-10-05); .env.local keeps the VITE_ names. Only these two
// reach the browser, and never a secret key: it would give every visitor the whole database.
const { SUPABASE_URL, SUPABASE_KEY } = process.env
if (SUPABASE_KEY && (SUPABASE_KEY.startsWith('sb_secret_') || Buffer.from(SUPABASE_KEY.split('.')[1] ?? '', 'base64').toString().includes('service_role')))
  throw new Error('SUPABASE_KEY is a SECRET key. Put the PUBLISHABLE key (sb_publishable_…) in Vercel instead.')

// `vite preview` answers with vercel.json's headers, rule by rule (each `source` read as a regular expression — true of the
// patterns there), so a local check of the built site meets the same Content-Security-Policy and caching a visitor does.
// Not `vite dev`: its inline scripts would be refused.
const vercel: { headers: { source: string; headers: { key: string; value: string }[] }[] } = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const siteHeaders: Plugin = {
  name: 'vercel-headers',
  configurePreviewServer: (server) =>
    void server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '/').split('?')[0]
      for (const rule of vercel.headers) if (new RegExp(`^${rule.source}$`).test(path)) for (const h of rule.headers) res.setHeader(h.key, h.value)
      next()
    }),
}

export default defineConfig({
  plugins: [react(), siteHeaders],
  define: SUPABASE_URL && SUPABASE_KEY ? { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(SUPABASE_KEY) } : {},
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
  // the readers' worker (src/import/read.worker.ts: IFC, DXF) loads web-ifc and its wasm lazily: that needs an ES-module worker
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
