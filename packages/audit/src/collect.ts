/**
 * `collectSiteEvidence`: the audit-side twin of the website checker worker's
 * fetch plan (`website/public/_worker.js`, `fetchCheckEvidence`). It records the
 * same eight resources with the same URL derivation (`@agentmarkup/core/score`
 * `discover.ts`), the same Accept headers, the same redirect caps (homepage 5,
 * sample page 3, secondaries 2, probe 0), the same 30-request budget and 25 s
 * deadline, the same allowlisted header capture, the same 404/410 body drop and
 * the same `classifyResource`, so `evaluateSiteChecks` returns identical
 * results for a site whichever side fetched it (`test/collect-parity.test.ts`).
 *
 * Two things the worker does not need: a per-host minimum gap between request
 * starts (one polite client over thousands of SMB sites) and a batch-flavoured
 * User-Agent. Neither changes what is recorded.
 */
import { createRequire } from 'node:module';
import {
  NOT_FOUND_PROBE_ACCEPT,
  NOT_FOUND_PROBE_PATH,
  buildMarkdownUrl,
  classifyResource,
  findFirstInternalLink,
  findMarkdownAlternateUrl,
  findSitemapUrl,
  resolveSameOriginUrl,
  type EvidenceResourceKey,
  type FetchSummary,
  type RemoteResource,
  type SiteEvidence,
} from '@agentmarkup/core/score';
import { isFetchableUrl } from './net.js';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** What an HTML client sends; the homepage and sample page keep it. */
export const HTML_ACCEPT =
  'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1';

export const HOMEPAGE_MAX_REDIRECTS = 5;
export const SAMPLE_PAGE_MAX_REDIRECTS = 3;
export const SECONDARY_MAX_REDIRECTS = 2;

/** Response headers copied onto each resource: an allowlist, never set-cookie. */
export const DISCOVERY_HEADER_NAMES = [
  'link',
  'vary',
  'cf-mitigated',
  'content-signal',
  'x-robots-tag',
  'last-modified',
  'content-length',
  'www-authenticate',
  'location',
] as const;
const DISCOVERY_HEADER_VALUE_MAX_CHARS = 512;

export const COLLECT_DEFAULTS = {
  /** Wall-clock budget for one site. */
  deadlineMs: 25_000,
  /** Budget for one resource, redirects included. */
  perFetchMs: 10_000,
  /** In-flight requests on the target at once. */
  maxConcurrent: 4,
  /** Minimum gap between request starts to one hostname. */
  minGapMs: 1000,
  /** Hard stop on `fetch()` calls per site. */
  maxFetches: 30,
  maxResponseBytes: 5 * 1024 * 1024,
} as const;

const CHECK_RESOURCE_KEYS: EvidenceResourceKey[] = [
  'homepage',
  'homepageMarkdown',
  'llmsTxt',
  'robotsTxt',
  'sitemap',
  'notFoundProbe',
  'samplePage',
  'samplePageMarkdown',
];

export const INVALID_TARGET_MESSAGE = 'Enter a public http:// or https:// website URL.';

/** A rejected target: empty, not http(s), credentials, a blocked host or port. */
export class InvalidTargetUrlError extends Error {
  constructor(message = INVALID_TARGET_MESSAGE) {
    super(message);
    this.name = 'InvalidTargetUrlError';
  }
}

function resolvePackageVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const COLLECTOR_VERSION = resolvePackageVersion();
export const COLLECTOR_USER_AGENT = `agentmarkup-checker/${COLLECTOR_VERSION} (+https://agentmarkup.dev; batch)`;

export interface HostGate {
  /**
   * Resolves when a request to `hostname` may start. With a `deadline` (epoch
   * ms), a slot that would start at or after it is not reserved and the call
   * resolves `false` at once instead of waiting; otherwise it resolves `true`
   * (a gate that resolves nothing counts as admitted).
   */
  wait(hostname: string, deadline?: number): Promise<boolean | void>;
}

