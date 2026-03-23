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
      agentCard: {
        version: '1.0.0',
        supportedInterfaces: [
          {
            url: 'https://agent.example.com/a2a/v1',
            protocolBinding: 'HTTP+JSON',
            protocolVersion: '1.0',
          },
        ],
        skills: [
          {
            id: 'docs-search',
            name: 'Docs search',
            description: 'Answers product questions from the docs set.',
            tags: ['docs', 'support'],
          },
        ],
      },
      llmsTxt: {
        sections: [
          {
            title: 'Docs',
            entries: [{ title: 'FAQ', url: '/faq', description: 'Frequently asked questions' }],
          },
        ],
      },
      llmsFullTxt: {
        enabled: true,
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
      markdownPages: {
        enabled: true,
      },
      contentSignalHeaders: {
        enabled: true,
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
    const agentCard = await readFile(
      join(root, 'dist', '.well-known', 'agent-card.json'),
      'utf8'
    );
    const llmsTxt = await readFile(join(root, 'dist', 'llms.txt'), 'utf8');
    const llmsFullTxt = await readFile(join(root, 'dist', 'llms-full.txt'), 'utf8');
    const faqMarkdown = await readFile(join(root, 'dist', 'faq.md'), 'utf8');
    const headers = await readFile(join(root, 'dist', '_headers'), 'utf8');
    const robotsTxt = await readFile(join(root, 'dist', 'robots.txt'), 'utf8');

    expect(homeHtml).toContain('"@type": "WebSite"');
    expect(homeHtml).toContain('"@type": "Organization"');
    expect(homeHtml).toContain('type="text/plain"');
    expect(homeHtml).toContain('href="/llms.txt"');
    expect(homeHtml).toContain('type="text/markdown"');
    expect(faqHtml).toContain('"@type": "FAQPage"');
    expect(faqHtml).toContain('href="/llms.txt"');
    expect(faqHtml).toContain('href="/faq.md"');

    expect(agentCard).toContain('"supportedInterfaces"');
    expect(agentCard).toContain('"protocolBinding": "HTTP+JSON"');
    expect(llmsTxt).toContain('# Example');
    expect(llmsTxt).toContain('[FAQ](https://example.com/faq.md)');
    expect(llmsFullTxt).toContain('### FAQ');
    expect(llmsFullTxt).toContain('Preferred fetch: https://example.com/faq.md');
    expect(faqMarkdown).toContain('# FAQ');
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
    expect(headers).toContain('/faq.md');
    expect(headers).toContain('Link: <https://example.com/faq>; rel="canonical"');

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

  it('preserves an existing Agent Card unless replacement is enabled', async () => {
    const existingAgentCard = [
      '{',
      '  "name": "Existing Agent",',
      '  "description": "Curated card.",',
      '  "version": "1.0.0",',
      '  "supportedInterfaces": [',
      '    {',
      '      "url": "https://agent.example.com/a2a/v1",',
      '      "protocolBinding": "HTTP+JSON",',
      '      "protocolVersion": "1.0"',
      '    }',
      '  ],',
      '  "capabilities": {},',
      '  "defaultInputModes": ["text/plain"],',
      '  "defaultOutputModes": ["text/plain"],',
      '  "skills": []',
      '}',
      '',
    ].join('\n');

    const root = await createFixture({
      'dist/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Readable HTML.</p></main></body></html>',
      'public/.well-known/agent-card.json': existingAgentCard,
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      description: 'Astro fixture for agentmarkup.',
      agentCard: {
        version: '1.0.1',
        supportedInterfaces: [
          {
            url: 'https://agent.example.com/a2a/v2',
            protocolBinding: 'JSONRPC',
            protocolVersion: '1.0',
          },
        ],
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

    const agentCard = await readFile(
      join(root, 'dist', '.well-known', 'agent-card.json'),
      'utf8'
    );

    expect(agentCard).toContain('"name": "Existing Agent"');
    expect(agentCard).not.toContain('"protocolBinding": "JSONRPC"');
  });

  it('reports invalid Agent Card config and skips Agent Card emission', async () => {
    const root = await createFixture({
      'dist/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Readable HTML.</p></main></body></html>',
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      agentCard: {
        version: '1.0.0',
        supportedInterfaces: [],
      },
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await integration.hooks['astro:build:done']?.({
      dir: pathToFileURL(join(root, 'dist/')),
      routes: [],
      pages: [{ pathname: '/' }],
    } as AstroBuildDoneArgs);

    await expect(
      readFile(join(root, 'dist', '.well-known', 'agent-card.json'), 'utf8')
    ).rejects.toThrow();

    const output = consoleSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');
    expect(output).toContain('Agent Card description must be a non-empty string');
    expect(output).toContain('supportedInterfaces must include at least one interface');
  });

  it('injects an llms.txt discovery link when the site ships a public llms.txt file', async () => {
    const root = await createFixture({
      'dist/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Readable HTML.</p></main></body></html>',
      'public/llms.txt': '# Existing\n\n## Docs\n\n- [Guide](https://example.com/guide)\n',
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
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

    expect(homeHtml).toContain('type="text/plain"');
    expect(homeHtml).toContain('href="/llms.txt"');
  });

  it('writes markdown canonical headers even without Content-Signal enabled', async () => {
    const root = await createFixture({
      'dist/index.html': [
        '<html>',
        '  <head><title>Home</title></head>',
        '  <body><main><h1>Home</h1><p>Readable body copy for markdown output.</p></main></body>',
        '</html>',
      ].join('\n'),
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      markdownPages: {
        enabled: true,
      },
    });

    await integration.hooks['astro:build:done']?.({
      dir: pathToFileURL(join(root, 'dist/')),
      routes: [],
      pages: [{ pathname: '/' }],
    } as AstroBuildDoneArgs);

    const headers = await readFile(join(root, 'dist', '_headers'), 'utf8');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
    expect(headers).not.toContain('Content-Signal:');
  });

  it('preserves markdown canonical headers when patching an existing public _headers file', async () => {
    const root = await createFixture({
      'dist/index.html': [
        '<html>',
        '  <head><title>Home</title></head>',
        '  <body><main><h1>Home</h1><p>Readable body copy for markdown output.</p></main></body>',
        '</html>',
      ].join('\n'),
      'public/_headers': [
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '',
      ].join('\n'),
    });

    const integration = agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      markdownPages: {
        enabled: true,
      },
      contentSignalHeaders: {
        enabled: true,
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

    const headers = await readFile(join(root, 'dist', '_headers'), 'utf8');

    expect(headers).toContain('/assets/*');
    expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
    expect(headers).toContain('/index.md');
    expect(headers).toContain('Link: <https://example.com/>; rel="canonical"');
  });
});
