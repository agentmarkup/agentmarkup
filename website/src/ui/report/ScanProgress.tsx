import { useEffect, useId, useState } from 'react';

import { formatElapsed } from '../../checker/scan-meta';
import { StatusIcon } from '../Status';
import { SCAN_SLOW_PROMPT_MS } from '../../checker/use-site-check';

interface ScanProgressProps {
  host: string;
  startedAt: number;
  slowPromptDismissed: boolean;
  onKeepWaiting(): void;
  onCancel(): void;
}

/** The card content is revealed after this delay (it is laid out from the start), so a fast cached answer shows only the skeleton. */
const SCAN_PROGRESS_DELAY_MS = 300;

/**
 * The worker's real fetch plan, in its order (`_worker.js` fetchCheckEvidence):
 * homepage alone first, then the rest four at a time. Never ticked off one by
 * one: the browser makes one request and the worker answers once (H11).
 */
const FETCH_PLAN = [
  'Homepage, first: everything else needs it',
  'robots.txt, then the sitemap it names',
  'llms.txt',
  'A page that should not exist',
  'Markdown version of the homepage',
  'One inner page, then its markdown',
];

function footnote(elapsedMs: number, host: string, slowPromptDismissed: boolean): string {
  if (elapsedMs >= SCAN_SLOW_PROMPT_MS && !slowPromptDismissed) {
    return 'This is taking longer than the checker allows (25 seconds).';
  }
  if (elapsedMs >= 15_000) {
    return `Still waiting. A file that does not answer in time is left out of the score, never counted against ${host}.`;
  }
  if (elapsedMs >= 6_000) {
    return 'Slow answers are normal on shared hosting. Each file gets up to 10 seconds.';
  }
  return 'One request, one answer: the files are fetched together and arrive at once, usually in under 10 seconds.';
}

/** Spec 5.3: the honest single-round-trip progress card. */
export function ScanProgress({ host, startedAt, slowPromptDismissed, onKeepWaiting, onCancel }: ScanProgressProps) {
  const headingId = useId();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(performance.now() - startedAt);
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [startedAt]);

  const visible = elapsed >= SCAN_PROGRESS_DELAY_MS;
  const slow = elapsed >= SCAN_SLOW_PROMPT_MS && !slowPromptDismissed;

  return (
    <section
      className="scan-progress"
      aria-labelledby={visible ? headingId : undefined}
      data-visible={visible ? 'true' : 'false'}
    >
      {/* The content is in the DOM from the first paint and hidden by scan.css until the
          delay, so the card has its final height at once and nothing below it shifts (5.3). */}
      <div className="scan-progress-head">
        <h2 id={headingId}>Checking {host}</h2>
        <span className="scan-progress-timer" aria-hidden="true">
          {formatElapsed(elapsed)}
        </span>
      </div>
      <ol className="scan-steps">
        <li className="scan-step" data-state="done">
          <span className="scan-step-mark" aria-hidden="true">
            <StatusIcon status="good" size={14} />
          </span>
          <span className="scan-step-text">
            Sent to the agentmarkup checker<span className="sr-only"> (done)</span>
          </span>
        </li>
        <li className="scan-step" data-state="working">
          <span className="scan-step-mark" aria-hidden="true" />
          <span className="scan-step-text">
            The checker fetches up to 8 public files from {host}
            <span className="sr-only"> (in progress)</span>
          </span>
          <ul className="scan-files">
            {FETCH_PLAN.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </li>
        <li className="scan-step" data-state="waiting">
          <span className="scan-step-mark" aria-hidden="true" />
          <span className="scan-step-text">
            Your browser scores the answers<span className="sr-only"> (waiting)</span>
          </span>
        </li>
      </ol>
      <div className="scan-bar-indeterminate" aria-hidden="true">
        <span className="scan-bar-indeterminate-fill" />
        <span className="scan-bar-indeterminate-word">working</span>
      </div>
      <p className="scan-progress-note">{footnote(elapsed, host, slowPromptDismissed)}</p>
      {slow ? (
        <div className="scan-progress-actions">
          <button className="checker-action" type="button" onClick={onKeepWaiting}>
            Keep waiting
          </button>
          <button className="checker-action" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  );
}
