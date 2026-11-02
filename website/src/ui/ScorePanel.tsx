import { useState } from 'react';
import { getCheckDefinition, renderClientSummary, unverifiedResourcesWithoutChecks } from '@agentmarkup/core/score';
import type { ScoreReport } from '@agentmarkup/core/score';

import { RESOURCE_LABELS, SCORE_METHODOLOGY_PATH } from '../checker/check-copy';
import { blockedExplanation, verdictFromGrade } from './status-model';
import './score.css';

interface ScorePanelProps {
  report: ScoreReport;
  /** Host name shown in the client summary. */
  siteName: string;
  /** Re-runs the check; shown on provisional reports and on runs blocked by a fetch that did not complete. */
  onRerun?: () => void;
  rerunDisabled?: boolean;
}

type CopyState = 'idle' | 'copied' | 'manual';

function nameOf(id: string): string {
  return getCheckDefinition(id)?.name ?? id;
}

/**
 * The provisional line: unverified checks left the denominator; a resource no check
 * waited on (a timed-out sample page) means its readers were judged without it.
 */
function provisionalSentence(report: ScoreReport, resourceLabels: string[]): string {
  const checks = report.unverifiedChecks.length;
  const parts: string[] = [];
  if (checks > 0) {
    parts.push(
      `Between ${report.range?.pessimistic} and ${report.range?.optimistic}: ${checks} check${checks === 1 ? '' : 's'} could not be verified in time and left the denominator.`
    );
  }
  if (resourceLabels.length > 0) {
    const pronoun = resourceLabels.length === 1 ? 'it' : 'them';
    parts.push(
      `${resourceLabels.join(' and ')} could not be fetched in time${checks > 0 ? ' either' : ''}, so the checks that read ${pronoun} were judged without ${pronoun}.`
    );
  }
  parts.push('This run was not cached.');
  return parts.join(' ');
}

function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

function TierBar({
  id,
  label,
  earned,
  available,
  note,
}: {
  id: string;
  label: string;
  earned: number;
  available: number;
  note: string;
}) {
  const percent = available > 0 ? Math.max(0, Math.min(100, (earned / available) * 100)) : 0;
  return (
    <div className={`score-tier score-tier-${id}`}>
      <div className="score-tier-head">
        <dt>{label}</dt>
        <dd>
          {formatPoints(earned)} / {available}
        </dd>
      </div>
      <div
        className="score-bar"
        role="img"
        aria-label={`${label}: ${formatPoints(earned)} of ${available} points`}
      >
        <span className="score-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <small>{note}</small>
    </div>
  );
}

