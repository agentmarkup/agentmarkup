import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import { analyzeSecurityScan } from '../security-scan/analyze';
import type {
  SecurityAuditItem,
  SecurityResourceStatus,
  SecurityScanAnalysis,
  SecurityScanErrorResponse,
  SecurityScanResponse,
} from '../security-scan/types';

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

class SecurityScanRequestError extends Error {
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'SecurityScanRequestError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class SecurityScanTurnstileError extends SecurityScanRequestError {
  siteKey: string;

  constructor(
    message: string,
    siteKey: string,
    retryAfterSeconds: number | null = null
  ) {
    super(message, retryAfterSeconds);
    this.name = 'SecurityScanTurnstileError';
    this.siteKey = siteKey;
  }
}

function getInitialUrl(): string {
  if (typeof window === 'undefined') return '';
  return normalizeWebsiteInput(
    new URLSearchParams(window.location.search).get('url') ?? ''
  );
}

async function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    throw new Error('Verification is only available in the browser.');
  }

  if (window.turnstile) return window.turnstile;

  if (!window.__agentmarkupTurnstileLoader) {
    window.__agentmarkupTurnstileLoader = new Promise<TurnstileApi>(
      (resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-agentmarkup-turnstile="true"]'
        );
        const handleLoad = () => {
          if (window.turnstile) {
            resolve(window.turnstile);
          } else {
            reject(new Error('Verification widget did not initialize.'));
          }
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
  if (!retryAfterSeconds || retryAfterSeconds <= 0) return null;
  if (retryAfterSeconds < 60) {
    return `Try again in about ${retryAfterSeconds} second${
      retryAfterSeconds === 1 ? '' : 's'
    }.`;
  }

  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

async function requestSecurityScan(
  rawUrl: string,
  turnstileToken?: string
): Promise<SecurityScanResponse> {
  const trimmedUrl = normalizeWebsiteInput(rawUrl);
  const response = await fetch('/api/security-scan', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ url: trimmedUrl, turnstileToken }),
  });

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(getSecurityScanApiError(response.status));
  }

  const payload = (await response.json()) as SecurityScanResponse &
    SecurityScanErrorResponse;
  if (!response.ok) {
    if (payload.turnstileRequired && payload.turnstileSiteKey) {
      throw new SecurityScanTurnstileError(
        payload.error ?? 'Additional verification is required.',
        payload.turnstileSiteKey,
        payload.retryAfterSeconds ?? null
      );
    }

    throw new SecurityScanRequestError(
      payload.error ?? `Security scan failed with HTTP ${response.status}`,
      payload.retryAfterSeconds ?? null
    );
  }

  return payload;
}

function getSecurityScanApiError(status: number): string {
  const isLocalhost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);

  if (isLocalhost) {
    return 'The security scan API runs in the Cloudflare Pages worker. Plain Vite localhost does not serve /api/security-scan. Test this on the deployed site or run the site through Cloudflare Pages local dev.';
  }
  if (status === 404) {
    return 'The security scan API route was not found. Make sure the Pages worker is deployed alongside the website.';
  }
  return 'The security scan API did not return JSON. Make sure the Pages worker is deployed and handling /api/security-scan.';
}

