import { useState } from 'react'

function CodeBlock({ code, maxHeight }: { code: string; maxHeight?: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const lines = code.split('\n')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 3000)
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-toolbar">
        <button className="copy-btn" onClick={handleCopy} aria-label={copyState === 'copied' ? 'Code copied' : 'Copy code'}>
          {copyState === 'copied' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : copyState === 'error' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
        <span className="sr-only" aria-live="polite">
          {copyState === 'copied' ? 'Code copied to clipboard.' : copyState === 'error' ? 'Copy failed. Select the code and copy it manually.' : ''}
        </span>
      </div>
      <pre tabIndex={0} aria-label="Scrollable code example" style={maxHeight ? { maxHeight, overflow: 'auto' } : undefined}>
        <code>
          <span className="line-numbers" aria-hidden="true">
            {lines.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </span>
          <span className="code-content">{code}</span>
        </code>
      </pre>
    </div>
  )
}

export default CodeBlock
