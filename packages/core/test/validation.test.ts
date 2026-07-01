import { describe, it, expect } from 'vitest';
import {
  validateExistingJsonLd,
  validateSchema,
} from '../src/validation/schema.js';
import { validateLlmsTxt } from '../src/validation/llms-txt.js';
import { validateHtmlContent } from '../src/validation/html.js';
import type { SchemaConfig } from '../src/types.js';

describe('validateSchema', () => {
  it('reports missing required fields', () => {
    const results = validateSchema(
      { preset: 'product', name: '', url: 'https://example.com' },
      '/products/test'
    );

    expect(results.some((r) => r.severity === 'error' && r.message.includes("'name'"))).toBe(true);
  });

  it('reports missing recommended fields as warnings', () => {
    const results = validateSchema(
      { preset: 'product', name: 'Widget', url: 'https://example.com' },
      '/products/widget'
    );

    expect(results.some((r) => r.severity === 'warning' && r.message.includes("'sku'"))).toBe(
      true
    );
  });

  it('reports empty faqPage questions', () => {
    const results = validateSchema({
      preset: 'faqPage',
      url: 'https://example.com/faq',
      questions: [],
    });

    expect(results.some((r) => r.message.includes('empty questions'))).toBe(true);
  });

  it('reports missing @type on custom schemas', () => {
    const results = validateSchema({ name: 'Test' } as unknown as SchemaConfig);
    expect(results.some((r) => r.message.includes('@type'))).toBe(true);
  });

  it('passes valid schemas with no errors', () => {
    const results = validateSchema({
      preset: 'webSite',
      name: 'Test',
      url: 'https://example.com',
    });

    const errors = results.filter((r) => r.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('validates known custom schema types by @type', () => {
    const results = validateSchema({
      '@type': 'SoftwareApplication',
      name: 'Example App',
      url: 'https://example.com/app',
    });

    expect(
      results.some((r) => r.severity === 'error' && r.message.includes('applicationCategory'))
    ).toBe(true);
  });
});

describe('validateExistingJsonLd', () => {
  it('reports invalid existing JSON-LD blocks', () => {
    const html = [
      '<html><head>',
      '<script type="application/ld+json">{ invalid }</script>',
      '</head><body></body></html>',
    ].join('');

    const results = validateExistingJsonLd(html, '/');
    expect(results.some((r) => r.message.includes('not valid JSON'))).toBe(true);
  });

  it('reports missing required fields for known schema types already in HTML', () => {
    const html = [
      '<html><head>',
      '<script type="application/ld+json">',
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Example',
      }),
      '</script>',
      '</head><body></body></html>',
    ].join('');

    const results = validateExistingJsonLd(html, '/');
    expect(results.some((r) => r.message.includes("required field 'url'"))).toBe(true);
  });
});

describe('validateHtmlContent', () => {
  it('warns on thin client-rendered HTML shells', () => {
    const results = validateHtmlContent(
      '<html><body><div id="root"></div></body></html>',
      '/'
    );

    expect(results.some((r) => r.message.includes('client-side rendering'))).toBe(true);
  });

  it('does not warn on pages with meaningful body content', () => {
    const results = validateHtmlContent(
      '<html><body><main><h1>Example</h1><p>This page has meaningful static HTML content.</p></main></body></html>',
      '/'
    );

    expect(results).toEqual([]);
  });
});

describe('validateLlmsTxt', () => {
  it('reports missing H1', () => {
    const results = validateLlmsTxt('Some text without heading\n');
    expect(results.some((r) => r.message.includes('H1'))).toBe(true);
  });

  it('reports missing sections', () => {
    const results = validateLlmsTxt('# Site Name\n\nJust text.\n');
    expect(results.some((r) => r.message.includes('sections'))).toBe(true);
  });

  it('reports empty link URLs', () => {
    const results = validateLlmsTxt('# Site\n\n## Section\n\n- [Title]()\n');
    expect(results.some((r) => r.message.includes('empty URL'))).toBe(true);
  });

  it('checks link validation across multiple lines independently', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## Section\n\n- [First]()\n- [Second]()\n'
    );

    const emptyUrlErrors = results.filter((r) => r.message.includes('empty URL'));
    expect(emptyUrlErrors).toHaveLength(2);
  });

  it('passes valid llms.txt', () => {
    const results = validateLlmsTxt('# Site\n\n## Docs\n\n- [Guide](https://example.com)\n');
    const errors = results.filter((r) => r.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('recognizes Markdown links whose labels contain escaped brackets', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## Docs\n\n- [A \\[b\\] title](https://example.com/x?a=%28b%29&c=1)\n'
    );
    expect(
      results.find((r) => r.message.includes('plain-text URLs'))
    ).toBeUndefined();
    expect(results.filter((r) => r.severity === 'error')).toHaveLength(0);
  });

  it('warns when links are plain-text URLs instead of Markdown links', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## Links\n\n- Website: https://example.com\n+ Download: https://example.com/download/\n1. Docs: https://example.com/docs/\n2) API: https://example.com/api/\n'
    );
    const warning = results.find((r) => r.message.includes('plain-text URLs'));
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('4 bare-URL list lines');
  });

  it('does not flag a file that already uses Markdown links', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## Docs\n\n- [Guide](https://example.com): notes\n- [API](https://example.com/api)\n'
    );
    expect(results.some((r) => r.message.includes('plain-text URL'))).toBe(false);
  });

  it('warns when a file mixes Markdown links with bare URLs', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## Docs\n\n- [Guide](https://example.com)\n- Download: https://example.com/download/\n'
    );
    const warning = results.find((r) => r.message.includes('mixes Markdown links'));
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warning');
  });

  it('warns when a list item has a Markdown link plus another bare URL', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## Docs\n\n- [Guide](https://example.com) also mirrors at https://example.com/guide.md\n'
    );
    const warning = results.find((r) => r.message.includes('mixes Markdown links'));
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warning');
  });

  it('does not flag scheme-less mentions or non-list prose URLs', () => {
    const results = validateLlmsTxt(
      '# Site\n\n## About\n\n- Voice onboarding starts at call.example.com\n\nSource: https://example.com\n'
    );
    expect(results.some((r) => r.message.includes('plain-text URL'))).toBe(false);
  });
});