function SecurityScan() {
  const [targetUrl, setTargetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SecurityScanResponse | null>(null);
  const [analysis, setAnalysis] = useState<SecurityScanAnalysis | null>(null);
  const [turnstileChallenge, setTurnstileChallenge] =
    useState<TurnstileChallengeState | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  async function performScan(rawUrl: string, turnstileToken?: string) {
    const trimmedUrl = normalizeWebsiteInput(rawUrl);
    if (!trimmedUrl) {
      setError('Enter a public website URL to run the security scan.');
      setResult(null);
      setAnalysis(null);
      setTurnstileChallenge(null);
      return;
    }

    setLoading(true);
    setError(null);
    if (!turnstileToken) setTurnstileChallenge(null);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('url', trimmedUrl);
    window.history.replaceState({}, '', nextUrl);

    try {
      const payload = await requestSecurityScan(trimmedUrl, turnstileToken);
      setResult(payload);
      setAnalysis(analyzeSecurityScan(payload));
      setTurnstileChallenge(null);
    } catch (caught) {
      if (caught instanceof SecurityScanTurnstileError) {
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
        caught instanceof Error ? caught.message : 'The security scan failed.';
      const retryAfter =
        caught instanceof SecurityScanRequestError
          ? formatRetryAfter(caught.retryAfterSeconds)
          : null;
      setError(retryAfter ? `${baseMessage} ${retryAfter}` : baseMessage);
      setResult(null);
      setAnalysis(null);
      setTurnstileChallenge(null);
    } finally {
      setLoading(false);
    }
  }

  const handleTurnstileToken = useEffectEvent((token: string) => {
    void performScan(targetUrl, token);
  });

  const handleTurnstileRenderFailure = useEffectEvent((message: string) => {
    setError(message);
  });

  useEffect(() => {
    const initialUrl = getInitialUrl();
    if (!initialUrl) return;

    let cancelled = false;
    setTargetUrl(initialUrl);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('url', initialUrl.trim());
    window.history.replaceState({}, '', nextUrl);
    setLoading(true);
    setError(null);

    void requestSecurityScan(initialUrl)
      .then((payload) => {
        if (cancelled) return;
        setResult(payload);
        setAnalysis(analyzeSecurityScan(payload));
        setTurnstileChallenge(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (caught instanceof SecurityScanTurnstileError) {
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
          caught instanceof SecurityScanRequestError
            ? formatRetryAfter(caught.retryAfterSeconds)
            : null;
        const message =
          caught instanceof Error ? caught.message : 'The security scan failed.';
        setError(retryAfter ? `${message} ${retryAfter}` : message);
        setResult(null);
        setAnalysis(null);
        setTurnstileChallenge(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const challenge = turnstileChallenge;
    const container = turnstileContainerRef.current;
    if (!challenge || !container) return;

    let cancelled = false;
    container.innerHTML = '';

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        turnstileWidgetIdRef.current = turnstile.render(container, {
          sitekey: challenge.siteKey,
          theme: 'auto',
          callback: (token) => handleTurnstileToken(token),
          'expired-callback': () => {
            handleTurnstileRenderFailure(
              'Verification expired. Complete the challenge again to rerun the security scan.'
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
    void performScan(targetUrl);
  }

  return (
    <main>
      <article className="doc-page checker-page">
        <h1>Passive security scan for public websites</h1>
        <p className="doc-intro checker-intro">
          Inspect the public HTTPS response, defensive headers, cookies,
          embedded resources, security.txt, and basic email authentication.
          Findings are deterministic pass, warning, or error results with no
          score. Slow targets can produce partial results instead of blocking
          the whole report.
        </p>

        <section className="checker-panel">
          <form className="checker-form" onSubmit={handleSubmit}>
            <label className="checker-label" htmlFor="security-scan-url">
              Website URL
            </label>
            <p className="checker-field-note">
              Enter any public page URL. The scan normalizes it to the site root
              and always assesses the HTTPS site, even if you enter http://.
            </p>
            <div className="checker-form-row">
              <input
                id="security-scan-url"
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
                {loading ? 'Scanning...' : 'Run security scan'}
              </button>
            </div>
          </form>
          <p className="checker-note">
            This scan and the <a href="/checker/">website checker</a> share the
            same per-IP limit of 10 requests per 10 minutes. One complete scan
            counts as one request against that shared budget, not one request
            per internal fetch.
          </p>
        </section>

        <section className="checker-findings">
          <h2>Passive and authorized use only</h2>
          <div className="checker-finding-list">
            <article className="checker-finding checker-finding-pass">
              <p className="checker-finding-detail">
                This is a passive read of publicly served responses, not a
                penetration test or vulnerability scan. Only scan sites you own
                or are authorized to assess. Findings describe missing
                defense-in-depth headers, not proof of exploitability.
              </p>
            </article>
            <article className="checker-finding checker-finding-pass">
              <p className="checker-finding-detail">
                The scan sends ordinary GET requests to conventional public URLs
                and a few read-only DNS lookups. It does not enumerate paths,
                scan ports, send payloads, fuzz inputs, probe TLS, authenticate,
                or run a headless browser.
              </p>
            </article>
            <article className="checker-finding checker-finding-pass">
              <p className="checker-finding-detail">
                Requests use the fixed identifying user agent{' '}
                <code>agentmarkup-checker/... (+https://agentmarkup.dev)</code>.
                Nothing is hidden or spoofed; the traffic is browser-equivalent
                and identifies this service.
              </p>
            </article>
          </div>
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
              The scanner only asks for this after repeated requests from the
              same IP. Completing it reruns the same scan once.
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="checker-state checker-state-error">
            <h2>Security scan failed</h2>
            <p>{error}</p>
          </section>
        ) : null}

        {loading ? (
          <section className="checker-state">
            <h2>Reading public responses</h2>
            <p>
              The scanner is fetching the HTTPS homepage, checking the first
              HTTP response and security.txt, and requesting passive DNS data.
            </p>
          </section>
        ) : null}

        {analysis && result ? (
          <>
            <section className="checker-summary">
              <div>
                <h2>Results for {analysis.normalizedUrl}</h2>
                <p className="checker-summary-text">
                  Scanned at {new Date(result.fetchedAt).toLocaleString()}.
                  {analysis.normalizedFrom ? (
                    <>
                      {' '}
                      Input was normalized from{' '}
                      <code>{analysis.normalizedFrom}</code>. The scan assessed
                      the HTTPS site root.
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
                      {result.protection.remainingChecks} request
                      {result.protection.remainingChecks === 1 ? '' : 's'} remain
                      in the current shared IP window.
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
                  <FindingCard
                    key={`${item.level}-${item.title}-${index}`}
                    item={item}
                  />
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

function ResourceCard({ resource }: { resource: SecurityResourceStatus }) {
  return (
    <article className={`checker-resource checker-resource-${resource.level}`}>
      <div className="checker-resource-top">
        <h3>{resource.label}</h3>
        <span
          className={`checker-resource-status checker-resource-status-${resource.level}`}
        >
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
      {resource.explainer ? (
        <p className="checker-agentmarkup-help">
          <strong>What this means:</strong> {resource.explainer}
        </p>
      ) : null}
    </article>
  );
}

function FindingCard({ item }: { item: SecurityAuditItem }) {
  return (
    <article className={`checker-finding checker-finding-${item.level}`}>
      <div className="checker-finding-top">
        <span className={`checker-level checker-level-${item.level}`}>
          {item.level}
        </span>
        <h3>{item.title}</h3>
      </div>
      <p className="checker-finding-detail">{item.detail}</p>
      <p className="checker-agentmarkup-help">
        <strong>What this means:</strong> {item.explainer}
      </p>
      {item.docUrl ? (
        <p className="checker-finding-doc">
          <a href={item.docUrl}>Relevant docs</a>
        </p>
      ) : null}
    </article>
  );
}

export default SecurityScan;
