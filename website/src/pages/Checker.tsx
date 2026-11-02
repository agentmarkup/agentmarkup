import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { SCORE_CATALOG_VERSION } from '@agentmarkup/core/score';

import { analyzeSiteCheck } from '../checker/analyze';
import { findingKey } from '../checker/check-copy';
import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import { StatusIcon } from '../ui/Status';
import {
  levelToStatus,
  statusLabels,
  verdictExplanationForGrade,
  verdictFromGrade,
} from '../ui/status-model';
import { FindingFilter, ResultCount } from '../ui/ToolResults';
import { ScorePanel } from '../ui/ScorePanel';
import { TopFixes } from '../ui/TopFixes';
import { ContextualFaq } from '../ui/ContextualFaq';
import { checkerFaqs } from '../data/page-faqs';
import type {
  AuditItem,
  CheckerErrorResponse,
  ResourceStatus,
  SiteAnalysis,
  SiteCheckResponse,
} from '../checker/types';

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

interface TurnstileChallengeState {
  siteKey: string;
  message: string;
  retryAfterSeconds: number | null;
}

class CheckerRequestError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'CheckerRequestError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class CheckerTurnstileError extends CheckerRequestError {
  siteKey: string;

  constructor(
    message: string,
    siteKey: string,
    retryAfterSeconds: number | null = null
  ) {
    super(message, retryAfterSeconds);
    this.name = 'CheckerTurnstileError';
    this.siteKey = siteKey;
  }
}

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

function formatRetryAfter(retryAfterSeconds: number | null): string | null {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) {
    return null;
  }

  if (retryAfterSeconds < 60) {
    return `Try again in about ${retryAfterSeconds} second${
      retryAfterSeconds === 1 ? '' : 's'
    }.`;
  }

  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

async function requestSiteCheck(
  rawUrl: string,
  turnstileToken?: string
): Promise<SiteCheckResponse> {
  const trimmedUrl = normalizeWebsiteInput(rawUrl);
  const response = await fetch('/api/check', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: trimmedUrl,
      turnstileToken,
    }),
  });

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(getCheckerApiError(response.status));
  }

  const payload = (await response.json()) as SiteCheckResponse &
    CheckerErrorResponse;
  if (!response.ok) {
    if (payload.turnstileRequired && payload.turnstileSiteKey) {
      throw new CheckerTurnstileError(
        payload.error ?? 'Additional verification is required.',
        payload.turnstileSiteKey,
        payload.retryAfterSeconds ?? null
      );
    }

    throw new CheckerRequestError(
      payload.error ?? `Checker request failed with HTTP ${response.status}`,
      payload.retryAfterSeconds ?? null
    );
  }

  return payload;
}

function getCheckerApiError(status: number): string {
  const isLocalhost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);

  if (isLocalhost) {
    return 'The checker API runs in the Cloudflare Pages worker. Plain Vite localhost does not serve /api/check. Test this on the deployed site or run the site through Cloudflare Pages local dev.';
  }

  if (status === 404) {
    return 'The checker API route was not found. Make sure the Pages worker is deployed alongside the website.';
  }

  return 'The checker API did not return JSON. Make sure the Pages worker is deployed and handling /api/check.';
}

