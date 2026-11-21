/**
 * The site's plain pages, on marble (Docs/DESIGN.md): not found, a link that is off, no connection, the error card round
 * every app, and the quiet skeleton a page shows while its code arrives. Styles in index.css (the entry's own stylesheet),
 * so they still look right when an app's code — or its stylesheet — failed to load.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

const reload = () => location.reload()

/** A page with one thing to say: an inscription, a serif title, one line, what to do (and a picture beside). The wordmark goes home. */
export function Slate({ eyebrow, title, line, children, figure }: { eyebrow: string; title: string; line: ReactNode; children?: ReactNode; figure?: ReactNode }) {
  return (
    <main className="slate grain">
      <a className="slate-mark display" href="/" aria-label="Plotline, front page">
        Plotline
      </a>
      <div className="slate-body">
        <div className="label">{eyebrow}</div>
        <h1 className="display">{title}</h1>
        <div className="slate-line">{line}</div>
        {children && <div className="slate-actions">{children}</div>}
      </div>
      {figure && <figure className="slate-figure">{figure}</figure>}
    </main>
  )
}

const Home = () => (
  <a className="btn primary" href="/">
    Go to the front page
  </a>
)

/** Any address that leads nowhere, and a flat that is not here. */
export const NotFound = ({ what = 'page' }: { what?: 'page' | 'flat' }) =>
  what === 'flat' ? (
    <Slate eyebrow="Not found" title="This flat isn't here." line="The link may be old or mistyped. Ask your sales contact for a fresh one.">
      <Home />
    </Slate>
  ) : (
    <Slate eyebrow="Not found" title="Nothing stands at this address." line="It may be mistyped, or the page has moved.">
      <Home />
    </Slate>
  )

/** `/studio` on a phone (under 720 px wide, qa3 P14: its bar's words ran under its buttons, "Start with a plan" one word a line): one card saying so. */
export const ForAComputer = ({ onAnyway }: { onAnyway: () => void }) => (
  <Slate eyebrow="The Studio" title="The Studio is for a computer." line="Tracing a floor plan takes a mouse and a wide screen. Open this page on a computer; on this phone you can walk the flats and the building.">
    <a className="btn primary" href="/u/type-a">
      See a flat
    </a>
    <button className="btn" onClick={onAnyway}>
      Open it anyway
    </button>
  </Slate>
)

/** `/u/preview` before the Studio sent anything (the preview lives in that one browser). */
export const NoPreview = () => (
  <Slate eyebrow="No preview yet" title="Nothing was sent from the Studio." line="Open the Studio and press Preview 3D. The preview opens in the same browser.">
    <a className="btn primary" href="/studio">
      Open the Studio
    </a>
  </Slate>
)

/** A share link (`/s/…`) the database does not open: turned off, expired, or never made. */
export const LinkOff = () => (
  <Slate eyebrow="Link turned off" title="This link no longer opens a flat." line="It was turned off or has expired. Ask your sales contact for a fresh one.">
    <Home />
  </Slate>
)

/** The flat could not be fetched (no network, or the database did not answer). */
export const Offline = () => (
  <Slate eyebrow="No connection" title="The flat could not be fetched." line="Check the internet connection, then try again.">
    <button className="btn primary" onClick={reload}>
      Try again
    </button>
  </Slate>
)

/**
 * Round each app: a render error (or an app's code that failed to download, after a new release) shows the card instead
 * of a white screen, and the stack goes to the console.
 */
export class ErrorCard extends Component<{ children: ReactNode }, { broke: boolean }> {
  state = { broke: false }
  static getDerivedStateFromError = () => ({ broke: true })
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[plotline] the page broke:', error, info.componentStack)
  }
  render() {
    if (!this.state.broke) return this.props.children
    return (
      <Slate eyebrow="Error" title="Something broke here." line="Reload, or go back.">
        <button className="btn primary" onClick={reload}>
          Reload
        </button>
        <button className="btn" onClick={() => (history.length > 1 ? history.back() : location.assign('/'))}>
          Go back
        </button>
      </Slate>
    )
  }
}

/**
 * While a page's code arrives: its frame drawn in quiet marble shapes (the Studio's bars, the start screen's column, a
 * page's title). It shows only after a beat, so a fast load never flashes it.
 */
export function Skeleton({ kind }: { kind: 'page' | 'viewer' | 'studio' }) {
  return (
    <div className={`skel skel-${kind}`} role="status">
      <span className="sr">Loading</span>
      {kind === 'studio' ? (
        <>
          <div className="skel-top">
            <i className="w1" />
            <i className="w3" />
          </div>
          <div className="skel-rail" />
          <div className="skel-side">
            <i className="w2" />
            <i className="w4" />
            <i className="w3" />
          </div>
        </>
      ) : (
        <div className="skel-body">
          <i className="w2 lbl" />
          <i className="w5 ttl" />
          <i className="w4" />
          {kind === 'viewer' && <i className="w1 act" />}
        </div>
      )}
    </div>
  )
}
