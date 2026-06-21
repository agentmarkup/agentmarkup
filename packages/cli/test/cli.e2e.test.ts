import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { run } from '../src/index.js';

const createdRoots: string[] = [];
const tempFixturesDir = join(process.cwd(), 'test', '.tmp');

interface Fixture {
  root: string;
  outDir: string;
}

const BASE_CONFIG = `export default {
  site: 'https://example.com',
  name: 'Example',
  description: 'Example site',
  llmsTxt: {
    sections: [
      { title: 'Docs', entries: [{ title: 'Home', url: 'https://example.com/' }] },
    ],
  },
  globalSchemas: [
    { preset: 'webSite', name: 'Example', url: 'https://example.com' },
  ],
  markdownPages: { enabled: true },
  aiCrawlers: { GPTBot: 'disallow' },
};
`;

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function createFixture(files: Record<string, string>): Promise<Fixture> {
  await mkdir(tempFixturesDir, { recursive: true });
  const root = await mkdtemp(join(tempFixturesDir, 'agentmarkup-cli-'));
  createdRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(root, relativePath, content);
  }
  return { root, outDir: join(root, 'dist') };
}

const page = (title: string): string =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${title} body content goes here so the mirror is substantial enough to be useful.</p></body></html>`;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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

describe('@agentmarkup/cli generate', () => {
  it('writes the full machine-readable surface and injects HTML', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
      'dist/faq/index.html': page('FAQ'),
    });

    const code = await run(['generate'], { cwd: fixture.root });
    expect(code).toBe(0);

    const llms = await readFile(join(fixture.outDir, 'llms.txt'), 'utf8');
    expect(llms).toContain('# Example');

    const robots = await readFile(join(fixture.outDir, 'robots.txt'), 'utf8');
    expect(robots).toContain('GPTBot');

    // Markdown mirrors: index.html -> index.md, faq/index.html -> faq.md
    expect(existsSync(join(fixture.outDir, 'index.md'))).toBe(true);
    expect(existsSync(join(fixture.outDir, 'faq.md'))).toBe(true);

    // _headers carries the markdown canonical entries
    const headers = await readFile(join(fixture.outDir, '_headers'), 'utf8');
    expect(headers).toContain('/index.md');

    const indexHtml = await readFile(join(fixture.outDir, 'index.html'), 'utf8');
    expect(indexHtml).toContain('application/ld+json');
    expect(indexHtml).toContain('/llms.txt');
    expect(indexHtml).toContain('text/markdown');
  });

  it('generates llms-full.txt when enabled', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG.replace(
        'markdownPages: { enabled: true },',
        'markdownPages: { enabled: true },\n  llmsFullTxt: { enabled: true },'
      ),
      'dist/index.html': page('Home'),
    });

    const code = await run(['generate'], { cwd: fixture.root });
    expect(code).toBe(0);
    expect(existsSync(join(fixture.outDir, 'llms-full.txt'))).toBe(true);
  });

  it('preserves curated llms.txt and existing robots.txt rules (coexistence)', async () => {
    const curatedLlms = '# Curated\n\n## Hand written\n- [Home](https://example.com/)\n';
    const existingRobots =
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n';
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
      'dist/llms.txt': curatedLlms,
      'dist/robots.txt': existingRobots,
    });

    const code = await run(['generate'], { cwd: fixture.root });
    expect(code).toBe(0);

    expect(await readFile(join(fixture.outDir, 'llms.txt'), 'utf8')).toBe(curatedLlms);
    const robots = await readFile(join(fixture.outDir, 'robots.txt'), 'utf8');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(robots).toContain('GPTBot');
  });

  it('maps nested directories to flat markdown mirror names', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/blog/post/index.html': page('Post'),
    });

    const code = await run(['generate'], { cwd: fixture.root });
    expect(code).toBe(0);
    expect(existsSync(join(fixture.outDir, 'blog/post.md'))).toBe(true);
  });
});

describe('@agentmarkup/cli dry-run', () => {
  it('writes nothing but exits 0', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
    });

    const code = await run(['generate', '--dry-run'], { cwd: fixture.root });
    expect(code).toBe(0);

    expect(existsSync(join(fixture.outDir, 'llms.txt'))).toBe(false);
    expect(existsSync(join(fixture.outDir, 'robots.txt'))).toBe(false);
    expect(existsSync(join(fixture.outDir, 'index.md'))).toBe(false);
    // HTML must be untouched on disk
    const indexHtml = await readFile(join(fixture.outDir, 'index.html'), 'utf8');
    expect(indexHtml).not.toContain('application/ld+json');
  });
});

describe('@agentmarkup/cli check', () => {
  it('passes (exit 0) on a clean generated output', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
    });

    expect(await run(['generate'], { cwd: fixture.root })).toBe(0);
    expect(await run(['check'], { cwd: fixture.root })).toBe(0);
  });

  it('fails (exit 1) when an existing llms.txt is malformed', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
      'dist/llms.txt': 'not a heading\njust text\n',
    });

    expect(await run(['check'], { cwd: fixture.root })).toBe(1);
  });

  it('does not write files in check mode', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
    });

    expect(await run(['check'], { cwd: fixture.root })).toBe(0);
    expect(existsSync(join(fixture.outDir, 'llms.txt'))).toBe(false);
    expect(existsSync(join(fixture.outDir, 'index.md'))).toBe(false);
  });

  it('--strict turns warnings into a non-zero exit', async () => {
    // A valid llms.txt (H1 present) with no "## sections" yields a warning, no errors.
    const fixture = await createFixture({
      'agentmarkup.config.mjs': `export default { site: 'https://example.com', name: 'Example' };`,
      'dist/index.html': page('Home'),
      'dist/llms.txt': '# Example\n\nintro text but no sections\n',
    });

    expect(await run(['check'], { cwd: fixture.root })).toBe(0);
    expect(await run(['check', '--strict'], { cwd: fixture.root })).toBe(1);
  });

  it('warns on missing configured artifacts (lenient by default, gated under --strict)', async () => {
    // BASE_CONFIG configures llms.txt, markdown mirrors and AI crawlers, but the raw
    // HTML output has none of them generated yet.
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'dist/index.html': page('Home'),
    });

    expect(await run(['check'], { cwd: fixture.root })).toBe(0);
    expect(await run(['check', '--strict'], { cwd: fixture.root })).toBe(1);
  });

  it('fails check on a malformed existing llms-full.txt', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG.replace(
        'markdownPages: { enabled: true },',
        'markdownPages: { enabled: true },\n  llmsFullTxt: { enabled: true },'
      ),
      'dist/index.html': page('Home'),
      'dist/llms-full.txt': 'no heading at all\njust text\n',
    });

    expect(await run(['check'], { cwd: fixture.root })).toBe(1);
  });
});

describe('@agentmarkup/cli resolution and errors', () => {
  it('never auto-guesses public/ as the output directory', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'public/index.html': page('Home'),
    });

    // No dist/build/out/_site present, only public/ -> resolution must fail.
    const code = await run(['generate'], { cwd: fixture.root });
    expect(code).toBe(1);
    expect(existsSync(join(fixture.root, 'public/llms.txt'))).toBe(false);
  });

  it('processes public/ only when passed explicitly', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': BASE_CONFIG,
      'public/index.html': page('Home'),
    });

    const code = await run(['generate', 'public'], { cwd: fixture.root });
    expect(code).toBe(0);
    expect(existsSync(join(fixture.root, 'public/llms.txt'))).toBe(true);
  });

  it('exits 1 when no config is found', async () => {
    const fixture = await createFixture({ 'dist/index.html': page('Home') });
    expect(await run(['generate'], { cwd: fixture.root })).toBe(1);
  });

  it('exits 1 when site is not an absolute http(s) URL', async () => {
    const fixture = await createFixture({
      'agentmarkup.config.mjs': `export default { site: 'example.com', name: 'X' };`,
      'dist/index.html': page('Home'),
    });
    expect(await run(['generate'], { cwd: fixture.root })).toBe(1);
  });

  it('exits 1 when the explicit output directory does not exist', async () => {
    const fixture = await createFixture({ 'agentmarkup.config.mjs': BASE_CONFIG });
    expect(await run(['generate', 'nope'], { cwd: fixture.root })).toBe(1);
  });

  it('supports a function-style config export and --config path', async () => {
    const fixture = await createFixture({
      'amk.config.mjs': `export default () => ({
        site: 'https://example.com', name: 'Example',
        llmsTxt: { sections: [{ title: 'D', entries: [{ title: 'Home', url: 'https://example.com/' }] }] },
      });`,
      'dist/index.html': page('Home'),
    });

    const code = await run(['generate', '--config', 'amk.config.mjs'], {
      cwd: fixture.root,
    });
    expect(code).toBe(0);
    expect(existsSync(join(fixture.outDir, 'llms.txt'))).toBe(true);
  });
});

describe('@agentmarkup/cli meta', () => {
  it('prints help and exits 0 for --help', async () => {
    expect(await run(['--help'])).toBe(0);
  });

  it('exits 2 with no command', async () => {
    expect(await run([])).toBe(2);
  });

  it('exits 2 for an unknown command', async () => {
    const fixture = await createFixture({ 'agentmarkup.config.mjs': BASE_CONFIG });
    expect(await run(['frobnicate'], { cwd: fixture.root })).toBe(2);
  });

  it('prints the version for --version', async () => {
    expect(await run(['generate', '--version'], { version: '9.9.9' })).toBe(0);
  });

  it('errors (exit 2) when --config is given no value', async () => {
    expect(await run(['generate', '--config'])).toBe(2);
  });
});
