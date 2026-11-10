// Fetcher parity: one stubbed origin fed to the audit collector and to the
// website checker worker (imported by relative path, no D1, same abort-honouring
// stub under fake timers) must give the same `evaluateSiteChecks` output and the
// same `scoreChecks` report. Evaluator output, not raw evidence, so harmless
// field-order and timing differences do not count; the raw resources are still
// compared on every field except `durationMs`.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHALLENGE_HEADERS,
  CHALLENGE_MARKERS,
  CHALLENGE_MARKERS_NON_2XX,
  CHALLENGE_STATUSES,
  classifyResource,
  evaluateSiteChecks,
  scoreChecks,
  type SiteEvidence,
} from '@agentmarkup/core/score';
// @ts-expect-error - the deployed Pages worker is plain JS with no type declarations
import worker from '../../../website/public/_worker.js';
import { DISCOVERY_HEADER_NAMES, collectSiteEvidence } from '../src/collect.js';
import {
  ABOUT_HTML,
  NOT_FOUND_HTML,
  PROBE_PATH,
  createFetchStub,
  settleWithFakeTimers,
  type Route,
} from './helpers/fetch-stub.js';

const START = new Date('2026-11-02T12:00:00.000Z');
const CHECK_URL = 'https://agentmarkup.dev/api/check?url=https%3A%2F%2Fexample.com';

const HOMEPAGE = `<!doctype html><html lang="en"><head><title>Example</title>
<link rel="canonical" href="https://example.com/"><link rel="alternate" type="text/markdown" href="/index.md">
<link rel="alternate" type="text/plain" href="/llms.txt"><meta property="og:image" content="https://example.com/og.png"><meta property="og:type" content="website">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example","url":"https://example.com/","description":"An example company.","address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Denver"},"contactPoint":{"@type":"ContactPoint","telephone":"+1 555 0100"},"sameAs":["https://www.linkedin.com/company/example","https://github.com/example"]}</script>
</head><body><nav><a href="/about/">About</a> <a href="/contact/">Contact</a> <a href="/privacy/">Privacy</a></nav>
<main><h1>Example</h1><h2>What we do</h2><p>${'Server-rendered content about the company and its services. '.repeat(20)}</p>
<form><label for="q">Search</label><input id="q" name="q" type="text"><button type="submit">Go</button></form></main></body></html>`;

function parityOrigin(): Record<string, Route> {
  return {
    '/': () => ({ status: 200, body: HOMEPAGE, headers: { 'content-type': 'text/html; charset=utf-8', link: '</sitemap.xml>; rel="sitemap"', vary: 'Accept' } }),
    '/about/': () => ({ status: 200, body: ABOUT_HTML, headers: { 'content-type': 'text/html' }, delayMs: 300 }),
    '/robots.txt': () => ({
      status: 200,
      body: 'User-agent: *\nAllow: /\nContent-Signal: ai-train=yes, search=yes\nSitemap: https://example.com/sitemap.xml\n',
      headers: { 'content-type': 'text/plain' },
    }),
    '/sitemap.xml': () => ({
      status: 200,
      body: '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc><lastmod>2026-10-20</lastmod></url><url><loc>https://example.com/about/</loc><lastmod>2026-10-21</lastmod></url></urlset>',
      headers: { 'content-type': 'application/xml' },
    }),
    '/llms.txt': () => ({
      status: 200,
      body: '# Example\n\n> Example is a company. Use this file when you need the canonical description of what Example offers and where to find it.\n\n## When to use Example\n\n- [About](https://example.com/about/)\n- [Full](https://example.com/llms-full.txt)\n',
      headers: { 'content-type': 'text/plain' },
    }),
    '/index.md': () => ({ status: 200, body: '---\ntitle: Example\n---\n# Example\n\nMarkdown twin.\n', headers: { 'content-type': 'text/markdown' } }),
    // The slow resource: never answers, so both sides report it unverified.
    '/about.md': () => ({ status: 0, never: true }),
    [PROBE_PATH]: () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
  };
}

type Resource = Record<string, unknown> & { durationMs?: number };

const WORKER_SOURCE = readFileSync(new URL('../../../website/public/_worker.js', import.meta.url), 'utf8');

/** A top-level `const NAME = [...];` literal of the worker, evaluated in an empty context. */
function workerConstant(name: string): unknown {
  const match = WORKER_SOURCE.match(new RegExp(`^const ${name} = (\\[[\\s\\S]*?\\]);$`, 'm'));
  if (!match) throw new Error(`no top-level array const ${name} in website/public/_worker.js`);
  return runInNewContext(`(${match[1]})`);
}

