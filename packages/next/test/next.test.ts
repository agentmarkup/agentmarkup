import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { NextAdapterLike } from '../src/types.js';
import {
  AGENTMARKUP_NEXT_CONFIG_ENV,
  AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV,
  createAgentmarkupNextConfig,
  decodeAgentmarkupConfig,
  encodeAgentmarkupConfig,
  getAgentmarkupHeaders,
  processNextBuildOutput,
  withAgentmarkup,
} from '../src/index.js';

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
  const root = await mkdtemp(join(tempFixturesDir, 'agentmarkup-next-'));
  createdRoots.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(root, relativePath, content);
  }

  return root;
}

async function importFreshAdapter(): Promise<NextAdapterLike> {
  vi.resetModules();
  const module = await import('../src/adapter.js');
  return module.default as NextAdapterLike;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env[AGENTMARKUP_NEXT_CONFIG_ENV];
  delete process.env[AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV];

  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe('@agentmarkup/next', () => {
  it('wraps next config with adapterPath and server headers', async () => {
    const nextConfig = withAgentmarkup(
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
      {}
    );

    expect(typeof nextConfig.adapterPath).toBe('string');
    expect(nextConfig.experimental?.adapterPath).toBeUndefined();
    expect(typeof nextConfig.headers).toBe('function');

    const headers = await nextConfig.headers?.();
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/:path*',
          headers: expect.arrayContaining([
            expect.objectContaining({
              key: 'Content-Signal',
              value: 'ai-train=yes, search=yes, ai-input=yes',
            }),
          ]),
        }),
        expect.objectContaining({
          source: '/index.md',
        }),
        expect.objectContaining({
          source: '/:agentmarkupPath*.md',
        }),
      ])
    );
  });

  it('merges existing next headers with agentmarkup headers', async () => {
    const nextConfig = withAgentmarkup(
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
      {
        headers: async () => [
          {
            source: '/existing',
            headers: [{ key: 'X-Existing', value: 'yes' }],
          },
        ],
      }
    );

    const headers = await nextConfig.headers?.();
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/existing',
          headers: [{ key: 'X-Existing', value: 'yes' }],
        }),
        expect.objectContaining({
          source: '/:path*',
        }),
        expect.objectContaining({
          source: '/:agentmarkupPath*.md',
        }),
      ])
    );
  });

  it('round-trips encoded config and exposes the config-wrapper helper', () => {
    const config = {
      site: 'https://example.com/docs',
      name: 'Example',
      markdownPages: {
        enabled: true,
      },
    };

    const encoded = encodeAgentmarkupConfig(config);
    expect(decodeAgentmarkupConfig(encoded)).toEqual(config);

    const wrapped = createAgentmarkupNextConfig(config, {
      output: 'export',
    });
    expect(wrapped.config).toEqual(config);
    expect(wrapped.nextConfig.output).toBe('export');
    expect(typeof wrapped.nextConfig.adapterPath).toBe('string');
  });

  it('omits Content-Signal headers when they are disabled', () => {
    const headers = getAgentmarkupHeaders(
      {
        site: 'https://example.com/docs',
        name: 'Example',
        markdownPages: {
          enabled: true,
        },
        contentSignalHeaders: {
          enabled: false,
        },
      },
      {
        basePath: '/docs',
      }
    );

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/docs/:agentmarkupPath*.md',
        }),
      ])
    );
    expect(headers).toHaveLength(2);
  });

  it('uses output metadata to handle export builds with a basePath', async () => {
    const root = await createFixture({
      'out/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome.</p></main></body></html>',
      'out/faq.html': '<html><head><title>FAQ</title></head><body><main><h1>FAQ</h1><p>Answers live here.</p></main></body></html>',
    });

    await processNextBuildOutput(
      {
        site: 'https://example.com/docs',
        name: 'Example',
        description: 'Next fixture for agentmarkup with a basePath.',
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
        markdownPages: {
          enabled: true,
        },
        contentSignalHeaders: {
          enabled: true,
        },
        globalSchemas: [
          {
            preset: 'webSite',
            name: 'Example',
            url: 'https://example.com/docs',
          },
        ],
      },
      {
        projectDir: root,
        nextConfig: {
          output: 'export',
          basePath: '/docs',
        },
        outputs: {
          staticFiles: [
            {
              filePath: join(root, 'out', 'index.html'),
              pathname: '/docs',
            },
            {
              filePath: join(root, 'out', 'faq.html'),
              pathname: '/docs/faq',
            },
          ],
        },
      }
    );

    const homeHtml = await readFile(join(root, 'out', 'index.html'), 'utf8');
    const faqHtml = await readFile(join(root, 'out', 'faq.html'), 'utf8');
    const llmsTxt = await readFile(join(root, 'out', 'llms.txt'), 'utf8');
    const llmsFullTxt = await readFile(join(root, 'out', 'llms-full.txt'), 'utf8');
    const faqMarkdown = await readFile(join(root, 'out', 'faq.md'), 'utf8');
    const headers = await readFile(join(root, 'out', '_headers'), 'utf8');

    expect(homeHtml).toContain('href="/docs/llms.txt"');
    expect(homeHtml).toContain('href="/docs/index.md"');
    expect(faqHtml).toContain('href="/docs/faq.md"');
    expect(llmsTxt).toContain('[FAQ](https://example.com/docs/faq.md)');
    expect(llmsFullTxt).toContain('Preferred fetch: https://example.com/docs/faq.md');
    expect(faqMarkdown).toContain('# FAQ');
    expect(headers).toContain('/docs/index.md');
    expect(headers).toContain('/docs/faq.md');
    expect(headers).toContain('/docs/*');
    expect(headers).toContain('Link: <https://example.com/docs/>; rel="canonical"');
  });

  it('emits full machine-readable output for static export builds', async () => {
    const root = await createFixture({
      'out/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome.</p></main></body></html>',
      'out/faq/index.html': '<html><head><title>FAQ</title></head><body><main><h1>FAQ</h1><p>Answers live here.</p></main></body></html>',
      'public/robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    });

    await processNextBuildOutput(
      {
        site: 'https://example.com',
        name: 'Example',
        description: 'Next fixture for agentmarkup.',
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
        markdownPages: {
          enabled: true,
        },
        contentSignalHeaders: {
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
      },
      {
        projectDir: root,
        nextConfig: {
          output: 'export',
        },
      }
    );

    const homeHtml = await readFile(join(root, 'out', 'index.html'), 'utf8');
    const faqHtml = await readFile(join(root, 'out', 'faq', 'index.html'), 'utf8');
    const llmsTxt = await readFile(join(root, 'out', 'llms.txt'), 'utf8');
    const llmsFullTxt = await readFile(join(root, 'out', 'llms-full.txt'), 'utf8');
    const faqMarkdown = await readFile(join(root, 'out', 'faq.md'), 'utf8');
    const headers = await readFile(join(root, 'out', '_headers'), 'utf8');
    const robotsTxt = await readFile(join(root, 'out', 'robots.txt'), 'utf8');

    expect(homeHtml).toContain('"@type": "WebSite"');
    expect(homeHtml).toContain('"@type": "Organization"');
    expect(homeHtml).toContain('type="text/plain"');
    expect(homeHtml).toContain('href="/llms.txt"');
    expect(homeHtml).toContain('type="text/markdown"');

    expect(faqHtml).toContain('"@type": "FAQPage"');
    expect(faqHtml).toContain('href="/faq.md"');

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
    expect(robotsTxt).toContain('User-agent: GPTBot');
    expect(robotsTxt).toContain('User-agent: ClaudeBot');
  });

  it('preserves existing machine-readable files unless replacement is enabled', async () => {
    const root = await createFixture({
      'out/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome.</p></main></body></html>',
      'out/faq/index.html': '<html><head><title>FAQ</title></head><body><main><h1>FAQ</h1><p>Answers live here.</p></main></body></html>',
      'out/index.md': '# Existing Home\n\nCurated home markdown.\n',
      'out/faq.md': '# Existing FAQ\n\nCurated FAQ markdown.\n',
      'out/llms.txt': '# Curated\n\n- Keep this file.\n',
      'out/llms-full.txt': '# Curated Full\n\nKeep this richer file.\n',
    });

    const result = await processNextBuildOutput(
      {
        site: 'https://example.com',
        name: 'Example',
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
        markdownPages: {
          enabled: true,
        },
      },
      {
        projectDir: root,
        nextConfig: {
          output: 'export',
        },
      }
    );

    expect(result.markdownPagesStatus).toBe('preserved');
    expect(result.llmsTxtStatus).toBe('preserved');
    expect(result.llmsFullTxtStatus).toBe('preserved');

    expect(await readFile(join(root, 'out', 'index.md'), 'utf8')).toContain(
      'Curated home markdown.'
    );
    expect(await readFile(join(root, 'out', 'faq.md'), 'utf8')).toContain(
      'Curated FAQ markdown.'
    );
    expect(await readFile(join(root, 'out', 'llms.txt'), 'utf8')).toContain(
      '- Keep this file.'
    );
    expect(await readFile(join(root, 'out', 'llms-full.txt'), 'utf8')).toContain(
      'Keep this richer file.'
    );
  });

  it('writes machine-readable assets into public for server builds and patches built app html', async () => {
    const root = await createFixture({
      '.next/server/app/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome to the site.</p></main></body></html>',
      '.next/server/app/(marketing)/pricing/page.html': '<html><head><title>Pricing</title></head><body><main><h1>Pricing</h1><p>Plans and billing.</p></main></body></html>',
    });

    const result = await processNextBuildOutput(
      {
        site: 'https://example.com',
        name: 'Example',
        globalSchemas: [
          {
            preset: 'webSite',
            name: 'Example',
            url: 'https://example.com',
          },
        ],
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
        projectDir: root,
        nextConfig: {},
      }
    );

    expect(result.mode).toBe('server');

    const llmsTxt = await readFile(join(root, 'public', 'llms.txt'), 'utf8');
    const llmsFullTxt = await readFile(join(root, 'public', 'llms-full.txt'), 'utf8');
    const pricingMarkdown = await readFile(join(root, 'public', 'pricing.md'), 'utf8');
    const pricingHtml = await readFile(
      join(root, '.next', 'server', 'app', '(marketing)', 'pricing', 'page.html'),
      'utf8'
    );

    expect(llmsTxt).toContain('[Pricing](https://example.com/pricing.md)');
    expect(llmsFullTxt).toContain('Preferred fetch: https://example.com/pricing.md');
    expect(pricingMarkdown).toContain('# Pricing');
    expect(pricingHtml).toContain('"@type": "WebSite"');
    expect(pricingHtml).toContain('href="/pricing.md"');
    expect(pricingHtml).toContain('href="/llms.txt"');
  });

  it('builds server header rules that are useful without static export', () => {
    const headers = getAgentmarkupHeaders(
      {
        site: 'https://example.com/docs',
        name: 'Example',
        markdownPages: {
          enabled: true,
        },
        contentSignalHeaders: {
          enabled: true,
          path: '/*',
        },
      },
      {
        basePath: '/docs',
      }
    );

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/docs/:path*',
        }),
        expect.objectContaining({
          source: '/docs/:agentmarkupPath*.md',
        }),
        expect.objectContaining({
          source: '/docs/index.md',
        }),
      ])
    );
  });

  it('warns when the adapter cannot decode its serialized config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[AGENTMARKUP_NEXT_CONFIG_ENV] = 'not-valid-base64';

    const adapter = await importFreshAdapter();
    await adapter.onBuildComplete?.({
      projectDir: '/tmp/agentmarkup-next-invalid-config',
      config: {
        output: 'export',
      },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to decode agentmarkup config')
    );
  });

  it('warns when a previous Next adapter cannot be loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env[AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV] = '/missing/previous-adapter.mjs';

    const adapter = await importFreshAdapter();
    const nextConfig = { output: 'export' };
    await expect(adapter.modifyConfig?.(nextConfig, {})).resolves.toBe(nextConfig);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load previous adapter')
    );
  });

  it('rejects output metadata file paths outside the project directory', async () => {
    const root = await createFixture({});
    const externalRoot = await createFixture({
      'outside.html': '<html><head><title>Outside</title></head><body><main><h1>Outside</h1></main></body></html>',
    });

    await expect(
      processNextBuildOutput(
        {
          site: 'https://example.com',
          name: 'Example',
          markdownPages: {
            enabled: true,
          },
        },
        {
          projectDir: root,
          nextConfig: {
            output: 'export',
          },
          outputs: {
            staticFiles: [
              {
                filePath: join(externalRoot, 'outside.html'),
                pathname: '/outside',
              },
            ],
          },
        }
      )
    ).rejects.toThrow(/Refusing to access Next output file outside/);
  });

  it('rejects output metadata pathnames with traversal segments', async () => {
    const root = await createFixture({
      'out/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>',
    });

    await expect(
      processNextBuildOutput(
        {
          site: 'https://example.com',
          name: 'Example',
          markdownPages: {
            enabled: true,
          },
        },
        {
          projectDir: root,
          nextConfig: {
            output: 'export',
          },
          outputs: {
            staticFiles: [
              {
                filePath: join(root, 'out', 'index.html'),
                pathname: '/../escape',
              },
            ],
          },
        }
      )
    ).rejects.toThrow(/Refusing to process Next output pathname/);
  });

  it('chains a previous adapter and still runs the agentmarkup build hook', async () => {
    const root = await createFixture({
      'out/index.html': '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Welcome.</p></main></body></html>',
      'previous-adapter.mjs': `
        import { writeFile } from 'node:fs/promises';
        import { join } from 'node:path';

        export default {
          async modifyConfig(nextConfig) {
            return { ...nextConfig, reactStrictMode: true };
          },
          async onBuildComplete(context) {
            await writeFile(join(context.projectDir, 'out', 'previous-adapter.txt'), 'ran\\n', 'utf8');
          },
        };
      `,
    });

    process.env[AGENTMARKUP_NEXT_CONFIG_ENV] = encodeAgentmarkupConfig({
      site: 'https://example.com',
      name: 'Example',
      llmsTxt: {
        sections: [
          {
            title: 'Docs',
            entries: [{ title: 'Home', url: '/', description: 'Homepage' }],
          },
        ],
      },
    });
    process.env[AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV] = join(
      root,
      'previous-adapter.mjs'
    );

    const adapter = await importFreshAdapter();
    const nextConfig = await adapter.modifyConfig?.(
      {
        output: 'export',
      },
      {}
    );
    expect(nextConfig?.reactStrictMode).toBe(true);

    await adapter.onBuildComplete?.({
      projectDir: root,
      config: {
        output: 'export',
      },
    });

    expect(await readFile(join(root, 'out', 'previous-adapter.txt'), 'utf8')).toContain(
      'ran'
    );
    expect(await readFile(join(root, 'out', 'llms.txt'), 'utf8')).toContain('# Example');
  });
});