export function ScorePanel({ report, siteName, onRerun, rerunDisabled }: ScorePanelProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const verdict = verdictFromGrade(report.grade, report.analysisStatus);
  const blocked = report.analysisStatus === 'blocked' || report.score === null;
  // A final homepage status (404, 410, ...) is a complete answer: a re-run changes nothing.
  const rerunHelps = blocked && report.blockedKind !== 'http-status';
  const partial = report.analysisStatus === 'partial' && report.range !== null;
  const atCap = report.score !== null && report.score >= 100;
  const unverifiedCount = report.unverifiedChecks.length;
  const resourcesOnly = unverifiedResourcesWithoutChecks(report);
  const resourceLabels = resourcesOnly.map((key) => RESOURCE_LABELS[key]);
  const summary = renderClientSummary(report, { siteName });

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }

  return (
    <section className={`score-panel score-panel-${verdict}`} aria-labelledby="score-panel-title">
      <div className="score-panel-headline">
        <p className="section-kicker">Agent-readiness score</p>
        {blocked ? (
          <>
            <h2 id="score-panel-title">No score yet</h2>
            <p className="score-panel-blocked">
              {report.blockedKind === 'http-status'
                ? blockedExplanation(report.blockedKind, report.blockedReason)
                : 'We could not reach this site in time, so nothing was scored. A fetch that did not complete is never counted against a site. Re-run the check.'}
            </p>
          </>
        ) : (
          <>
            <div className="score-panel-number">
              <strong aria-label={`Score ${report.score} out of 100`}>{report.score}</strong>
              <span>/ 100</span>
            </div>
            <h2 id="score-panel-title">
              Grade {report.grade}: {report.label}
            </h2>
            <p className="score-panel-raw">
              Raw {report.raw?.toFixed(2)} before rounding{atCap ? ', at the cap' : ''}.
              {' '}Required {formatPoints(report.required.earned)} + recommended{' '}
              {formatPoints(report.recommended.earned)} + bonus {formatPoints(report.bonus.points)}.
            </p>
          </>
        )}
        {partial ? (
          <p className="score-panel-provisional" role="status">
            <span className="score-badge">Provisional</span>
            <span>{provisionalSentence(report, resourceLabels)}</span>
            {onRerun ? (
              <button type="button" className="checker-action" onClick={onRerun} disabled={rerunDisabled}>
                Re-run the check
              </button>
            ) : null}
          </p>
        ) : null}
        {rerunHelps && onRerun ? (
          <div className="score-panel-actions">
            <button type="button" className="checker-action" onClick={onRerun} disabled={rerunDisabled}>
              Re-run the check
            </button>
          </div>
        ) : null}
      </div>

      {/* A blocked run has no tiers to show: 0 of 0 bars would read as a score. */}
      {!blocked ? (
        <dl className="score-tiers" aria-label="Points by tier">
          <TierBar
            id="required"
            label="Required"
            earned={report.required.earned}
            available={report.required.available}
            note={`${report.required.passing} of ${report.required.total} eligible checks pass`}
          />
          <TierBar
            id="recommended"
            label="Recommended"
            earned={report.recommended.earned}
            available={report.recommended.available}
            note={`${report.recommended.passing} of ${report.recommended.total} eligible checks pass`}
          />
          <TierBar
            id="bonus"
            label="Bonus"
            earned={report.bonus.points}
            available={report.bonus.cap}
            note={`${report.bonus.signals} extra signal${report.bonus.signals === 1 ? '' : 's'}, never subtracts`}
          />
        </dl>
      ) : null}

      {unverifiedCount > 0 || resourcesOnly.length > 0 || report.naChecks.length > 0 || report.notMeasured.length > 0 ? (
        <div className="score-panel-lists">
          {unverifiedCount > 0 || resourcesOnly.length > 0 ? (
            <div>
              <h3>Could not be verified in time</h3>
              <ul>
                {report.unverifiedChecks.map((id) => (
                  <li key={id}>{nameOf(id)}</li>
                ))}
                {resourcesOnly.map((key) => (
                  <li key={`resource-${key}`}>
                    {RESOURCE_LABELS[key]} <small>(its readers were judged without it)</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.naChecks.length > 0 ? (
            <div>
              <h3>Not applicable to this site</h3>
              <ul>
                {report.naChecks.map((entry) => (
                  <li key={entry.id}>
                    {nameOf(entry.id)} <small>({entry.reason})</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.notMeasured.length > 0 ? (
            <details>
              <summary>
                Not measured in catalog {report.catalogVersion} ({report.notMeasured.length})
              </summary>
              <ul>
                {report.notMeasured.map((id) => (
                  <li key={id}>{nameOf(id)}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="score-panel-footer">
        <p className="score-panel-meta">
          Sample page: {report.samplePageUrl ?? 'none (no same-origin link on the homepage)'}.
          {' '}Catalog {report.catalogVersion}, formula {report.formulaVersion}.{' '}
          <a href={SCORE_METHODOLOGY_PATH}>How the score is computed</a>.
        </p>
        <div className="score-panel-actions">
          <button type="button" className="checker-action" onClick={() => void copySummary()}>
            {copyState === 'copied' ? 'Copied' : 'Copy client summary'}
          </button>
          {copyState === 'manual' ? (
            <span className="score-panel-note">Clipboard unavailable; copy the text below.</span>
          ) : null}
        </div>
      </div>
      {copyState === 'manual' ? (
        <textarea
          className="score-summary-text"
          readOnly
          aria-label="Client summary"
          value={summary}
        />
      ) : null}
    </section>
  );
}
