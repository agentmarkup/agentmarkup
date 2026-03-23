import { describe, expect, it } from 'vitest';
import {
  generateContentSignalHeaderValue,
  generateContentSignalHeaders,
  generateMarkdownCanonicalHeaders,
  patchHeadersFile,
  patchMarkdownCanonicalHeaders,
} from '../src/generators/headers.js';

describe('Content-Signal headers', () => {
  it('generates a default Content-Signal header value', () => {
    expect(generateContentSignalHeaderValue()).toBe(
      'ai-train=yes, search=yes, ai-input=yes'
    );
  });

  it('creates a headers block with markers', () => {
    const headers = generateContentSignalHeaders();
    expect(headers).toContain('# BEGIN agentmarkup Content-Signal');
    expect(headers).toContain('/*');
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
  });

  it('patches an existing _headers file without losing previous rules', () => {
    const existing = [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '',
      '/llms.txt',
      '  Cache-Control: public, max-age=300',
      '',
    ].join('\n');

    const patched = patchHeadersFile(existing, {});

    expect(patched).toContain('X-Content-Type-Options: nosniff');
    expect(patched).toContain('/llms.txt');
    expect(patched).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
  });

  it('preserves an existing matching Content-Signal block', () => {
    const existing = [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '',
      '# BEGIN agentmarkup Content-Signal',
      '/*',
      '  Content-Signal: ai-train=yes, search=yes, ai-input=yes',
      '# END agentmarkup Content-Signal',
      '',
    ].join('\n');

    expect(patchHeadersFile(existing, {})).toBe(existing);
  });

  it('rejects Content-Signal paths with control characters', () => {
    expect(() =>
      generateContentSignalHeaders({
        path: '/*\n/evil',
      })
    ).toThrow(/Invalid contentSignalHeaders\.path/);
  });

  it('rejects runtime Content-Signal directive values outside yes or no', () => {
    expect(() =>
      generateContentSignalHeaders({
        aiTrain: 'maybe' as 'yes',
      })
    ).toThrow(/Invalid contentSignalHeaders\.aiTrain "maybe"/);
  });

  it('creates markdown canonical headers for markdown mirrors', () => {
    const headers = generateMarkdownCanonicalHeaders([
      {
        markdownPath: '/index.md',
        canonicalUrl: 'https://example.com/',
      },
      {
        markdownPath: '/faq.md',
        canonicalUrl: 'https://example.com/faq',
      },
    ]);

    expect(headers).toContain('# BEGIN agentmarkup Markdown canonicals');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
    expect(headers).toContain('/faq.md');
    expect(headers).toContain('Link: <https://example.com/faq>; rel="canonical"');
  });

  it('patches markdown canonical headers without losing previous rules', () => {
    const existing = [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '',
      '/llms.txt',
      '  Cache-Control: public, max-age=300',
      '',
    ].join('\n');

    const patched = patchMarkdownCanonicalHeaders(existing, [
      {
        markdownPath: '/pricing.md',
        canonicalUrl: 'https://example.com/pricing',
      },
    ]);

    expect(patched).toContain('X-Content-Type-Options: nosniff');
    expect(patched).toContain('/pricing.md');
    expect(patched).toContain(
      'Link: <https://example.com/pricing>; rel="canonical"'
    );
  });

  it('preserves existing matching markdown canonical rules without markers', () => {
    const existing = [
      '/index.md',
      '  Link: <https://example.com/>; rel="canonical"',
      '',
      '/faq.md',
      '  Link: <https://example.com/faq>; rel="canonical"',
      '',
    ].join('\n');

    expect(
      patchMarkdownCanonicalHeaders(existing, [
        {
          markdownPath: '/index.md',
          canonicalUrl: 'https://example.com/',
        },
        {
          markdownPath: '/faq.md',
          canonicalUrl: 'https://example.com/faq',
        },
      ])
    ).toBe(existing);
  });

  it('rejects markdown canonical entries with control characters', () => {
    expect(() =>
      generateMarkdownCanonicalHeaders([
        {
          markdownPath: '/faq.md\n/x',
          canonicalUrl: 'https://example.com/faq',
        },
      ])
    ).toThrow(/Invalid markdown canonical markdownPath/);
  });
});
