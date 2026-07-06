import { describe, it, expect } from 'vitest';
import { analyzeCrawlerAccess } from '../src/analyzers/crawler-access.js';
import { CRAWLER_AGENTS } from '../src/agents.js';
import type { FetchResult } from '../src/net.js';

function result(overrides: Partial<FetchResult>): FetchResult {
  return {
    requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com',
    status: 200,
    ok: true,
    headers: {},
    body: '',
    bodyBytes: 0,
    redirects: 0,
    blocked: false,
    ...overrides,
  };
}

const gptbot = CRAWLER_AGENTS.find((a) => a.id === 'gptbot')!;

describe('analyzeCrawlerAccess', () => {
  it('reports pass when the crawler UA gets the same success class as the browser', () => {
    const findings = analyzeCrawlerAccess(result({ status: 200 }), [
      { agent: gptbot, result: result({ status: 200 }) },
    ]);
    const f = findings.find((x) => x.code === 'crawler.accessible');
    expect(f?.level).toBe('pass');
  });

  it('warns (not errors) on a plain 403 — the UA-WAF vs IP-allowlist ambiguity', () => {
    const findings = analyzeCrawlerAccess(result({ status: 200 }), [
      { agent: gptbot, result: result({ status: 403, ok: false, body: 'Forbidden' }) },
    ]);
    const f = findings.find((x) => x.code === 'crawler.ua-differential-block');
    expect(f).toBeDefined();
    expect(f?.level).toBe('warn');
    // must not assert a hard block
    expect(findings.some((x) => x.level === 'error')).toBe(false);
  });

  it('flags a Cloudflare challenge distinctly via cf-mitigated', () => {
    const findings = analyzeCrawlerAccess(result({ status: 200 }), [
      {
        agent: gptbot,
        result: result({
          status: 403,
          ok: false,
          headers: { 'cf-mitigated': 'challenge' },
        }),
      },
    ]);
    expect(findings.find((x) => x.code === 'crawler.bot-challenge')?.level).toBe(
      'warn'
    );
  });

  it('detects a challenge from body markers when no header is present', () => {
    const findings = analyzeCrawlerAccess(result({ status: 200 }), [
      {
        agent: gptbot,
        result: result({
          status: 403,
          ok: false,
          body: '<html><body>Just a moment... challenge-platform</body></html>',
        }),
      },
    ]);
    expect(findings.find((x) => x.code === 'crawler.bot-challenge')).toBeDefined();
  });

  it('warns on rate limiting', () => {
    const findings = analyzeCrawlerAccess(result({ status: 200 }), [
      { agent: gptbot, result: result({ status: 429, ok: false }) },
    ]);
    expect(findings.find((x) => x.code === 'crawler.rate-limited')?.level).toBe(
      'warn'
    );
  });

  it('bails out with a single warning when the browser control fails', () => {
    const findings = analyzeCrawlerAccess(result({ status: 503, ok: false }), [
      { agent: gptbot, result: result({ status: 200 }) },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('crawler.control-failed');
  });

  it('does not draw a conclusion when the crawler probe itself errors (including non-network errors)', () => {
    const findings = analyzeCrawlerAccess(result({ status: 200 }), [
      { agent: gptbot, result: result({ status: null, ok: false, error: 'timeout' }) },
      { agent: gptbot, result: result({ status: null, ok: false, error: 'too-many-redirects' }) },
      { agent: gptbot, result: result({ status: null, ok: false, error: 'blocked-by-ssrf-rules' }) },
    ]);
    expect(findings.every((x) => x.code === 'crawler.probe-failed')).toBe(true);
    expect(findings).toHaveLength(3);
  });

  it('warns when an accessible crawler gets far less content than the browser', () => {
    const richHtml = `<html><body><main>${'real product content here. '.repeat(200)}</main></body></html>`;
    const thinHtml = '<html><body><div id="root"></div></body></html>';
    const findings = analyzeCrawlerAccess(result({ status: 200, body: richHtml }), [
      { agent: gptbot, result: result({ status: 200, body: thinHtml }) },
    ]);
    expect(findings.find((x) => x.code === 'crawler.content-differential')?.level).toBe('warn');
    // it should not also claim clean access for the same crawler
    expect(findings.find((x) => x.code === 'crawler.accessible')).toBeUndefined();
  });

  it('passes (no differential) when the crawler gets comparable content to the browser', () => {
    const richHtml = `<html><body><main>${'real product content here. '.repeat(200)}</main></body></html>`;
    const findings = analyzeCrawlerAccess(result({ status: 200, body: richHtml }), [
      { agent: gptbot, result: result({ status: 200, body: richHtml }) },
    ]);
    expect(findings.find((x) => x.code === 'crawler.accessible')?.level).toBe('pass');
    expect(findings.find((x) => x.code === 'crawler.content-differential')).toBeUndefined();
  });
});
