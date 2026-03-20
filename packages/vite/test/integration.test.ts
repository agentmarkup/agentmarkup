import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { build } from 'vite';
import type { Plugin } from 'vite';
import type { AgentMarkupConfig } from '../src/types.js';
import { agentmarkup } from '../src/plugin.js';

const createdRoots: string[] = [];
const tempFixturesDir = join(process.cwd(), 'test', '.tmp');

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function createFixture(files: Record<string, string>): Promise<string> {
  await mkdir(tempFixturesDir, { recursive: true });
  const root = await mkdtemp(join(tempFixturesDir, 'agentmarkup-vite-'));
  createdRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(root, relativePath, content);
  }

  return root;
}

async function buildFixture(
  root: string,
  config: AgentMarkupConfig,
  inputs: string[],
  extraPlugins: Plugin[] = []
): Promise<void> {
  const inputMap = Object.fromEntries(
    inputs.map((input) => [
      input === 'index.html' ? 'index' : input.replace(/\.html$/, ''),
      join(root, input),
    ])
  );

  await build({
    root,
    logLevel: 'silent',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: inputMap,
      },
    },
    plugins: [agentmarkup(config), ...extraPlugins],
  });
}

async function readDistFile(root: string, relativePath: string): Promise<string> {
  return readFile(join(root, 'dist', relativePath), 'utf8');
}

function countJsonLdScripts(html: string): number {
  return (html.match(/<script type="application\/ld\+json">/g) ?? []).length;
}