type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Keeps request starts to one hostname at least `minGapMs` apart. Share one gate
 * across sites (the batch does) so two agencies on one host stay polite too.
 */
export function createHostGate(
  minGapMs: number,
  now: () => number = Date.now,
  sleep: Sleep = defaultSleep
): HostGate {
  const nextAllowed = new Map<string, number>();
  return {
    async wait(hostname: string, deadline?: number): Promise<boolean> {
      const current = now();
      if (deadline !== undefined && current >= deadline) return false;
      if (minGapMs <= 0) return true;
      const key = hostname.toLowerCase();
      const slot = Math.max(current, nextAllowed.get(key) ?? 0);
      // Refused before reserving: a queued slot past the run deadline would
      // hold the run past its advertised budget and push later requests back.
      if (deadline !== undefined && slot >= deadline) return false;
      nextAllowed.set(key, slot + minGapMs);
      if (slot > current) {
        await sleep(slot - current);
      }
      return true;
    },
  };
}

export interface FetchBudget {
  fetches: number;
  maxFetches: number;
}

export interface CollectOptions {
  /** Raw fetch, injected for tests; defaults to `globalThis.fetch`. */
  fetchImpl?: FetchLike;
  deadlineMs?: number;
  perFetchMs?: number;
  maxConcurrent?: number;
  minGapMs?: number;
  maxFetches?: number;
  maxResponseBytes?: number;
  /** Pin the sample page (a previous run's `fetchSummary.samplePageUrl`). */
  samplePageUrl?: string | null;
  /** Recorded timestamp; defaults to the clock at the start of the run. */
  fetchedAt?: string;
  userAgent?: string;
  /** A gate shared across sites; a private one is created when absent. */
  hostGate?: HostGate;
  /** Clock, for tests. */
  now?: () => number;
}

export type CollectedEvidence = SiteEvidence & { fetchSummary: FetchSummary };

interface ResolvedOptions {
  fetchImpl: FetchLike;
  deadlineMs: number;
  perFetchMs: number;
  maxConcurrent: number;
  minGapMs: number;
  maxFetches: number;
  maxResponseBytes: number;
  samplePageUrl: string | null;
  fetchedAt: string | null;
  userAgent: string;
  hostGate: HostGate;
  now: () => number;
}

function resolveOptions(options: CollectOptions): ResolvedOptions {
  const now = options.now ?? Date.now;
  const minGapMs = options.minGapMs ?? COLLECT_DEFAULTS.minGapMs;
  const fetchImpl =
    options.fetchImpl ??
    ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  return {
    fetchImpl,
    deadlineMs: options.deadlineMs ?? COLLECT_DEFAULTS.deadlineMs,
    perFetchMs: options.perFetchMs ?? COLLECT_DEFAULTS.perFetchMs,
    maxConcurrent: options.maxConcurrent ?? COLLECT_DEFAULTS.maxConcurrent,
    minGapMs,
    maxFetches: options.maxFetches ?? COLLECT_DEFAULTS.maxFetches,
    maxResponseBytes: options.maxResponseBytes ?? COLLECT_DEFAULTS.maxResponseBytes,
    samplePageUrl: options.samplePageUrl ?? null,
    fetchedAt: options.fetchedAt ?? null,
    userAgent: options.userAgent ?? COLLECTOR_USER_AGENT,
    hostGate: options.hostGate ?? createHostGate(minGapMs, now),
    now,
  };
}

/**
 * The worker's `normalizePublicUrl`: scheme defaulted to https, http(s) only, no
 * credentials, no blocked host, no non-default port, path reset to the root.
 */
export function normalizeTargetUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidTargetUrlError();
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new InvalidTargetUrlError();
  }
  if (parsed.username || parsed.password || !isFetchableUrl(parsed)) {
    throw new InvalidTargetUrlError();
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '/';
  return parsed.toString();
}

function toSiteRootUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '/';
  return parsed.toString();
}

/** A small FIFO semaphore: at most `maxConcurrent` tasks run at once. */
export function createLimiter(maxConcurrent: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active += 1;
    const start = queue.shift();
    start?.();
  };
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}

function mapFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message === 'timeout') {
      return 'Request timed out.';
    }
    if (
      error.message === 'Response exceeded the checker size limit.' ||
      error.message === 'Request was blocked by checker safety rules.' ||
      error.message === 'Too many redirects.' ||
      error.message === 'Request timed out.' ||
      error.message === 'Checker time budget exhausted.' ||
      error.message === 'Checker request budget exhausted.'
    ) {
      return error.message;
    }
  }
  return 'Request failed.';
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A body that cannot be cancelled was already consumed or closed.
  }
}

/**
 * Reads at most `maxResponseBytes`. Every early rejection (an oversized
 * Content-Length, the cap crossed mid-stream, a read that throws) cancels the
 * body before rethrowing, so no stream stays open after the limiter slot that
 * started it is released.
 */
async function readBoundedBody(
  response: Response,
  maxResponseBytes: number
): Promise<{ text: string; bytes: number }> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      await cancelResponseBody(response);
      throw new Error('Response exceeded the checker size limit.');
    }
  }
  if (!response.body) {
    return { text: '', bytes: 0 };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        throw new Error('Response exceeded the checker size limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    try {
      // The reader holds the stream lock, so cancel through it.
      await reader.cancel();
    } catch {
      // An errored stream is already closed.
    }
    throw error;
  }
  text += decoder.decode();
  return { text, bytes: totalBytes };
}

function captureDiscoveryHeaders(headers: Headers): Record<string, string> {
  const captured: Record<string, string> = {};
  for (const name of DISCOVERY_HEADER_NAMES) {
    const value = headers.get(name);
    if (value === null || value === '') continue;
    captured[name] =
      value.length > DISCOVERY_HEADER_VALUE_MAX_CHARS
        ? value.slice(0, DISCOVERY_HEADER_VALUE_MAX_CHARS)
        : value;
  }
  return captured;
}

export interface ResourceFetchOptions extends CollectOptions {
  maxRedirects?: number;
  accept?: string;
  /** Shared across the resources of one site; a fresh one is created when absent. */
  budget?: FetchBudget;
  /** Start of the site run, for the shared deadline; defaults to the call time. */
  runStartedAt?: number;
}

interface Trace {
  startedAt: number;
  hops: number;
  started: boolean;
}

function finalize(
  resource: Omit<RemoteResource, 'durationMs' | 'hops' | 'outcome' | 'headers'>,
  response: Response | null,
  trace: Trace,
  now: () => number
): RemoteResource {
  const result: RemoteResource = {
    ...resource,
    durationMs: now() - trace.startedAt,
    hops: trace.hops,
  };
  if (!trace.started) {
    result.skipped = true;
  }
  result.headers = response ? captureDiscoveryHeaders(response.headers) : {};
  if ((result.status === 404 || result.status === 410) && typeof result.body === 'string') {
    result.body = null;
    result.bodyDropped = true;
  }
  result.outcome = classifyResource(result);
  return result;
}

/**
 * Fetches one resource the way the worker's `fetchText` does: manual redirects
 * re-validated per hop (http(s), no blocked host, default port only), a
 * per-resource timeout capped by the run deadline, a shared request budget, the
 * allowlisted headers, the 404/410 body drop and the outcome classification.
 * Never rejects: every failure is a `status 0` resource with the worker's error
 * string, so `Promise.all` over resources is safe.
 */
