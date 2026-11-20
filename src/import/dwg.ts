/**
 * AutoCAD's .dwg (session 31). Its format is closed and every free reader is LibreDWG (GPL-3.0: it cannot go in the page),
 * so a .dwg is converted to DXF by a converter Plotline does not ship: a small server function (api/dwg.js, CloudConvert's
 * free plan behind a key that never reaches the browser — Docs/SETUP_FORMATS.md) or any address that takes the .dwg's
 * bytes and answers its DXF. Its address is VITE_DWG_CONVERT_URL; without it a .dwg is refused with the one-click export,
 * as before. The DXF then goes through the DXF reader like a dropped one.
 */

/** the converter's address, or null: then a .dwg is refused (index.ts LOCKED_FORMATS) */
export const DWG_CONVERTER: string | null = (import.meta.env?.VITE_DWG_CONVERT_URL as string | undefined)?.trim() || null

/** A DXF file starts with group code 0 and SECTION (a comment group 999 may come first, as LibreDWG writes). */
export const looksLikeDxf = (text: string): boolean => /^\s*(999\s*\r?\n[^\n]*\r?\n\s*)*0\s*\r?\nSECTION/.test(text.slice(0, 4096))

export async function convertDwg(bytes: ArrayBuffer, name: string, url: string, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/acad', 'X-File-Name': encodeURIComponent(name) }, signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('the DWG converter could not be reached (no internet?) — or save it as DXF in AutoCAD and drop the .dxf')
  }
  const text = await res.text()
  if (!res.ok) throw new Error(`the DWG converter said: ${text.slice(0, 200) || res.status} — save it as DXF in AutoCAD and drop the .dxf instead`)
  if (!looksLikeDxf(text)) throw new Error('the DWG converter did not send a DXF back — save it as DXF in AutoCAD and drop the .dxf instead')
  return text
}