afterEach(async () => {
  vi.restoreAllMocks();

  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe('agentmarkup integration', () => {
  it('emits llms.txt, injects JSON-LD, and patches robots.txt in a real Vite build', async () => {
    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup fixture");\n',
      'public/robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '  </head>',
        '  <body>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
      'faq/index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>FAQ</title>',
        '  </head>',
        '  <body>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
        description: 'Integration fixture for agentmarkup.',
        llmsTxt: {
          sections: [
            {
              title: 'Docs',
              entries: [
                {
                  title: 'FAQ',
                  url: '/faq',
                  description: 'Frequently asked questions',
                },
              ],
            },
          ],
        },
        globalSchemas: [
          {
            preset: 'webSite',
            name: 'Example',
            url: 'https://example.com',
            description: 'Integration fixture for agentmarkup.',
          },
          {
            preset: 'organization',
            name: 'Example Inc.',
            url: 'https://example.com',
            logo: 'https://example.com/logo.png',
          },
        ],
        pages: [
          {
            path: '/faq',
            schemas: [
              {
                preset: 'faqPage',
                url: 'https://example.com/faq',
                questions: [
                  {
                    question: 'Do builds emit JSON-LD?',
                    answer: 'Yes.',
                  },
                ],
              },
            ],
          },
        ],
        aiCrawlers: {
          GPTBot: 'allow',
          ClaudeBot: 'allow',
        },
        markdownPages: {
          enabled: true,
        },
        contentSignalHeaders: {
          enabled: true,
        },
      },
      ['index.html', 'faq/index.html']
    );

    const llmsTxt = await readDistFile(root, 'llms.txt');
    const robotsTxt = await readDistFile(root, 'robots.txt');
    const headers = await readDistFile(root, '_headers');
    const homeMarkdown = await readDistFile(root, 'index.md');
    const faqMarkdown = await readDistFile(root, 'faq.md');
    const homeHtml = await readDistFile(root, 'index.html');
    const faqHtml = await readDistFile(root, 'faq/index.html');

    expect(llmsTxt).toContain('# Example');
    expect(llmsTxt).toContain('[FAQ](https://example.com/faq.md)');

    expect(robotsTxt).toContain('User-agent: *\nAllow: /');
    expect(robotsTxt).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(robotsTxt).toContain('# BEGIN agentmarkup AI crawlers');
    expect(robotsTxt).toContain('User-agent: GPTBot');
    expect(robotsTxt).toContain('User-agent: ClaudeBot');

    expect(homeHtml).toContain('"@type": "WebSite"');
    expect(homeHtml).toContain('"@type": "Organization"');
    expect(homeHtml).toContain('type="text/markdown"');
    expect(homeHtml).not.toContain('"@type": "FAQPage"');
    expect(countJsonLdScripts(homeHtml)).toBe(2);

    expect(faqHtml).toContain('"@type": "WebSite"');
    expect(faqHtml).toContain('"@type": "Organization"');
    expect(faqHtml).toContain('"@type": "FAQPage"');
    expect(faqHtml).toContain('href="/faq.md"');
    expect(countJsonLdScripts(faqHtml)).toBe(3);

    expect(homeMarkdown).toContain('# Home');
    expect(faqMarkdown).toContain('# FAQ');
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
    expect(headers).toContain('/faq.md');
    expect(headers).toContain('Link: <https://example.com/faq>; rel="canonical"');
  });

  it('reports validation warnings during a real Vite build', async () => {
    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup warnings fixture");\n',
      'public/robots.txt': 'User-agent: *\nDisallow: /\n',
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '  </head>',
        '  <body>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
      'about/index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>About</title>',
        '  </head>',
        '  <body>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
        llmsTxt: {
          sections: [
            {
              title: 'Pages',
              entries: [{ title: 'Home', url: '/' }],
            },
          ],
        },
        pages: [
          {
            path: '/',
            schemas: [
              {
                preset: 'product',
                name: 'Widget',
                url: 'https://example.com',
              },
            ],
          },
        ],
        aiCrawlers: {
          GPTBot: 'allow',
        },
        validation: {
          warnOnMissingSchema: true,
        },
      },
      ['index.html', 'about/index.html']
    );

    const output = consoleSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');

    expect(output).toContain("Product schema missing 'sku' field");
    expect(output).toContain('No structured data configured for this page');
    expect(output).toContain('/about');
    // Note: public/robots.txt is not copied into the bundle during programmatic
    // Vite builds, so the robots.txt conflict warning cannot be tested here.
    // That path is covered by the unit test in robots-txt.test.ts.
  });

  it('reports thin HTML warnings from final emitted files', async () => {
    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup thin-html fixture");\n',
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
      },
      ['index.html']
    );

    const output = consoleSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');

    expect(output).toContain('Page body has very little indexable HTML');
    expect(output).toContain('/:');
  });

  it('validates final emitted HTML after late writeBundle prerendering', async () => {
    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup late-prerender fixture");\n',
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '  </head>',
        '  <body>',
        '    <div id="root"></div>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
      },
      ['index.html'],
      [
        {
          name: 'late-prerender-fixture',
          async writeBundle() {
            const htmlPath = join(root, 'dist', 'index.html');
            const html = await readFile(htmlPath, 'utf8');
            await writeFile(
              htmlPath,
              html.replace(
                '<div id="root"></div>',
                [
                  '<div id="root">',
                  '<main>',
                  '<h1>Home</h1>',
                  '<p>This page was prerendered after Vite emitted the HTML shell, so the final built file contains real indexable content.</p>',
                  '</main>',
                  '</div>',
                ].join('')
              ),
              'utf8'
            );
          },
        },
      ]
    );

    const output = consoleSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');

    expect(output).not.toContain('Page body has very little indexable HTML');
  });

  it('preserves existing llms.txt and robots.txt and skips duplicate JSON-LD types', async () => {
    const existingLlms = '# Existing\n\n## Docs\n\n- [Guide](https://example.com/guide)\n';
    const existingRobots = [
      'User-agent: *',
      'Allow: /',
      '',
      'User-agent: GPTBot',
      'Allow: /',
      '',
      'User-agent: ClaudeBot',
      'Allow: /',
      '',
    ].join('\n');

    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup preserve fixture");\n',
      'public/llms.txt': existingLlms,
      'public/robots.txt': existingRobots,
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '    <script type="application/ld+json">',
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Example',
          url: 'https://example.com',
        }),
        '    </script>',
        '  </head>',
        '  <body>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
        llmsTxt: {
          sections: [
            {
              title: 'Generated',
              entries: [{ title: 'Home', url: '/', description: 'Generated content' }],
            },
          ],
        },
        globalSchemas: [
          {
            preset: 'webSite',
            name: 'Example',
            url: 'https://example.com',
          },
        ],
        aiCrawlers: {
          GPTBot: 'allow',
          ClaudeBot: 'allow',
        },
      },
      ['index.html']
    );

    const llmsTxt = await readDistFile(root, 'llms.txt');
    const robotsTxt = await readDistFile(root, 'robots.txt');
    const homeHtml = await readDistFile(root, 'index.html');

    expect(llmsTxt).toBe(existingLlms);
    expect(robotsTxt).toBe(existingRobots);
    expect(countJsonLdScripts(homeHtml)).toBe(1);
  });

  it('emits markdown canonical headers even without Content-Signal enabled', async () => {
    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup markdown headers fixture");\n',
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '  </head>',
        '  <body>',
        '    <main><h1>Home</h1><p>Readable body copy for markdown output.</p></main>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
        markdownPages: {
          enabled: true,
        },
      },
      ['index.html']
    );

    const headers = await readDistFile(root, '_headers');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
    expect(headers).not.toContain('Content-Signal:');
  });

  it('preserves markdown canonical headers when patching an existing public _headers file', async () => {
    const root = await createFixture({
      'src/main.js': 'console.log("agentmarkup existing headers fixture");\n',
      'public/_headers': [
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '',
      ].join('\n'),
      'index.html': [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <title>Home</title>',
        '  </head>',
        '  <body>',
        '    <main><h1>Home</h1><p>Readable body copy for markdown output.</p></main>',
        '    <script type="module" src="/src/main.js"></script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    });

    await buildFixture(
      root,
      {
        site: 'https://example.com',
        name: 'Example',
        markdownPages: {
          enabled: true,
        },
        contentSignalHeaders: {
          enabled: true,
        },
      },
      ['index.html']
    );

    const headers = await readDistFile(root, '_headers');

    expect(headers).toContain('/assets/*');
    expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
  });
});