export async function fetchResource(
  targetUrl: string,
  options: ResourceFetchOptions = {}
): Promise<RemoteResource> {
  const resolved = resolveOptions(options);
  const { now, fetchImpl, hostGate } = resolved;
  const budget: FetchBudget = options.budget ?? { fetches: 0, maxFetches: resolved.maxFetches };
  const maxRedirects = options.maxRedirects ?? HOMEPAGE_MAX_REDIRECTS;
  const accept = options.accept ?? HTML_ACCEPT;
  const startedAt = now();
  const runStartedAt = options.runStartedAt ?? startedAt;
  // The per-resource budget starts when the first request is sent, after the
  // polite host-gate wait, so queueing behind other requests to the same host
  // never eats the transport time a slow page needs. The run deadline still
  // counts wall-clock from the run start, gate waits included.
  let invocationDeadline = startedAt + resolved.perFetchMs;
  const trace: Trace = { startedAt, hops: 0, started: false };
  const remaining = () => ({
    global: resolved.deadlineMs - (now() - runStartedAt),
    invocation: invocationDeadline - now(),
  });
  const assertTime = () => {
    const left = remaining();
    if (left.global <= 0) throw new Error('Checker time budget exhausted.');
    if (left.invocation <= 0) throw new Error('Request timed out.');
    return left;
  };

  try {
    let currentUrl = targetUrl;
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      trace.hops = redirectCount;
      assertTime();

      const parsed = new URL(currentUrl);
      if (!isFetchableUrl(parsed)) {
        throw new Error('Request was blocked by checker safety rules.');
      }
      if (budget.fetches >= budget.maxFetches) {
        throw new Error('Checker request budget exhausted.');
      }
      // Deadline-aware admission: a host-gate slot that would start after the
      // run deadline is refused instead of awaited, so the run never waits
      // past its budget; the resource reports the budget error (and, before
      // its first request, `skipped`).
      const admitted = await hostGate.wait(parsed.hostname, runStartedAt + resolved.deadlineMs);
      if (admitted === false) {
        throw new Error('Checker time budget exhausted.');
      }
      if (redirectCount === 0) {
        trace.startedAt = now();
        invocationDeadline = trace.startedAt + resolved.perFetchMs;
      }
      const left = assertTime();
      // Re-checked after the await: concurrent resources must not all pass one
      // check and then all count. Counted only when a request is actually
      // sent, so fetchSummary.fetches equals the number of fetch() calls.
      if (budget.fetches >= budget.maxFetches) {
        throw new Error('Checker request budget exhausted.');
      }
      budget.fetches += 1;
      trace.started = true;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(left.invocation, left.global));
      try {
        const response = await fetchImpl(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': resolved.userAgent, accept },
        });

        try {
          if (response.status >= 300 && response.status < 400) {
            // A resource that follows no redirects (the not-found probe) reports
            // the 3xx it received as its completed answer, with or without a
            // Location header (kept through the discovery headers when present),
            // before the missing-Location failure a followed chain gets. Same
            // order as the worker's fetchText.
            if (maxRedirects === 0) {
              await cancelResponseBody(response);
              return finalize(
                {
                  requestedUrl: targetUrl,
                  finalUrl: currentUrl,
                  status: response.status,
                  ok: false,
                  contentType: response.headers.get('content-type'),
                  body: null,
                  xRobotsTag: response.headers.get('x-robots-tag'),
                },
                response,
                trace,
                now
              );
            }
            const location = response.headers.get('location');
            if (!location) {
              await cancelResponseBody(response);
              return finalize(
                {
                  requestedUrl: targetUrl,
                  finalUrl: currentUrl,
                  status: response.status,
                  ok: false,
                  contentType: response.headers.get('content-type'),
                  body: null,
                  xRobotsTag: response.headers.get('x-robots-tag'),
                  error: 'Redirect response had no Location header.',
                },
                response,
                trace,
                now
              );
            }
            let nextUrl: URL;
            try {
              nextUrl = new URL(location, currentUrl);
            } catch {
              throw new Error('Request was blocked by checker safety rules.');
            }
            if (!isFetchableUrl(nextUrl)) {
              throw new Error('Request was blocked by checker safety rules.');
            }
            await cancelResponseBody(response);
            currentUrl = nextUrl.toString();
            continue;
          }

          // Metadata before the body: a body-read failure keeps status, final URL
          // and headers so transport checks still run (partial results).
          let body: string | null = null;
          let bodyBytes: number | undefined;
          let bodyError: string | undefined;
          try {
            const read = await readBoundedBody(response, resolved.maxResponseBytes);
            body = read.text;
            bodyBytes = read.bytes;
          } catch (error) {
            bodyError = mapFetchError(error);
          }
          return finalize(
            {
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              status: response.status,
              ok: response.ok,
              contentType: response.headers.get('content-type'),
              body,
              xRobotsTag: response.headers.get('x-robots-tag'),
              ...(bodyError ? { error: bodyError } : {}),
              ...(bodyBytes === undefined ? {} : { bodyBytes }),
            },
            response,
            trace,
            now
          );
        } catch (error) {
          // Any throw after the response arrived (a blocked or unparseable
          // redirect target) releases the body before the error propagates.
          await cancelResponseBody(response);
          throw error;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return finalize(
      {
        requestedUrl: targetUrl,
        finalUrl: currentUrl,
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        xRobotsTag: null,
        error: 'Too many redirects.',
      },
      null,
      trace,
      now
    );
  } catch (error) {
    const mapped = mapFetchError(error);
    const starved = mapped === 'Request timed out.' && remaining().global <= 0;
    return finalize(
      {
        requestedUrl: targetUrl,
        finalUrl: targetUrl,
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        xRobotsTag: null,
        error: starved ? 'Checker time budget exhausted.' : mapped,
      },
      null,
      trace,
      now
    );
  }
}

