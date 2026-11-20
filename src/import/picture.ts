/**
 * Plan pictures the Studio cannot take as they are (session 31): a TIFF (a scanner's, a plotter's) is decoded with the
 * reader three ships (UTIF through TIFFLoader, MIT); a HEIC / HEIF (an iPhone photo) only where the browser itself decodes
 * it (Safari does, Firefox and Chrome do not) — else a plain message says how to get a JPEG. Either becomes a WEBP, its
 * longer side at most 6000 px, that the Studio loads like any plan picture. Browser only (a canvas).
 */

export const CONVERTED_PICTURE = /\.(tiff?|heic|heif)$/i

const HEIC_WORDS =
  'This browser cannot open HEIC photos (the iPhone\'s own format). On the iPhone: Settings → Camera → Formats → Most Compatible, or share the photo as a JPEG; on a PC, open it and save it as JPG — then drop that.'

export async function toPlanPicture(file: File): Promise<File> {
  let canvas = document.createElement('canvas')
  if (/\.tiff?$/i.test(file.name)) {
    const { TIFFLoader } = await import('three/addons/loaders/TIFFLoader.js')
    const t = new TIFFLoader().parse(await file.arrayBuffer())
    const w = t.width ?? 0, h = t.height ?? 0
    if (!w || !h || !t.data) throw new Error('this TIFF holds no picture Plotline can read')
    canvas.width = w
    canvas.height = h
    const data = t.data as Uint8Array<ArrayBuffer>
    const px = new Uint8ClampedArray(data.buffer, data.byteOffset, w * h * 4)
    canvas.getContext('2d')!.putImageData(new ImageData(px, w, h), 0, 0)
  } else {
    const bmp = await createImageBitmap(file).catch(() => null)
    if (!bmp) throw new Error(HEIC_WORDS)
    canvas.width = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.drawImage(bmp, 0, 0)
    bmp.close()
  }
  const long = Math.max(canvas.width, canvas.height)
  if (long > 6000) {
    const k = 6000 / long
    const small = document.createElement('canvas')
    small.width = Math.round(canvas.width * k)
    small.height = Math.round(canvas.height * k)
    small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height)
    canvas = small
  }
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.92))
  if (!blob) throw new Error('this browser could not turn it into a picture')
  return new File([blob], file.name.replace(CONVERTED_PICTURE, '.webp'), { type: 'image/webp' })
}
