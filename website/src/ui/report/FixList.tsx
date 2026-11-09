import type { MouseEvent } from 'react';
import { fixActionFor, getCheckDefinition, platformFixesApply } from '@agentmarkup/core/score';
import type { ScoreReport, ScoredCheck } from '@agentmarkup/core/score';

import { SCORE_METHODOLOGY_PATH, platformFixFor, titleForCheck } from '../../checker/check-copy';
import type { FixPlan } from '../../checker/report-model';
import { GROUP_COPY, TIER_WORDS, fixGainLabel, fixHeading } from '../../checker/report-copy';
import './report.css';

interface FixListProps {
  report: ScoreReport;
  plan: FixPlan;
  onOpenCheck(id: string): void;
}

const NOTHING_TO_FIX = 'Every scored check passes. Nothing to fix.';

function nameOf(check: ScoredCheck): string {
  return getCheckDefinition(check.id)?.name ?? check.id;
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Section 8. Ranked by the engine (`rankTopFixes`, via `fixPlan`); no gain sums (H8).
 * Evidence is not repeated here: "See the evidence" opens the check in its group.
 */
export function FixList({ report, plan, onOpenCheck }: FixListProps) {
  if (report.analysisStatus === 'blocked' || report.score === null) return null;

  const heading = fixHeading(plan);
  const empty = plan.all.length === 0;

  // The hash link works without JS; with JS the group and check open first.
  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpenCheck(id);
  }

  function thenItem(check: ScoredCheck, index: number) {
    return (
      <li key={check.id} className="fix-then-item" data-check-id={check.id}>
        {index > 0 ? <span aria-hidden="true">{' · '}</span> : null}
        <a href={`#check-${check.id}`} onClick={(event) => jump(event, check.id)}>
          {nameOf(check)}
        </a>{' '}
        +{check.estGain} (<a href={`${SCORE_METHODOLOGY_PATH}#${check.id}`}>rule</a>)
      </li>
    );
  }

  return (
    <section className="fix-section" aria-labelledby="fix-title">
      <h2 id="fix-title" className="fix-heading">
        {heading.title}
      </h2>
      {empty ? (
        <p className="fix-empty">{heading.note ?? NOTHING_TO_FIX}</p>
      ) : heading.note ? (
        <p className="fix-note">{heading.note}</p>
      ) : null}

      {plan.primary.length > 0 ? (
        <ol className="fix-list">
          {plan.primary.map((check, index) => {
            const definition = getCheckDefinition(check.id);
            const bucket = definition?.bucket;
            const platform = platformFixesApply(check) ? platformFixFor(definition, report.platform) : null;
            const action = fixActionFor(check);
            return (
              <li
                key={check.id}
                className="fix-row"
                data-check-id={check.id}
                data-optional={plan.atCap ? 'true' : undefined}
              >
                <span className="fix-rank" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="fix-main">
                  <h3 className="fix-title">{titleForCheck(check)}</h3>
                  <p className="fix-meta">
                    {nameOf(check)}
                    {bucket ? ` · ${capitalize(GROUP_COPY[bucket].noun)}` : ''} · {TIER_WORDS[check.tier]}
                  </p>
                  {action ? <p className="fix-do">Do: {action}</p> : null}
                  {platform ? <p className="fix-platform">On {platform}</p> : null}
                  <p className="fix-links">
                    <a href={`#check-${check.id}`} onClick={(event) => jump(event, check.id)}>
                      See the evidence
                    </a>
                    <span aria-hidden="true">{' · '}</span>
                    <a href={`${SCORE_METHODOLOGY_PATH}#${check.id}`}>How this check is scored</a>
                  </p>
                </div>
                <span className="fix-gain">
                  <span aria-hidden="true">
                    {plan.atCap ? (
                      <>
                        +{check.estGain ?? 0}
                        <span className="fix-gain-cap"> above 100</span>
                      </>
                    ) : (
                      fixGainLabel(check, false)
                    )}
                  </span>
                  <span className="sr-only">
                    {plan.atCap
                      ? `estimated gain ${check.estGain} points above the 100 cap`
                      : `estimated gain ${check.estGain} points`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {plan.then.length > 0 ? (
        <div className="fix-then">
          <span className="fix-then-label">Then:</span>
          <ol className="fix-then-list" start={plan.primary.length + 1}>
            {plan.then.map(thenItem)}
          </ol>
        </div>
      ) : null}

      {plan.optionalOnly ? (
        <div className="fix-optional-line">
          <span>
            {plan.all.length} optional extra{plan.all.length === 1 ? '' : 's'} above the cap:
          </span>{' '}
          <ul className="fix-then-list">{plan.all.map(thenItem)}</ul>
        </div>
      ) : null}
    </section>
  );
}
