// Decode plan images (webp/jpg/png) to grey PGM fixtures for the src/trace eval (src/trace/walls.test.ts).
// Uses the system Edge via Playwright (a canvas decodes every format; no image deps).
// Usage: node scripts/trace-fixtures.mjs [--rgb] [outDir] [imageDir ...]
//   default outDir E:/dev/tmp/wave15/walls/fixtures; default inputs: public/assets/plan-* + every "Demo drawings" subfolder.
//   --rgb also writes "<name>.ppm" (P6 colour) beside each PGM, for src/trace/hints (green areas, colour fills).
// Output names: "<folder>__<file>.pgm" (spaces → _), the calibrated plans as "assets__plan-*.pgm".
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const rgb = process.argv.includes('--rgb')
const args = process.argv.slice(2).filter((a) => a !== '--rgb')
const outDir = args[0] ?? 'E:/dev/tmp/wave15/walls/fixtures'
const dirs = args.length > 1 ? args.slice(1) : null
mkdirSync(outDir, { recursive: true })

const inputs = []
const add = (dir, tag) => {
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) if (/\.(webp|jpe?g|png)$/i.test(f)) inputs.push({ path: join(dir, f), tag })
}
if (dirs) for (const d of dirs) add(d, basename(d))
else {
  for (const f of readdirSync(join(root, 'public/assets'))) if (/^plan-/.test(f)) inputs.push({ path: join(root, 'public/assets', f), tag: 'assets' })
  const demo = existsSync('E:/dev/Plotline/Demo drawings') ? 'E:/dev/Plotline/Demo drawings' : join(root, 'Demo drawings')
  for (const d of readdirSync(demo)) add(join(demo, d), d)
}

const pw = await import(pathToFileURL('E:/dev/Plotline/node_modules/playwright/index.mjs').href)
const browser = await pw.chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
for (const { path, tag } of inputs) {
  const ext = extname(path).slice(1).toLowerCase()
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const url = `data:${mime};base64,${readFileSync(path).toString('base64')}`
  const { w, h, b64, rgb64 } = await page.evaluate(async ([src, rgb]) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext('2d')
    g.fillStyle = '#fff' // transparent PNGs → white paper
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const out = new Uint8Array(c.width * c.height)
    for (let i = 0; i < out.length; i++) out[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2])
    const b64of = (a) => {
      let s = ''
      for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000))
      return btoa(s)
    }
    const col = rgb ? new Uint8Array(out.length * 3) : null
    if (col) for (let i = 0; i < out.length; i++) (col[i * 3] = d[i * 4]), (col[i * 3 + 1] = d[i * 4 + 1]), (col[i * 3 + 2] = d[i * 4 + 2])
    return { w: c.width, h: c.height, b64: b64of(out), rgb64: col ? b64of(col) : null }
  }, [url, rgb])
  const name = `${tag}__${basename(path, extname(path))}`.replace(/\s+/g, '_') + '.pgm'
  writeFileSync(join(outDir, name), Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), Buffer.from(b64, 'base64')]))
  if (rgb64) writeFileSync(join(outDir, name.replace(/\.pgm$/, '.ppm')), Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), Buffer.from(rgb64, 'base64')]))
  console.log(name, w, h)
}
await browser.close()
