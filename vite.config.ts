import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vercel holds them as SUPABASE_URL / SUPABASE_KEY (founder, 2026-10-05); .env.local keeps the VITE_ names. Only these two
// reach the browser, and never a secret key: it would give every visitor the whole database.
const { SUPABASE_URL, SUPABASE_KEY } = process.env
if (SUPABASE_KEY && (SUPABASE_KEY.startsWith('sb_secret_') || Buffer.from(SUPABASE_KEY.split('.')[1] ?? '', 'base64').toString().includes('service_role')))
  throw new Error('SUPABASE_KEY is a SECRET key. Put the PUBLISHABLE key (sb_publishable_…) in Vercel instead.')

export default defineConfig({
  plugins: [react()],
  define: SUPABASE_URL && SUPABASE_KEY ? { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(SUPABASE_KEY) } : {},
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
