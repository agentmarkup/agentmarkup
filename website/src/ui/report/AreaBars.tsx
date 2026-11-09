import type { ScoreReport } from '@agentmarkup/core/score';

import { areaTotal, formatPoints, type GroupSummary } from '../../checker/report-model';
import { GROUP_COPY } from '../../checker/report-copy';
import { StatusIcon } from '../Status';
import './report.css';

interface AreaBarsProps {
  groups: GroupSummary[];
  report: ScoreReport;
}

/**
 * The six areas in fixed order (6.7). Every figure is the published decomposition
 * of the engine's own per-check weights (7.2); bonus is never inside an area.
 */
export function AreaBars({ groups, report }: AreaBarsProps) {
  if (groups.length === 0) return null;
  const atCap = report.score !== null && report.score >= 100;
  const extras = formatPoints(report.bonus.points);

  return (
    <div className="area-bars">
      {groups.map((group) => {
        const copy = GROUP_COPY[group.bucket];
        const unscored = group.pct === null;
        const earned = formatPoints(group.earned, 1);
        const stake = formatPoints(group.stake, 1);
        const label = unscored
          ? `${copy.label}: not scored on this site`
          : `${copy.label}: ${group.pct} percent, ${earned} of ${stake} points${group.hasUnverified ? ', provisional' : ''}`;
        const flagged = group.tone === 'attention' || group.tone === 'action';
        return (
          <div
            key={group.bucket}
            className="area-bar"
            data-tone={group.tone}
            data-unscored={unscored ? 'true' : undefined}
            data-provisional={group.hasUnverified ? 'true' : undefined}
          >
            <span className="area-bar-label" aria-hidden="true">
              {copy.label}
            </span>
            <span className="area-bar-track" role="img" aria-label={label}>
              <span className="area-bar-fill" style={{ width: `${group.pct ?? 0}%` }} />
            </span>
            <span className="area-bar-value" aria-hidden="true">
              {unscored ? 'Not scored' : `${group.pct}%`}
              {unscored ? null : <span className="area-bar-points"> {earned} of {stake} pts</span>}
            </span>
            <span className="area-bar-flag" aria-hidden="true">
              {flagged ? <StatusIcon status={group.tone === 'action' ? 'action' : 'attention'} size={12} /> : null}
            </span>
          </div>
        );
      })}
      <p className="area-extras">
        Extras +{extras} of {formatPoints(report.bonus.cap)}, never subtract
      </p>
      <p className="area-footnote">
        Areas add up to {formatPoints(areaTotal(report), 2)} of 100 points, plus {extras} in extras
        {atCap ? ', capped at 100' : ''}.
      </p>
    </div>
  );
}
