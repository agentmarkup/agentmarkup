import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { formatElapsed, hostOf, quotaNote, redirectNotice, reportTime, scanMeta, stripWww } from '../../checker/scan-meta';
import type { SiteCheckActions, SiteCheckState } from '../../checker/use-site-check';
import { ReportBody } from './ReportBody';
import { ReportSkeleton, ScoreSkeleton } from './ReportSkeleton';
import { ScanBar } from './ScanBar';
import { ScanNotice } from './ScanNotice';
import { ScanProgress } from './ScanProgress';
import './scan.css';

interface ReportShellProps {
  state: SiteCheckState;
  actions: SiteCheckActions;
  headingRef: RefObject<HTMLHeadingElement | null>;
  noticeHeadingRef: RefObject<HTMLHeadingElement | null>;
  turnstileRef: RefObject<HTMLDivElement | null>;
  scanInputRef: RefObject<HTMLInputElement | null>;
}

/** Elapsed seconds since `startedAt`, refreshed every 100 ms while mounted; never announced. */
function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(performance.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [startedAt]);
  return (
    <span className="report-meta-elapsed" aria-hidden="true">
      {formatElapsed(elapsed)}
    </span>
  );
}

/** Same host after dropping `www.`: a ScanBar submit of the site on screen is a rescan, not a new report. */
function sameSite(a: string, b: string): boolean {
  return stripWww(hostOf(a)).toLowerCase() === stripWww(hostOf(b)).toLowerCase();
}

/**
 * Spec 5.0: the report column for every non-idle phase. ScanBar, header, banner
 * slot, then the hero slot (skeleton + progress, or a full-width notice) or the
 * report body. Mounted only after a client action, so locale formatting is safe.
 */
export function ReportShell({ state, actions, headingRef, noticeHeadingRef, turnstileRef, scanInputRef }: ReportShellProps) {
  const { phase, current, requestedUrl, error, challenge } = state;
  const scanning = phase === 'scanning';
  const rescanning = scanning && current !== null;
  const [draft, setDraft] = useState(() => hostOf(requestedUrl));
  const [fieldErrorEdited, setFieldErrorEdited] = useState(false);

  const result = current?.result ?? null;
  const report = current?.analysis.report ?? null;
  const host = stripWww(hostOf(result ? result.targetUrl : requestedUrl));
  const requestedHost = hostOf(requestedUrl);
  const onRescan = () => {
    if (result) actions.start(result.targetUrl, { source: 'rescan' });
  };

  const meta = result && report ? scanMeta(result, report) : [];
  const redirect = result ? redirectNotice(requestedUrl, result.targetUrl) : null;
  const quota = result ? quotaNote(result) : null;
  const fieldError = fieldErrorEdited ? null : state.fieldError;

  const showErrorCard = phase === 'error' && !current && error !== null && error.kind !== 'invalid';
  const showErrorBanner = phase === 'done' && current !== null && error !== null && error.kind !== 'invalid';
  const showChallenge = phase === 'challenged' && challenge !== null;
  // The hook sends a refused first address back to the landing; should one ever
  // land here, no header is titled with an address that was never scanned.
  const invalidFirst = phase === 'error' && !current && error?.kind === 'invalid';

  const challengeNotice = showChallenge ? (
    <ScanNotice
      kind="challenge"
      variant={current ? 'banner' : 'card'}
      host={stripWww(requestedHost)}
      challenge={challenge}
      headingRef={noticeHeadingRef}
      turnstileRef={turnstileRef}
      onShowAgain={() => actions.setChallengeNote(null)}
    />
  ) : null;

  return (
    <article className="checker-page report" aria-busy={scanning}>
      <ScanBar
        value={scanning ? requestedHost : draft}
        onChange={(value) => {
          setDraft(value);
          setFieldErrorEdited(true);
        }}
        onSubmit={(normalized) => {
          setFieldErrorEdited(false);
          const rescan = result !== null && sameSite(normalized, result.targetUrl);
          actions.start(rescan && result ? result.targetUrl : normalized, { source: rescan ? 'rescan' : 'form' });
        }}
        onCancel={actions.cancel}
        scanning={scanning}
        secondary={current !== null}
        fieldError={fieldError}
        quota={quota}
        inputRef={scanInputRef}
      />

      {invalidFirst ? null : (
      <header className="report-header">
        <p className="section-kicker">Agent-readiness report</p>
        <h1 className="report-domain" ref={headingRef} tabIndex={-1}>
          {host}
        </h1>
        {scanning && state.startedAt !== null ? (
          <p className="report-meta">
            {rescanning ? 'Scanning again' : 'Scanning now'} · <ElapsedTime startedAt={state.startedAt} />
            {rescanning ? (
              <>
                {' · '}
                <button className="report-meta-cancel" type="button" onClick={actions.cancel}>
                  Cancel
                </button>
              </>
            ) : null}
          </p>
        ) : meta.length > 0 ? (
          <p className="report-meta">{meta.join(' · ')}</p>
        ) : null}
        {redirect && !scanning ? <p className="report-redirect">{redirect}</p> : null}
      </header>
      )}

      {current && (showChallenge || showErrorBanner) ? (
        <div className="report-banner">
          {challengeNotice ?? (
            <ScanNotice
              kind="error"
              variant="banner"
              host={host}
              error={error ?? undefined}
              headingRef={noticeHeadingRef}
              onRetry={onRescan}
              reportTime={reportTime(current.result.fetchedAt) ?? undefined}
            />
          )}
        </div>
      ) : null}

      {!current && scanning && state.startedAt !== null ? (
        <>
          <div className="report-hero is-skeleton">
            <ScoreSkeleton />
            <ScanProgress
              host={stripWww(requestedHost)}
              startedAt={state.startedAt}
              slowPromptDismissed={state.slowPromptDismissed}
              onKeepWaiting={actions.keepWaiting}
              onCancel={actions.cancel}
            />
          </div>
          <ReportSkeleton />
        </>
      ) : null}

      {!current && showChallenge ? <div className="report-hero-slot">{challengeNotice}</div> : null}

      {showErrorCard ? (
        <div className="report-hero-slot">
          <ScanNotice
            kind="error"
            variant="card"
            host={stripWww(requestedHost)}
            error={error}
            headingRef={noticeHeadingRef}
            onRetry={() => actions.start(requestedUrl, { source: 'form' })}
          />
        </div>
      ) : null}

      {current ? (
        <ReportBody
          analysis={current.analysis}
          result={current.result}
          host={host}
          siteName={hostOf(current.result.targetUrl)}
          rescanning={rescanning}
          onRescan={onRescan}
        />
      ) : null}
    </article>
  );
}