/**
 * Whether a resource counts as unverified for the fetch summary, so the summary
 * status always equals the score engine's analysisStatus. Outcome `unverified`
 * counts. A challenged resource is a measured answer, with one exception the
 * engine makes too: a not-found probe that answers 429/503 with challenge
 * markers leaves nav.not-found unverified ('probe-challenged'), so it counts
 * and refetchUnverified retries it. A 401/403 challenged probe scores
 * nav.not-found as a measured fail and does not count. classifyResource stays
 * unchanged; same rule as the worker's isUnverifiedForSummary.
 */
export function isUnverifiedForSummary(key: EvidenceResourceKey, resource: RemoteResource): boolean {
  if (resource.outcome === 'unverified') return true;
  return (
    key === 'notFoundProbe' &&
    resource.outcome === 'challenge' &&
    resource.status !== 401 &&
    resource.status !== 403
  );
}

/**
 * Whether the run is `blocked`, exactly when evaluateSiteChecks blocks it: the
 * homepage is unverified (a re-run may succeed), or its final answer is a
 * non-2xx other than 401/403 (404, 410, 400, ...: nothing to score). A 401, a
 * 403 or a challenge page is scored, so it does not block. Same rule as the
 * worker's isBlockedHomepage.
 */
export function isBlockedHomepage(homepage: RemoteResource): boolean {
  return (
    homepage.outcome === 'unverified' ||
    homepage.outcome === 'not-found' ||
    (homepage.outcome === 'http-error' && homepage.status !== 401 && homepage.status !== 403)
  );
}

function buildFetchSummary(
  evidence: Omit<SiteEvidence, 'fetchSummary'>,
  samplePageUrl: string | null,
  elapsedMs: number,
  budget: FetchBudget
): FetchSummary {
  const unverified: string[] = [];
  let hops = 0;
  for (const key of CHECK_RESOURCE_KEYS) {
    const resource = evidence[key];
    if (!resource) continue;
    hops += resource.hops ?? 0;
    if (isUnverifiedForSummary(key, resource)) unverified.push(key);
  }
  const analysisStatus = isBlockedHomepage(evidence.homepage)
    ? 'blocked'
    : unverified.length > 0
      ? 'partial'
      : 'complete';
  return { analysisStatus, unverified, elapsedMs, fetches: budget.fetches, hops, samplePageUrl };
}

/** The sitemap a run fetches: the one robots.txt declares, else /sitemap.xml. */
function discoverSitemap(
  robotsTxt: RemoteResource,
  targetUrl: string
): { sitemapUrl: string; sitemapSource: 'robots' | 'default' } {
  const declared =
    robotsTxt.ok && robotsTxt.body ? findSitemapUrl(robotsTxt.body, targetUrl) : null;
  return {
    sitemapUrl: declared ?? new URL('/sitemap.xml', targetUrl).toString(),
    sitemapSource: declared ? 'robots' : 'default',
  };
}

