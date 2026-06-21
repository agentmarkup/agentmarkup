import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import nuxtModule, {
  registerAgentmarkup,
  processStaticOutput,
} from '../src/module.js';
import type { AgentMarkupConfig } from '@agentmarkup/core';

const createdRoots: string[] = [];
const tempFixturesDir = join(process.cwd(), 'test', '.tmp');

const CONFIG: AgentMarkupConfig = {
  site: 'https://example.com',
  name: 'Example',
  description: 'Example site',
  llmsTxt: {
    sections: [
      { title: 'Docs', entries: [{ title: 'Home', url: 'https://example.com/' }] },
    ],
  },
  globalSchemas: [{ preset: 'webSite', name: 'Example', url: 'https://example.com' }],
  markdownPages: { enabled: true },
  aiCrawlers: { GPTBot: 'disallow' },
};

const page = (title: string): string =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${title} body content that is substantial enough for a useful mirror.</p></body></html>`;

/** Mock just enough of the Nuxt/Nitro surface that registerAgentmarkup touches. */
interface MockNitro {
  options: { output: { publicDir: string } };
  hooks: { hook(name: string, fn: () => Promise<void> | void): void };
}

function makeHarness(publicDir: string | undefined) {
  let nitroInit: ((nitro: MockNitro) => void | Promise<void>) | undefined;
  let prerenderDone: (() => void | Promise<void>) | undefined;

  const nuxt = {
    hook(name: string, fn: (nitro: MockNitro) => void | Promise<void>) {
      if (name === 'nitro:init') nitroInit = fn;
    },
  };

  const nitro: MockNitro = {
    options: { output: { publicDir: publicDir as string } },
    hooks: {
      hook(name: string, fn: () => Promise<void> | void) {
        if (name === 'prerender:done') prerenderDone = fn;
      },
    },
  };

  return {
    nuxt,
    async runBuild(): Promise<void> {
      await nitroInit?.(nitro);
      await prerenderDone?.();
    },
    get registeredPrerenderDone() {
      return prerenderDone;
    },
  };
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function createPublicDir(files: Record<string, string>): Promise<string> {
  await mkdir(tempFixturesDir, { recursive: true });
  const root = await mkdtemp(join(tempFixturesDir, 'agentmarkup-nuxt-'));
  createdRoots.push(root);
  const publicDir = join(root, '.output', 'public');
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(publicDir, relativePath, content);
  }
  return publicDir;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe('@agentmarkup/nuxt module', () => {
  it('exposes the expected module metadata', () => {
    const meta = (nuxtModule as unknown as { getMeta?: () => Promise<unknown> })
      .getMeta;
    // defineNuxtModule returns a callable module with a getMeta() helper.
    expect(typeof meta).toBe('function');
  });

  it('registers nitro:init -> prerender:done and emits the full surface', async () => {
    const publicDir = await createPublicDir({
      'index.html': page('Home'),
      'faq/index.html': page('FAQ'),
    });

    const harness = makeHarness(publicDir);
    registerAgentmarkup(harness.nuxt, CONFIG);
    await harness.runBuild();

    // llms.txt + robots.txt + markdown mirrors + _headers + injected JSON-LD
    expect(await readFile(join(publicDir, 'llms.txt'), 'utf8')).toContain('# Example');
    expect(await readFile(join(publicDir, 'robots.txt'), 'utf8')).toContain('GPTBot');
    expect(existsSync(join(publicDir, 'index.md'))).toBe(true);
    expect(existsSync(join(publicDir, 'faq.md'))).toBe(true);
    expect(await readFile(join(publicDir, '_headers'), 'utf8')).toContain('/index.md');

    const html = await readFile(join(publicDir, 'index.html'), 'utf8');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('/llms.txt');
    expect(html).toContain('text/markdown');
  });

  it('preserves curated llms.txt and existing robots.txt rules (coexistence)', async () => {
    const curated = '# Curated\n\n## Hand written\n- [Home](https://example.com/)\n';
    const robots = 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n';
    const publicDir = await createPublicDir({
      'index.html': page('Home'),
      'llms.txt': curated,
      'robots.txt': robots,
    });

    const harness = makeHarness(publicDir);
    registerAgentmarkup(harness.nuxt, CONFIG);
    await harness.runBuild();

    expect(await readFile(join(publicDir, 'llms.txt'), 'utf8')).toBe(curated);
    const patchedRobots = await readFile(join(publicDir, 'robots.txt'), 'utf8');
    expect(patchedRobots).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(patchedRobots).toContain('GPTBot');
  });

  it('no-ops gracefully when no prerender output directory is available (pure SSR)', async () => {
    const harness = makeHarness(undefined);
    registerAgentmarkup(harness.nuxt, CONFIG);
    // Should register and run without throwing even though publicDir is undefined.
    await expect(harness.runBuild()).resolves.toBeUndefined();
    expect(harness.registeredPrerenderDone).toBeTypeOf('function');
  });

  it('does not register a prerender hook until nitro:init fires', async () => {
    const harness = makeHarness(await createPublicDir({ 'index.html': page('Home') }));
    registerAgentmarkup(harness.nuxt, CONFIG);
    // Before runBuild(), nitro:init has not been invoked, so no prerender hook yet.
    expect(harness.registeredPrerenderDone).toBeUndefined();
  });
});

describe('@agentmarkup/nuxt processStaticOutput (re-export parity)', () => {
  it('is re-exported and writes artifacts in generate mode', async () => {
    const publicDir = await createPublicDir({ 'index.html': page('Home') });
    const result = await processStaticOutput(CONFIG, {
      outDir: publicDir,
      mode: 'generate',
    });
    expect(result.mode).toBe('generate');
    expect(existsSync(join(publicDir, 'llms.txt'))).toBe(true);
  });
});
