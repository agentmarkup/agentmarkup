import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderClientSummary } from '@agentmarkup/core/score';
import type { ScoreReport } from '@agentmarkup/core/score';

import type { BlockedCase } from '../../checker/report-model';
import { renderDeveloperBrief } from '../../checker/report-copy';
import './report.css';

interface ReportActionsProps {
  report: ScoreReport;
  host: string;
  siteName: string;
  previous: ScoreReport | null;
  onRescan(): void;
  rescanning: boolean;
  rescan: 'primary' | 'secondary' | 'none';
  /** The blocked row (5.9), so a blocked run's developer brief names the right cause. */
  blocked?: BlockedCase | null;
}

type CopyKind = 'summary' | 'brief' | 'link';

interface Fallback {
  kind: CopyKind;
  label: string;
  text: string;
}

const COPIED_MS = 2500;
const TOAST_MS = 6000;

const FALLBACK_LABELS: Readonly<Record<CopyKind, string>> = {
  summary: 'Client summary',
  brief: 'Developer brief',
  link: 'Link to a fresh check',
};

function CheckMark() {
  return (
    <svg className="report-action-check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The actions row (6.5). Copy actions copy the report on screen, also while a
 * rescan runs; the row itself is never inert.
 */
export function ReportActions({
  report,
  host,
  siteName,
  previous,
  onRescan,
  rescanning,
  rescan,
  blocked = null,
}: ReportActionsProps) {
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [toast, setToast] = useState('');
  const [fallback, setFallback] = useState<Fallback | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  // The report on screen, for a clipboard call that settles after a rescan replaced
  // it. A layout effect runs inside the commit, so no promise can settle between the
  // new report landing and this ref catching up.
  const latestReport = useRef(report);
  useLayoutEffect(() => {
    latestReport.current = report;
    // Timers from a copy of the previous report must not clear the next copy's feedback early.
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    copiedTimer.current = null;
    toastTimer.current = null;
  }, [report]);

  // A new report (a rescan landed) clears copy feedback and a stale clipboard
  // fallback, which would otherwise offer the previous report's text under the
  // new score. Adjusted during render, so no setState in an effect.
  const [seenReport, setSeenReport] = useState(report);
  if (seenReport !== report) {
    setSeenReport(report);
    setCopied(null);
    setToast('');
    setFallback(null);
  }

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );

  function textFor(kind: CopyKind): string {
    if (kind === 'summary') return renderClientSummary(report, { siteName, previous });
    if (kind === 'brief') return renderDeveloperBrief(report, { host, origin: window.location.origin, blocked });
    return `${window.location.origin}/checker/?url=${encodeURIComponent(host)}`;
  }

  async function copy(kind: CopyKind) {
    const text = textFor(kind);
    const startedFor = report;
    let written = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      written = false;
    }
    // The report changed while the clipboard call was pending: say nothing about the old one.
    if (latestReport.current !== startedFor) return;
    if (!written) {
      setFallback({ kind, label: FALLBACK_LABELS[kind], text });
      return;
    }
    setFallback(null);
    if (kind === 'link') {
      setToast(`Link copied. Opening it runs a fresh check of ${host}.`);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(''), TOAST_MS);
      return;
    }
    setToast(kind === 'summary' ? 'Client summary copied.' : 'Developer brief copied.');
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), TOAST_MS);
    setCopied(kind);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  }

  const summaryPrimary = rescan !== 'primary';
  const rescanButton =
    rescan === 'none' ? null : (
      <button
        type="button"
        className={`${rescan === 'primary' ? 'checker-submit report-action-primary' : 'checker-action report-action'}${rescanning ? ' is-busy' : ''}`}
        aria-disabled={rescanning ? 'true' : undefined}
        onClick={() => {
          if (!rescanning) onRescan();
        }}
      >
        Rescan
      </button>
    );

  return (
    <div className="report-actions">
      {rescan === 'primary' ? rescanButton : null}
      <button
        type="button"
        className={summaryPrimary ? 'checker-submit report-action-primary' : 'checker-action report-action'}
        onClick={() => void copy('summary')}
      >
        {copied === 'summary' ? (
          <>
            <CheckMark />
            Copied
          </>
        ) : (
          'Copy client summary'
        )}
      </button>
      <button type="button" className="checker-action report-action" onClick={() => void copy('brief')}>
        {copied === 'brief' ? (
          <>
            <CheckMark />
            Copied
          </>
        ) : (
          'Copy developer brief'
        )}
      </button>
      <button type="button" className="checker-action report-action" onClick={() => void copy('link')}>
        Copy link
      </button>
      <button type="button" className="checker-action report-action" onClick={() => window.print()}>
        Print or save PDF
      </button>
      {rescan === 'secondary' ? rescanButton : null}
      <p className="report-toast" role="status">
        {toast}
      </p>
      {fallback ? (
        <>
          <p className="report-summary-fallback-note">Clipboard unavailable. Select the text below.</p>
          <textarea
            className="report-summary-fallback"
            readOnly
            aria-label={fallback.label}
            value={fallback.text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </>
      ) : null}
    </div>
  );
}
