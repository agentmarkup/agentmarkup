import { describe, it, expect } from 'vitest';
import {
  analyzeJsDependence,
  analyzeMachineReadable,
  analyzeMarkdown,
  analyzeMetadata,
  analyzeRobots,
  analyzeSitemap,
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

  it('treats an HTML soft-404 at /robots.txt as missing, not present', () => {
    const softHtml = result({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><head><title>Home</title></head><body>homepage</body></html>',
    });
    const f = analyzeRobots(softHtml);
    expect(f.find((x) => x.code === 'robots.missing')?.level).toBe('warn');
    expect(f.find((x) => x.code === 'robots.crawlers-allowed')).toBeUndefined();
  });

  it('treats an HTML body without a content-type header as a soft-404 (missing)', () => {
    const softHtml = result({
      body: '<html><head></head><body>homepage catch-all</body></html>',
    });
    const f = analyzeRobots(softHtml);
    expect(f.find((x) => x.code === 'robots.missing')?.level).toBe('warn');
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

  it('accepts @graph-wrapped JSON-LD as present (does not require @type on the wrapper)', () => {
    const html =
      '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"X","url":"https://example.com"},{"@type":"Organization","name":"X"}]}</script></head><body>x</body></html>';
    const f = analyzeMachineReadable(result({ body: html }), llmsOk);
    expect(f.find((x) => x.code === 'jsonld.present')?.level).toBe('pass');
    expect(f.find((x) => x.code === 'jsonld.invalid')).toBeUndefined();
  });

  it('accepts typed-but-incomplete JSON-LD as present (audit does not enforce build-time completeness)', () => {
    const html =
      '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","headline":"Home","url":"https://example.com"}</script></head><body>x</body></html>';
    const f = analyzeMachineReadable(result({ body: html }), llmsOk);
    expect(f.find((x) => x.code === 'jsonld.present')?.level).toBe('pass');
    expect(f.find((x) => x.code === 'jsonld.invalid')).toBeUndefined();
  });

  it('flags genuinely unparseable JSON-LD as an error', () => {
    const html =
      '<html><head><script type="application/ld+json">{"@type":"Organization","name":"X",}trailing junk</script></head><body>x</body></html>';
    const f = analyzeMachineReadable(result({ body: html }), llmsOk);
    expect(f.find((x) => x.code === 'jsonld.invalid')?.level).toBe('error');
  });

  it('warns when llms.txt is missing', () => {
    const f = analyzeMachineReadable(
      result({ body: '<html><body>x</body></html>' }),
      result({ status: 404, ok: false, body: null })
    );
    expect(f.find((x) => x.code === 'llms.missing')?.level).toBe('warn');
  });

  it('treats an HTML soft-404 at /llms.txt as missing, not malformed', () => {
    const softHtml = result({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><head><title>Home</title></head><body>homepage catch-all page</body></html>',
    });
    const f = analyzeMachineReadable(result({ body: '<html><body>x</body></html>' }), softHtml);
    expect(f.find((x) => x.code === 'llms.missing')?.level).toBe('warn');
    expect(f.find((x) => x.code === 'llms.invalid')).toBeUndefined();
  });

  it('treats an HTML body without a content-type header as a soft-404 (missing)', () => {
    const softHtml = result({
      body: '<html><body>homepage catch-all</body></html>',
    });
    const f = analyzeMachineReadable(result({ body: '<html><body>x</body></html>' }), softHtml);
    expect(f.find((x) => x.code === 'llms.missing')?.level).toBe('warn');
  });

  it('still flags a genuine text/plain llms.txt that is malformed', () => {
    const malformed = result({
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: 'this file has no h1 heading, just prose\nmore text\n',
    });
    const f = analyzeMachineReadable(result({ body: '<html><body>x</body></html>' }), malformed);
    expect(f.find((x) => x.code === 'llms.invalid')?.level).toBe('error');
  });

  it('accepts a real text/plain llms.txt as present', () => {
    const real = result({
      headers: { 'content-type': 'text/plain' },
      body: '# Site\n\n## Docs\n\n- [Guide](https://example.com/g)\n',
    });
    const f = analyzeMachineReadable(result({ body: '<html><body>x</body></html>' }), real);
    expect(f.find((x) => x.code === 'llms.present')?.level).toBe('pass');
  });
});

describe('analyzeMarkdown', () => {
  it('passes when a markdown mirror is fetchable', () => {
    const mirror = result({
      headers: { 'content-type': 'text/markdown' },
      body: '# Page\n\nReal markdown content for agents.\n',
    });
    const f = analyzeMarkdown(result({ body: '<html><body>x</body></html>' }), mirror);
    expect(f.find((x) => x.code === 'markdown.present')?.level).toBe('pass');
  });

  it('passes when the HTML advertises a text/markdown alternate link', () => {
    const html =
      '<html><head><link rel="alternate" type="text/markdown" href="/index.md"></head><body>x</body></html>';
    const mirror = result({ status: 404, ok: false, body: null });
    const f = analyzeMarkdown(result({ body: html }), mirror);
    expect(f.find((x) => x.code === 'markdown.present')?.level).toBe('pass');
  });

  it('emits no finding when there is no markdown mirror (it is optional)', () => {
    const mirror = result({ status: 404, ok: false, body: null });
    const f = analyzeMarkdown(result({ body: '<html><body>x</body></html>' }), mirror);
    expect(f).toHaveLength(0);
  });

  it('does not count an HTML soft-404 at the .md path as a markdown mirror', () => {
    const mirror = result({
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body>homepage</body></html>',
    });
    const f = analyzeMarkdown(result({ body: '<html><body>x</body></html>' }), mirror);
    expect(f).toHaveLength(0);
  });
});

describe('analyzeSitemap', () => {
  const noRobots = result({ status: 404, ok: false, body: null });

  it('passes on a real XML sitemap', () => {
    const sm = result({
      headers: { 'content-type': 'application/xml' },
      body: '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>',
    });
    expect(analyzeSitemap(sm, noRobots).find((x) => x.code === 'sitemap.present')?.level).toBe('pass');
  });

  it('warns when sitemap.xml is a 404 and robots declares none', () => {
    const sm = result({ status: 404, ok: false, body: null });
    expect(analyzeSitemap(sm, noRobots).find((x) => x.code === 'sitemap.missing')?.level).toBe('warn');
  });

  it('warns when the sitemap path returns an HTML soft-404', () => {
    const sm = result({
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body>homepage</body></html>',
    });
    expect(analyzeSitemap(sm, noRobots).find((x) => x.code === 'sitemap.missing')?.level).toBe('warn');
  });

  it('passes when robots.txt declares a Sitemap even if /sitemap.xml is a soft-404', () => {
    const softHtml = result({
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body>homepage</body></html>',
    });
    const robots = result({
      body: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap_index.xml\n',
    });
    expect(analyzeSitemap(softHtml, robots).find((x) => x.code === 'sitemap.present')?.level).toBe('pass');
  });
});

describe('analyzeMetadata', () => {
  it('passes when title, description, and canonical are present', () => {
    const html =
      '<html><head><title>My Page</title><meta name="description" content="A useful page."><link rel="canonical" href="https://example.com/"></head><body>x</body></html>';
    expect(analyzeMetadata(result({ body: html })).find((x) => x.code === 'meta.complete')?.level).toBe('pass');
  });

  it('warns and lists what is missing', () => {
    const html = '<html><head><title>My Page</title></head><body>x</body></html>';
    const f = analyzeMetadata(result({ body: html }));
    const finding = f.find((x) => x.code === 'meta.incomplete');
    expect(finding?.level).toBe('warn');
    expect(finding?.evidence).toContain('description');
    expect(finding?.evidence).toContain('canonical');
  });

  it('emits no finding when the control fetch failed', () => {
    const f = analyzeMetadata(result({ status: 503, ok: false, body: null }));
    expect(f).toHaveLength(0);
  });
});
