import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'agentmarkup-cookie-consent'
const STORAGE_TS_KEY = 'agentmarkup-cookie-consent-ts'
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
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
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
  window.gtag('config', GA_ID)
}

function grantConsent() {
  initGtagStub()
  window.gtag('consent', 'update', {
    analytics_storage: 'granted',
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

function CookieConsent() {
  const [consent, setConsent] = useState<Consent>(null)
  const [consentReady, setConsentReady] = useState(false)

  const reset = useCallback(() => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_TS_KEY)
    setConsent(null)
  }, [])

  useEffect(() => {
    setConsent(getConsent())
    setConsentReady(true)
  }, [])

  useEffect(() => {
    if (!consentReady) return
    // Always bootstrap gtag stub so consent default is set
    bootstrapGA()

    if (consent === 'accepted') {
      injectGAScript()
      grantConsent()
    }

    window.resetCookieConsent = reset
  }, [consent, consentReady, reset])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    setConsent('accepted')
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    setConsent('declined')
    // Disable GA for this page
    ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true
  }

  if (!consentReady || consent !== null) return null

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
