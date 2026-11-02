import { TOP_FIXES_LIMIT, getCheckDefinition, rankTopFixes } from '@agentmarkup/core/score';
import type { ScoreReport } from '@agentmarkup/core/score';

import { platformFixFor } from '../checker/check-copy';
import './score.css';

interface TopFixesProps {
  report: ScoreReport;
}

export function TopFixes({ report }: TopFixesProps) {
  if (report.analysisStatus === 'blocked' || report.score === null) {
    return null;
  }

  const fixes = rankTopFixes(report.checks, TOP_FIXES_LIMIT);
  const atCap = report.score >= 100;

  return (
    <section className="top-fixes" aria-labelledby="top-fixes-title">
      <h2 id="top-fixes-title">{atCap ? 'At the cap' : 'Top fixes'}</h2>
      <p>
        {fixes.length === 0
          ? 'Every scored check passes. Nothing to fix.'
          : atCap
            ? 'The score is already 100, so these gains are hidden by the cap. They are listed anyway so the remaining work stays visible.'
            : 'Ranked by estimated gain on this score with the current denominator. Fixing one check can make others eligible, so gains are estimates.'}
      </p>
      {fixes.length > 0 ? (
        <ol className="top-fixes-list">
          {fixes.map((fix) => {
            const definition = getCheckDefinition(fix.id);
            const platformFix = platformFixFor(definition, report.platform);
            return (
              <li key={fix.id} className="top-fixes-item" data-check-id={fix.id}>
                <div>
                  <h3>{definition?.name ?? fix.id}</h3>
                  <p>{definition?.clientSentence.fail ?? fix.evidence}</p>
                  <p>
                    <strong>What to do:</strong> {definition?.action ?? 'See the methodology.'}
                  </p>
                  {platformFix ? (
                    <p>
                      <strong>On {platformFix}</strong>
                    </p>
                  ) : null}
                  <p className="top-fixes-link">
                    <a href={definition?.docUrl ?? '/score/'}>How this check is scored</a>
                  </p>
                </div>
                <span className="top-fixes-gain">
                  <strong>+{fix.estGain}</strong>
                  points
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
