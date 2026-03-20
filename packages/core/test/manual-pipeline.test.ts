import { describe, expect, it } from 'vitest';
import {
  generateContentSignalHeaders,
  generateLlmsFullTxt,
  generateLlmsTxtDiscoveryLink,
  generateJsonLdTags,
  generateLlmsTxt,
  generateMarkdownCanonicalHeaders,
  generatePageMarkdown,
  patchRobotsTxt,
  presetToJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '../src/index.js';

describe('manual pipeline helpers', () => {
  it('generates locale-specific llms.txt through the public API', () => {
    const llms = generateLlmsTxt({
      site: 'https://gritsprout.com',
      name: 'GritSprout',
      description: 'GritSprout is the app for daily habits and rewards for kids.',
      llmsTxt: {
        sections: [
          {
            title: 'Public pages',
            entries: [
              {
                title: 'Pricing',
                url: '/pricing',
                description: 'One subscription covers the whole family.',
              },
              {
                title: 'FAQ',
                url: '/faq',
                description: 'Frequently asked questions about GritSprout.',
              },
            ],
          },
        ],
      },
    });

    expect(llms).toContain('# GritSprout');
    expect(llms).toContain('https://gritsprout.com/pricing');
    expect(llms).toContain('Frequently asked questions about GritSprout.');
    expect(validateLlmsTxt(llms ?? '')).toEqual([]);
  });

  it('generates llms-full.txt through the public API', () => {
    const llmsFull = generateLlmsFullTxt(
      {
        site: 'https://gritsprout.com',
        name: 'GritSprout',
        description: 'GritSprout is the app for daily habits and rewards for kids.',
        llmsTxt: {
          sections: [
            {
              title: 'Public pages',
              entries: [{ title: 'Pricing', url: '/pricing', description: 'Plans and billing.' }],
            },
          ],
        },
        llmsFullTxt: {
          enabled: true,
        },
        markdownPages: {
          enabled: true,
        },
      },
      {
        contentByUrl: {
          'https://gritsprout.com/pricing.md': '# Pricing\n\nPlans and billing.\n',
        },
      }
    );

    expect(llmsFull).toContain('### Pricing');
    expect(llmsFull).toContain('https://gritsprout.com/pricing.md');
  });

  it('patches existing robots.txt without losing existing directives', () => {
    const existing = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /app',
      'Sitemap: https://mar.ro/sitemap.xml',
      '',
    ].join('\n');

    const crawlers = {
      GPTBot: 'allow' as const,
      ClaudeBot: 'allow' as const,
    };

    const patched = patchRobotsTxt(existing, crawlers);

    expect(patched).toContain('Sitemap: https://mar.ro/sitemap.xml');
    expect(patched).toContain('User-agent: GPTBot');
    expect(patched).toContain('User-agent: ClaudeBot');
    expect(validateRobotsTxt(patched, crawlers)).toEqual([]);
  });

  it('builds JSON-LD tags from public preset helpers for manual HTML injection', () => {
    const jsonLd = generateJsonLdTags([
      presetToJsonLd({
        preset: 'webSite',
        name: 'Măr',
        url: 'https://mar.ro',
      }),
      presetToJsonLd({
        preset: 'organization',
        name: 'Măr',
        url: 'https://mar.ro',
        description: 'Daily habits and rewards for kids.',
      }),
    ]);

    expect(jsonLd).toContain('<script type="application/ld+json">');
    expect(jsonLd).toContain('"@type": "WebSite"');
    expect(jsonLd).toContain('"@type": "Organization"');
  });

  it('generates markdown mirrors from final HTML through the public API', () => {
    const markdown = generatePageMarkdown({
      html: '<html><head><title>FAQ</title></head><body><main><h1>FAQ</h1><p>Answers.</p></main></body></html>',
      pagePath: '/faq/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain('# FAQ');
    expect(markdown).toContain('Answers.');
  });

  it('builds Content-Signal headers through the public API', () => {
    const headers = generateContentSignalHeaders();
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
  });

  it('builds an llms.txt discovery link through the public API', () => {
    const link = generateLlmsTxtDiscoveryLink();
    expect(link).toContain('/llms.txt');
    expect(link).toContain('text/plain');
  });

  it('builds markdown canonical headers through the public API', () => {
    const headers = generateMarkdownCanonicalHeaders([
      {
        markdownPath: '/faq.md',
        canonicalUrl: 'https://example.com/faq',
      },
    ]);

    expect(headers).toContain('/faq.md');
    expect(headers).toContain('Link: <https://example.com/faq>; rel="canonical"');
  });
});
