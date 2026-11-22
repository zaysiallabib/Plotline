/**
 * The Studio's one-click samples ("Start with a plan" → Try a sample ▾): real buildings' files in `public/samples/`,
 * each free to pass on — source, author and licence in `public/samples/MANIFEST.md`; the whole tested set in
 * Docs/SAMPLES.md. A sample opens through the same path as a dropped file. `samples.test.ts` keeps this list, the folder
 * and the manifest equal.
 */
/** `credit`: who made it and its licence, shown when the mouse rests on the sample (CC BY asks for the credit) */
export type Sample = { file: string; name: string; bytes: number; credit: string }

export const SAMPLES: Sample[] = [
  { file: 'flat-7-rooms.ifc', name: 'A flat, 7 rooms (surveyed)', bytes: 415344, credit: 'SUM4Re project (Fernandez Copons, Navares Vazquez, Arias, Balado Frias) · CC BY 4.0' },
  { file: 'ifcopenhouse.ifc', name: 'IfcOpenHouse, a small house', bytes: 113264, credit: 'Thomas Krijnen, IfcOpenShell · CC0' },
  { file: 'semi-detached-houses-ground.dxf', name: 'Two semi-detached houses, ground floor', bytes: 716182, credit: 'Roberts, Allinson, Lomas, Loughborough University · CC BY 4.0' },
  { file: 'institute-office-floor.dxf', name: 'An institute office floor', bytes: 24556, credit: 'Klemen Bregar, Institut Jožef Stefan · CC BY 4.0' },
  { file: 'primary-school-ground.pdf', name: 'A primary school, ground floor', bytes: 237030, credit: 'UK Department for Education · Open Government Licence v3.0' },
  { file: 'casa-steiner-ground.pdf', name: 'Casa Steiner, Vienna (Adolf Loos)', bytes: 109480, credit: 'Julian.Schindler, Wikimedia Commons · CC0' },
  { file: 'flat-three-rooms.svg', name: 'A flat: three rooms, hall, bath', bytes: 33304, credit: 'Avalokitesvara, Wikimedia Commons · CC BY-SA 3.0' },
  { file: 'apartment-building.glb', name: 'A brick apartment building', bytes: 1213848, credit: 'Poly by Google · CC BY 3.0' },
]

/** "IFC · 1.2 MB" */
export const sampleLine = (s: Sample) => `${s.file.split('.').pop()!.toUpperCase()} · ${s.bytes < 1e6 ? `${Math.max(1, Math.round(s.bytes / 1e3))} KB` : `${(s.bytes / 1e6).toFixed(1)} MB`}`
