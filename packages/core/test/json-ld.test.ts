import { describe, it, expect } from 'vitest';
import { serializeJsonLd, generateJsonLdTags } from '../src/generators/json-ld.js';
import {
  filterJsonLdByExistingTypes,
  findExistingJsonLdTypes,
} from '../src/html.js';

describe('serializeJsonLd', () => {
  it('wraps JSON-LD in script tag', () => {
    const result = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Test',
    });

    expect(result).toContain('<script type="application/ld+json">');
    expect(result).toContain('</script>');
    expect(result).toContain('"@type": "WebSite"');
  });

  it('escapes XSS-dangerous characters', () => {
    const result = serializeJsonLd({
      '@type': 'Article',
      name: '<script>alert("xss")</script>',
      description: "it's a test & more",
    });

    expect(result).not.toContain('<script>alert');
    expect(result).toContain('\\u003C');
    expect(result).toContain('\\u003E');
    expect(result).toContain('\\u0026');
    expect(result).toContain('\\u0027');
  });
});

describe('generateJsonLdTags', () => {
  it('generates multiple script tags', () => {
    const result = generateJsonLdTags([
      { '@type': 'WebSite', name: 'A' },
      { '@type': 'Organization', name: 'B' },
    ]);

    const scriptCount = (result.match(/<script type="application\/ld\+json">/g) || []).length;
    expect(scriptCount).toBe(2);
  });
});

describe('existing JSON-LD helpers', () => {
  it('detects schema types from existing script tags and @graph payloads', () => {
    const html = [
      '<html><head>',
      '<script type="application/ld+json">',
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name: 'Example' },
          { '@type': ['Organization', 'Thing'], name: 'Example Inc.' },
        ],
      }),
      '</script>',
      '</head><body></body></html>',
    ].join('');

    const types = findExistingJsonLdTypes(html);
    expect(types.has('website')).toBe(true);
    expect(types.has('organization')).toBe(true);
    expect(types.has('thing')).toBe(true);
  });

  it('skips injecting schema types that already exist in the page HTML', () => {
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

    const filtered = filterJsonLdByExistingTypes(
      [
        { '@type': 'WebSite', name: 'Example' },
        { '@type': 'Organization', name: 'Example Inc.' },
      ],
      html
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ '@type': 'Organization' });
  });
});
