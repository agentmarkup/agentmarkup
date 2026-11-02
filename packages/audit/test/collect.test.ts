import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLLECTOR_USER_AGENT,
  InvalidTargetUrlError,
  collectSiteEvidence,
  createHostGate,
  fetchResource,
  normalizeTargetUrl,
  refetchUnverified,
  stripEvidenceBodies,
  type CollectOptions,
} from '../src/collect.js';
import {
  ABOUT_HTML,
  HOMEPAGE_HTML,
  HTML_ACCEPT,
  NOT_FOUND_HTML,
  PROBE_ACCEPT,
  PROBE_PATH,
  callFor,
  createFetchStub,
  healthySite,
  settleWithFakeTimers,
  withDelay,
  type Route,
} from './helpers/fetch-stub.js';

const RESOURCE_KEYS = [
  'homepage',
  'homepageMarkdown',
  'llmsTxt',
  'robotsTxt',
  'sitemap',
  'notFoundProbe',
  'samplePage',
  'samplePageMarkdown',
] as const;

const START = new Date('2026-11-02T12:00:00.000Z');

function collect(routes: Record<string, Route>, options: CollectOptions = {}) {
  const stub = createFetchStub(routes);
  const pending = collectSiteEvidence('https://example.com', {
    fetchImpl: stub.fetch,
    minGapMs: 0,
    ...options,
  });
  return { stub, result: settleWithFakeTimers(pending) };
}

