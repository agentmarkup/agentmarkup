import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstroConfig, AstroIntegration, AstroIntegrationLogger } from 'astro';
import { agentmarkup } from '../src/index.js';

const createdRoots: string[] = [];
const tempFixturesDir = join(process.cwd(), 'test', '.tmp');
type AstroConfigDoneArgs = Parameters<
  NonNullable<NonNullable<AstroIntegration['hooks']>['astro:config:done']>
>[0];
type AstroBuildDoneArgs = Parameters<
  NonNullable<NonNullable<AstroIntegration['hooks']>['astro:build:done']>
>[0];

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
  const root = await mkdtemp(join(tempFixturesDir, 'agentmarkup-astro-'));
  createdRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(root, relativePath, content);
  }

  return root;
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

describe('@agentmarkup/astro', () => {
  it('injects JSON-LD and writes llms.txt and robots.txt at build:done', async () => {
    const root = await createFixture({
      'dist/index.html': '<html><head><title>Home</title></head><body></body></html>',
      'dist/faq/index.html': '<html><head><title>FAQ</title></head><body></body></html>',
      'public/robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      description: 'Astro fixture for agentmarkup.',
      llmsTxt: {
        sections: [
          {
            title: 'Docs',
            entries: [{ title: 'FAQ', url: '/faq', description: 'Frequently asked questions' }],
          },
        ],
      },
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example',
          url: 'https://example.com',
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
              questions: [{ question: 'Do builds emit JSON-LD?', answer: 'Yes.' }],
            },
          ],
        },
      ],
      aiCrawlers: {
        GPTBot: 'allow',
        ClaudeBot: 'allow',
      },
    });

    await integration.hooks['astro:config:done']?.({
      config: {
        publicDir: pathToFileURL(join(root, 'public/')),
      } as unknown as AstroConfig,
      setAdapter: () => {},
      injectTypes: () => pathToFileURL(join(root, 'types.d.ts')),
      logger: {} as unknown as AstroIntegrationLogger,
    } as AstroConfigDoneArgs);

    await integration.hooks['astro:build:done']?.({
      dir: pathToFileURL(join(root, 'dist/')),
      routes: [],
      pages: [{ pathname: '/' }, { pathname: '/faq' }],
    } as AstroBuildDoneArgs);

    const homeHtml = await readFile(join(root, 'dist', 'index.html'), 'utf8');
    const faqHtml = await readFile(join(root, 'dist', 'faq', 'index.html'), 'utf8');
    const llmsTxt = await readFile(join(root, 'dist', 'llms.txt'), 'utf8');
    const robotsTxt = await readFile(join(root, 'dist', 'robots.txt'), 'utf8');

    expect(homeHtml).toContain('"@type": "WebSite"');
    expect(homeHtml).toContain('"@type": "Organization"');
    expect(faqHtml).toContain('"@type": "FAQPage"');

    expect(llmsTxt).toContain('# Example');
    expect(llmsTxt).toContain('[FAQ](https://example.com/faq)');

    expect(robotsTxt).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(robotsTxt).toContain('# BEGIN agentmarkup AI crawlers');
    expect(robotsTxt).toContain('User-agent: GPTBot');
    expect(robotsTxt).toContain('User-agent: ClaudeBot');
  });

  it('reports pages with no schemas when warnOnMissingSchema is enabled', async () => {
    const root = await createFixture({
      'dist/about/index.html': '<html><head><title>About</title></head><body></body></html>',
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      validation: {
        warnOnMissingSchema: true,
      },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await integration.hooks['astro:build:done']?.({
      dir: pathToFileURL(join(root, 'dist/')),
      routes: [],
      pages: [{ pathname: '/about' }],
    } as AstroBuildDoneArgs);

    const output = consoleSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');

    expect(output).toContain('/about');
    expect(output).toContain('No structured data configured for this page');
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
      'dist/index.html': [
        '<html><head>',
        '<script type="application/ld+json">',
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Example',
          url: 'https://example.com',
        }),
        '</script>',
        '</head><body></body></html>',
      ].join(''),
      'public/llms.txt': existingLlms,
      'public/robots.txt': existingRobots,
    });

    const integration = agentmarkup({
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
    });

    await integration.hooks['astro:config:done']?.({
      config: {
        publicDir: pathToFileURL(join(root, 'public/')),
      } as unknown as AstroConfig,
      setAdapter: () => {},
      injectTypes: () => pathToFileURL(join(root, 'types.d.ts')),
      logger: {} as unknown as AstroIntegrationLogger,
    } as AstroConfigDoneArgs);

    await integration.hooks['astro:build:done']?.({
      dir: pathToFileURL(join(root, 'dist/')),
      routes: [],
      pages: [{ pathname: '/' }],
    } as AstroBuildDoneArgs);

    const homeHtml = await readFile(join(root, 'dist', 'index.html'), 'utf8');
    const llmsTxt = await readFile(join(root, 'dist', 'llms.txt'), 'utf8');
    const robotsTxt = await readFile(join(root, 'dist', 'robots.txt'), 'utf8');

    expect((homeHtml.match(/application\/ld\+json/g) ?? [])).toHaveLength(1);
    expect(llmsTxt).toBe(existingLlms);
    expect(robotsTxt).toBe(existingRobots);
  });
});
