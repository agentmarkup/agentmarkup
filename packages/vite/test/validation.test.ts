import { describe, it, expect } from 'vitest';
import { validateSchema } from '../src/validation/schema.js';
import { validateLlmsTxt } from '../src/validation/llms-txt.js';

describe('validateSchema', () => {
  it('reports missing required fields', () => {
    const results = validateSchema(
      { preset: 'product', name: '', url: 'https://example.com' } as any,
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
    const results = validateSchema({ name: 'Test' } as any);
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
});
