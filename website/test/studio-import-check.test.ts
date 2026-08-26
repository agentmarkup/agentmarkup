import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  RemoteResource,
  SiteCheckResponse,
} from '../src/checker/types';
import { analyzeSiteCheck } from '../src/checker/analyze';
import { inspectSite } from '../src/studio/import-check';

const MAX_RESPONSE_SIZE = 6 * 1024 * 1024;
const RAW_PAGE_TEXT = 'PRIVATE RAW HOMEPAGE COPY MUST NOT LEAK';
const HOMEPAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta name="description" content="An example site.">
    <link rel="canonical" href="https://example.com/">
    <link rel="alternate" type="text/plain" href="/llms.txt">
  </head>
  <body>
    <main><h1>Example</h1><p>${RAW_PAGE_TEXT} with enough meaningful content for the checker.</p></main>
  </body>
</html>`;

function resource(overrides: Partial<RemoteResource> = {}): RemoteResource {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    ok: true,
    contentType: 'text/plain',
    body: 'Readable resource body.',
    ...overrides,
  };
}

function siteCheckFixture(
  overrides: Partial<SiteCheckResponse> = {}
): SiteCheckResponse {
  return {
    targetUrl: 'https://example.com',
    origin: 'https://example.com',
    fetchedAt: '2026-08-26T20:00:00.000Z',
    normalizedFrom: null,
    homepage: resource({
      contentType: 'text/html; charset=utf-8',
      body: HOMEPAGE_HTML,
    }),
    homepageMarkdown: resource({
      requestedUrl: 'https://example.com/index.md',
      finalUrl: 'https://example.com/index.md',
      contentType: 'text/markdown',
      body: '# Example\n\nThis is a readable markdown mirror with enough useful prose to pass the checker resource validation and represent the homepage clearly for agents.',
    }),
    llmsTxt: resource({
      requestedUrl: 'https://example.com/llms.txt',
      finalUrl: 'https://example.com/llms.txt',
      body: '# Example\n\n## Docs\n- [Documentation](https://example.com/docs)',
    }),
    robotsTxt: resource({
      requestedUrl: 'https://example.com/robots.txt',
      finalUrl: 'https://example.com/robots.txt',
      body: [
        'User-agent: GPTBot',
        'Allow: /',
        'User-agent: ClaudeBot',
        'Allow: /',
        'User-agent: PerplexityBot',
        'Allow: /',
        'User-agent: Google-Extended',
        'Allow: /',
        'User-agent: CCBot',
        'Allow: /',
      ].join('\n'),
    }),
    sitemap: resource({
      requestedUrl: 'https://example.com/sitemap.xml',
      finalUrl: 'https://example.com/sitemap.xml',
      contentType: 'application/xml',
      body: '<urlset></urlset>',
    }),
    sitemapUrl: 'https://example.com/sitemap.xml',
    sitemapSource: 'robots',
    notFoundProbe: resource({
      requestedUrl: 'https://example.com/missing',
      finalUrl: 'https://example.com/missing',
      status: 404,
      ok: false,
      body: null,
    }),
    samplePage: null,
    samplePageMarkdown: null,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeAll(() => {
  const browserWindow = new Window();
  vi.stubGlobal('DOMParser', browserWindow.DOMParser);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('inspectSite', () => {
  it('maps a successful checker response into a conservative draft patch', async () => {
    const fixture = siteCheckFixture({
      homepage: resource({
        contentType: 'text/html; charset=utf-8',
        body: HOMEPAGE_HTML.replace(' lang="en"', '')
          .replace(
            '    <meta name="description" content="An example site.">\n',
            ''
          )
          .replace('<h1>Example</h1>', ''),
      }),
    });
    const analysis = analyzeSiteCheck(fixture);
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(fixture));

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.sourceUrl).toBe('https://example.com');
    expect(result.draftPatch?.identity).toEqual({ site: 'https://example.com' });
    expect(result.draftPatch?.content).toEqual({
      markdownMirrors: { enabled: true, exclude: [] },
    });
    expect(result.summaryText).toMatch(/error \d+, warning \d+, pass \d+/);
    expect(result.summaryText).toContain('llms.txt: present');
    expect(result.summaryText).not.toContain(RAW_PAGE_TEXT);
    expect(result.summaryText).not.toContain('<html');
    expect(analysis.items.length).toBeGreaterThan(10);
    expect(result.findings).toHaveLength(10);
    expect(result.findings).toEqual(
      analysis.items.slice(0, 10).map((item) => ({
        level: item.level,
        title: item.title.slice(0, 80),
      }))
    );
    expect(
      result.findings?.every(
        (finding) =>
          Object.keys(finding).sort().join(',') === 'level,title' &&
          /^(?:pass|warning|error)$/.test(finding.level) &&
          finding.title.length <= 80
      )
    ).toBe(true);
    expect(JSON.stringify(result.findings)).not.toContain(RAW_PAGE_TEXT);
    expect(JSON.stringify(result.findings)).not.toMatch(/<\/?[a-z][^>]*>/i);
  });

  it('returns a rate-limit outcome with the requested wait', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: 'Too many requests.',
          retryAfterSeconds: 47,
        },
        429
      )
    );

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      humanActionNeeded: 'rate-limited',
      errorCode: 'rate_limited',
    });
    expect(result.summaryText).toContain('47 seconds');
    expect(result).not.toHaveProperty('findings');
  });

  it('returns a rate-limit outcome when the 429 body is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response('Too many requests.', { status: 429 })
    );

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      humanActionNeeded: 'rate-limited',
      errorCode: 'rate_limited',
    });
    expect(result.summaryText).toBe(
      'The site checker is rate-limited. Wait before trying again.'
    );
    expect(result).not.toHaveProperty('findings');
  });

  it('returns a human-action outcome when Turnstile is required', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          error: 'Verification required.',
          turnstileRequired: true,
          turnstileSiteKey: 'site-key',
        },
        403
      )
    );

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toMatchObject({
      ok: false,
      humanActionNeeded: 'turnstile',
      errorCode: 'turnstile_required',
    });
    expect(result.summaryText).toContain('complete the checker verification');
    expect(result).not.toHaveProperty('findings');
  });

  it('normalizes a bare domain before posting it to the checker', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(siteCheckFixture())
    );

    await inspectSite('example.com', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0];
    expect(input).toBe('/api/check');
    expect(JSON.parse(String(init?.body))).toEqual({
      url: 'https://example.com',
    });
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBeUndefined();
  });

  it('rejects non-http URLs without fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await inspectSite('ftp://x', fetchImpl);

    expect(result).toMatchObject({ ok: false, errorCode: 'invalid_url' });
    expect(result).not.toHaveProperty('findings');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns fetch_failed when the request rejects', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network unavailable');
    });

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toMatchObject({ ok: false, errorCode: 'fetch_failed' });
    expect(result).not.toHaveProperty('findings');
  });

  it('returns fetch_failed when the response is not JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response('<html>not json</html>', { status: 200 })
    );

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toMatchObject({ ok: false, errorCode: 'fetch_failed' });
    expect(result).not.toHaveProperty('findings');
  });

  it('rejects an oversized content-length without reading or parsing the body', async () => {
    const response = new Response('{"invalid":', {
      status: 200,
      headers: { 'content-length': String(MAX_RESPONSE_SIZE + 1) },
    });
    const textSpy = vi.spyOn(response, 'text');
    const jsonSpy = vi.spyOn(response, 'json');
    const fetchImpl = vi.fn<typeof fetch>(async () => response);

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toEqual({
      ok: false,
      errorCode: 'response_too_large',
      summaryText: 'The site checker response was too large to inspect safely.',
    });
    expect(textSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized response body before parsing it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response('x'.repeat(MAX_RESPONSE_SIZE + 1), { status: 200 })
    );

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toEqual({
      ok: false,
      errorCode: 'response_too_large',
      summaryText: 'The site checker response was too large to inspect safely.',
    });
  });

  it('returns timeout for an AbortError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result).toMatchObject({ ok: false, errorCode: 'timeout' });
    expect(result).not.toHaveProperty('findings');
  });

  it('keeps a summary with 50 findings within 1200 characters', async () => {
    const manyFindings = Array.from(
      { length: 50 },
      (_, index) => `- [](https://example.com/page-${index})`
    ).join('\n');
    const fixture = siteCheckFixture({
      llmsTxt: resource({
        requestedUrl: 'https://example.com/llms.txt',
        finalUrl: 'https://example.com/llms.txt',
        body: `# Example\n\n## Pages\n${manyFindings}`,
      }),
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(fixture));

    const result = await inspectSite('https://example.com', fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.summaryText.length).toBeLessThanOrEqual(1_200);
    expect(result.summaryText).toContain('warning: llms.txt needs improvement');
  });
});
