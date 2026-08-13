type PlainLanguageSummaryProps = {
  level: string
  audience: string
  readingTime: string
  children: React.ReactNode
  action: { href: string; label: string }
}

export function PlainLanguageSummary({ level, audience, readingTime, children, action }: PlainLanguageSummaryProps) {
  return (
    <aside className="plain-summary" aria-label="Guide summary">
      <p className="plain-summary-label">In simple terms</p>
      <div className="plain-summary-meta" aria-label="Guide details">
        <span>{level}</span>
        <span>{audience}</span>
        <span>{readingTime}</span>
      </div>
      <div className="plain-summary-copy">{children}</div>
      <a className="plain-summary-action" href={action.href}>{action.label}</a>
    </aside>
  )
}