const RESOURCE_KEYS = ['homepage', 'homepageMarkdown', 'llmsTxt', 'robotsTxt', 'sitemap', 'notFoundProbe', 'samplePage', 'samplePageMarkdown'] as const;

// AWS WAF answers (catalog 1.1.0): the Captcha action is 405 with x-amzn-waf-action:
// captcha, the Challenge action 202 with x-amzn-waf-action: challenge; emag.ro served
// its captcha page with 511 (observed 2026-11-09).
const AWS_CAPTCHA_PAGE =
  '<!doctype html><html><head><title>Captcha</title><script src="https://b1.eu-central-1.captcha-sdk.awswaf.com/b1/jsapi.js" defer></script></head><body><div id="b"></div><script>AwsWafIntegration.fetch("/x")</script></body></html>';
const AWS_SDK_HOMEPAGE = HOMEPAGE.replace(
  '</head>',
  '<script src="https://x.token.awswaf.com/x/challenge.js" defer></script><script>AwsWafIntegration.getToken()</script></head>'
);

function withoutTiming(resource: Resource | null): Resource | null {
  if (!resource) return null;
  const { durationMs, ...rest } = resource;
  void durationMs;
  return rest;
}

describe('collector and worker parity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('evaluates to the same checks and the same score from one stubbed origin', async () => {
    vi.setSystemTime(START);
    const workerStub = createFetchStub(parityOrigin());
    vi.stubGlobal('fetch', workerStub.fetch);
    const response = await settleWithFakeTimers(worker.fetch(new Request(CHECK_URL), {}) as Promise<Response>);
    expect(response.status).toBe(200);
    const workerPayload = (await response.json()) as SiteEvidence & Record<string, unknown>;

    vi.setSystemTime(START);
    const collectorStub = createFetchStub(parityOrigin());
    const collected = await settleWithFakeTimers(
      collectSiteEvidence('https://example.com', { fetchImpl: collectorStub.fetch, minGapMs: 0 })
    );
    const collectorEvidence = JSON.parse(JSON.stringify(collected)) as SiteEvidence;

    expect(workerStub.calls.map((call) => call.path)).toEqual(collectorStub.calls.map((call) => call.path));
    expect(workerPayload.fetchSummary?.analysisStatus).toBe('partial');
    expect(workerPayload.fetchSummary?.unverified).toEqual(['samplePageMarkdown']);
    expect(collectorEvidence.fetchSummary?.analysisStatus).toBe('partial');
    expect(collectorEvidence.fetchSummary?.unverified).toEqual(['samplePageMarkdown']);
    expect(collectorEvidence.fetchSummary?.fetches).toBe(workerPayload.fetchSummary?.fetches);
    expect(collectorEvidence.fetchSummary?.samplePageUrl).toBe(workerPayload.fetchSummary?.samplePageUrl);

    for (const key of ['homepage', 'homepageMarkdown', 'llmsTxt', 'robotsTxt', 'sitemap', 'notFoundProbe', 'samplePage', 'samplePageMarkdown'] as const) {
      expect(withoutTiming(collectorEvidence[key] as Resource | null), key).toEqual(
        withoutTiming(workerPayload[key] as Resource | null)
      );
    }
    expect(collectorEvidence.targetUrl).toBe(workerPayload.targetUrl);
    expect(collectorEvidence.sitemapUrl).toBe(workerPayload.sitemapUrl);
    expect(collectorEvidence.sitemapSource).toBe(workerPayload.sitemapSource);
    expect(collectorEvidence.fetchedAt).toBe(workerPayload.fetchedAt);

    const fromWorker = evaluateSiteChecks(workerPayload);
    const fromCollector = evaluateSiteChecks(collectorEvidence);
    expect(fromCollector).toEqual(fromWorker);
    expect(scoreChecks(fromCollector)).toEqual(scoreChecks(fromWorker));

    const report = scoreChecks(fromCollector);
    expect(report.analysisStatus).toBe('partial');
    expect(report.unverifiedChecks).toContain('markdown.url-fallback');
    expect(report.score).not.toBeNull();
    for (const check of report.checks) {
      expect(check.evidence).not.toContain('<');
    }
  });

  /** One origin through the worker and through the collector, as JSON-roundtripped evidence. */
  async function runBoth(origin: () => Record<string, Route>) {
    vi.setSystemTime(START);
    vi.stubGlobal('fetch', createFetchStub(origin()).fetch);
    const response = await settleWithFakeTimers(worker.fetch(new Request(CHECK_URL), {}) as Promise<Response>);
    expect(response.status).toBe(200);
    const workerPayload = (await response.json()) as SiteEvidence;

    vi.setSystemTime(START);
    const collected = await settleWithFakeTimers(
      collectSiteEvidence('https://example.com', { fetchImpl: createFetchStub(origin()).fetch, minGapMs: 0 })
    );
    const collectorEvidence = JSON.parse(JSON.stringify(collected)) as SiteEvidence;
    return { workerPayload, collectorEvidence };
  }

  // The fetch summary and the score engine must name the same run status. A
  // 401/403 challenged probe is a measured nav.not-found fail (complete); a
  // 429/503 challenged probe leaves nav.not-found unverified (partial).
  it.each([
    { status: 401, expected: 'complete' },
    { status: 403, expected: 'complete' },
    { status: 429, expected: 'partial' },
    { status: 503, expected: 'partial' },
  ])('a challenged probe answering $status gives the same status in both summaries and the engine', async ({ status, expected }) => {
    const origin = (): Record<string, Route> => ({
      ...parityOrigin(),
      '/about.md': () => ({ status: 200, body: '# About\n\nMarkdown twin.\n', headers: { 'content-type': 'text/markdown' } }),
      [PROBE_PATH]: () => ({
        status,
        body: '<html><head><title>Just a moment...</title></head></html>',
        headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
      }),
    });
    const { workerPayload, collectorEvidence } = await runBoth(origin);

    expect(collectorEvidence.notFoundProbe?.outcome).toBe('challenge');
    expect(workerPayload.notFoundProbe?.outcome).toBe('challenge');
    const engine = scoreChecks(evaluateSiteChecks(collectorEvidence));
    expect(engine.analysisStatus).toBe(expected);
    expect(collectorEvidence.fetchSummary?.analysisStatus).toBe(engine.analysisStatus);
    expect(workerPayload.fetchSummary?.analysisStatus).toBe(engine.analysisStatus);
    expect(engine.checks.find((check) => check.id === 'nav.not-found')?.status).toBe(
      expected === 'complete' ? 'fail' : 'unverified'
    );
  });

  // Blocked exactly when the engine blocks: an unverified homepage (500 without
  // markers) or a final non-2xx other than 401/403 (404, 410). A 401 or 403 is
  // scored (reach.bot-detection 0), so the run is not blocked.
  it.each([
    { status: 404, expected: 'blocked', blockedKind: 'http-status' },
    { status: 410, expected: 'blocked', blockedKind: 'http-status' },
    { status: 500, expected: 'blocked', blockedKind: 'unverified' },
    { status: 401, expected: 'complete', blockedKind: null },
    { status: 403, expected: 'complete', blockedKind: null },
  ])('a homepage answering $status gives the same status in both summaries and the engine', async ({ status, expected, blockedKind }) => {
    const origin = (): Record<string, Route> => ({
      ...parityOrigin(),
      '/': () => ({ status, body: '<html><body>No page here.</body></html>', headers: { 'content-type': 'text/html' } }),
    });
    const { workerPayload, collectorEvidence } = await runBoth(origin);

    const evaluation = evaluateSiteChecks(collectorEvidence);
    expect(evaluation.blockedKind).toBe(blockedKind);
    expect(evaluateSiteChecks(workerPayload).blockedKind).toBe(blockedKind);
    const engine = scoreChecks(evaluation);
    expect(engine.analysisStatus).toBe(expected);
    expect(collectorEvidence.fetchSummary?.analysisStatus).toBe(engine.analysisStatus);
    expect(workerPayload.fetchSummary?.analysisStatus).toBe(engine.analysisStatus);
    if (expected === 'complete') {
      expect(engine.checks.find((check) => check.id === 'reach.bot-detection')?.status).toBe('fail');
    }
  });

  // Core, the worker and the collector share one challenge rule (catalog 1.1.0). The
  // worker is plain JS with its own copies, so its published lists are read from its
  // source; the collector imports classifyResource from core and owns only the header
  // allowlist, which must carry every challenge header or the marker never arrives.
  it('keeps the worker challenge lists and both header allowlists equal to core', () => {
    expect(workerConstant('CHALLENGE_STATUSES')).toEqual([...CHALLENGE_STATUSES]);
    expect(workerConstant('CHALLENGE_MARKERS')).toEqual([...CHALLENGE_MARKERS]);
    expect(workerConstant('CHALLENGE_MARKERS_NON_2XX')).toEqual([...CHALLENGE_MARKERS_NON_2XX]);
    expect(workerConstant('CHALLENGE_HEADERS')).toEqual(
      CHALLENGE_HEADERS.map((header) => ({ name: header.name, values: [...header.values] }))
    );
    expect(workerConstant('DISCOVERY_HEADER_NAMES')).toEqual([...DISCOVERY_HEADER_NAMES]);
    for (const header of CHALLENGE_HEADERS) {
      expect(DISCOVERY_HEADER_NAMES as readonly string[], header.name).toContain(header.name);
    }
  });

  it.each([
    {
      name: 'a 511 AWS WAF captcha homepage',
      routes: { '/': { status: 511, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html' } } },
      outcomes: { homepage: 'challenge' },
      status: 'complete',
      bot: 'HTTP 511, challenge marker "awswaf.com"',
    },
    {
      name: 'a 405 homepage with x-amzn-waf-action: captcha',
      routes: { '/': { status: 405, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html', 'x-amzn-waf-action': 'captcha' } } },
      outcomes: { homepage: 'challenge' },
      status: 'complete',
      bot: 'HTTP 405, challenge marker "x-amzn-waf-action: captcha"',
    },
    {
      name: 'a 202 homepage with x-amzn-waf-action: challenge',
      routes: { '/': { status: 202, body: '', headers: { 'x-amzn-waf-action': 'challenge' } } },
      outcomes: { homepage: 'ok' },
      status: 'complete',
      bot: 'HTTP 202 with challenge marker "x-amzn-waf-action: challenge"',
    },
    {
      name: 'a 200 homepage that loads the AWS WAF SDK',
      routes: { '/': { status: 200, body: AWS_SDK_HOMEPAGE, headers: { 'content-type': 'text/html; charset=utf-8' } } },
      outcomes: { homepage: 'ok' },
      status: 'partial',
      bot: 'HTTP 200, HTML, no challenge markers',
    },
    {
      name: 'a 511 homepage without markers',
      routes: { '/': { status: 511, body: '<html><body>Network Authentication Required</body></html>', headers: { 'content-type': 'text/html' } } },
      outcomes: { homepage: 'unverified' },
      status: 'blocked',
      bot: null,
    },
    {
      name: 'a 405 homepage without markers',
      routes: { '/': { status: 405, body: 'Method Not Allowed', headers: { 'content-type': 'text/plain' } } },
      outcomes: { homepage: 'http-error' },
      status: 'blocked',
      bot: null,
    },
    {
      name: 'AWS WAF answers on secondary resources',
      routes: {
        '/llms.txt': { status: 511, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html' } },
        '/index.md': { status: 405, body: '', headers: { 'x-amzn-waf-action': 'captcha' } },
        [PROBE_PATH]: { status: 511, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html' } },
      },
      outcomes: { llmsTxt: 'challenge', homepageMarkdown: 'challenge', notFoundProbe: 'challenge' },
      status: 'partial',
      bot: 'HTTP 200, HTML, no challenge markers',
    },
  ])('$name: same resources, same outcomes as core, same status in both summaries and the engine', async ({ routes, outcomes, status, bot }) => {
    const origin = (): Record<string, Route> => ({
      ...parityOrigin(),
      ...Object.fromEntries(Object.entries(routes).map(([path, reply]) => [path, () => reply])),
    });
    const { workerPayload, collectorEvidence } = await runBoth(origin);

    for (const key of RESOURCE_KEYS) {
      const workerResource = workerPayload[key] as (Resource & SiteEvidence['homepage']) | null;
      const collectorResource = collectorEvidence[key] as (Resource & SiteEvidence['homepage']) | null;
      expect(withoutTiming(collectorResource), key).toEqual(withoutTiming(workerResource));
      if (workerResource) {
        // The worker's own classifyResource agrees with core's on what it recorded.
        expect(workerResource.outcome, key).toBe(classifyResource(workerResource));
      }
    }
    for (const [key, outcome] of Object.entries(outcomes)) {
      expect(workerPayload[key as (typeof RESOURCE_KEYS)[number]]?.outcome, key).toBe(outcome);
    }
    const evaluation = evaluateSiteChecks(collectorEvidence);
    expect(evaluateSiteChecks(workerPayload)).toEqual(evaluation);
    const engine = scoreChecks(evaluation);
    expect(engine.analysisStatus).toBe(status);
    expect(collectorEvidence.fetchSummary?.analysisStatus).toBe(engine.analysisStatus);
    expect(workerPayload.fetchSummary?.analysisStatus).toBe(engine.analysisStatus);
    if (bot) {
      expect(engine.checks.find((check) => check.id === 'reach.bot-detection')?.evidence).toBe(bot);
    }
  });
});
