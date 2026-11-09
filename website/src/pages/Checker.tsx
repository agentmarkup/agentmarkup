import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { flushSync } from 'react-dom';

import { SCORE_CATALOG_VERSION } from '@agentmarkup/core/score';

import { SKELETON_QUESTIONS } from '../checker/scan-meta';
import { isScannableUrl, useSiteCheck } from '../checker/use-site-check';
import type { SiteCheckActions, SiteCheckState } from '../checker/use-site-check';
import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import { StatusIcon } from '../ui/Status';
import { ContextualFaq } from '../ui/ContextualFaq';
import { ReportShell } from '../ui/report/ReportShell';
import { checkerFaqs } from '../data/page-faqs';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: 'auto' | 'light' | 'dark';
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
    }
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __agentmarkupTurnstileLoader?: Promise<TurnstileApi>;
  }
}

const TURNSTILE_EXPIRED_NOTE = 'The check expired.';
const TURNSTILE_FAILED_NOTE = 'The check could not load. Refresh the page and try again.';

function getInitialUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return normalizeWebsiteInput(
    new URLSearchParams(window.location.search).get('url') ?? ''
  );
}

async function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    throw new Error('Verification is only available in the browser.');
  }

  if (window.turnstile) {
    return window.turnstile;
  }

  if (!window.__agentmarkupTurnstileLoader) {
    window.__agentmarkupTurnstileLoader = new Promise<TurnstileApi>(
      (resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-agentmarkup-turnstile="true"]'
        );

        const handleLoad = () => {
          if (window.turnstile) {
            resolve(window.turnstile);
            return;
          }

          reject(new Error('Verification widget did not initialize.'));
        };

        const handleError = () => {
          reject(new Error('Verification widget could not be loaded.'));
        };

        if (existing) {
          existing.addEventListener('load', handleLoad, { once: true });
          existing.addEventListener('error', handleError, { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.agentmarkupTurnstile = 'true';
        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', handleError, { once: true });
        document.head.append(script);
      }
    );
  }

  return window.__agentmarkupTurnstileLoader;
}

type ViewSnapshot = Pick<
  SiteCheckState,
  'phase' | 'runId' | 'requestedUrl' | 'current' | 'error' | 'challenge' | 'fieldError' | 'fieldErrorNonce'
>;

