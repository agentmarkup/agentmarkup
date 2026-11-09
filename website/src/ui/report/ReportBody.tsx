import { useEffect, useMemo, useRef, useState } from 'react';
import { compareReports } from '@agentmarkup/core/score';

import {
  blockedCase,
  fixPlan,
  gatedInfo,
  groupReport,
  reportTone,
} from '../../checker/report-model';
import { previousReport, rememberReport } from '../../checker/report-history';
import { PRODUCT_LINE, changeLine, gatedNotice, verdictSentence } from '../../checker/report-copy';
import { SCORE_METHODOLOGY_PATH } from '../../checker/check-copy';
import type { SiteAnalysis, SiteCheckResponse } from '../../checker/types';
import { StatusIcon } from '../Status';
import { AreaBars } from './AreaBars';
import { CheckGroups } from './CheckGroups';
import { FixList } from './FixList';
import { HowChecked } from './HowChecked';
import { NotScored } from './NotScored';
import { ReportActions } from './ReportActions';
import { ScoreBlock } from './ScoreBlock';
import { StickyScoreBar } from './StickyScoreBar';
import './report.css';

interface ReportBodyProps {
  analysis: SiteAnalysis;
  result: SiteCheckResponse;
  /** Host without `www.`, as in the h1. */
  host: string;
  /** Full host of the target URL, used in the client summary. */
  siteName: string;
  rescanning: boolean;
  onRescan(): void;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

/**
 * The done view under the report header (sections 5.6 to 5.12, 6.1 items 6 to 13).
 * It renders only after a client-side scan, never during prerender, so the
 * `Intl` and `localStorage` reads below cannot cause a hydration mismatch.
 */
export function ReportBody({ analysis, result, host, siteName, rescanning, onRescan }: ReportBodyProps) {
  const report = analysis.report;
  const blocked = blockedCase(report, result);
  const gated = blocked ? null : gatedInfo(report);
  const groups = groupReport(report);
  const plan = fixPlan(report);
  const tone = reportTone(report, blocked);
  const partial = report.analysisStatus === 'partial';
  const complete = report.analysisStatus === 'complete';

  // 6.4: the last complete report of this host in this browser, read before this one is stored.
  const previous = useMemo(
    () => (complete ? previousReport(host, report.fetchedAt) : null),
    [complete, host, report.fetchedAt]
  );
  useEffect(() => {
    if (complete) rememberReport(host, report);
  }, [complete, host, report]);

  let change: string | null = null;
  if (previous) {
    const comparison = compareReports(previous, report);
    if (comparison.comparable && comparison.scoreDelta !== null) change = changeLine(comparison, previous);
  }

  const [openRequest, setOpenRequest] = useState<{ id: string; nonce: number } | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const sentence = verdictSentence(report, groups, host);
  const gatedCopy = gated ? gatedNotice(gated, host) : null;
  const scannedOn = formatDate(result.fetchedAt);
  const rescan = blocked ? (blocked.rescan ? 'primary' : 'none') : partial ? 'none' : 'secondary';
  const stale = rescanning ? 'report-stale' : undefined;

  function openCheck(id: string) {
    setOpenRequest((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  }

  return (
    <div className="report-body">
      <p className="report-print-header">
        agentmarkup agent-readiness report · {host}
        {scannedOn ? ` · ${scannedOn}` : ''}
      </p>
      <StickyScoreBar report={report} host={host} targetRef={heroRef} />

      {/* While a rescan runs the hero is dimmed; it stays focusable only when it holds the partial run's Rescan. */}
      <section
        ref={heroRef}
        className={['report-hero-card', stale].filter(Boolean).join(' ')}
        data-tone={tone}
        aria-label="Score"
        inert={rescanning && !partial}
      >
        <div className="report-hero" data-blocked={blocked ? 'true' : undefined}>
          <div className="report-hero-main">
            <ScoreBlock
              report={report}
              tone={tone}
              blocked={blocked}
              host={host}
              onRescan={onRescan}
              rescanning={rescanning}
            />
            {gatedCopy ? (
              <div className="report-notice" data-tone="action">
                <span className="report-notice-icon">
                  <StatusIcon status="action" />
                </span>
                <div className="report-notice-text">
                  <p className="report-notice-title">{gatedCopy.title}</p>
                  <p className="report-notice-body">{gatedCopy.body}</p>
                </div>
              </div>
            ) : null}
            {sentence ? <p className="report-sentence">{sentence}</p> : null}
          </div>
          {blocked ? null : (
            <div className="report-hero-areas">
              <AreaBars groups={groups} report={report} />
              {/* 6.4 change line, after the bars so the six areas stay on a phone's first screen. */}
              {change ? <p className="report-change">{change}</p> : null}
            </div>
          )}
        </div>
      </section>

      <ReportActions
        report={report}
        host={host}
        siteName={siteName}
        previous={previous}
        onRescan={onRescan}
        rescanning={rescanning}
        rescan={rescan}
        blocked={blocked}
      />

      <div className={['report-sections', stale].filter(Boolean).join(' ')} inert={rescanning}>
        <FixList report={report} plan={plan} onOpenCheck={openCheck} />
        <CheckGroups report={report} groups={groups} items={analysis.items} openRequest={openRequest} />
        <NotScored report={report} defaultOpen={partial} />
        <HowChecked analysis={analysis} result={result} />
      </div>

      <p className="report-product-line">
        {PRODUCT_LINE.text} <a href={PRODUCT_LINE.href}>{PRODUCT_LINE.linkLabel}</a>
      </p>
      <p className="report-footer">
        Catalog {report.catalogVersion} · formula {report.formulaVersion} ·{' '}
        <a href={SCORE_METHODOLOGY_PATH}>How the score is computed</a>
      </p>
      <p className="report-print-header report-print-footer">
        Computed from a published formula (catalog {report.catalogVersion}, formula {report.formulaVersion}). Every
        point traces to a check listed at agentmarkup.dev/score/.
      </p>
    </div>
  );
}