describe('collectSiteEvidence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the homepage first, then runs the wave with four requests in flight, in the worker order', async () => {
    const { stub, result } = collect(withDelay(healthySite(), 100, ['/']));
    const evidence = await result;

    expect(stub.events.slice(0, 2)).toEqual(['start /', 'end /']);
    expect(stub.calls.map((call) => call.path)).toEqual([
      '/',
      '/robots.txt',
      PROBE_PATH,
      '/llms.txt',
      '/index.md',
      '/about/',
      '/sitemap_index.xml',
      '/about.md',
    ]);
    expect(stub.maxInFlight()).toBe(4);
    expect(evidence.fetchSummary).toEqual({
      analysisStatus: 'complete',
      unverified: [],
      elapsedMs: 300,
      fetches: 8,
      hops: 0,
      samplePageUrl: 'https://example.com/about/',
    });
    expect(evidence.fetchSummary.fetches).toBe(stub.fetch.mock.calls.length);
    expect(evidence.targetUrl).toBe('https://example.com/');
    expect(evidence.origin).toBe('https://example.com');
    expect(evidence.fetchedAt).toBe(START.toISOString());
    expect(evidence.normalizedFrom).toBe('https://example.com');
    expect(evidence.sitemapUrl).toBe('https://example.com/sitemap_index.xml');
    expect(evidence.sitemapSource).toBe('robots');
    for (const key of RESOURCE_KEYS) {
      expect(evidence[key]).toMatchObject({ durationMs: expect.any(Number), hops: 0, headers: expect.any(Object) });
      expect(evidence[key]).not.toHaveProperty('skipped');
    }
  });

  it('keeps request starts to one host at least the per-host gap apart', async () => {
    const { stub, result } = collect(healthySite(), { minGapMs: 1000 });
    const evidence = await result;

    const starts = stub.calls.map((call) => call.startedAt).sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1000);
    }
    expect(evidence.fetchSummary.analysisStatus).toBe('complete');
    expect(evidence.fetchSummary.elapsedMs).toBeGreaterThanOrEqual(7000);
  });

  it('shares one host gate across sites and leaves other hosts alone', async () => {
    const sleeps: number[] = [];
    let clock = 0;
    const gate = createHostGate(
      1000,
      () => clock,
      async (ms) => {
        sleeps.push(ms);
        clock += ms;
      }
    );
    await gate.wait('a.example');
    await gate.wait('b.example');
    await gate.wait('A.example');
    expect(sleeps).toEqual([1000]);
    clock = 5000;
    await gate.wait('a.example');
    expect(sleeps).toEqual([1000]);
  });

  it('starts the sitemap only after robots.txt answers and uses the URL it declares', async () => {
    const routes = healthySite();
    const robots = routes['/robots.txt'];
    routes['/robots.txt'] = (url, hit) => ({ ...robots(url, hit), delayMs: 500 });
    const { stub, result } = collect(routes);
    const evidence = await result;

    const robotsCall = callFor(stub.calls, '/robots.txt');
    const sitemapCall = callFor(stub.calls, '/sitemap_index.xml');
    expect(robotsCall.endedAt).toBe(robotsCall.startedAt + 500);
    expect(sitemapCall.startedAt).toBeGreaterThanOrEqual(robotsCall.endedAt ?? Infinity);
    expect(stub.calls.some((call) => call.path === '/sitemap.xml')).toBe(false);
    expect(evidence.sitemap?.outcome).toBe('ok');
  });

  it('falls back to /sitemap.xml when robots.txt declares nothing', async () => {
    const routes = healthySite();
    routes['/robots.txt'] = () => ({ status: 200, body: 'User-agent: *\nAllow: /\n' });
    routes['/sitemap.xml'] = () => ({ status: 200, body: '<urlset></urlset>' });
    const { result } = collect(routes);
    const evidence = await result;
    expect(evidence.sitemapUrl).toBe('https://example.com/sitemap.xml');
    expect(evidence.sitemapSource).toBe('default');
  });

  it('reports a sitemap that never answers as unverified and marks the run partial', async () => {
    const routes = healthySite();
    routes['/sitemap_index.xml'] = () => ({ status: 0, never: true });
    const { result } = collect(routes);
    const evidence = await result;

    expect(evidence.sitemap).toMatchObject({
      status: 0,
      ok: false,
      body: null,
      error: 'Request timed out.',
      outcome: 'unverified',
      hops: 0,
      headers: {},
    });
    expect(evidence.sitemap).not.toHaveProperty('skipped');
    expect(evidence.sitemap?.durationMs).toBeGreaterThanOrEqual(10_000);
    expect(evidence.fetchSummary.analysisStatus).toBe('partial');
    expect(evidence.fetchSummary.unverified).toEqual(['sitemap']);
  });

  it('names the run deadline when it, not the per-request timeout, ends a fetch', async () => {
    const routes = healthySite();
    routes['/'] = () => ({ status: 200, body: HOMEPAGE_HTML, delayMs: 9000 });
    routes['/about/'] = () => ({ status: 200, body: ABOUT_HTML, delayMs: 9000 });
    routes['/about.md'] = () => ({ status: 0, never: true });
    const { result } = collect(routes);
    const evidence = await result;

    expect(evidence.samplePageMarkdown).toMatchObject({
      status: 0,
      error: 'Checker time budget exhausted.',
      outcome: 'unverified',
    });
    expect(evidence.fetchSummary.unverified).toEqual(['samplePageMarkdown']);
  });

  it('stops at the request budget: the fourth fetch is refused, marked skipped and unverified', async () => {
    const { stub, result } = collect(healthySite(), { maxFetches: 3 });
    const evidence = await result;

    expect(stub.calls.map((call) => call.path)).toEqual(['/', '/robots.txt', PROBE_PATH]);
    expect(evidence.fetchSummary.fetches).toBe(3);
    expect(evidence.llmsTxt).toMatchObject({
      status: 0,
      error: 'Checker request budget exhausted.',
      skipped: true,
      outcome: 'unverified',
      hops: 0,
      headers: {},
    });
    for (const key of ['homepageMarkdown', 'samplePage', 'sitemap', 'samplePageMarkdown'] as const) {
      expect(evidence[key]).toMatchObject({ error: 'Checker request budget exhausted.', skipped: true });
    }
    expect(evidence.fetchSummary.analysisStatus).toBe('partial');
    expect(evidence.fetchSummary.unverified).toEqual([
      'homepageMarkdown',
      'llmsTxt',
      'sitemap',
      'samplePage',
      'samplePageMarkdown',
    ]);
  });

  it('sends the markdown-first Accept on the probe only, manual redirects and the batch user-agent everywhere', async () => {
    const { stub, result } = collect(healthySite());
    await result;

    const accept = (path: string) => new Headers(callFor(stub.calls, path).init.headers).get('accept');
    expect(accept(PROBE_PATH)).toBe(PROBE_ACCEPT);
    expect(accept('/')).toBe(HTML_ACCEPT);
    expect(accept('/about/')).toBe(HTML_ACCEPT);
    expect(accept('/llms.txt')).toBe(HTML_ACCEPT);
    for (const call of stub.calls) {
      expect(call.init.redirect).toBe('manual');
      expect(new Headers(call.init.headers).get('user-agent')).toBe(COLLECTOR_USER_AGENT);
    }
    expect(COLLECTOR_USER_AGENT).toMatch(/^agentmarkup-checker\/\d+\.\d+\.\d+ \(\+https:\/\/agentmarkup\.dev; batch\)$/);
  });

  it('drops 404 and 410 bodies on every resource but keeps a 2xx probe body', async () => {
    const routes = healthySite();
    routes['/llms.txt'] = () => ({ status: 410, body: 'gone', headers: { 'content-type': 'text/plain' } });
    routes['/sitemap_index.xml'] = () => ({ status: 404, body: NOT_FOUND_HTML });
    routes[PROBE_PATH] = () => ({ status: 200, body: HOMEPAGE_HTML, headers: { 'content-type': 'text/html' } });
    const { result } = collect(routes);
    const evidence = await result;

    expect(evidence.llmsTxt).toMatchObject({ status: 410, body: null, bodyBytes: 4, bodyDropped: true, outcome: 'not-found' });
    expect(evidence.sitemap).toMatchObject({ status: 404, body: null, bodyDropped: true, outcome: 'not-found' });
    expect(evidence.sitemap?.bodyBytes).toBe(NOT_FOUND_HTML.length);
    expect(evidence.homepageMarkdown).toMatchObject({ status: 404, body: null, bodyDropped: true });
    expect(evidence.notFoundProbe).toMatchObject({ status: 200, body: HOMEPAGE_HTML, outcome: 'ok' });
    expect(evidence.notFoundProbe).not.toHaveProperty('bodyDropped');
  });

  it('captures the allowlisted headers, the probe Location, and never set-cookie', async () => {
    const routes = healthySite();
    routes['/'] = () => ({
      status: 200,
      body: HOMEPAGE_HTML,
      headers: {
        'content-type': 'text/html',
        link: '</sitemap.xml>; rel="sitemap"',
        vary: 'Accept',
        'x-robots-tag': 'all',
        'set-cookie': 'session=secret; Path=/',
        'content-signal': 'ai-train=yes',
      },
    });
    routes[PROBE_PATH] = () => ({ status: 301, headers: { location: 'https://example.com/' } });
    const { stub, result } = collect(routes);
    const evidence = await result;

    expect(evidence.homepage.headers).toEqual({
      link: '</sitemap.xml>; rel="sitemap"',
      vary: 'Accept',
      'x-robots-tag': 'all',
      'content-signal': 'ai-train=yes',
    });
    expect(evidence.homepage.xRobotsTag).toBe('all');
    expect(evidence.notFoundProbe).toMatchObject({
      status: 301,
      ok: false,
      body: null,
      hops: 0,
      outcome: 'http-error',
      headers: { location: 'https://example.com/' },
    });
    expect(evidence.notFoundProbe).not.toHaveProperty('error');
    expect(stub.calls.filter((call) => call.path === PROBE_PATH)).toHaveLength(1);
    for (const key of RESOURCE_KEYS) {
      expect(evidence[key]?.headers).not.toHaveProperty('set-cookie');
    }
  });

  it('caps redirect hops per resource (5 / 3 / 2) and never exceeds 26 fetches on a redirect-heavy host', async () => {
    const routes: Record<string, Route> = {
      '*': (url, hit) =>
        hit < 10
          ? { status: 302, headers: { location: `${url.pathname}?hop=${hit + 1}` } }
          : { status: 200, body: HOMEPAGE_HTML, headers: { 'content-type': 'text/html' } },
    };
    // The probe follows none and reports the 3xx; the sample page is the first
    // internal link of the homepage, which is only reached after 10 hops and
    // therefore never ok: that is the 5-hop cap doing its job.
    const { stub, result } = collect(routes);
    const evidence = await result;

    expect(evidence.homepage).toMatchObject({ status: 0, error: 'Too many redirects.', hops: 5, outcome: 'unverified' });
    expect(evidence.robotsTxt).toMatchObject({ status: 0, error: 'Too many redirects.', hops: 2 });
    expect(evidence.llmsTxt).toMatchObject({ error: 'Too many redirects.', hops: 2 });
    expect(evidence.notFoundProbe).toMatchObject({ status: 302, hops: 0, outcome: 'http-error' });
    expect(evidence.samplePage).toBeNull();
    expect(stub.fetch.mock.calls.length).toBeLessThanOrEqual(26);
    expect(evidence.fetchSummary.fetches).toBe(stub.fetch.mock.calls.length);
    expect(evidence.fetchSummary.analysisStatus).toBe('blocked');
  });

  it('classifies a 503 without markers as unverified and a 403 with cf-mitigated as a challenge', async () => {
    const routes = healthySite();
    routes['/llms.txt'] = () => ({ status: 503, body: 'Service unavailable', headers: { 'content-type': 'text/plain' } });
    routes['/robots.txt'] = () => ({
      status: 403,
      body: '<html><body>Just a moment...</body></html>',
      headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
    });
    const { result } = collect(routes);
    const evidence = await result;

    expect(evidence.llmsTxt.outcome).toBe('unverified');
    expect(evidence.robotsTxt.outcome).toBe('challenge');
    expect(evidence.robotsTxt.headers).toEqual({ 'cf-mitigated': 'challenge' });
    expect(evidence.fetchSummary.unverified).toEqual(['llmsTxt']);
  });

  it('refuses non-default ports on the target and on a redirect hop', async () => {
    expect(() => normalizeTargetUrl('https://example.com:8080/')).toThrow(InvalidTargetUrlError);
    expect(() => normalizeTargetUrl('ftp://example.com/')).toThrow(InvalidTargetUrlError);
    expect(() => normalizeTargetUrl('http://127.0.0.1/')).toThrow(InvalidTargetUrlError);
    expect(() => normalizeTargetUrl('https://user:pw@example.com/')).toThrow(InvalidTargetUrlError);
    expect(normalizeTargetUrl('example.com/path?x=1#y')).toBe('https://example.com/');
    expect(normalizeTargetUrl('http://example.com:80/')).toBe('http://example.com/');

    const routes = healthySite();
    routes['/llms.txt'] = () => ({ status: 302, headers: { location: 'https://example.com:8080/llms.txt' } });
    routes['/robots.txt'] = () => ({ status: 302, headers: { location: 'http://127.0.0.1/robots.txt' } });
    const { result } = collect(routes);
    const evidence = await result;
    expect(evidence.llmsTxt).toMatchObject({ status: 0, error: 'Request was blocked by checker safety rules.', outcome: 'unverified' });
    expect(evidence.robotsTxt).toMatchObject({ status: 0, error: 'Request was blocked by checker safety rules.' });
  });

  it('uses the pinned sample page when it is on the final origin and ignores a foreign pin', async () => {
    const routes = healthySite();
    routes['/services/'] = () => ({ status: 200, body: ABOUT_HTML, headers: { 'content-type': 'text/html' } });
    routes['/services.md'] = () => ({ status: 404, body: NOT_FOUND_HTML });
    const pinned = collect(routes, { samplePageUrl: 'https://example.com/services/' });
    const evidence = await pinned.result;
    expect(evidence.fetchSummary.samplePageUrl).toBe('https://example.com/services/');
    expect(evidence.samplePage?.requestedUrl).toBe('https://example.com/services/');
    expect(evidence.samplePageMarkdown?.requestedUrl).toBe('https://example.com/services.md');

    const foreign = collect(healthySite(), { samplePageUrl: 'https://other.example/services/' });
    const fallback = await foreign.result;
    expect(fallback.fetchSummary.samplePageUrl).toBe('https://example.com/about/');
  });

  it('marks the run blocked when the homepage never answers', async () => {
    const routes = healthySite();
    routes['/'] = () => ({ status: 0, never: true });
    const { result } = collect(routes);
    const evidence = await result;
    expect(evidence.homepage).toMatchObject({ status: 0, error: 'Request timed out.', outcome: 'unverified' });
    expect(evidence.fetchSummary.analysisStatus).toBe('blocked');
    expect(evidence.fetchSummary.unverified).toContain('homepage');
    expect(evidence.samplePage).toBeNull();
  });

  it('keeps status and headers when the body exceeds the size cap and reports the resource unverified', async () => {
    const stub = createFetchStub({
      '/big': () => ({ status: 200, body: 'x'.repeat(2048), headers: { 'content-type': 'text/plain', link: '<a>; rel="x"' } }),
    });
    const resource = await settleWithFakeTimers(
      fetchResource('https://example.com/big', { fetchImpl: stub.fetch, maxResponseBytes: 1024, minGapMs: 0 })
    );
    expect(resource).toMatchObject({
      status: 200,
      body: null,
      error: 'Response exceeded the checker size limit.',
      outcome: 'unverified',
      headers: { link: '<a>; rel="x"' },
    });
  });
});

