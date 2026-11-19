/** A link the viewer understood before `/` became the front page: a buyer's choices (`c`), a floor, staff on/off, a view. */
const VIEWER_KEYS = ['c', 'floor', 'staff', 'view']

/** Bare `/` is the front page; `/` with an old share link's or staff bookmark's query still opens the viewer as before. */
export const landingOrViewer = (pathname: string, search: string): 'landing' | 'viewer' => {
  if (pathname !== '/') return 'viewer'
  const q = new URLSearchParams(search)
  return VIEWER_KEYS.some((k) => q.has(k)) ? 'viewer' : 'landing'
}
