import { getCheckDefinition, unverifiedResourcesWithoutChecks } from '@agentmarkup/core/score';
import type { ScoreReport } from '@agentmarkup/core/score';

import { RESOURCE_LABELS } from '../../checker/check-copy';
import { naReason } from '../../checker/report-copy';
import './report.css';

interface NotScoredProps {
  report: ScoreReport;
  defaultOpen: boolean;
}

function nameOf(id: string): string {
  return getCheckDefinition(id)?.name ?? id;
}

/**
 * Section 7.10: N/A, not measured and not checked on this run stay listed with human
 * reasons (H5), never in a failure colour and never as raw reason codes.
 */
export function NotScored({ report, defaultOpen }: NotScoredProps) {
  const na = report.naChecks.length;
  const notMeasured = report.notMeasured.length;
  const unverified = report.unverifiedChecks.length;
  const resources = unverifiedResourcesWithoutChecks(report);
  if (na + notMeasured + unverified + resources.length === 0) return null;
  // A blocked run marks every check n/a for one reason (e.g. the homepage answered 404): say it once.
  const reasons = new Set(report.naChecks.map((entry) => entry.reason));
  const sharedReason = report.analysisStatus === 'blocked' && reasons.size === 1 ? [...reasons][0] : null;

  return (
    <details className="not-scored" open={defaultOpen}>
      <summary>
        What was not scored, and why (
        {sharedReason !== null ? `${na} not scored on this run` : `${na} not applicable`}, {notMeasured} not measured
        yet{unverified > 0 ? `, ${unverified} not checked on this run` : ''})
      </summary>
      {unverified + resources.length > 0 ? (
        <>
          <h3>Not checked on this run</h3>
          <ul className="not-scored-list">
            {report.unverifiedChecks.map((id) => (
              <li key={id}>{nameOf(id)}</li>
            ))}
            {resources.map((key) => (
              <li key={`resource-${key}`}>
                {RESOURCE_LABELS[key]}{' '}
                <span className="not-scored-reason">(the checks that read it were judged without it)</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {na > 0 && sharedReason !== null ? (
        <>
          <h3>Not scored on this run</h3>
          <p className="not-scored-reason">{naReason(sharedReason)}.</p>
          <ul className="not-scored-list">
            {report.naChecks.map((entry) => (
              <li key={entry.id}>{nameOf(entry.id)}</li>
            ))}
          </ul>
        </>
      ) : na > 0 ? (
        <>
          <h3>Doesn&apos;t apply to this site</h3>
          <ul className="not-scored-list">
            {report.naChecks.map((entry) => (
              <li key={entry.id}>
                {nameOf(entry.id)}: <span className="not-scored-reason">{naReason(entry.reason)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {notMeasured > 0 ? (
        <>
          <h3>
            Not measured in catalog {report.catalogVersion} ({notMeasured})
          </h3>
          <ul className="not-scored-list">
            {report.notMeasured.map((id) => (
              <li key={id}>{nameOf(id)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}
