// Shared `/api/check` payload fixture for the website checker tests. It mirrors
// the reference site in packages/core/test/score/evaluate.test.ts (every
// implemented check passes, score 100) so a website test can start from a known
// report and break exactly one thing.
import type { RemoteResource, SiteCheckResponse } from '../../src/checker/types';

export const ORIGIN = 'https://www.example.com';
export const HOME = `${ORIGIN}/`;
export const SAMPLE_URL = `${ORIGIN}/services/`;
export const PROBE_URL = `${ORIGIN}/agentmarkup-probe-404-does-not-exist-9f3a2c`;
export const FETCHED_AT = '2026-11-02T12:00:00.000Z';
const LONG = 'Agents read this paragraph of ordinary page text about the services on offer here. '.repeat(12);

export const ORG_GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#org`,
      name: 'Example Co',
      url: HOME,
      description: 'Example Co builds example websites.',
      address: { '@type': 'PostalAddress', streetAddress: '1 Main Street', addressLocality: 'Springfield' },
      contactPoint: { '@type': 'ContactPoint', telephone: '+1-555-0100', contactType: 'sales' },
      sameAs: ['https://www.linkedin.com/company/example', 'https://x.com/example'],
    },
    { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: 'Example Co', url: HOME, publisher: { '@id': `${ORIGIN}/#org` } },
    { '@type': 'FAQPage', mainEntity: [] },
    { '@type': 'Service', name: 'Consulting', provider: { '@id': `${ORIGIN}/#org` } },
  ],
};

export interface HeadOptions {
  canonical?: string | null;
  lang?: string | null;
  ogImage?: string | null;
  ogType?: string | null;
  robots?: string | null;
  llmsLink?: boolean;
  markdownLink?: boolean;
  jsonLd?: unknown[] | null;
  extra?: string;
}

export function head(options: HeadOptions = {}): string {
  const canonical = options.canonical === undefined ? HOME : options.canonical;
  const lang = options.lang === undefined ? 'en' : options.lang;
  const ogImage = options.ogImage === undefined ? `${ORIGIN}/og.png` : options.ogImage;
  const ogType = options.ogType === undefined ? 'website' : options.ogType;
  const robots = options.robots === undefined ? 'index, follow' : options.robots;
  const blocks = options.jsonLd === undefined ? [ORG_GRAPH] : options.jsonLd ?? [];
  return [
    `<!doctype html><html${lang ? ` lang="${lang}"` : ''}><head><meta charset="utf-8"><title>Example Co</title>`,
    canonical ? `<link rel="canonical" href="${canonical}">` : '',
    ogImage ? `<meta property="og:image" content="${ogImage}">` : '',
    ogType ? `<meta property="og:type" content="${ogType}">` : '',
    robots ? `<meta name="robots" content="${robots}">` : '',
    options.llmsLink === false ? '' : '<link rel="alternate" type="text/plain" href="/llms.txt">',
    options.markdownLink === false ? '' : '<link rel="alternate" type="text/markdown" href="/index.md">',
    ...blocks.map((block) =>
      typeof block === 'string'
        ? `<script type="application/ld+json">${block}</script>`
        : `<script type="application/ld+json">${JSON.stringify(block)}</script>`
    ),
    options.extra ?? '',
    '</head>',
  ].join('\n');
}

export const NAV =
  '<header><nav aria-label="Main"><a href="/about/">About</a> <a href="/contact/">Contact</a> <a href="/privacy/">Privacy</a> <a href="/services/">Services</a></nav></header>';
export const FORM =
  '<form action="/subscribe/"><label for="email">Email</label> <input id="email" type="email" name="email"> <button type="submit">Subscribe</button></form>';
export const FOOTER =
  '<footer><a href="https://x.com/example" aria-label="Example on X"><svg viewBox="0 0 1 1"></svg></a> <button type="button" title="Back to top"><span aria-hidden="true">^</span></button></footer>';
export const DEFAULT_BODY = `<body>${NAV}<main><h1>Example Co</h1><h2>What we do</h2><p>${LONG}</p><h3>Details</h3><p>${LONG}</p>${FORM}</main>${FOOTER}</body></html>`;

export function page(body = DEFAULT_BODY, headOptions: HeadOptions = {}): string {
  return `${head(headOptions)}\n${body}`;
}

