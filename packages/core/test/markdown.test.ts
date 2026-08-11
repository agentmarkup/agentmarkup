import { describe, expect, it } from 'vitest';
import {
  generateMarkdownAlternateLink,
  generatePageMarkdown,
  resolveMarkdownCanonicalUrl,
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

  it('keeps the body heading when the title is only a prefix of it', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html>',
        '<head><title>Intro</title></head>',
        '<body><main>',
        '<h1>Introduction</h1>',
        '<p>Welcome to the guide.</p>',
        '</main></body>',
        '</html>',
      ].join(''),
      pagePath: '/intro/',
      siteUrl: 'https://example.com',
    });

    // "Intro" is a prefix of "Introduction" but not equal, so the real heading
    // must survive rather than being stripped as a duplicate title.
    expect(markdown).toContain('# Introduction');
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

  it('keeps semantic headers, navigation, and asides inside main content', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html><head><title>Learning center</title></head><body>',
        '<header><nav><a href="/">Site navigation</a></nav></header>',
        '<main>',
        '<header><h1>Learn how AI sees your website</h1><p>Choose a useful path.</p></header>',
        '<nav aria-label="Learning paths"><a href="/docs/">Read the docs</a></nav>',
        '<aside><p>Recommended next reading</p><a href="/next/">Continue reading</a></aside>',
        '</main>',
        '<footer>Site footer</footer>',
        '</body></html>',
      ].join(''),
      pagePath: '/learn/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain('# Learn how AI sees your website');
    expect(markdown).toContain('Choose a useful path.');
    expect(markdown).toContain('[Read the docs](/docs/)');
    expect(markdown).toContain('Recommended next reading');
    expect(markdown).toContain('[Continue reading](/next/)');
    expect(markdown).not.toContain('Site navigation');
    expect(markdown).not.toContain('Site footer');
  });

  it('preserves standalone card links with their text and destination', () => {
    const markdown = generatePageMarkdown({
      html: [
        '<html><head><title>Paths</title></head><body><main>',
        '<a class="card" href="/checker/">',
        '<span><strong>Check my website</strong>',
        '<small>Run a free check and get clear next steps.</small></span>',
        '</a>',
        '</main></body></html>',
      ].join(''),
      pagePath: '/paths/',
      siteUrl: 'https://example.com',
    });

    expect(markdown).toContain(
      '[Check my website Run a free check and get clear next steps.](/checker/)'
    );
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

describe('resolveMarkdownCanonicalUrl', () => {
  it('uses the authored HTML canonical, including its trailing slash', () => {
    expect(
      resolveMarkdownCanonicalUrl({
        html: '<html><head><link rel="canonical" href="https://example.com/docs/" /></head></html>',
        pagePath: '/docs',
        siteUrl: 'https://example.com',
      })
    ).toBe('https://example.com/docs/');
  });

  it('uses the authored canonical regardless of link attribute order', () => {
    expect(
      resolveMarkdownCanonicalUrl({
        html: '<html><head><link href="https://example.com/docs/" rel="canonical" /></head></html>',
        pagePath: '/docs',
        siteUrl: 'https://example.com',
      })
    ).toBe('https://example.com/docs/');
  });

  it('falls back to the configured site and page path when no canonical is authored', () => {
    expect(
      resolveMarkdownCanonicalUrl({
        html: '<html><head><title>Docs</title></head></html>',
        pagePath: '/docs',
        siteUrl: 'https://example.com/',
      })
    ).toBe('https://example.com/docs');
  });
});
