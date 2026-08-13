import { StatusIcon } from './Status'
import { levelToStatus, statusLabels } from './status-model'
import type { OverallVerdict } from './status-model'

const verdictExplanations: Record<OverallVerdict, string> = {
  action: 'At least one issue should be fixed before you rely on this result.',
  attention: 'Nothing critical was found, but there are clear improvements worth making.',
  good: 'Every check returned a pass in this run.',
}

export function OverallVerdictPanel({ status }: { status: OverallVerdict }) {
  return (
    <div className={`overall-verdict overall-verdict-${status}`}>
      <StatusIcon status={status} size={28} />
      <div><p className="overall-verdict-label">{statusLabels[status]}</p><p>{verdictExplanations[status]}</p></div>
    </div>
  )
}

export function FindingFilter({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return <button className="finding-filter" type="button" aria-pressed={active} onClick={onClick}>{label} <strong>{count}</strong></button>
}

export function ResultCount({ label, value, level }: { label: string; value: number; level: 'error' | 'warning' | 'pass' }) {
  return (
    <div className={`checker-count checker-count-${level}`}>
      <StatusIcon status={levelToStatus(level)} size={17} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}