export const SAMPLE_HTML = `<!doctype html><html lang="en"><head><title>Services</title></head><body><nav><a href="/">Home</a></nav><main><h1>Services</h1><p>${LONG}</p></main></body></html>`;
export const LLMS = [
  '# Example Co',
  '',
  '> Example Co builds example websites for small businesses and keeps them readable for AI agents and search engines alike.',
  '',
  '## When to use Example Co',
  '',
  '- Use Example Co when you need a small business website built and maintained.',
  `- Full index: ${ORIGIN}/llms-full.txt`,
  '',
  '## Pages',
  '',
  `- [About](${ORIGIN}/about/): who we are`,
  '',
].join('\n');
export const ROBOTS = [
  'User-agent: *',
  'Allow: /',
  'Content-Signal: ai-train=yes, search=yes, ai-input=yes',
  `Sitemap: ${ORIGIN}/sitemap.xml`,
  '',
].join('\n');
export const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${HOME}</loc><lastmod>2026-10-20</lastmod></url>
<url><loc>${SAMPLE_URL}</loc><lastmod>2026-10-21</lastmod></url>
</urlset>`;
export const HOME_MD =
  "---\ntitle: Example Co\n---\n# Example Co\n\nExample Co builds example websites.\n\n```js\nconsole.log('hello');\n```\n";
export const SAMPLE_MD = '---\ntitle: Services\n---\n# Services\n\nWhat we do.\n';

export function resource(url: string, overrides: Partial<RemoteResource> = {}): RemoteResource {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    ok: true,
    contentType: 'text/html; charset=utf-8',
    body: '',
    headers: {},
    ...overrides,
  };
}

export function html(url: string, body: string, overrides: Partial<RemoteResource> = {}): RemoteResource {
  return resource(url, { body, ...overrides });
}

export function text(
  url: string,
  body: string,
  contentType = 'text/plain; charset=utf-8',
  overrides: Partial<RemoteResource> = {}
): RemoteResource {
  return resource(url, { body, contentType, ...overrides });
}

export function markdown(url: string, body: string, overrides: Partial<RemoteResource> = {}): RemoteResource {
  return text(url, body, 'text/markdown; charset=utf-8', overrides);
}

export function notFound(url: string, contentType = 'text/html; charset=utf-8', bytes = 1234): RemoteResource {
  return resource(url, { status: 404, ok: false, contentType, body: null, bodyBytes: bytes, bodyDropped: true });
}

export function timedOut(url: string): RemoteResource {
  return resource(url, { status: 0, ok: false, contentType: null, body: null, error: 'Request timed out.' });
}

export function status(url: string, code: number, overrides: Partial<RemoteResource> = {}): RemoteResource {
  return resource(url, {
    status: code,
    ok: code >= 200 && code < 300,
    body: code >= 200 && code < 300 ? 'ok' : '',
    ...overrides,
  });
}

export function homepage(
  body: string = DEFAULT_BODY,
  headOptions: HeadOptions = {},
  overrides: Partial<RemoteResource> = {}
): RemoteResource {
  return html(HOME, page(body, headOptions), {
    headers: { link: `<${ORIGIN}/sitemap.xml>; rel="sitemap"` },
    ...overrides,
  });
}

export interface Parts {
  homepage?: RemoteResource;
  sample?: RemoteResource | null;
  llms?: RemoteResource;
  robots?: RemoteResource;
  sitemap?: RemoteResource | null;
  sitemapSource?: 'robots' | 'default' | null;
  /** `null` leaves the probe out of the payload (an older worker response). */
  probe?: RemoteResource | null;
  homeMd?: RemoteResource | null;
  sampleMd?: RemoteResource | null;
  fetchedAt?: string;
  targetUrl?: string;
  normalizedFrom?: string | null;
}

export function siteCheck(parts: Parts = {}): SiteCheckResponse {
  const sample = parts.sample === undefined ? html(SAMPLE_URL, SAMPLE_HTML) : parts.sample;
  return {
    targetUrl: parts.targetUrl ?? HOME,
    origin: ORIGIN,
    fetchedAt: parts.fetchedAt ?? FETCHED_AT,
    normalizedFrom: parts.normalizedFrom ?? null,
    homepage: parts.homepage ?? homepage(),
    homepageMarkdown: parts.homeMd === undefined ? markdown(`${ORIGIN}/index.md`, HOME_MD) : parts.homeMd,
    llmsTxt: parts.llms ?? text(`${ORIGIN}/llms.txt`, LLMS),
    robotsTxt: parts.robots ?? text(`${ORIGIN}/robots.txt`, ROBOTS),
    sitemap: parts.sitemap === undefined ? text(`${ORIGIN}/sitemap.xml`, SITEMAP, 'application/xml') : parts.sitemap,
    sitemapUrl: `${ORIGIN}/sitemap.xml`,
    sitemapSource: parts.sitemapSource ?? 'robots',
    ...(parts.probe === null
      ? {}
      : { notFoundProbe: parts.probe ?? notFound(PROBE_URL, 'text/markdown; charset=utf-8', 40) }),
    samplePage: sample,
    samplePageMarkdown:
      parts.sampleMd === undefined ? (sample ? markdown(`${ORIGIN}/services.md`, SAMPLE_MD) : null) : parts.sampleMd,
  };
}
