import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import CookieConsent from './CookieConsent'
import { GlassSurface } from './ui/GlassSurface'
import { GitHubIcon } from './ui/GitHubIcon'
import { ReadingTools } from './ui/ReadingTools'
import { SiteMoltenMetal } from './ui/SiteMoltenMetal'

const THEME_STORAGE_KEY = 'theme'
const THEME_CHANGE_EVENT = 'agentmarkup:theme-change'
const BORDER_GLOW_SELECTOR = '.blog-card, .blog-featured, .path-card, .developer-paths a, .product-option-card, .developer-route'
const DevShowcase = import.meta.env.DEV ? lazy(() => import('./ui/DevShowcase')) : null

type NavLink = {
  href: string
  label: string
  external?: boolean
}

function ExternalLinkIcon() {
  return (
    <svg className="external-link-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.25 3.25H3.75a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 .5.5h8.5a.5.5 0 0 0 .5-.5v-2.5M8.75 3.25h4v4M12.5 3.5 7.25 8.75" />
    </svg>
  )
}

const learnLinks: NavLink[] = [
  { href: '/learn/', label: 'Learning Center' },
  { href: '/blog/', label: 'Blog' },
  { href: '/docs/llms-txt/', label: 'llms.txt guide' },
  { href: '/docs/json-ld/', label: 'JSON-LD guide' },
  { href: '/docs/ai-crawlers/', label: 'AI crawlers guide' },
]

const developerLinks: NavLink[] = [
  { href: '/studio/', label: 'Studio' },
  { href: '/docs/audit/', label: 'Audit guide' },
  { href: 'https://github.com/agentmarkup/agentmarkup', label: 'GitHub', external: true },
  { href: 'https://www.npmjs.com/search?q=%40agentmarkup', label: 'npm packages', external: true },
]

function getPreferredTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onStoreChange()
  }
  const handleMediaChange = () => {
    if (!localStorage.getItem(THEME_STORAGE_KEY)) onStoreChange()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)
  mediaQuery.addEventListener('change', handleMediaChange)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
    mediaQuery.removeEventListener('change', handleMediaChange)
  }
}

function subscribePath() {
  return () => {}
}

function getPath() {
  return typeof window === 'undefined' ? '' : window.location.pathname
}

function isCurrentPage(currentPath: string, href: string) {
  if (!currentPath || !href.startsWith('/')) return false
  return currentPath === href
}

function isCurrentSection(currentPath: string, href: string) {
  if (!currentPath || !href.startsWith('/')) return false
  if (href === '/') return currentPath === '/'
  return currentPath.startsWith(href)
}

function NavAnchor({ link, currentPath, onClick }: { link: NavLink; currentPath: string; onClick?: () => void }) {
  return (
    <a
      href={link.href}
      aria-current={isCurrentPage(currentPath, link.href) ? 'page' : undefined}
      target={link.external ? '_blank' : undefined}
      rel={link.external ? 'noopener noreferrer' : undefined}
      onClick={onClick}
    >
      <span>{link.label}</span>
      {link.external ? <ExternalLinkIcon /> : null}
    </a>
  )
}

