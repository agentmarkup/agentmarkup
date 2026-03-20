import { describe, it, expect } from 'vitest';
import { serializeJsonLd, generateJsonLdTags } from '../src/generators/json-ld.js';

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