function Checker() {
  const [targetUrl, setTargetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<SiteCheckResponse | null>(null);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [turnstileChallenge, setTurnstileChallenge] =
    useState<TurnstileChallengeState | null>(null);
  const [findingFilter, setFindingFilter] = useState<'all' | 'error' | 'warning' | 'pass'>('all');
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const justResetRef = useRef(false);
  const initialCheckStartedRef = useRef(false);

  const showResults = Boolean(analysis && result);
  const verdict = analysis
    ? verdictFromGrade(analysis.report.grade, analysis.report.analysisStatus)
    : null;
  const visibleItems = analysis
    ? analysis.items.filter((item) => findingFilter === 'all' || item.level === findingFilter)
    : [];

  // Move focus when the view switches so keyboard and screen-reader users are
  // not left on a control that just unmounted: to the results heading when
  // results appear, and back to the URL input after "Check another site".
  useEffect(() => {
    if (showResults) {
      resultsHeadingRef.current?.focus();
    } else if (justResetRef.current) {
      justResetRef.current = false;
      urlInputRef.current?.focus();
    }
  }, [showResults]);

  async function performCheck(rawUrl: string, turnstileToken?: string) {
    const trimmedUrl = normalizeWebsiteInput(rawUrl);
    if (!trimmedUrl) {
      setFieldError('Enter a public website URL to run the checker.');
      setError(null);
      setResult(null);
      setAnalysis(null);
      setTurnstileChallenge(null);
      return;
    }

    setLoading(true);
    setFieldError(null);
    setError(null);
    setFindingFilter('all');

    if (!turnstileToken) {
      setTurnstileChallenge(null);
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('url', trimmedUrl);
    window.history.replaceState({}, '', nextUrl);

    try {
      const payload = await requestSiteCheck(trimmedUrl, turnstileToken);
      const nextAnalysis = analyzeSiteCheck(payload);
      setResult(payload);
      setAnalysis(nextAnalysis);
      setTurnstileChallenge(null);
    } catch (caught) {
      if (caught instanceof CheckerTurnstileError) {
        setError(null);
        setResult(null);
        setAnalysis(null);
        setTurnstileChallenge({
          siteKey: caught.siteKey,
          message: caught.message,
          retryAfterSeconds: caught.retryAfterSeconds,
        });
        return;
      }

      const baseMessage =
        caught instanceof Error ? caught.message : 'The checker request failed.';
      const retryAfter =
        caught instanceof CheckerRequestError
          ? formatRetryAfter(caught.retryAfterSeconds)
          : null;
      const message = retryAfter ? `${baseMessage} ${retryAfter}` : baseMessage;

      setError(message);
      setResult(null);
      setAnalysis(null);
      setTurnstileChallenge(null);
    } finally {
      setLoading(false);
    }
  }

  const handleTurnstileToken = useEffectEvent((token: string) => {
    void performCheck(targetUrl, token);
  });

  const handleTurnstileRenderFailure = useEffectEvent((message: string) => {
    setError(message);
  });

  useEffect(() => {
    if (initialCheckStartedRef.current) {
      return;
    }

    const initialUrl = getInitialUrl();
    if (!initialUrl) {
      return;
    }

    initialCheckStartedRef.current = true;

    let cancelled = false;

    setTargetUrl(initialUrl);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('url', initialUrl.trim());
    window.history.replaceState({}, '', nextUrl);

    setLoading(true);
    setError(null);
    setFieldError(null);

    void requestSiteCheck(initialUrl)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setResult(payload);
        setAnalysis(analyzeSiteCheck(payload));
        setTurnstileChallenge(null);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }

        if (caught instanceof CheckerTurnstileError) {
          setError(null);
          setResult(null);
          setAnalysis(null);
          setTurnstileChallenge({
            siteKey: caught.siteKey,
            message: caught.message,
            retryAfterSeconds: caught.retryAfterSeconds,
          });
          return;
        }

        const retryAfter =
          caught instanceof CheckerRequestError
            ? formatRetryAfter(caught.retryAfterSeconds)
            : null;
        const message =
          caught instanceof Error ? caught.message : 'The checker request failed.';
        setError(retryAfter ? `${message} ${retryAfter}` : message);
        setResult(null);
        setAnalysis(null);
        setTurnstileChallenge(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const challenge = turnstileChallenge;
    const container = turnstileContainerRef.current;
    if (!challenge || !container) {
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
          sitekey: challenge.siteKey,
          action: 'public-scan',
          theme: 'auto',
          callback: (token) => {
            handleTurnstileToken(token);
          },
          'expired-callback': () => {
            handleTurnstileRenderFailure(
              'Verification expired. Complete the challenge again to rerun the checker.'
            );
          },
          'error-callback': () => {
            handleTurnstileRenderFailure(
              'Verification failed to load correctly. Refresh the page and try again.'
            );
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          handleTurnstileRenderFailure(
            'Verification could not be loaded right now. Please try again later.'
          );
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
  }, [turnstileChallenge]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performCheck(targetUrl);
  }

  function handleNewCheck() {
    justResetRef.current = true;
    setResult(null);
    setAnalysis(null);
    setError(null);
    setFieldError(null);
    setTargetUrl('');
    setTurnstileChallenge(null);
    setFindingFilter('all');
    window.scrollTo({ top: 0 });
  }

  return (
    <main>
      <article className="doc-page checker-page">
        {!showResults ? (
          <>
            <section className="checker-start">
              <div className="checker-heading">
                <p className="section-kicker">Free website check</p>
                <h1>Check your website before AI crawlers and search engines do</h1>
                <p className="doc-intro checker-intro">
                  See what machines can find, understand, and access, then get a clear next step.
                </p>
              </div>

              <div className="checker-panel">
                <form className="checker-form" onSubmit={handleSubmit} aria-busy={loading} noValidate>
                  <label className="checker-label" htmlFor="checker-url">
                    Enter your website address
                  </label>
                  <p className="checker-field-note" id="checker-url-help">
                    Any public page works. We automatically check the website root.
                  </p>
                  <div className="checker-form-row">
                    <input
                      id="checker-url"
                      ref={urlInputRef}
                      className="checker-input"
                      type="text"
                      placeholder="https://example.com"
                      value={targetUrl}
                      onChange={(event) => {
                        setTargetUrl(event.target.value);
                        if (fieldError) setFieldError(null);
                      }}
                      onBlur={() =>
                        setTargetUrl((currentUrl) => normalizeWebsiteInput(currentUrl))
                      }
                      inputMode="url"
                      autoComplete="url"
                      spellCheck={false}
                      aria-describedby={`checker-url-help${fieldError ? ' checker-url-error' : ''}`}
                      aria-invalid={Boolean(fieldError)}
                      required
                    />
                    <button className="checker-submit" type="submit" disabled={loading} aria-busy={loading}>
                      {loading ? <><span className="checker-spinner" aria-hidden="true" />Checking...</> : 'Check website'}
                    </button>
                  </div>
                  {fieldError ? <p className="field-error" id="checker-url-error" role="alert"><StatusIcon status="action" />{fieldError}</p> : null}
                </form>
                <p className="checker-note">
                  A 0-100 agent-readiness score from a published formula, no account. One homepage and one internal page are sampled. Also looking for public security issues? <a href="/security-scan/">Use the security scan</a>. <a href="/score/">How the score is computed</a>. <a href="/blog/website-checker/">How this check works</a>.
                </p>
              </div>
            </section>

        <section className="checker-answer-overview" aria-label="What the checker tells you">
          <div className="checker-answer-grid">
            <article>
              <span>Find</span>
                  <h2>Can AI find your site?</h2>
              <p>Checks your sitemap, discovery links, and public pages.</p>
            </article>
            <article>
              <span>Understand</span>
                  <h2>Can AI understand your pages?</h2>
              <p>Checks content, structured information, and machine-readable versions.</p>
            </article>
            <article>
              <span>Access</span>
                  <h2>Are your access rules clear?</h2>
              <p>Checks crawler rules and whether important AI services receive a usable response.</p>
            </article>
          </div>
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
              off-site search. A check whose evidence did not arrive in time leaves the denominator
              instead of lowering the number. The checker samples one homepage and one internal
              page, so it gives a useful first view without crawling your whole site.{' '}
              <a href="/score/">Read the methodology</a>.
            </p>
          </aside>
        </section>
        <ContextualFaq items={checkerFaqs} />
          </>
        ) : null}

        {showResults ? <h1>Check your website before AI crawlers and search engines do</h1> : null}

        {turnstileChallenge ? (
          <section className="checker-state checker-state-challenge" role="status" aria-live="polite">
            <h2>Verification required</h2>
            <p>{turnstileChallenge.message}</p>
            {formatRetryAfter(turnstileChallenge.retryAfterSeconds) ? (
              <p className="checker-note">
                {formatRetryAfter(turnstileChallenge.retryAfterSeconds)}
              </p>
            ) : null}
            <div className="checker-turnstile" ref={turnstileContainerRef} />
            <p className="checker-note">
              The checker only asks for this after repeated requests from the same IP. Completing it reruns the same check once.
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="checker-state checker-state-error" id="checker-error-message" role="alert">
            <h2>Checker request failed</h2>
            <p>{error}</p>
          </section>
        ) : null}

        {loading ? (
          <section className="checker-state" role="status" aria-live="polite">
            <h2>Fetching public metadata</h2>
            <p>The checker is requesting the homepage, markdown mirrors, llms.txt, robots.txt, the sitemap, a path that cannot exist, and one sampled internal page right now.</p>
          </section>
        ) : null}

        {analysis && result ? (
          <>
            <div className="checker-results-top">
              <button
                type="button"
                className="checker-action"
                onClick={handleNewCheck}
              >
                Check another site
              </button>
            </div>

            <ScorePanel
              report={analysis.report}
              siteName={siteNameOf(analysis.normalizedUrl)}
              onRerun={() => void performCheck(analysis.normalizedUrl)}
              rerunDisabled={loading}
            />

            <section className="checker-summary">
              <div>
                <h2 ref={resultsHeadingRef} tabIndex={-1}>
                  Results for {analysis.normalizedUrl}
                </h2>
                {verdict ? (
                  <div className={`overall-verdict overall-verdict-${verdict}`}>
                    <StatusIcon status={verdict} size={28} />
                    <div>
                      <p className="overall-verdict-label">{statusLabels[verdict]}</p>
                      <p>
                        {verdictExplanationForGrade(
                          analysis.report.grade,
                          analysis.report.analysisStatus,
                          analysis.report.blockedKind,
                          analysis.report.blockedReason
                        )}
                      </p>
                    </div>
                  </div>
                ) : null}
                <p className="checker-summary-text">
                  Checked at {new Date(result.fetchedAt).toLocaleString()}.
                  {analysis.normalizedFrom ? (
                    <>
                      {' '}
                      Input was normalized from <code>{analysis.normalizedFrom}</code> to the site root.
                    </>
                  ) : null}
                  {result.cache?.hit && result.cache.cachedAt ? (
                    <>
                      {' '}
                      Served from a short-term cache created at{' '}
                      <code>{new Date(result.cache.cachedAt).toLocaleString()}</code>.
                    </>
                  ) : null}
                  {typeof result.protection?.remainingChecks === 'number' ? (
                    <>
                      {' '}
                      {result.protection.remainingChecks} check
                      {result.protection.remainingChecks === 1 ? '' : 's'} remain in the
                      current IP window.
                    </>
                  ) : null}
                </p>
              </div>
              <div className="checker-counts" aria-label="Result counts">
                <ResultCount label="Action required" value={analysis.counts.error} level="error" />
                <ResultCount label="Needs attention" value={analysis.counts.warning} level="warning" />
                <ResultCount label="Looks good" value={analysis.counts.pass} level="pass" />
              </div>
            </section>

            <TopFixes report={analysis.report} />

            <section className="checker-findings">
              <h2>Findings</h2>
              <div className="finding-filters" aria-label="Filter findings">
                <FindingFilter active={findingFilter === 'all'} count={analysis.items.length} label="All" onClick={() => setFindingFilter('all')} />
                <FindingFilter active={findingFilter === 'error'} count={analysis.counts.error} label="Action required" onClick={() => setFindingFilter('error')} />
                <FindingFilter active={findingFilter === 'warning'} count={analysis.counts.warning} label="Needs attention" onClick={() => setFindingFilter('warning')} />
                <FindingFilter active={findingFilter === 'pass'} count={analysis.counts.pass} label="Looks good" onClick={() => setFindingFilter('pass')} />
              </div>
              <p className="sr-only" role="status" aria-live="polite">{visibleItems.length} finding{visibleItems.length === 1 ? '' : 's'} shown.</p>
              <div className="checker-finding-list">
                {visibleItems.length ? visibleItems.map((item) => (
                  <FindingCard key={findingKey(item)} item={item} />
                )) : <p className="finding-empty">No findings in this category.</p>}
              </div>
            </section>

            <details className="checker-technical-details">
              <summary>Technical details and resources</summary>
              <section className="checker-resources">
                {analysis.resources.map((resource) => (
                  <ResourceCard key={resource.key} resource={resource} />
                ))}
              </section>
            </details>
          </>
        ) : null}
      </article>
    </main>
  );
}

function siteNameOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function ResourceCard({ resource }: { resource: ResourceStatus }) {
  return (
    <article className={`checker-resource checker-resource-${resource.level}`}>
      <div className="checker-resource-top">
        <h3>{resource.label}</h3>
        <span className={`checker-resource-status checker-resource-status-${resource.level}`}>
          <StatusIcon status={levelToStatus(resource.level)} size={15} />
          {resource.status}
        </span>
      </div>
      {resource.url ? (
        <p className="checker-resource-url">
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            {resource.url}
          </a>
        </p>
      ) : null}
      <p className="checker-resource-detail">{resource.detail}</p>
      {resource.agentmarkupHelp ? (
        <p className="checker-agentmarkup-help">
          <strong>How agentmarkup helps:</strong> {resource.agentmarkupHelp}
        </p>
      ) : null}
    </article>
  );
}

function FindingCard({ item }: { item: AuditItem }) {
  return (
    <article className={`checker-finding checker-finding-${item.level}`} data-check-id={item.checkId ?? item.id}>
      <div className="checker-finding-top">
        <span className={`checker-level checker-level-${item.level}`}><StatusIcon status={levelToStatus(item.level)} size={15} />{statusLabels[levelToStatus(item.level)]}</span>
        <h3>{item.title}</h3>
      </div>
      <p className="checker-finding-detail"><strong>What happened:</strong> {item.detail}</p>
      <p className="checker-finding-action"><strong>What to do:</strong> {item.action}</p>
      {item.agentmarkupHelp ? (
        <p className="checker-agentmarkup-help">
          <strong>How agentmarkup helps:</strong> {item.agentmarkupHelp}
        </p>
      ) : null}
      {item.docUrl ? (
        <p className="checker-finding-doc">
          <a href={item.docUrl}>Relevant docs</a>
        </p>
      ) : null}
    </article>
  );
}

export default Checker;
