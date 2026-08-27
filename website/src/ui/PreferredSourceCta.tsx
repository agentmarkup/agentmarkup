/**
 * "Prefer us on Google" CTA.
 *
 * Deliberately a plain styled link, NOT Google's publisher.js embed. The
 * documented embed ships about 250 KB of Subscribe-with-Google JavaScript and
 * injects a credentialed news.google.com iframe on every pageview. That would
 * require loosening this site's CSP (script-src + frame-src) and disclosing a
 * pre-consent third-party embed in the privacy and cookie policy. The plain
 * link needs none of that, with the trade-off that it cannot show a live
 * "already added" state.
 *
 * The href is Google's DOCUMENTED deeplink to the source preferences tool. Do
 * not go back to the Google-internal news.google.com/swg/ui/v1/addpreferredsource
 * URL: it breaks outside the embed's popup-messaging context with "Something
 * went wrong". The site must also appear in the source preferences tool's
 * search results. If agentmarkup.dev is not in that corpus yet, the tool shows
 * no result, and no button variant can fix that eligibility limitation.
 *
 * The inline four-color Google G marks the destination as nominative use. It
 * makes no external image request, so the site's img-src CSP stays unchanged.
 */

type PreferredSourceCtaProps = {
  variant: 'footer' | 'article'
}

const SITE_URL = 'https://agentmarkup.dev'
const PREFERRED_SOURCE_HREF = `https://www.google.com/preferences/source?q=${encodeURIComponent(SITE_URL)}&hl=en`
const LABEL = 'Prefer us on Google'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function PreferredSourceLink({ variant }: PreferredSourceCtaProps) {
  const className = variant === 'footer' ? 'preferred-source-link' : 'preferred-source-button'

  const trackClick = () => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'click_preferred_source', { variant })
    }
  }

  return (
    <a
      className={className}
      href={PREFERRED_SOURCE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      onClick={trackClick}
      onAuxClick={(event) => {
        if (event.button === 1) trackClick()
      }}
    >
      <GoogleIcon />
      {LABEL}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function PreferredSourceCta({ variant }: PreferredSourceCtaProps) {
  if (variant === 'footer') {
    return <PreferredSourceLink variant="footer" />
  }

  return (
    <aside className="preferred-source-cta" aria-label="Prefer agentmarkup on Google">
      <p>Choose agentmarkup as a preferred source for your own Google Top stories results.</p>
      <PreferredSourceLink variant="article" />
    </aside>
  )
}

export default PreferredSourceCta
