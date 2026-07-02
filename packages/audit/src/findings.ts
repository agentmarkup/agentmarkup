/**
 * A single audit finding. Deterministic pass/warn/error — no scores, matching
 * the repo's checker convention. `evidence` carries the raw observation so the
 * report never asserts more than it saw (see the crawler-access classifier).
 */
export type AuditLevel = 'pass' | 'warn' | 'error';

export interface AuditFinding {
  /** Stable machine-readable code, e.g. `crawler.ua-waf-block`. */
  code: string;
  level: AuditLevel;
  /** One-line summary. */
  title: string;
  /** Human explanation of what was checked and what it means. */
  detail: string;
  /** Raw evidence for the finding (status codes, headers), when applicable. */
  evidence?: string;
  /** Concrete next step, e.g. an agentmarkup config snippet or CDN setting. */
  fix?: string;
}

export function finding(f: AuditFinding): AuditFinding {
  return f;
}

export function worstLevel(findings: AuditFinding[]): AuditLevel {
  if (findings.some((f) => f.level === 'error')) return 'error';
  if (findings.some((f) => f.level === 'warn')) return 'warn';
  return 'pass';
}

export function countByLevel(
  findings: AuditFinding[]
): Record<AuditLevel, number> {
  return findings.reduce(
    (acc, f) => {
      acc[f.level] += 1;
      return acc;
    },
    { pass: 0, warn: 0, error: 0 } as Record<AuditLevel, number>
  );
}
