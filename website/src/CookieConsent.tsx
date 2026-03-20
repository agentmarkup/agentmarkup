import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'agentmarkup-cookie-consent'
const STORAGE_TS_KEY = 'agentmarkup-cookie-consent-ts'
const MAX_AGE_DAYS = 180

type Consent = 'accepted' | 'declined' | null

declare global {
  interface Window {
    dataLayer?: unknown[][]
    resetCookieConsent?: () => void
  }
}

function loadGA() {
  if (document.querySelector('script[src*="googletagmanager"]')) return
  const s = document.createElement('script')
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-LWKDV94L16'
  s.async = true
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  function gtag(...args: unknown[]) { window.dataLayer?.push(args) }
  gtag('js', new Date())
  gtag('config', 'G-LWKDV94L16')
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
  const [consent, setConsent] = useState<Consent>(() => getConsent())

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_TS_KEY)
    setConsent(null)
  }, [])

  useEffect(() => {
    if (consent === 'accepted') {
      loadGA()
    }
    // Expose reset for console and footer link
    window.resetCookieConsent = reset
  }, [consent, reset])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    setConsent('accepted')
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()))
    setConsent('declined')
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
