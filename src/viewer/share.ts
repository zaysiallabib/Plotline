/** Share links: `?c=<base64url(JSON.stringify(Configuration))>`, and BDT formatting. */
import type { Configuration, FinishSlot } from '../core'

export function encodeConfig(cfg: Configuration): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Unknown slot/option ids are dropped silently (spec §3.7). */
export function decodeConfig(s: string | null, slots: FinishSlot[]): Configuration {
  if (!s) return {}
  try {
    const raw = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))) as Record<string, unknown>
    const cfg: Configuration = {}
    for (const slot of slots) {
      const opt = raw[slot.id]
      if (typeof opt === 'string' && slot.options.some((o) => o.id === opt)) cfg[slot.id] = opt
    }
    return cfg
  } catch {
    return {}
  }
}

/** Bangladeshi digit grouping: 185000 → "1,85,000", 12500000 → "1,25,00,000". */
export function formatTaka(n: number): string {
  const s = String(Math.abs(Math.trunc(n)))
  if (s.length <= 3) return s
  const head = s.slice(0, -3)
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3)
}

/** 0 → "Included", +185000 → "+৳1,85,000", −40000 → "−৳40,000". */
export function formatDelta(n: number): string {
  if (n === 0) return 'Included'
  return `${n > 0 ? '+' : '−'}৳${formatTaka(n)}`
}
