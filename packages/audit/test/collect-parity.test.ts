// Fetcher parity: one stubbed origin fed to the audit collector and to the
// website checker worker (imported by relative path, no D1, same abort-honouring
// stub under fake timers) must give the same `evaluateSiteChecks` output and the
// same `scoreChecks` report. Evaluator output, not raw evidence, so harmless
// field-order and timing differences do not count; the raw resources are still
// compared on every field except `durationMs`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateSiteChecks, scoreChecks, type SiteEvidence } from '@agentmarkup/core/score';
// @ts-expect-error - the deployed Pages worker is plain JS with no type declarations
import worker from '../../../website/public/_worker.js';
import { collectSiteEvidence } from '../src/collect.js';
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
});
