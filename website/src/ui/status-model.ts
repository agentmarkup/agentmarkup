export type SemanticStatus = 'action' | 'attention' | 'good' | 'info' | 'neutral'

export type OverallVerdict = Extract<SemanticStatus, 'action' | 'attention' | 'good'>

export type ResultCounts = { error: number; warning: number; pass: number }

export const statusLabels: Record<SemanticStatus, string> = {
  action: 'Action required',
  attention: 'Needs attention',
  good: 'Looks good',
  info: 'Information',
  neutral: 'Not checked',
}
export function getOverallVerdict(counts: ResultCounts): OverallVerdict {
  if (counts.error > 0) return 'action'
  if (counts.warning > 0) return 'attention'
  return 'good'
}

export function levelToStatus(level: 'error' | 'warning' | 'pass' | 'info'): SemanticStatus {
  if (level === 'error') return 'action'
  if (level === 'warning') return 'attention'
  if (level === 'info') return 'info'
  return 'good'
}
