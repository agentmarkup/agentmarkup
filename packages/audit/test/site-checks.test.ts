import { describe, it, expect } from 'vitest';
import {
  analyzeJsDependence,
  analyzeMachineReadable,
  analyzeRobots,
} from '../src/analyzers/site-checks.js';
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

describe('analyzeJsDependence', () => {
  it('errors on an empty JS shell', () => {
    const html = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
    const f = analyzeJsDependence(result({ body: html }));
    expect(f[0].code).toBe('js.empty-shell');
    expect(f[0].level).toBe('error');
  });

  it('passes when meaningful text is server-rendered', () => {
    const html = `<html><body><main>${'Real content about the product. '.repeat(20)}</main></body></html>`;
    const f = analyzeJsDependence(result({ body: html }));
    expect(f[0].code).toBe('js.server-rendered');
    expect(f[0].level).toBe('pass');
  });

  it('warns on thin HTML without an obvious empty root', () => {
    const f = analyzeJsDependence(result({ body: '<html><body><p>hi</p></body></html>' }));
    expect(f[0].code).toBe('js.thin-html');
    expect(f[0].level).toBe('warn');
  });
});

describe('analyzeRobots', () => {
  it('errors when a wildcard disallow shadows expected crawlers', () => {
    const f = analyzeRobots(result({ body: 'User-agent: *\nDisallow: /\n' }));
    expect(f.find((x) => x.code === 'robots.blocks-crawlers')?.level).toBe('error');
  });

  it('passes and detects Content-Signal when present', () => {
    const body =
      'User-agent: *\nContent-Signal: ai-train=yes, search=yes, ai-input=yes\nAllow: /\n';
    const f = analyzeRobots(result({ body }));
    expect(f.find((x) => x.code === 'robots.crawlers-allowed')?.level).toBe('pass');
    expect(f.find((x) => x.code === 'robots.content-signal')?.level).toBe('pass');
  });

  it('warns when robots.txt is missing', () => {
    const f = analyzeRobots(result({ status: 404, ok: false, body: null }));
    expect(f.find((x) => x.code === 'robots.missing')?.level).toBe('warn');
  });

  it('warns when Content-Signal is absent from an otherwise-open robots.txt', () => {
    const f = analyzeRobots(result({ body: 'User-agent: *\nAllow: /\n' }));
    expect(f.find((x) => x.code === 'robots.no-content-signal')?.level).toBe('warn');
  });
});

describe('analyzeMachineReadable', () => {
  const llmsOk = result({ body: '# Site\n\n## Docs\n\n- [Guide](https://example.com/g)\n' });

  it('flags invalid JSON-LD as an error', () => {
    const html =
      '<html><head><script type="application/ld+json">{"not":"schema"}</script></head><body>x</body></html>';
    const f = analyzeMachineReadable(result({ body: html }), llmsOk);
    expect(f.find((x) => x.code === 'jsonld.invalid')?.level).toBe('error');
  });

  it('passes on valid JSON-LD', () => {
    const html =
      '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"X","url":"https://example.com"}</script></head><body>x</body></html>';
    const f = analyzeMachineReadable(result({ body: html }), llmsOk);
    expect(f.find((x) => x.code === 'jsonld.present')?.level).toBe('pass');
  });

  it('warns when llms.txt is missing', () => {
    const f = analyzeMachineReadable(
      result({ body: '<html><body>x</body></html>' }),
      result({ status: 404, ok: false, body: null })
    );
    expect(f.find((x) => x.code === 'llms.missing')?.level).toBe('warn');
  });
});
