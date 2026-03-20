import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { analyzeSiteCheck } from '../checker/analyze';
import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
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
  const [result, setResult] = useState<SiteCheckResponse | null>(null);
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [turnstileChallenge, setTurnstileChallenge] =
    useState<TurnstileChallengeState | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  async function performCheck(rawUrl: string, turnstileToken?: string) {
    const trimmedUrl = normalizeWebsiteInput(rawUrl);
    if (!trimmedUrl) {
      setError('Enter a public website URL to run the checker.');
      setResult(null);
      setAnalysis(null);
      setTurnstileChallenge(null);
      return;
    }

    setLoading(true);
    setError(null);

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
    const initialUrl = getInitialUrl();
    if (!initialUrl) {
      return;
    }

    let cancelled = false;

    setTargetUrl(initialUrl);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('url', initialUrl.trim());
    window.history.replaceState({}, '', nextUrl);

    setLoading(true);
    setError(null);

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

  return (
    <main>
      <article className="doc-page checker-page">
        <h1>Check your website before AI crawlers and search engines do</h1>
        <p className="doc-intro checker-intro">
          The checker fetches your public homepage, markdown mirrors, <code>/llms.txt</code>, <code>/robots.txt</code>, and sitemap, then shows deterministic pass, warning, and error findings. It also follows at most one same-origin page link to see what a real LLM-style fetch would actually get. No score. No vague advice. Just the exact metadata, crawler, and thin-HTML issues that need fixing.
        </p>

        <section className="checker-panel">
          <form className="checker-form" onSubmit={handleSubmit}>
            <label className="checker-label" htmlFor="checker-url">
              Website URL
            </label>
            <p className="checker-field-note">
              Only the root website is checked first. Enter any public page URL
              and the checker will normalize it to the site root before
              fetching metadata.
            </p>
            <div className="checker-form-row">
              <input
                id="checker-url"
                className="checker-input"
                type="text"
                placeholder="https://example.com"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                onBlur={() =>
                  setTargetUrl((currentUrl) => normalizeWebsiteInput(currentUrl))
                }
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                required
              />
              <button className="checker-submit" type="submit" disabled={loading}>
                {loading ? 'Checking...' : 'Run checker'}
              </button>
            </div>
          </form>
          <p className="checker-note">
            The checker normalizes input to the site root and looks for homepage metadata, JSON-LD, markdown alternate links, llms.txt, robots.txt, sitemap discovery, and common AI crawler rules. It samples one internal link only, so it stays deterministic and does not flood the checked site.
          </p>
        </section>

        {turnstileChallenge ? (
          <section className="checker-state checker-state-challenge">
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
          <section className="checker-state checker-state-error">
            <h2>Checker request failed</h2>
            <p>{error}</p>
          </section>
        ) : null}

        {loading ? (
          <section className="checker-state">
            <h2>Fetching public metadata</h2>
            <p>The checker is requesting the homepage, markdown mirrors, llms.txt, robots.txt, sitemap, and one sampled internal page right now.</p>
          </section>
        ) : null}

        {analysis && result ? (
          <>
            <section className="checker-summary">
              <div>
                <h2>Results for {analysis.normalizedUrl}</h2>
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
                <ResultCount label="Errors" value={analysis.counts.error} level="error" />
                <ResultCount label="Warnings" value={analysis.counts.warning} level="warning" />
                <ResultCount label="Passes" value={analysis.counts.pass} level="pass" />
              </div>
            </section>

            <section className="checker-resources">
              {analysis.resources.map((resource) => (
                <ResourceCard key={resource.key} resource={resource} />
              ))}
            </section>

            <section className="checker-findings">
              <h2>Findings</h2>
              <div className="checker-finding-list">
                {analysis.items.map((item, index) => (
                  <FindingCard key={`${item.level}-${item.title}-${index}`} item={item} />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </article>
    </main>
  );
}

function ResultCount({
  label,
  value,
  level,
}: {
  label: string;
  value: number;
  level: 'error' | 'warning' | 'pass';
}) {
  return (
    <div className={`checker-count checker-count-${level}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ResourceCard({ resource }: { resource: ResourceStatus }) {
  return (
    <article className={`checker-resource checker-resource-${resource.level}`}>
      <div className="checker-resource-top">
        <h3>{resource.label}</h3>
        <span className={`checker-resource-status checker-resource-status-${resource.level}`}>
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
    <article className={`checker-finding checker-finding-${item.level}`}>
      <div className="checker-finding-top">
        <span className={`checker-level checker-level-${item.level}`}>{item.level}</span>
        <h3>{item.title}</h3>
      </div>
      <p className="checker-finding-detail">{item.detail}</p>
      <p className="checker-finding-action">{item.action}</p>
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
