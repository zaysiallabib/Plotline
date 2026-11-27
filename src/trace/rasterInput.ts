/**
 * The plan picture's pixels as Auto-trace's rasters: grey (luminance) and the colour image itself (RGBA: planter greens,
 * blue glazing, colour fills), same size, the Scale tool's frame. One helper for the page and the trace worker (from
 * Maheer's Plotline 2.0).
 */
export function traceRasters({ width, height, data: rgba }: { width: number; height: number; data: Uint8ClampedArray }) {
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return { gray: { width, height, data }, rgb: { width, height, data: rgba } }
}
