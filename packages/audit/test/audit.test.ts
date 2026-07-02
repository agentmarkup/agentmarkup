import { describe, it, expect } from 'vitest';
import { audit } from '../src/audit.js';
import { BROWSER_CONTROL } from '../src/agents.js';
import type { FetchOptions, FetchResult } from '../src/net.js';

function ok(url: string, body: string): FetchResult {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    ok: true,
    headers: {},
    body,
    bodyBytes: body.length,
    redirects: 0,
    blocked: false,
  };
}

function notFound(url: string): FetchResult {
  return { ...ok(url, ''), status: 404, ok: false, body: null };
}

const GOOD_HTML =
  '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example","url":"https://example.com"}</script></head><body><main>' +
  'Real server-rendered content about the product and how it works. '.repeat(10) +
  '</main></body></html>';

describe('audit orchestrator', () => {
  it('produces a clean report for a well-configured site', async () => {
    const fetchImpl = async (url: string): Promise<FetchResult> => {
      if (url.endsWith('/robots.txt')) {
        return ok(
          url,
          'User-agent: *\nContent-Signal: ai-train=yes, search=yes\nAllow: /\n'
        );
      }
      if (url.endsWith('/llms.txt')) {
        return ok(url, '# Example\n\n## Docs\n\n- [Guide](https://example.com/g)\n');
      }
      return ok(url, GOOD_HTML);
    };

    const report = await audit('https://example.com', {
      fetchImpl,
      fetchedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(report.summary.error).toBe(0);
    expect(report.summary.worst).not.toBe('error');
    expect(report.findings.find((f) => f.code === 'crawler.accessible')).toBeDefined();
    expect(report.findings.find((f) => f.code === 'js.server-rendered')).toBeDefined();
    expect(report.fetchedAt).toBe('2026-07-02T00:00:00.000Z');
  });

  it('surfaces provable errors: robots block + empty JS shell', async () => {
    const shell = '<html><body><div id="root"></div><script src="/a.js"></script></body></html>';
    const fetchImpl = async (url: string): Promise<FetchResult> => {
      if (url.endsWith('/robots.txt')) return ok(url, 'User-agent: *\nDisallow: /\n');
      if (url.endsWith('/llms.txt')) return notFound(url);
      return ok(url, shell);
    };

    const report = await audit('https://example.com', {
      fetchImpl,
      fetchedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(report.summary.worst).toBe('error');
    expect(report.findings.find((f) => f.code === 'robots.blocks-crawlers')?.level).toBe('error');
    expect(report.findings.find((f) => f.code === 'js.empty-shell')?.level).toBe('error');
  });

  it('spoofs each crawler UA and the browser control distinctly', async () => {
    const seen: string[] = [];
    const fetchImpl = async (
      url: string,
      opts: FetchOptions
    ): Promise<FetchResult> => {
      if (!url.endsWith('.txt')) seen.push(opts.userAgent);
      return ok(url, GOOD_HTML);
    };
    await audit('https://example.com', {
      fetchImpl,
      fetchedAt: '2026-07-02T00:00:00.000Z',
    });
    expect(seen).toContain(BROWSER_CONTROL.ua);
    expect(seen.some((ua) => ua.includes('GPTBot'))).toBe(true);
    expect(seen.some((ua) => ua.includes('ClaudeBot'))).toBe(true);
  });
});