/** The sample page's markdown URL: its alternate link, else the `.md` twin of its final URL. */
function discoverSampleMarkdownUrl(samplePage: RemoteResource, samplePageUrl: string): string {
  const base = samplePage.finalUrl || samplePageUrl;
  return (
    (samplePage.ok && samplePage.body ? findMarkdownAlternateUrl(samplePage.body, base) : null) ??
    buildMarkdownUrl(base)
  );
}

/**
 * Records the eight checker resources for one site: homepage first (it decides
 * the final origin, the markdown alternate link and the sample page), then one
 * wave through a semaphore of `maxConcurrent` with robots.txt submitted first,
 * the sitemap chained off robots.txt and the sample markdown off the sample page.
 */
export async function collectSiteEvidence(
  input: string,
  options: CollectOptions = {}
): Promise<CollectedEvidence> {
  const resolved = resolveOptions(options);
  const normalized = normalizeTargetUrl(input);
  const runStartedAt = resolved.now();
  const fetchedAt = resolved.fetchedAt ?? new Date(runStartedAt).toISOString();
  const budget: FetchBudget = { fetches: 0, maxFetches: resolved.maxFetches };
  const shared: ResourceFetchOptions = {
    ...options,
    hostGate: resolved.hostGate,
    now: resolved.now,
    fetchImpl: resolved.fetchImpl,
    budget,
    runStartedAt,
  };

  const homepage = await fetchResource(normalized, {
    ...shared,
    maxRedirects: HOMEPAGE_MAX_REDIRECTS,
  });
  const targetUrl = toSiteRootUrl(homepage.finalUrl || normalized);
  const homepageBase = homepage.finalUrl || targetUrl;
  const hasHtml = homepage.ok && Boolean(homepage.body);
  const homepageMarkdownUrl =
    (hasHtml ? findMarkdownAlternateUrl(homepage.body ?? '', homepageBase) : null) ??
    buildMarkdownUrl(targetUrl);
  const pinned = resolved.samplePageUrl
    ? resolveSameOriginUrl(resolved.samplePageUrl, homepageBase)
    : null;
  const samplePageUrl =
    pinned ?? (hasHtml ? findFirstInternalLink(homepage.body ?? '', homepageBase) : null);

  const limit = createLimiter(resolved.maxConcurrent);
  const secondary: ResourceFetchOptions = { ...shared, maxRedirects: SECONDARY_MAX_REDIRECTS };
  const run = (resourceUrl: string, fetchOptions: ResourceFetchOptions) =>
    limit(() => fetchResource(resourceUrl, fetchOptions));

  const robotsPromise = run(new URL('/robots.txt', targetUrl).toString(), secondary);
  const probePromise = run(new URL(NOT_FOUND_PROBE_PATH, targetUrl).toString(), {
    ...shared,
    maxRedirects: 0,
    accept: NOT_FOUND_PROBE_ACCEPT,
  });
  const llmsPromise = run(new URL('/llms.txt', targetUrl).toString(), secondary);
  const homepageMarkdownPromise = run(homepageMarkdownUrl, secondary);
  const samplePromise: Promise<RemoteResource | null> = samplePageUrl
    ? run(samplePageUrl, { ...shared, maxRedirects: SAMPLE_PAGE_MAX_REDIRECTS })
    : Promise.resolve(null);
  const sitemapPromise = robotsPromise.then((robotsTxt) => {
    const { sitemapUrl, sitemapSource } = discoverSitemap(robotsTxt, targetUrl);
    return run(sitemapUrl, secondary).then((sitemap) => ({ sitemap, sitemapUrl, sitemapSource }));
  });
  const sampleMarkdownPromise = samplePromise.then((samplePage) => {
    if (!samplePage || !samplePageUrl) return null;
    return run(discoverSampleMarkdownUrl(samplePage, samplePageUrl), secondary);
  });

  const [robotsTxt, notFoundProbe, llmsTxt, homepageMarkdown, samplePage, sitemapResult, samplePageMarkdown] =
    await Promise.all([
      robotsPromise,
      probePromise,
      llmsPromise,
      homepageMarkdownPromise,
      samplePromise,
      sitemapPromise,
      sampleMarkdownPromise,
    ]);

  const evidence: Omit<SiteEvidence, 'fetchSummary'> = {
    targetUrl,
    origin: new URL(targetUrl).origin,
    fetchedAt,
    normalizedFrom: input.trim() && input.trim() !== targetUrl ? input.trim() : null,
    homepage,
    homepageMarkdown,
    llmsTxt,
    robotsTxt,
    sitemap: sitemapResult.sitemap,
    sitemapUrl: sitemapResult.sitemapUrl,
    sitemapSource: sitemapResult.sitemapSource,
    notFoundProbe,
    samplePage,
    samplePageMarkdown,
  };
  const fetchSummary = buildFetchSummary(
    evidence,
    samplePageUrl,
    resolved.now() - runStartedAt,
    budget
  );
  return { ...evidence, fetchSummary };
}