function NavDisclosure({ label, links, currentPath }: { label: string; links: NavLink[]; currentPath: string }) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.open = false
      }
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false
        detailsRef.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [])

  const groupCurrent = links.some((link) => isCurrentSection(currentPath, link.href))
  return (
    <details className="nav-disclosure" ref={detailsRef}>
      <summary aria-current={groupCurrent ? 'location' : undefined}>{label}<span aria-hidden="true">⌄</span></summary>
      <div className="nav-popover">
        {links.map((link) => <NavAnchor currentPath={currentPath} key={link.href} link={link} />)}
      </div>
    </details>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getPreferredTheme, () => 'dark')
  const currentPath = useSyncExternalStore(subscribePath, getPath, () => '')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuDialogRef = useRef<HTMLDialogElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    // The cursor-tracking glass glow does per-move layout reads and style
    // writes; keep it off the Studio workspace alongside the WebGL background.
    if (currentPath.startsWith('/studio')) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const handlePointerMove = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return

      const glass = event.target.closest<HTMLElement>('.glass-surface')
      if (glass) {
        const glassRect = glass.getBoundingClientRect()
        glass.style.setProperty('--glass-x', `${event.clientX - glassRect.left}px`)
        glass.style.setProperty('--glass-y', `${event.clientY - glassRect.top}px`)
      }

      const surface = event.target.closest<HTMLElement>(BORDER_GLOW_SELECTOR)
      if (!surface) return
      const rect = surface.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const centerX = rect.width / 2
      const centerY = rect.height / 2
      const deltaX = x - centerX
      const deltaY = y - centerY
      const scaleX = deltaX === 0 ? Number.POSITIVE_INFINITY : centerX / Math.abs(deltaX)
      const scaleY = deltaY === 0 ? Number.POSITIVE_INFINITY : centerY / Math.abs(deltaY)
      const proximity = Math.min(Math.max(1 / Math.min(scaleX, scaleY), 0), 1)
      let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90
      if (angle < 0) angle += 360
      surface.style.setProperty('--border-glow-x', `${x}px`)
      surface.style.setProperty('--border-glow-y', `${y}px`)
      surface.style.setProperty('--edge-proximity', `${(proximity * 100).toFixed(3)}`)
      surface.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`)
    }
    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => document.removeEventListener('pointermove', handlePointerMove)
  }, [currentPath])

  useEffect(() => {
    const dialog = menuDialogRef.current
    if (!dialog) return
    if (menuOpen && !dialog.open) {
      dialog.showModal()
      document.body.classList.add('nav-drawer-open')
    } else if (!menuOpen && dialog.open) {
      dialog.close()
    }
    return () => document.body.classList.remove('nav-drawer-open')
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
        requestAnimationFrame(() => menuButtonRef.current?.focus())
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  const closeMenu = () => {
    setMenuOpen(false)
    document.body.classList.remove('nav-drawer-open')
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  const showDevShowcase = Boolean(DevShowcase && currentPath === '/__design/')
  // The Studio is a long-lived interactive workspace, often embedded in an
  // agent's in-app browser; the continuous WebGL background costs GPU there.
  const showMoltenBackground = !currentPath.startsWith('/studio')

  return (
    <>
      {showMoltenBackground ? <SiteMoltenMetal theme={theme} /> : null}
      <a className="skip-link" href="#page-content">Skip to content</a>
      <header className="site-header">
        <GlassSurface className="site-header-glass" borderRadius={22} saturation={1.45} distortionScale={-62}>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="/" className="nav-brand" aria-current={currentPath === '/' ? 'page' : undefined}>
              <img src="/favicon.png" alt="" width="28" height="28" className="nav-logo" />
              <span>agentmarkup</span>
            </a>

            <div className="nav-links">
              <NavAnchor currentPath={currentPath} link={{ href: '/', label: 'Product' }} />
              <NavAnchor currentPath={currentPath} link={{ href: '/checker/', label: 'Website Checker' }} />
              <NavAnchor currentPath={currentPath} link={{ href: '/security-scan/', label: 'Security Scan' }} />
              <NavDisclosure currentPath={currentPath} label="Learn" links={learnLinks} />
              <NavDisclosure currentPath={currentPath} label="For developers" links={developerLinks} />
            </div>

            <div className="nav-actions">
              <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {theme === 'dark' ? (
                    <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>
                  ) : (
                    <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
                  )}
                </svg>
              </button>
              <button
                ref={menuButtonRef}
                className="menu-toggle"
                onClick={() => setMenuOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={menuOpen}
                aria-controls="mobile-navigation"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </div>
          </nav>
        </GlassSurface>
      </header>

      <dialog
        className="mobile-menu"
        id="mobile-navigation"
        ref={menuDialogRef}
        aria-labelledby="mobile-menu-title"
        onCancel={(event) => { event.preventDefault(); closeMenu() }}
        onClose={() => setMenuOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) closeMenu() }}
      >
        <div className="mobile-menu-panel">
          <div className="mobile-menu-header">
            <p id="mobile-menu-title">Navigate AgentMarkup</p>
            <div className="mobile-menu-actions">
              <button className="mobile-theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {theme === 'dark' ? (
                    <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>
                  ) : (
                    <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
                  )}
                </svg>
              </button>
              <button type="button" className="mobile-menu-close" onClick={closeMenu} aria-label="Close navigation menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </div>
          <div className="mobile-menu-links">
            <NavAnchor currentPath={currentPath} link={{ href: '/', label: 'Product' }} onClick={closeMenu} />
            <NavAnchor currentPath={currentPath} link={{ href: '/checker/', label: 'Website Checker' }} onClick={closeMenu} />
            <NavAnchor currentPath={currentPath} link={{ href: '/security-scan/', label: 'Security Scan' }} onClick={closeMenu} />
            <p>Learn</p>
            {learnLinks.map((link) => <NavAnchor currentPath={currentPath} key={link.href} link={link} onClick={closeMenu} />)}
            <p>For developers</p>
            {developerLinks.map((link) => <NavAnchor currentPath={currentPath} key={link.href} link={link} onClick={closeMenu} />)}
          </div>
        </div>
      </dialog>

      {!showDevShowcase ? <ReadingTools /> : null}

      <div className="container page-shell" id="page-content" tabIndex={-1}>
        {showDevShowcase && DevShowcase ? (
          <Suspense fallback={<main className="showcase-page"><p>Loading design system…</p></main>}><DevShowcase /></Suspense>
        ) : children}
      </div>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="/" className="nav-brand"><img src="/favicon.png" alt="" width="28" height="28" />agentmarkup</a>
            <p>Make your website easier for people and AI to understand.</p>
          </div>
          <div className="footer-grid">
            <section className="footer-col" aria-labelledby="footer-product"><h2 id="footer-product">Product</h2><a href="/checker/">Website checker</a><a href="/security-scan/">Security scan</a><a href="/docs/audit/">Audit guide</a></section>
            <section className="footer-col" aria-labelledby="footer-learn"><h2 id="footer-learn">Guides</h2><a href="/learn/">Learning Center</a><a href="/blog/">Blog</a><a href="/docs/llms-txt/">llms.txt guide</a><a href="/docs/json-ld/">JSON-LD guide</a><a href="/docs/ai-crawlers/">AI crawlers guide</a></section>
            <section className="footer-col" aria-labelledby="footer-developers"><h2 id="footer-developers">Developers</h2><a className="footer-github-link" href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer"><GitHubIcon />GitHub</a><a href="https://github.com/agentmarkup/agentmarkup/issues" target="_blank" rel="noopener noreferrer">Issues</a><a href="https://www.npmjs.com/search?q=%40agentmarkup" target="_blank" rel="noopener noreferrer">Packages</a><a href="/developers/">Developer resources</a><a href="/support/">Support</a></section><section className="footer-col" aria-labelledby="footer-company"><h2 id="footer-company">Company</h2><a href="/about/">About</a><a href="/contact/">Contact</a><a href="/authors/sebastian-cochinescu/">Maintainer</a></section>
            <section className="footer-col" aria-labelledby="footer-legal"><h2 id="footer-legal">Legal</h2><a href="/terms/">Terms of Service</a><a href="/privacy/">Privacy Policy</a><a href="/license/">MIT License</a><button type="button" className="footer-cookie-settings" onClick={() => window.dispatchEvent(new Event('agentmarkup:cookie-settings-open'))}>Cookie settings</button></section>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 <a href="/authors/sebastian-cochinescu/">Sebastian Cochinescu</a>. <a href="/terms/">Terms</a>. <a href="/privacy/">Privacy</a>. <a href="/license/">MIT License</a>.</p>
            <p>Used in production on <a href="https://animafelix.com" target="_blank" rel="noopener noreferrer">Anima Felix</a>.</p>
          </div>
        </div>
      </footer>
      <CookieConsent />
    </>
  )
}

export default Layout
