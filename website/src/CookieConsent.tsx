import { useEffect, useCallback, useSyncExternalStore } from 'react'

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

function injectGAScript() {
  if (document.querySelector(`script[src*="googletagmanager"]`)) return
  const s = document.createElement('script')
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  s.async = true
  document.head.appendChild(s)
}

function bootstrapGA() {
  initGtagStub()
  // Set default consent to denied
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, {
    send_page_view: false,
  })
}

function grantConsent() {
  initGtagStub()
  window.gtag('consent', 'update', {
    analytics_storage: 'granted',
  })
}

function trackPageView() {
  initGtagStub()
  window.gtag('config', GA_ID, {
    page_path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    page_location: window.location.href,
    page_title: document.title,
    send_page_view: true,
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

  const reset = useCallback(() => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_TS_KEY)
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  }, [])

  useEffect(() => {
    // Always bootstrap gtag stub so consent default is set
    bootstrapGA()

    if (consent === 'accepted') {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = false
      injectGAScript()
      grantConsent()
      trackPageView()
    } else if (consent === 'declined') {
      ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true
    }

    window.resetCookieConsent = reset
    return () => {
      if (window.resetCookieConsent === reset) {
        delete window.resetCookieConsent
      }
    }
  }, [consent, reset])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    // Disable GA for this page
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
