import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { retryAfterPhrase } from '../../checker/request';
import type { ChallengeState, ScanError, ScanErrorKind } from '../../checker/use-site-check';

interface ScanNoticeProps {
  kind: 'challenge' | 'error';
  host: string;
  error?: ScanError;
  challenge?: ChallengeState;
  headingRef: RefObject<HTMLHeadingElement | null>;
  turnstileRef?: RefObject<HTMLDivElement | null>;
  onRetry?(): void;
  onShowAgain?(): void;
  variant: 'card' | 'banner';
  /** Formatted time of the report kept on screen (banner only). */
  reportTime?: string;
}

interface ErrorCopy {
  title: string;
  body: string;
  retry: boolean;
}

/** Spec 5.5. `invalid` never renders a card: it is a field error under the input. */
function errorCopy(kind: ScanErrorKind, host: string): ErrorCopy {
  switch (kind) {
    case 'rate-limited':
      return {
        title: "You have used this network's free scans for now",
        body: 'To keep the checker free, each network gets 10 scans every 10 minutes.',
        retry: true,
      };
    case 'network':
      return { title: 'Could not reach the agentmarkup checker', body: 'Check your connection and try again.', retry: true };
    case 'timeout':
      return {
        title: 'The checker did not answer in time',
        body: `Nothing was counted against ${host}. Try again in a minute.`,
        retry: true,
      };
    case 'unavailable':
      return { title: 'The checker is unavailable right now', body: 'Try again in a minute.', retry: true };
    case 'forbidden':
      return {
        title: 'This page could not start the scan',
        body: 'Open agentmarkup.dev/checker/ directly and scan from there.',
        retry: false,
      };
    case 'local-dev':
      return {
        title: 'Local preview: the checker API is not running',
        body: 'Plain Vite does not serve /api/check. Run the site through Cloudflare Pages local dev (wrangler pages dev on website/dist) to test scans.',
        retry: false,
      };
    case 'invalid':
    case 'checker':
    default:
      return {
        title: 'The checker hit a problem on its side',
        body: `Nothing was counted against ${host}. This is on us, not on the site. Try again in a moment.`,
        retry: true,
      };
  }
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Live mm:ss countdown for the rate limit; mounted with a fresh `key` per error. */
function useCountdown(initialSeconds: number | null): number | null {
  const [remaining, setRemaining] = useState(initialSeconds);
  useEffect(() => {
    if (initialSeconds === null || initialSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemaining((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [initialSeconds]);
  return remaining;
}

function RetryButton({ onRetry, waiting }: { onRetry?(): void; waiting: boolean }) {
  if (!onRetry) return null;
  return (
    <button
      className="checker-action"
      type="button"
      aria-disabled={waiting ? 'true' : undefined}
      onClick={() => {
        if (!waiting) onRetry();
      }}
    >
      Try again
    </button>
  );
}

function ErrorNotice({ host, error, headingRef, onRetry, variant, reportTime }: ScanNoticeProps & { error: ScanError }) {
  const copy = errorCopy(error.kind, host);
  const rateLimited = error.kind === 'rate-limited';
  const remaining = useCountdown(rateLimited ? error.retryAfterSeconds : null);
  const waiting = rateLimited && remaining !== null && remaining > 0;
  const waitPhrase = rateLimited ? retryAfterPhrase(error.retryAfterSeconds) : null;
  const countdown = rateLimited
    ? waiting
      ? `You can scan again in ${formatCountdown(remaining ?? 0)}.`
      : 'Ready. Scan again.'
    : null;

  const title = variant === 'banner' ? `Rescan failed: ${copy.title}.` : copy.title;
  const body =
    variant === 'banner'
      ? reportTime
        ? `The report below is from ${reportTime}.`
        : 'The report below is from the previous scan.'
      : copy.body;

  return (
    <section className="scan-notice scan-notice-error" data-variant={variant} data-kind={error.kind} role="alert">
      <h2 className="scan-notice-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      <p className="scan-notice-body">{body}</p>
      {countdown ? (
        <p className="scan-notice-note">
          {variant === 'banner' && waiting ? `${copy.body} ` : null}
          {/* The ticking mm:ss is hidden from screen readers (inside role=alert it would be re-read every
              second); a fixed sentence stands in, and "Ready. Scan again." is announced once at 0. */}
          {waiting ? (
            <>
              <span className="scan-notice-countdown" aria-hidden="true">
                {countdown}
              </span>
              <span className="sr-only">You can scan again in {waitPhrase ?? 'a few minutes'}.</span>
            </>
          ) : (
            <span className="scan-notice-countdown">{countdown}</span>
          )}
        </p>
      ) : null}
      {copy.retry && onRetry ? (
        <div className="scan-notice-actions">
          <RetryButton onRetry={onRetry} waiting={waiting} />
        </div>
      ) : null}
    </section>
  );
}

function ChallengeNotice({ host, challenge, headingRef, turnstileRef, onShowAgain, variant }: ScanNoticeProps & { challenge: ChallengeState }) {
  const wait = retryAfterPhrase(challenge.retryAfterSeconds);
  return (
    <section className="scan-notice scan-notice-challenge" data-variant={variant}>
      <p className="scan-notice-kicker">One quick step</p>
      <h2 className="scan-notice-title" ref={headingRef} tabIndex={-1}>
        Confirm you are human to scan {host}
      </h2>
      <p className="scan-notice-body">
        Many scans came from this network in the last few minutes, so the checker asks once. Completing it starts
        your scan right away.
      </p>
      <div className="checker-turnstile" ref={turnstileRef} />
      {wait ? <p className="scan-notice-note">Or wait {wait}.</p> : null}
      {challenge.note ? (
        <p className="scan-notice-note scan-notice-challenge-note">
          {challenge.note}{' '}
          {onShowAgain ? (
            <button className="scan-notice-link" type="button" onClick={onShowAgain}>
              Show it again
            </button>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/** Challenge and error cards, rendered in view: in the hero slot on a first scan, in `.report-banner` on a rescan. */
export function ScanNotice(props: ScanNoticeProps) {
  if (props.kind === 'challenge') {
    return props.challenge ? <ChallengeNotice {...props} challenge={props.challenge} /> : null;
  }
  if (!props.error || props.error.kind === 'invalid') return null;
  return <ErrorNotice key={`${props.error.kind}:${props.error.retryAfterSeconds ?? ''}`} {...props} error={props.error} />;
}