export interface RefetchOptions extends CollectOptions {
  /** Retry passes over the unverified resources (default 2). */
  attempts?: number;
  /** Pause before each pass (default 20 s). */
  waitMs?: number;
  sleep?: Sleep;
}

function redirectCapFor(key: EvidenceResourceKey): { maxRedirects: number; accept?: string } {
  switch (key) {
    case 'homepage':
      return { maxRedirects: HOMEPAGE_MAX_REDIRECTS };
    case 'samplePage':
      return { maxRedirects: SAMPLE_PAGE_MAX_REDIRECTS };
    case 'notFoundProbe':
      return { maxRedirects: 0, accept: NOT_FOUND_PROBE_ACCEPT };
    default:
      return { maxRedirects: SECONDARY_MAX_REDIRECTS };
  }
}

/**
 * Retries the resources that did not complete, `attempts` times with `waitMs`
 * between passes, before a partial reading is accepted (the summary's
 * `unverified` list, so a 429/503 challenged not-found probe is retried too). A retried
 * resource replaces the recorded one only when it completed by the same rule. An unverified homepage re-collects the whole site, because the
 * other resources depend on its final URL. A recovered robots.txt re-derives
 * the sitemap URL and a recovered sample page its markdown URL, exactly as a
 * fresh run chains them; a dependent whose URL changed is refetched and its
 * result replaces the stale record whatever the outcome. Returns a new
 * evidence object.
 */