function Checker() {
  const check = useSiteCheck();
  const { start, cancel, reset, submitToken, setChallengeNote } = check;
  const [targetUrl, setTargetUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrorEdited, setFieldErrorEdited] = useState(false);
  const landingInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const noticeHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const previousViewRef = useRef<ViewSnapshot | null>(null);
  const initialCheckStartedRef = useRef(false);

  const landingFieldError = fieldErrorEdited ? null : check.fieldError;

  // Back on the landing with a field error (a rejected `?url=`, or an address the
  // worker refused on a first scan): the input shows what was tried and the busy
  // button resets. Adjusted during render, keyed by run and address, so it runs
  // once per rejection and never overwrites later typing.
  const rejectedKey =
    check.phase === 'idle' && check.fieldError && check.requestedUrl
      ? `${check.runId}|${check.fieldErrorNonce}|${check.requestedUrl}`
      : null;
  const [seededRejectedKey, setSeededRejectedKey] = useState<string | null>(null);
  if (rejectedKey !== null && rejectedKey !== seededRejectedKey) {
    setSeededRejectedKey(rejectedKey);
    setTargetUrl(check.requestedUrl);
    setSubmitting(false);
  }

  // The landing's input keeps the cancelled URL, and the busy button resets,
  // because the landing remounts in the same commit as a cancel or reset.
  const actions: SiteCheckActions = {
    ...check,
    cancel() {
      if (!check.current) {
        setTargetUrl(check.requestedUrl);
        setSubmitting(false);
      }
      cancel();
    },
    reset() {
      setTargetUrl('');
      setSubmitting(false);
      reset();
    },
  };

  // `?url=` auto-run (spec 4.3). The ref guard keeps StrictMode's second effect
  // pass from starting a second request; no cleanup aborts the request.
  useEffect(() => {
    if (initialCheckStartedRef.current) {
      return;
    }

    const initialUrl = getInitialUrl();
    if (!initialUrl) {
      return;
    }

    initialCheckStartedRef.current = true;
    start(initialUrl, { source: 'auto' });
  }, [start]);

  // Scroll and focus (spec 9): one scroll to the top when a first scan starts
  // from the landing, focus without scrolling, nothing moves when results land.
  const { phase, runId, requestedUrl, current, error, challenge, fieldError, fieldErrorNonce } = check;
  const challengeWidgetKey = challenge?.widgetKey ?? null;
  useLayoutEffect(() => {
    const next: ViewSnapshot = { phase, runId, requestedUrl, current, error, challenge, fieldError, fieldErrorNonce };
    const previous = previousViewRef.current;
    previousViewRef.current = next;
    if (!previous) {
      return;
    }

    const focus = (element: HTMLElement | null) => element?.focus({ preventScroll: true });

    if (next.fieldError && (next.fieldError !== previous.fieldError || next.fieldErrorNonce !== previous.fieldErrorNonce)) {
      focus(next.phase === 'idle' ? landingInputRef.current : scanInputRef.current);
      return;
    }

    if (next.phase === 'scanning' && (previous.phase !== 'scanning' || previous.runId !== next.runId)) {
      if (!next.current) {
        if (previous.phase === 'idle' && window.scrollY > 0) {
          window.scrollTo({ top: 0 });
        }
        focus(headingRef.current);
      } else {
        const active = document.activeElement;
        if (!active || active === document.body || !active.isConnected) {
          focus(headingRef.current);
        }
      }
      return;
    }

    if (next.phase === 'challenged' && previous.phase !== 'challenged') {
      focus(noticeHeadingRef.current);
      return;
    }

    if (next.error && next.error !== previous.error && next.error.kind !== 'invalid') {
      focus(noticeHeadingRef.current);
      return;
    }

    if (next.phase === 'idle' && previous.phase !== 'idle') {
      if (!next.requestedUrl) {
        window.scrollTo({ top: 0 });
      }
      focus(landingInputRef.current);
      return;
    }

    if (
      previous.phase === 'scanning' &&
      next.phase === 'done' &&
      next.runId !== previous.runId &&
      next.current === previous.current
    ) {
      // A cancelled rescan: back to the ScanBar.
      focus(scanInputRef.current);
      return;
    }

    if (previous.phase === 'scanning' && next.phase === 'done' && previous.current && next.current !== previous.current) {
      // A rescan landed: focus stays put (spec 9), unless the control that held it
      // (a provisional report's inline Rescan) left with the old report.
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        focus(headingRef.current);
      }
    }
  }, [phase, runId, requestedUrl, current, error, challenge, fieldError, fieldErrorNonce]);

  const handleTurnstileToken = useEffectEvent((token: string) => {
    submitToken(token);
  });

  const handleTurnstileNote = useEffectEvent((note: string) => {
    setChallengeNote(note);
  });

  // Turnstile widget (spec 5.4): rendered into the challenge card, theme from
  // `data-theme` (read in the effect only), removed on cleanup.
  const challengeSiteKey = phase === 'challenged' ? challenge?.siteKey ?? null : null;
  useEffect(() => {
    const container = turnstileRef.current;
    if (!challengeSiteKey || !container) {
      return;
    }

    let cancelled = false;
    container.innerHTML = '';

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled) {
          return;
        }

        turnstileWidgetIdRef.current = turnstile.render(container, {
          sitekey: challengeSiteKey,
          action: 'public-scan',
          theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
          // Each callback belongs to this widget generation: once the challenge is
          // replaced or gone (cleanup ran), a late call changes nothing.
          callback: (token) => {
            if (!cancelled) handleTurnstileToken(token);
          },
          'expired-callback': () => {
            if (!cancelled) handleTurnstileNote(TURNSTILE_EXPIRED_NOTE);
          },
          'error-callback': () => {
            if (!cancelled) handleTurnstileNote(TURNSTILE_FAILED_NOTE);
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          handleTurnstileNote(TURNSTILE_FAILED_NOTE);
        }
      });

    return () => {
      cancelled = true;

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }

      container.innerHTML = '';
    };
  }, [challengeSiteKey, challengeWidgetKey]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setFieldErrorEdited(false);
    const normalized = normalizeWebsiteInput(targetUrl);
    if (isScannableUrl(normalized)) {
      // Commit the busy state before the shell replaces the landing, so the
      // button is never `disabled` and never shows a dead click.
      flushSync(() => {
        setSubmitting(true);
        setTargetUrl(normalized);
      });
    }
    start(normalized, { source: 'form' });
  }

  return (
    <main>
      {check.phase === 'idle' ? (
        <article className="doc-page checker-page">
          <section className="checker-start">
            <div className="checker-heading">
              <p className="section-kicker">Free website check</p>
              <h1>Check your website before AI crawlers and search engines do</h1>
              <p className="doc-intro checker-intro">
                See what machines can find, understand, and access, then get a clear next step.
              </p>
            </div>

            <div className="checker-panel">
              <form className="checker-form" onSubmit={handleSubmit} noValidate>
                <label className="checker-label" htmlFor="checker-url">
                  Enter your website address
                </label>
                <p className="checker-field-note" id="checker-url-help">
                  Any public page works. We automatically check the website root.
                </p>
                <div className="checker-form-row">
                  <input
                    id="checker-url"
                    ref={landingInputRef}
                    className="checker-input"
                    type="text"
                    placeholder="https://example.com"
                    value={targetUrl}
                    onChange={(event) => {
                      setTargetUrl(event.target.value);
                      setFieldErrorEdited(true);
                    }}
                    onBlur={() =>
                      setTargetUrl((currentUrl) => normalizeWebsiteInput(currentUrl))
                    }
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    aria-describedby={`checker-url-help${landingFieldError ? ' checker-url-error' : ''}`}
                    aria-invalid={Boolean(landingFieldError)}
                    required
                  />
                  <button
                    className={submitting ? 'checker-submit is-busy' : 'checker-submit'}
                    type="submit"
                    aria-disabled={submitting ? 'true' : undefined}
                  >
                    {submitting ? <><span className="checker-spinner" aria-hidden="true" />Scanning...</> : 'Check website'}
                  </button>
                </div>
                {landingFieldError ? <p className="field-error" id="checker-url-error" role="alert"><StatusIcon status="action" />{landingFieldError}</p> : null}
              </form>
              <p className="checker-promise">
                Free. No account. Usually under 10 seconds. You get a 0-100 score, what it means, and the three fixes worth the most.
              </p>
              <p className="checker-note">
                A 0-100 agent-readiness score from a published formula, no account. One homepage and one internal page are sampled. Also looking for public security issues? <a href="/security-scan/">Use the security scan</a>. <a href="/score/">How the score is computed</a>. <a href="/blog/website-checker/">How this check works</a>.
              </p>
            </div>
          </section>

          <section className="checker-goals-overview" aria-labelledby="checker-goals-title">
            <h2 id="checker-goals-title">What the report answers</h2>
            <ol className="checker-goals">
              {SKELETON_QUESTIONS.map((goal, index) => (
                <li key={goal.label}>
                  <span className="checker-goal-number" aria-hidden="true">{index + 1}</span>
                  <span className="checker-goal-question">{goal.question}</span>
                  <span className="checker-goal-label">{goal.label}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="checker-scope" aria-labelledby="checker-scope-title">
            <header className="checker-scope-heading">
              <h2 id="checker-scope-title">What this website checker checks</h2>
              <p>
                The check reads public signals already available on your website. It does not log in,
                change your pages, or install anything.
              </p>
            </header>

            <div className="checker-scope-grid">
              <article>
                <h3>Pages and discovery</h3>
                <p>
                  Your homepage, one internal page, the sitemap XML, the canonical URL, About,
                  Contact and Privacy links, and how a path that does not exist is answered.
                </p>
              </article>
              <article>
                <h3>Content and structured data</h3>
                <p>
                  Readable HTML without JavaScript, document structure and control labelling, and
                  the JSON-LD identity that helps search engines and AI systems interpret a page.
                </p>
              </article>
              <article>
                <h3>AI-readable files</h3>
                <p>
                  Public <code>llms.txt</code> files, markdown alternatives, and other machine-readable
                  versions advertised by the website.
                </p>
              </article>
              <article>
                <h3>Crawler access</h3>
                <p>
                  <code>robots.txt</code> access for AI search and agent user agents, bot-detection
                  challenges on the homepage, and Content-Signal declarations. Blocking training
                  crawlers is reported as a policy note and never lowers the score.
                </p>
              </article>
            </div>

            <aside className="checker-method" aria-labelledby="checker-method-title">
              <h3 id="checker-method-title">How the result is decided</h3>
              <p>
                Every finding is based on a response the checker received. The score is a
                deterministic 0-100 number computed from a published formula (catalog v{SCORE_CATALOG_VERSION}):
                every point is traceable to a check you can see, with no LLM, no heuristics and no
                off-site search. A check whose evidence did not arrive in time is left out of the score
                instead of lowering the number. The checker samples one homepage and one internal
                page, so it gives a useful first view without crawling your whole site.{' '}
                <a href="/score/">Read the methodology</a>.
              </p>
            </aside>
          </section>
          <ContextualFaq items={checkerFaqs} />
        </article>
      ) : (
        <ReportShell
          state={check}
          actions={actions}
          headingRef={headingRef}
          noticeHeadingRef={noticeHeadingRef}
          turnstileRef={turnstileRef}
          scanInputRef={scanInputRef}
        />
      )}
      <p className="sr-only" role="status" aria-live="polite">{check.announcement}</p>
    </main>
  );
}

export default Checker;
