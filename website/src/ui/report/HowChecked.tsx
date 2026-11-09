import { formatPoints } from '../../checker/report-model';
import { normalizationNote } from '../../checker/scan-meta';
import { SCORE_METHODOLOGY_PATH } from '../../checker/check-copy';
import type { RemoteResource, SiteAnalysis, SiteCheckResponse } from '../../checker/types';
import { StatusIcon } from '../Status';
import { levelToStatus } from '../status-model';
import './report.css';

interface HowCheckedProps {
  analysis: SiteAnalysis;
  result: SiteCheckResponse;
}

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
}

/** Section 7.12: the fetch log, the arithmetic, versions and notes; collapsed by default. */
export function HowChecked({ analysis, result }: HowCheckedProps) {
  const report = analysis.report;
  const summary = result.fetchSummary;
  const blocked = report.analysisStatus === 'blocked' || report.score === null;
  const atCap = report.score !== null && report.score >= 100;

  const segments: string[] = [];
  if (typeof summary?.fetches === 'number') {
    segments.push(
      typeof summary.elapsedMs === 'number'
        ? `${summary.fetches} requests, redirects included, in ${(summary.elapsedMs / 1000).toFixed(1)} s`
        : `${summary.fetches} requests, redirects included`
    );
  }
  segments.push(`catalog ${report.catalogVersion}`, `formula ${report.formulaVersion}`);

  const cachedAt = result.cache?.hit ? formatTime(result.cache.cachedAt) : null;
  const expiresAt = result.cache?.hit ? formatTime(result.cache.expiresAt) : null;
  const normalization = normalizationNote(result);

  return (
    <details className="how-checked">
      <summary>How this was checked ({segments.join(' · ')})</summary>
      <ul className="fetch-log">
        {analysis.resources.map((resource) => {
          const fetched = result[resource.key] as RemoteResource | null | undefined;
          const duration = fetched?.durationMs;
          return (
            <li key={resource.key} className="fetch-row" data-level={resource.level}>
              <StatusIcon status={levelToStatus(resource.level)} size={14} />
              <span className="fetch-label">{resource.label}</span>
              <span className="fetch-status">{resource.status}</span>
              {resource.url ? (
                <a className="fetch-url" href={resource.url} rel="nofollow noopener noreferrer">
                  {resource.url}
                </a>
              ) : null}
              {typeof duration === 'number' ? <span className="fetch-time">{duration} ms</span> : null}
            </li>
          );
        })}
      </ul>
      {!blocked && report.raw !== null ? (
        <p className="score-arithmetic">
          Raw {report.raw.toFixed(2)} before rounding{atCap ? ', at the cap' : ''}. Required{' '}
          {formatPoints(report.required.earned)} + recommended {formatPoints(report.recommended.earned)} + bonus{' '}
          {formatPoints(report.bonus.points)}.
        </p>
      ) : null}
      <p className="report-versions">
        Sample page: {report.samplePageUrl ?? 'none (no same-origin link on the homepage)'}. Catalog{' '}
        {report.catalogVersion}, formula {report.formulaVersion}.{' '}
        <a href={SCORE_METHODOLOGY_PATH}>How the score is computed</a>.
      </p>
      {cachedAt ? (
        <p className="how-checked-note">
          This is a saved scan from {cachedAt}
          {expiresAt ? `; a fresh scan is possible after ${expiresAt}` : ''}.
        </p>
      ) : null}
      {normalization ? <p className="how-checked-note">{normalization}</p> : null}
      <p className="how-checked-note">Each file gets up to 10 seconds; the whole check up to 25.</p>
    </details>
  );
}