export async function refetchUnverified(
  evidence: CollectedEvidence,
  options: RefetchOptions = {}
): Promise<CollectedEvidence> {
  const attempts = options.attempts ?? 2;
  const waitMs = options.waitMs ?? 20_000;
  const sleep = options.sleep ?? defaultSleep;
  const resolved = resolveOptions(options);
  let current = evidence;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pending = current.fetchSummary.unverified as EvidenceResourceKey[];
    if (pending.length === 0) break;
    await sleep(waitMs);

    if (pending.includes('homepage')) {
      const again = await collectSiteEvidence(current.targetUrl, {
        ...options,
        fetchedAt: current.fetchedAt,
        samplePageUrl: options.samplePageUrl ?? current.fetchSummary.samplePageUrl ?? null,
      });
      current = {
        ...again,
        fetchSummary: {
          ...again.fetchSummary,
          elapsedMs: (current.fetchSummary.elapsedMs ?? 0) + (again.fetchSummary.elapsedMs ?? 0),
          fetches: (current.fetchSummary.fetches ?? 0) + (again.fetchSummary.fetches ?? 0),
        },
      };
      continue;
    }

    const budget: FetchBudget = { fetches: 0, maxFetches: resolved.maxFetches };
    const runStartedAt = resolved.now();
    const next: CollectedEvidence = { ...current };
    const recovered = new Set<EvidenceResourceKey>();
    const retry = (url: string, key: EvidenceResourceKey) =>
      fetchResource(url, {
        ...options,
        hostGate: resolved.hostGate,
        now: resolved.now,
        fetchImpl: resolved.fetchImpl,
        budget,
        runStartedAt,
        ...redirectCapFor(key),
      });
    const retryInPlace = async (key: EvidenceResourceKey) => {
      const previous = current[key];
      if (!previous) return;
      const retried = await retry(previous.requestedUrl, key);
      if (!isUnverifiedForSummary(key, retried)) {
        next[key] = retried;
        recovered.add(key);
      }
    };

    // Parents first: the sitemap URL comes from robots.txt and the sample
    // markdown URL from the sample page, so each dependent is re-derived after
    // its parent with the same helpers a fresh run uses.
    for (const key of pending) {
      if (key === 'sitemap' || key === 'samplePageMarkdown') continue;
      await retryInPlace(key);
    }

    if (recovered.has('robotsTxt')) {
      const { sitemapUrl, sitemapSource } = discoverSitemap(next.robotsTxt, next.targetUrl);
      next.sitemapSource = sitemapSource;
      if (sitemapUrl !== (current.sitemapUrl ?? current.sitemap?.requestedUrl ?? null)) {
        // The recorded sitemap answers a URL a fresh run would not ask for, so
        // the rediscovered one replaces it whatever its outcome (an unverified
        // result is retried by the next pass).
        next.sitemap = await retry(sitemapUrl, 'sitemap');
        next.sitemapUrl = sitemapUrl;
      } else if (pending.includes('sitemap')) {
        await retryInPlace('sitemap');
      }
    } else if (pending.includes('sitemap')) {
      await retryInPlace('sitemap');
    }

    const samplePageUrl = current.fetchSummary.samplePageUrl ?? current.samplePage?.requestedUrl ?? null;
    if (recovered.has('samplePage') && next.samplePage && samplePageUrl) {
      const markdownUrl = discoverSampleMarkdownUrl(next.samplePage, samplePageUrl);
      if (markdownUrl !== (current.samplePageMarkdown?.requestedUrl ?? null)) {
        next.samplePageMarkdown = await retry(markdownUrl, 'samplePageMarkdown');
      } else if (pending.includes('samplePageMarkdown')) {
        await retryInPlace('samplePageMarkdown');
      }
    } else if (pending.includes('samplePageMarkdown')) {
      await retryInPlace('samplePageMarkdown');
    }
    const { fetchSummary: previousSummary, ...rest } = next;
    const fetchSummary = buildFetchSummary(
      rest,
      previousSummary.samplePageUrl ?? null,
      (previousSummary.elapsedMs ?? 0) + (resolved.now() - runStartedAt),
      { fetches: (previousSummary.fetches ?? 0) + budget.fetches, maxFetches: budget.maxFetches }
    );
    current = { ...rest, fetchSummary };
  }
  return current;
}

/** The evidence without bodies, for files on disk and reports (never raw HTML). */
export function stripEvidenceBodies(evidence: SiteEvidence): SiteEvidence {
  const strip = (resource: RemoteResource | null | undefined): RemoteResource | null => {
    if (!resource) return null;
    const { body, ...rest } = resource;
    return {
      ...rest,
      body: null,
      ...(typeof body === 'string' && rest.bodyBytes === undefined
        ? { bodyBytes: new TextEncoder().encode(body).length }
        : {}),
    };
  };
  return {
    ...evidence,
    homepage: strip(evidence.homepage) as RemoteResource,
    homepageMarkdown: strip(evidence.homepageMarkdown),
    llmsTxt: strip(evidence.llmsTxt) as RemoteResource,
    robotsTxt: strip(evidence.robotsTxt) as RemoteResource,
    sitemap: strip(evidence.sitemap),
    notFoundProbe: strip(evidence.notFoundProbe),
    samplePage: strip(evidence.samplePage),
    samplePageMarkdown: strip(evidence.samplePageMarkdown),
  };
}
