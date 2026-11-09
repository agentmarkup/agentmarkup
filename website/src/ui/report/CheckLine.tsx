import { useState } from 'react';
import { fixActionFor, getCheckDefinition, platformFixesApply } from '@agentmarkup/core/score';
import type { ScoreReport, ScoredCheck } from '@agentmarkup/core/score';

import {
  PLATFORM_LABELS,
  SCORE_METHODOLOGY_PATH,
  isProductHelp,
  platformFixFor,
  titleForCheck,
} from '../../checker/check-copy';
import { checkWorth, displayStatus, formatPoints, isUncountedExtra } from '../../checker/report-model';
import { STATUS_WORDS, TIER_WORDS, creditLine, naReason } from '../../checker/report-copy';
import { ExtraMark, StatusMark } from './Chip';
import './report.css';

interface CheckLineProps {
  check: ScoredCheck;
  report: ScoreReport;
  open: boolean;
  onToggle(open: boolean): void;
}

/** Evidence longer than this is clamped to three lines with a Show all toggle (7.7). */
const EVIDENCE_CLAMP_CHARS = 240;

function isScored(check: ScoredCheck): boolean {
  return check.status === 'pass' || check.status === 'partial' || check.status === 'fail';
}

function titleFor(check: ScoredCheck, name: string): string {
  if (check.status === 'unverified') return `${name}: could not be checked in time`;
  if (check.status === 'na' || check.status === 'not-measured') return name;
  return titleForCheck(check);
}

function figureFor(check: ScoredCheck, report: ScoreReport): { text: string; kind: string } {
  if (check.status === 'unverified') return { text: 'not checked', kind: 'muted' };
  if (check.status === 'na') return { text: "doesn't apply", kind: 'muted' };
  if (check.status === 'not-measured') return { text: 'not measured', kind: 'muted' };
  if (check.estGain !== null && check.estGain > 0) {
    const atCap = report.score !== null && report.score >= 100;
    return atCap
      ? { text: `+${check.estGain} above 100`, kind: 'above-cap' }
      : { text: `+${check.estGain} pts`, kind: 'gain' };
  }
  if (check.status === 'pass') {
    return check.tier === 'bonus'
      ? { text: `+${formatPoints(checkWorth(check, report), 2)}`, kind: 'worth' }
      : { text: `${formatPoints(checkWorth(check, report), 2)} pts`, kind: 'worth' };
  }
  return { text: '', kind: 'muted' };
}

/** The platform fix without its "WordPress: " prefix (the label is the fact's term). */
function platformFix(check: ScoredCheck, report: ScoreReport): { label: string; text: string } | null {
  if (!report.platform || !platformFixesApply(check)) return null;
  const line = platformFixFor(getCheckDefinition(check.id), report.platform);
  if (!line) return null;
  const label = PLATFORM_LABELS[report.platform];
  const prefix = `${label}: `;
  return { label, text: line.startsWith(prefix) ? line.slice(prefix.length) : line };
}

export function CheckLine({ check, report, open, onToggle }: CheckLineProps) {
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const definition = getCheckDefinition(check.id);
  const name = definition?.name ?? check.id;
  const status = displayStatus(check);
  const extra = isUncountedExtra(check);
  const figure = figureFor(check, report);
  const needsWork = check.status === 'fail' || check.status === 'partial';
  const action = needsWork ? fixActionFor(check) : null;
  const platform = needsWork ? platformFix(check, report) : null;
  const help = needsWork && isProductHelp(definition?.agentmarkupHelp) ? definition?.agentmarkupHelp : null;
  const evidence = check.status === 'na' ? null : check.evidence || null;
  const longEvidence = evidence !== null && evidence.length > EVIDENCE_CLAMP_CHARS;

  return (
    <details
      className="check-line"
      id={`check-${check.id}`}
      data-check-id={check.id}
      data-status={status}
      data-extra={extra ? 'true' : undefined}
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) onToggle(next);
      }}
    >
      <summary className="check-summary">
        <span className="check-icon">
          {extra ? <ExtraMark size={16} /> : <StatusMark status={status} size={16} />}
        </span>
        <span className="sr-only">
          {STATUS_WORDS[status]}
          {extra ? ', extra not counted in the area percentage' : ''}:{' '}
        </span>
        <span className="check-title">{titleFor(check, name)}</span>
        <span className="check-tier">{TIER_WORDS[check.tier]}</span>
        <span className="check-figure" data-kind={figure.kind}>
          {figure.text}
        </span>
      </summary>
      {open ? (
        <div className="check-body">
          <dl className="check-facts">
            {evidence !== null ? (
              <div className="check-fact">
                <dt>Found</dt>
                <dd>
                  <pre
                    className="check-evidence"
                    data-clamped={longEvidence && !evidenceExpanded ? 'true' : undefined}
                  >
                    {evidence}
                  </pre>
                  {longEvidence ? (
                    <button
                      type="button"
                      className="check-evidence-toggle"
                      aria-expanded={evidenceExpanded}
                      onClick={() => setEvidenceExpanded((value) => !value)}
                    >
                      {evidenceExpanded ? 'Show less' : 'Show all'}
                    </button>
                  ) : null}
                  {check.status === 'unverified' ? <p>Left out of the score until a rescan.</p> : null}
                </dd>
              </div>
            ) : null}
            {check.status === 'na' ? (
              <div className="check-fact">
                <dt>Why</dt>
                <dd>{naReason(check.reason ?? 'not-applicable')}</dd>
              </div>
            ) : null}
            {definition?.evidence ? (
              <div className="check-fact">
                <dt>Checked</dt>
                <dd>{definition.evidence}</dd>
              </div>
            ) : null}
            {action ? (
              <div className="check-fact">
                <dt>Do</dt>
                <dd>{action}</dd>
              </div>
            ) : null}
            {platform ? (
              <div className="check-fact">
                <dt>{platform.label}</dt>
                <dd>{platform.text}</dd>
              </div>
            ) : null}
            {isScored(check) ? (
              <div className="check-fact">
                <dt>Points</dt>
                <dd>{creditLine(check, report)}</dd>
              </div>
            ) : null}
          </dl>
          {help ? <p className="check-help">agentmarkup: {help}</p> : null}
          <a className="check-rule-link" href={`${SCORE_METHODOLOGY_PATH}#${check.id}`}>
            How this check is scored
          </a>
        </div>
      ) : null}
    </details>
  );
}
