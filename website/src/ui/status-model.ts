import type { AnalysisStatus, BlockedKind, Grade } from '@agentmarkup/core/score'

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

/**
 * The website checker's verdict comes from the grade: A+ and A are good, B needs
 * attention, C to F need action. A blocked run (no score) also needs action.
 */
export function verdictFromGrade(grade: Grade | null, analysisStatus?: AnalysisStatus): OverallVerdict {
  if (analysisStatus === 'blocked' || grade === null) return 'action'
  if (grade === 'A+' || grade === 'A') return 'good'
  if (grade === 'B') return 'attention'
  return 'action'
}

/** The sentence for a run with no score, by why it is blocked. */
export function blockedExplanation(
  blockedKind?: BlockedKind | null,
  blockedReason?: string | null
): string {
  const status = blockedReason?.match(/HTTP (\d{3})/)?.[1]
  if (blockedKind === 'http-status') {
    return `The homepage answered ${status ? `HTTP ${status}` : 'an error status'}, so there is nothing to score yet. Make the site root serve a page, then run the check again.`
  }
  // An unverified homepage that answered (a 429 or 5xx without challenge markers,
  // or a 2xx without a readable body) did not time out: name its status.
  if (status) {
    return Number(status) >= 300
      ? `The homepage answered HTTP ${status} instead of a page, so there is no score yet. Re-run the check in a few minutes; a server error or a rate limit is never counted against a site.`
      : `The homepage answered HTTP ${status} without a readable page, so there is no score yet. Re-run the check in a few minutes; this is never counted against a site.`
  }
  return 'The site could not be reached in time, so there is no score yet. Re-run the check; a timed-out fetch is never counted against a site.'
}

export function verdictExplanationForGrade(
  grade: Grade | null,
  analysisStatus?: AnalysisStatus,
  blockedKind?: BlockedKind | null,
  blockedReason?: string | null
): string {
  if (analysisStatus === 'blocked' || grade === null) {
    return blockedExplanation(blockedKind, blockedReason)
  }
  if (grade === 'A+') return 'The score is in the top band. Any remaining estimated gains are listed below.'
  if (grade === 'A') return 'The required checks are largely in place. The remaining gaps are listed below with their estimated gain.'
  if (grade === 'B') return 'Several checks still cost points. The top fixes below name them.'
  return 'Required checks are failing. Fix those first; each one is worth the most points.'
}

export function levelToStatus(level: 'error' | 'warning' | 'pass' | 'info'): SemanticStatus {
  if (level === 'error') return 'action'
  if (level === 'warning') return 'attention'
  if (level === 'info') return 'info'
  return 'good'
}
