import { statusLabels } from './status-model'
import type { SemanticStatus } from './status-model'

export function StatusIcon({ status, size = 18 }: { status: SemanticStatus; size?: number }) {
  if (status === 'good') {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="m8 12 2.5 2.5L16.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (status === 'action') {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
    )
  }

  if (status === 'attention') {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 2.8 19h18.4L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
    )
  }

  if (status === 'info') {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="7.5" r="1" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function StatusLabel({
  status,
  count,
  className = '',
}: {
  status: SemanticStatus
  count?: number
  className?: string
}) {
  return (
    <span className={`semantic-status semantic-status-${status} ${className}`.trim()}>
      <StatusIcon status={status} />
      <span>{statusLabels[status]}</span>
      {typeof count === 'number' ? <strong>{count}</strong> : null}
    </span>
  )
}
