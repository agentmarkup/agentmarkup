import { describe, expect, it } from 'vitest';
import {
  generateMarkdownAlternateLink,
  generatePageMarkdown,
} from '../src/generators/markdown.js';

describe('generatePageMarkdown', () => {
  it('converts page content into markdown and strips navigation chrome', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html>',
        '<head>',
        '<title>Guide</title>',
        '<meta name="description" content="Learn the feature." />',
        '</head>',
        '<body>',
        '<nav><a href="/docs">Docs</a></nav>',
        '<main>',
        '<h1>Guide</h1>',
        '<p>Use <code>agentmarkup</code> to add structured data.</p>',
        '<ul><li><a href="/docs/json-ld/">JSON-LD docs</a></li></ul>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      pagePath: '/guide/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain('# Guide');
    expect(markdown).toContain('> Learn the feature.');
    expect(markdown).toContain('Source: https://example.com/guide/');
    expect(markdown).toContain('Use `agentmarkup` to add structured data.');
    expect(markdown).toContain('- [JSON-LD docs](/docs/json-ld/)');
    expect(markdown).not.toContain('Docs');
  });

  it('falls back to head metadata when the body is a thin client shell', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html>',
        '<head>',
        '<title>Checker</title>',
        '<meta name="description" content="Inspect machine-readable site metadata." />',
        '</head>',
        '<body><div id="root"></div></body>',
        '</html>',
      ].join(''),
      pagePath: '/checker/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain('# Checker');
    expect(markdown).toContain('Inspect machine-readable site metadata.');
  });

  it('preserves block separation and strips UI-only code chrome', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html>',
        '<head><title>Docs</title></head>',
        '<body>',
        '<main>',
        '<section>',
        '<h2>Configuration</h2>',
        '<p>First paragraph.</p>',
        '<p>Second paragraph.</p>',
        '<div class="code-block">',
        '<button class="copy-btn" aria-label="Copy code">Copy</button>',
        '<pre><code><span class="line-numbers" aria-hidden="true"><span>1</span><span>2</span></span><span class="code-content">const answer = 42;\nconsole.log(answer);</span></code></pre>',
        '</div>',
        '<p>Use <code>&lt;link rel="alternate"&gt;</code> in the head.</p>',
        '</section>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      pagePath: '/docs/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain('## Configuration');
    expect(markdown).toContain('First paragraph.');
    expect(markdown).toContain('Second paragraph.');
    expect(markdown).not.toContain('Copy');
    expect(markdown).not.toContain('123456');
    expect(markdown).not.toContain('234567');
    expect(markdown).toContain('const answer = 42;');
    expect(markdown).toContain('Use `<link rel="alternate">` in the head.');
  });

  it('removes tab chrome, preserves badge spacing, and decodes numeric entities', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html>',
        '<head><title>Patterns</title></head>',
        '<body>',
        '<main>',
        '<div class="fw-tabs"><button>Vite</button><button>Astro</button></div>',
        '<p><span class="preset">webSite</span><span class="preset">organization</span><span class="preset">article</span></p>',
        '<pre><code class="language-ts">const label = &#x27;agentmarkup&#x27;;\nconsole.log(label);</code></pre>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      pagePath: '/patterns/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).not.toContain('ViteAstro');
    expect(markdown).not.toContain('\nVite\n');
    expect(markdown).toContain('webSite organization article');
    expect(markdown).toContain("const label = 'agentmarkup';");
    expect(markdown).toContain('```ts');
  });

  it('leaves malformed numeric entities unchanged instead of throwing', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html>',
        '<head><title>Broken Entities</title></head>',
        '<body>',
        '<main>',
        '<pre><code>&#abc; &#99999999; &#55296;</code></pre>',
        '</main>',
        '</body>',
        '</html>',
      ].join(''),
      pagePath: '/broken-entities/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain('&#abc;');
    expect(markdown).toContain('&#99999999;');
    expect(markdown).toContain('&#55296;');
  });
});

describe('generateMarkdownAlternateLink', () => {
  it('builds a discoverable markdown alternate link for a page', () => {
    const link = generateMarkdownAlternateLink('/docs/llms-txt/');
    expect(link).toContain('type="text/markdown"');
    expect(link).toContain('href="/docs/llms-txt.md"');
  });

  it('escapes dangerous attribute characters in the generated href', () => {
    const link = generateMarkdownAlternateLink('/docs/"<&>');
    expect(link).toContain('&quot;');
    expect(link).toContain('&lt;');
    expect(link).toContain('&gt;');
    expect(link).toContain('&amp;');
  });
});
