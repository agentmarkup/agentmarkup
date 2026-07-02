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
  return lines.join('\n');
}

export function renderJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}