describe('refetchUnverified', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries only the unverified resources after the wait and accepts a completed retry', async () => {
    const routes = healthySite();
    const sitemap = routes['/sitemap_index.xml'];
    routes['/sitemap_index.xml'] = (url, hit) => (hit === 0 ? { status: 0, never: true } : sitemap(url, hit));
    const stub = createFetchStub(routes);
    const first = await settleWithFakeTimers(
      collectSiteEvidence('https://example.com', { fetchImpl: stub.fetch, minGapMs: 0 })
    );
    expect(first.fetchSummary.analysisStatus).toBe('partial');
    const callsBefore = stub.calls.length;

    const sleeps: number[] = [];
    const retried = await settleWithFakeTimers(
      refetchUnverified(first, {
        fetchImpl: stub.fetch,
        minGapMs: 0,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      })
    );

    expect(sleeps).toEqual([20_000]);
    expect(stub.calls.slice(callsBefore).map((call) => call.path)).toEqual(['/sitemap_index.xml']);
    expect(retried.sitemap?.outcome).toBe('ok');
    expect(retried.fetchSummary).toMatchObject({
      analysisStatus: 'complete',
      unverified: [],
      fetches: callsBefore + 1,
      samplePageUrl: 'https://example.com/about/',
    });
    expect(retried.fetchedAt).toBe(first.fetchedAt);
    expect(first.sitemap?.outcome).toBe('unverified');
  });

  it('gives up after the configured attempts and keeps the partial reading', async () => {
    const routes = healthySite();
    routes['/llms.txt'] = () => ({ status: 503, body: 'down' });
    const stub = createFetchStub(routes);
    const first = await settleWithFakeTimers(
      collectSiteEvidence('https://example.com', { fetchImpl: stub.fetch, minGapMs: 0 })
    );
    const sleeps: number[] = [];
    const retried = await settleWithFakeTimers(
      refetchUnverified(first, {
        fetchImpl: stub.fetch,
        minGapMs: 0,
        attempts: 2,
        waitMs: 5,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      })
    );
    expect(sleeps).toEqual([5, 5]);
    expect(retried.fetchSummary.analysisStatus).toBe('partial');
    expect(retried.fetchSummary.unverified).toEqual(['llmsTxt']);
    expect(stub.hits.get('/llms.txt')).toBe(3);
  });

  it('re-collects the whole site when the homepage was unverified', async () => {
    const routes = healthySite();
    const home = routes['/'];
    routes['/'] = (url, hit) => (hit === 0 ? { status: 0, never: true } : home(url, hit));
    const stub = createFetchStub(routes);
    const first = await settleWithFakeTimers(
      collectSiteEvidence('https://example.com', { fetchImpl: stub.fetch, minGapMs: 0 })
    );
    expect(first.fetchSummary.analysisStatus).toBe('blocked');
    const retried = await settleWithFakeTimers(
      refetchUnverified(first, { fetchImpl: stub.fetch, minGapMs: 0, sleep: async () => {} })
    );
    expect(retried.fetchSummary.analysisStatus).toBe('complete');
    expect(retried.homepage.outcome).toBe('ok');
    expect(retried.samplePage?.outcome).toBe('ok');
  });
});

describe('stripEvidenceBodies', () => {
  it('removes every body and keeps the byte count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    try {
      const stub = createFetchStub(healthySite());
      const evidence = await settleWithFakeTimers(
        collectSiteEvidence('https://example.com', { fetchImpl: stub.fetch, minGapMs: 0 })
      );
      const stripped = stripEvidenceBodies(evidence);
      for (const key of RESOURCE_KEYS) {
        expect(stripped[key]?.body).toBeNull();
      }
      expect(stripped.homepage.bodyBytes).toBe(HOMEPAGE_HTML.length);
      expect(stripped.homepage.outcome).toBe('ok');
      expect(evidence.homepage.body).toBe(HOMEPAGE_HTML);
      expect(JSON.stringify(stripped)).not.toContain('<');
    } finally {
      vi.useRealTimers();
    }
  });
});
