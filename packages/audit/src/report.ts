import type { ScoreReport } from '@agentmarkup/core/score';
import type { AuditReport } from './audit.js';
import type { AuditLevel } from './findings.js';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const GLYPH: Record<AuditLevel, string> = {
  pass: `${GREEN}✓${RESET}`,
  warn: `${YELLOW}⚠${RESET}`,
  error: `${RED}✗${RESET}`,
};

const ORDER: Record<AuditLevel, number> = { error: 0, warn: 1, pass: 2 };

export function renderText(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`${BOLD}agentmarkup audit${RESET} ${DIM}${report.url}${RESET}`);
  lines.push('');

  const sorted = [...report.findings].sort(
    (a, b) => ORDER[a.level] - ORDER[b.level]
  );
  for (const f of sorted) {
    lines.push(`  ${GLYPH[f.level]} ${f.title}`);
    lines.push(`    ${DIM}${f.detail}${RESET}`);
    if (f.evidence) lines.push(`    ${DIM}evidence: ${f.evidence}${RESET}`);
    if (f.fix) lines.push(`    ${DIM}fix: ${f.fix}${RESET}`);
    lines.push('');
  }

  const { passed, checks, error, warn } = report.summary;
  const headline =
    error > 0
      ? `${RED}${error} error(s)${RESET}, ${warn} warning(s)`
      : warn > 0
        ? `${YELLOW}${warn} warning(s)${RESET}`
        : `${GREEN}all clear${RESET}`;
  lines.push(`  ${BOLD}${passed}/${checks} checks passed${RESET} — ${headline}`);
  lines.push('');
  if (report.score) {
    lines.push(...renderScoreLines(report.score));
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The score block of the text report: headline, tier totals, status (with the
 * provisional range when a resource could not be verified in time), top fixes
 * with their estimated gain, and the catalog and formula versions.
 */
export function renderScoreLines(score: ScoreReport): string[] {
  const lines: string[] = [];
  if (score.analysisStatus === 'blocked' || score.score === null) {
    lines.push(`  ${BOLD}Agent-readiness score${RESET}: not available - we could not reach the site in time; re-run`);
    lines.push(`    ${DIM}catalog ${score.catalogVersion}, formula ${score.formulaVersion}, methodology: https://agentmarkup.dev/score/${RESET}`);
    return lines;
  }
  const colour = score.score >= 86 ? GREEN : score.score >= 70 ? YELLOW : RED;
  lines.push(
    `  ${BOLD}Agent-readiness score${RESET}: ${colour}${score.score}/100${RESET}, grade ${BOLD}${score.grade}${RESET} (${score.label}), raw ${score.raw}`
  );
  lines.push(
    `    ${DIM}required ${score.required.earned}/${score.required.available} (${score.required.passing} of ${score.required.total} passing), recommended ${score.recommended.earned}/${score.recommended.available} (${score.recommended.passing} of ${score.recommended.total}), bonus +${score.bonus.points} from ${score.bonus.signals} signal(s)${RESET}`
  );
  if (score.analysisStatus === 'partial' && score.range) {
    lines.push(
      `    ${YELLOW}provisional${RESET}: ${score.unverifiedChecks.length} check(s) could not be verified in time (${score.unverifiedChecks.join(', ')}); the score is between ${score.range.pessimistic} and ${score.range.optimistic}; re-run to confirm`
    );
  } else {
    lines.push(`    ${DIM}status: complete${RESET}`);
  }
  if (score.topFixes.length > 0) {
    lines.push(`    ${DIM}top fixes:${RESET}`);
    for (const fix of score.topFixes) {
      const gain = fix.estGain === null ? '' : ` (+${fix.estGain})`;
      lines.push(`      ${fix.status === 'fail' ? RED : YELLOW}${fix.id}${RESET}${gain} ${DIM}${fix.evidence}${RESET}`);
    }
  }
  if (score.samplePageUrl) {
    lines.push(`    ${DIM}sample page: ${score.samplePageUrl}${RESET}`);
  }
  lines.push(
    `    ${DIM}catalog ${score.catalogVersion}, formula ${score.formulaVersion}, methodology: https://agentmarkup.dev/score/${RESET}`
  );
  return lines;
}

export function renderJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}
