import type { AnalysisStatus, Grade } from '@agentmarkup/core/score'

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

export function verdictExplanationForGrade(grade: Grade | null, analysisStatus?: AnalysisStatus): string {
  if (analysisStatus === 'blocked' || grade === null) {
    return 'The site could not be reached in time, so there is no score yet. Re-run the check; a timed-out fetch is never counted against a site.'
  }
  if (grade === 'A+') return 'Every scored check passes or the score is at the cap. Any remaining gains are listed below so the hidden work stays visible.'
  if (grade === 'A') return 'The fundamentals are in place. The remaining gaps are listed below with their estimated gain.'
  if (grade === 'B') return 'Agents can read this site. The top fixes below name the points still on the table.'
  return 'Agents struggle with this site. Fix the required checks first; each one is worth the most points.'
}

export function levelToStatus(level: 'error' | 'warning' | 'pass' | 'info'): SemanticStatus {
  if (level === 'error') return 'action'
  if (level === 'warning') return 'attention'
  if (level === 'info') return 'info'
  return 'good'
}
