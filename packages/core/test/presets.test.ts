import { describe, it, expect } from 'vitest';
import { presetToJsonLd } from '../src/presets/resolve.js';

describe('presetToJsonLd', () => {
  it('builds webSite schema', () => {
    const result = presetToJsonLd({
      preset: 'webSite',
      name: 'My Site',
      url: 'https://example.com',
    });

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('WebSite');
    expect(result.name).toBe('My Site');
  });

  it('builds organization schema with logo', () => {
    const result = presetToJsonLd({
      preset: 'organization',
      name: 'Acme',
      url: 'https://acme.com',
      logo: 'https://acme.com/logo.png',
    });

    expect(result['@type']).toBe('Organization');
    expect(result.logo).toBe('https://acme.com/logo.png');
  });

  it('builds article schema with string author', () => {
    const result = presetToJsonLd({
      preset: 'article',
      headline: 'Test Post',
      url: 'https://example.com/post',
      datePublished: '2025-01-01',
      author: 'Jane Doe',
    });

    expect(result['@type']).toBe('Article');
    expect((result.author as { name: string }).name).toBe('Jane Doe');
  });

  it('builds faqPage schema', () => {
    const result = presetToJsonLd({
      preset: 'faqPage',
      url: 'https://example.com/faq',
      questions: [
        { question: 'Q1?', answer: 'A1.' },
        { question: 'Q2?', answer: 'A2.' },
      ],
    });

    expect(result['@type']).toBe('FAQPage');
    expect(result.mainEntity).toHaveLength(2);
  });

  it('builds product schema with offers', () => {
    const result = presetToJsonLd({
      preset: 'product',
      name: 'Widget',
      url: 'https://shop.com/widget',
      sku: 'W001',
      brand: 'Acme',
      offers: { price: 29.99, priceCurrency: 'USD', availability: 'InStock' },
    });

    expect(result['@type']).toBe('Product');
    expect(result.sku).toBe('W001');
    expect((result.brand as { name: string }).name).toBe('Acme');
    expect(result.offers).toHaveLength(1);
  });

  it('builds offer schema', () => {
    const result = presetToJsonLd({
      preset: 'offer',
      price: 9.99,
      priceCurrency: 'EUR',
      availability: 'InStock',
    });

    expect(result['@type']).toBe('Offer');
    expect(result.availability).toBe('https://schema.org/InStock');
  });

  it('passes through custom schemas', () => {
    const result = presetToJsonLd({
      '@type': 'Event',
      name: 'Conference',
      startDate: '2025-06-01',
    });

    expect(result['@type']).toBe('Event');
    expect(result['@context']).toBe('https://schema.org');
  });
});
