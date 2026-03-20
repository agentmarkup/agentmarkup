import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IndexHtmlTransformContext, ResolvedConfig } from 'vite';
import { agentmarkup } from '../src/plugin.js';

const HTML = '<html><head></head><body></body></html>';

function countJsonLdScripts(html: string): number {
  return (html.match(/<script type="application\/ld\+json">/g) ?? []).length;
}

function getTransformHandler(plugin: ReturnType<typeof agentmarkup>) {
  const hook = plugin.transformIndexHtml;

  if (!hook || typeof hook === 'function') {
    throw new Error('Expected transformIndexHtml hook object');
  }

  return hook.handler;
}

describe('agentmarkup plugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('matches page-specific schemas using the served path', async () => {
    const plugin = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      pages: [
        {
          path: '/faq',
          schemas: [
            {
              preset: 'faqPage',
              url: 'https://example.com/faq',
              questions: [{ question: 'Q1?', answer: 'A1.' }],
            },
          ],
        },
      ],
    });

    const result = await getTransformHandler(plugin)(HTML, {
      path: '/faq',
      filename: '/virtual/build/faq/index.html',
    } as IndexHtmlTransformContext);

    expect(result).toContain('"@type": "FAQPage"');
  });

  it('injects JSON-LD before a case-insensitive closing head tag', async () => {
    const plugin = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example',
          url: 'https://example.com',
        },
      ],
    });

    const result = await getTransformHandler(plugin)('<html><HEAD></HEAD><body></body></html>', {
      path: '/',
      filename: '/virtual/build/index.html',
    } as IndexHtmlTransformContext);

    expect(result).toContain('"@type": "WebSite"');
    expect(result.indexOf('<script type="application/ld+json">')).toBeLessThan(
      result.indexOf('</HEAD>')
    );
  });

  it('falls back to injecting before <body> when </head> is missing', async () => {
    const plugin = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example',
          url: 'https://example.com',
        },
      ],
    });

    const result = await getTransformHandler(plugin)('<html><body></body></html>', {
      path: '/',
      filename: '/virtual/build/index.html',
    } as IndexHtmlTransformContext);

    expect(result).toContain('"@type": "WebSite"');
    expect(result.indexOf('<script type="application/ld+json">')).toBeLessThan(
      result.indexOf('<body>')
    );
  });

  it('injects JSON-LD only once when malformed HTML contains multiple closing head tags', async () => {
    const plugin = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example',
          url: 'https://example.com',
        },
      ],
    });

    const result = await getTransformHandler(plugin)(
      '<html><head></head><body></head></body></html>',
      {
        path: '/',
        filename: '/virtual/build/index.html',
      } as IndexHtmlTransformContext
    );

    expect(countJsonLdScripts(result)).toBe(1);
  });

  it('reports pages with no schemas when warnOnMissingSchema is enabled', async () => {
    const plugin = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      validation: {
        warnOnMissingSchema: true,
      },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await getTransformHandler(plugin)(HTML, {
      path: '/about',
      filename: '/virtual/build/about/index.html',
    } as IndexHtmlTransformContext);

    plugin.closeBundle?.call(plugin);

    const output = consoleSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');

    expect(output).toContain('/about');
    expect(output).toContain('No structured data configured for this page');
  });

  it('skips HTML injection, asset emission, and reporting during SSR builds', async () => {
    const plugin = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example',
          url: 'https://example.com',
        },
      ],
      llmsTxt: {
        sections: [
          {
            title: 'Pages',
            entries: [{ title: 'Home', url: '/' }],
          },
        ],
      },
      aiCrawlers: {
        GPTBot: 'allow',
      },
    });

    plugin.configResolved?.({
      build: { ssr: true },
      publicDir: '/tmp',
    } as ResolvedConfig);

    const result = await getTransformHandler(plugin)(HTML, {
      path: '/',
      filename: '/virtual/build/index.html',
    } as IndexHtmlTransformContext);

    expect(result).toBe(HTML);

    const emitFile = vi.fn();
    plugin.generateBundle?.call(
      { emitFile } as unknown as Parameters<NonNullable<typeof plugin.generateBundle>>[0],
      {} as Parameters<NonNullable<typeof plugin.generateBundle>>[0],
      {}
    );

    expect(emitFile).not.toHaveBeenCalled();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    plugin.closeBundle?.call(plugin);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
