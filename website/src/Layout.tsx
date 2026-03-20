import { useState, useEffect } from 'react'
import CookieConsent from './CookieConsent'

function getPreferredTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function Layout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getPreferredTheme())
  const [themeReady] = useState(() => typeof window !== 'undefined')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!themeReady) return
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme, themeReady])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <>
      <nav className="site-nav">
        <div className="nav-inner">
          <a href="/" className="nav-brand">agentmarkup</a>
          <div className="nav-right">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              className="menu-toggle"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
            <div className="nav-links">
              <a href="/checker/">Checker</a>
              <a href="/docs/llms-txt/">llms.txt</a>
              <a href="/docs/json-ld/">JSON-LD</a>
              <a href="/docs/ai-crawlers/">AI Crawlers</a>
              <a href="/blog/">Blog</a>
              <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            <a href="/checker/" onClick={() => setMenuOpen(false)}>Checker</a>
            <a href="/docs/llms-txt/" onClick={() => setMenuOpen(false)}>llms.txt</a>
            <a href="/docs/json-ld/" onClick={() => setMenuOpen(false)}>JSON-LD</a>
            <a href="/docs/ai-crawlers/" onClick={() => setMenuOpen(false)}>AI Crawlers</a>
            <a href="/blog/" onClick={() => setMenuOpen(false)}>Blog</a>
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        )}
      </nav>

      <div className="container">
        {children}
      </div>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div className="footer-col">
              <h4>Packages</h4>
              <a href="https://www.npmjs.com/package/@agentmarkup/vite" target="_blank" rel="noopener noreferrer">@agentmarkup/vite</a>
              <a href="https://www.npmjs.com/package/@agentmarkup/astro" target="_blank" rel="noopener noreferrer">@agentmarkup/astro</a>
              <a href="https://www.npmjs.com/package/@agentmarkup/core" target="_blank" rel="noopener noreferrer">@agentmarkup/core</a>
            </div>
            <div className="footer-col">
              <h4>Docs</h4>
              <a href="/checker/">Website checker</a>
              <a href="/docs/llms-txt/">llms.txt guide</a>
              <a href="/docs/json-ld/">JSON-LD guide</a>
              <a href="/docs/ai-crawlers/">AI crawlers guide</a>
            </div>
            <div className="footer-col">
              <h4>Community</h4>
              <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://github.com/agentmarkup/agentmarkup/issues" target="_blank" rel="noopener noreferrer">Issues</a>
              <a href="/blog/">Blog</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>
              &copy; 2026 <a href="/authors/sebastian-cochinescu/">Sebastian Cochinescu</a>. <a href="/license/">MIT License</a>.
            </p>
            <p>
              Used in production on <a href="https://animafelix.com" target="_blank" rel="noopener noreferrer">Anima Felix</a>.
            </p>
          </div>
        </div>
      </footer>
      <CookieConsent />
    </>
  )
}

export default Layout
