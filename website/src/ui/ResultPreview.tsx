const exampleChecks = [
  {
    tone: 'good',
    label: 'Looks good',
    title: 'AI can find your website',
    detail: 'Your public pages and sitemap are discoverable.',
    meaning: 'AI services can reach the pages you expect them to see.',
    nextStep: 'No immediate action is needed. Keep your sitemap current when pages change.',
  },
  {
    tone: 'attention',
    label: 'Needs attention',
    title: 'Some pages are hard to understand',
    detail: 'A few important pages are missing clear structured information.',
    meaning: 'The pages are visible, but their purpose and key information may be ambiguous.',
    nextStep: 'Add a clear page description and structured information to the most important pages first.',
  },
  {
    tone: 'action',
    label: 'Action required',
    title: 'One access rule is blocking AI',
    detail: 'The checker points to the exact rule and explains how to fix it.',
    meaning: 'A crawler rule prevents at least one relevant AI service from reading the website.',
    nextStep: 'Review the named rule and change it only if you want that service to access your public content.',
  },
] as const

function StatusIcon({ tone }: { tone: (typeof exampleChecks)[number]['tone'] }) {
  if (tone === 'good') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.2 3.2 7.8-8" /></svg>
  }

  if (tone === 'attention') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 20H3L12 4Z" /><path d="M12 9v5M12 17.5v.1" /></svg>
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" /><path d="M12 8v5M12 16.5v.1" /></svg>
}

export function ResultPreview() {
  return (
    <article className="result-preview" aria-label="Example website check result">
      <div className="result-preview-glow" aria-hidden="true" />
      <header className="result-preview-header">
        <div>
          <p className="result-preview-eyebrow">Example result</p>
          <p className="result-preview-domain">yourwebsite.com</p>
        </div>
        <span className="result-preview-sample">Sample</span>
      </header>

      <div className="result-preview-verdict result-preview-verdict-action">
        <span className="result-preview-verdict-icon"><StatusIcon tone="action" /></span>
        <div>
          <p>Overall answer</p>
          <strong>Action required</strong>
          <span>Fix one blocking access rule first. The next step is shown below.</span>
        </div>
      </div>

      <div className="result-preview-list">
        {exampleChecks.map((check) => (
          <details className={`result-preview-row result-preview-row-${check.tone}`} key={check.title}>
            <summary>
              <span className="result-preview-icon"><StatusIcon tone={check.tone} /></span>
              <span>
                <span className="result-preview-label">{check.label}</span>
                <strong>{check.title}</strong>
                <span className="result-preview-detail">{check.detail}</span>
              </span>
            </summary>
            <div className="result-preview-explanation">
              <p><strong>What this means</strong><span>{check.meaning}</span></p>
              <p><strong>What you can do</strong><span>{check.nextStep}</span></p>
            </div>
          </details>
        ))}
      </div>

      <footer className="result-preview-next">
        <span>Next step</span>
        <strong>Add structured information to your most important pages.</strong>
      </footer>
    </article>
  )
}
