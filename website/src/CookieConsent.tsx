import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'agentmarkup-cookie-consent'
const STORAGE_TS_KEY = 'agentmarkup-cookie-consent-ts'
const CONSENT_CHANGE_EVENT = 'agentmarkup:cookie-consent-change'
const GA_ID = 'G-LWKDV94L16'
const MAX_AGE_DAYS = 180

type Consent = 'accepted' | 'declined' | null

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
    resetCookieConsent?: () => void
    __agentmarkupGaReady?: boolean
    __agentmarkupGaInitialized?: boolean
    __agentmarkupGaScriptPromise?: Promise<void>
  }
}

function initGtagStub() {
  window.dataLayer = window.dataLayer || []
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args)
    }
  }
}

function loadGAScript() {
  initGtagStub()

  if (window.__agentmarkupGaReady) {
    return Promise.resolve()
  }

  if (window.__agentmarkupGaScriptPromise) {
    return window.__agentmarkupGaScriptPromise
  }

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"]`,
  )

  window.__agentmarkupGaScriptPromise = new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      window.__agentmarkupGaReady = true
      resolve()
    }

    const handleError = () => {
      window.__agentmarkupGaScriptPromise = undefined
      reject(new Error('Failed to load Google Analytics script'))
    }

    if (existing) {
      if (existing.dataset.loaded === 'true') {
        handleLoad()
        return
      }

      existing.addEventListener('load', () => {
        existing.dataset.loaded = 'true'
        handleLoad()
      }, { once: true })
      existing.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    script.async = true
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      handleLoad()
    }, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)
  })

  return window.__agentmarkupGaScriptPromise
}

function bootstrapGA() {
  initGtagStub()
  if (window.__agentmarkupGaInitialized) return

  window.gtag('js', new Date())
  window.gtag('config', GA_ID, {
    send_page_view: false,
    allow_google_signals: true,
  })
  window.__agentmarkupGaInitialized = true
}

function trackPageView() {
  initGtagStub()
  window.gtag('event', 'page_view', {
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    page_location: window.location.href,
    page_title: document.title,
  })
}

function getConsent(): Consent {
  if (typeof window === 'undefined') return null
  const consent = localStorage.getItem(STORAGE_KEY)
  const ts = localStorage.getItem(STORAGE_TS_KEY)
  if (!consent || !ts) return null
  const age = (Date.now() - Number(ts)) / (1000 * 60 * 60 * 24)
  if (age > MAX_AGE_DAYS) {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_TS_KEY)
    return null
  }
  return consent as 'accepted' | 'declined'
}

function syncConsentDocumentState(consent: Consent) {
  if (typeof document === 'undefined') return

  if (consent === null) {
    document.documentElement.removeAttribute('data-cookie-consent')
    return
  }

  document.documentElement.setAttribute('data-cookie-consent', consent)
}

function subscribeConsent(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === STORAGE_KEY ||
      event.key === STORAGE_TS_KEY
    ) {
      onStoreChange()
    }
  }
  const handleConsentChange = () => {
    onStoreChange()
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(CONSENT_CHANGE_EVENT, handleConsentChange)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(CONSENT_CHANGE_EVENT, handleConsentChange)
  }
}

function CookieConsent() {
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => null)
  const lastTrackedPageRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_TS_KEY)
    syncConsentDocumentState(null)
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  }, [])

  useEffect(() => {
    syncConsentDocumentState(consent)

    window.resetCookieConsent = reset
    let cancelled = false

    if (consent === 'accepted') {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = false

      void loadGAScript()
        .then(() => {
          if (cancelled) return
          bootstrapGA()

          const pageKey = `${window.location.pathname}${window.location.search}${window.location.hash}`
          if (lastTrackedPageRef.current !== pageKey) {
            trackPageView()
            lastTrackedPageRef.current = pageKey
          }
        })
        .catch((error) => {
          console.warn('Google Analytics failed to initialize', error)
        })
    } else if (consent === 'declined') {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true
      lastTrackedPageRef.current = null
    } else {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true
      lastTrackedPageRef.current = null
    }

    return () => {
      cancelled = true
      if (window.resetCookieConsent === reset) {
        delete window.resetCookieConsent
      }
    }
  }, [consent, reset])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    syncConsentDocumentState('accepted')
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    syncConsentDocumentState('declined')
    ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  }

  if (consent !== null) return null

  return (
    <div className="cookie-banner">
      <p>This site uses cookies for anonymous analytics (Google Analytics). No personal data is collected.</p>
      <div className="cookie-actions">
        <button className="cookie-btn cookie-decline" onClick={decline}>Decline</button>
        <button className="cookie-btn cookie-accept" onClick={accept}>Accept</button>
      </div>
    </div>
  )
}

export default CookieConsent
