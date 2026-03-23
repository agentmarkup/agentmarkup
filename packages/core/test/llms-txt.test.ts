import { describe, it, expect } from 'vitest';
import {
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateLlmsTxtDiscoveryLink,
  hasLlmsTxtDiscoveryLink,
} from '../src/generators/llms-txt.js';
import type { AgentMarkupConfig } from '../src/types.js';

function makeConfig(overrides: Partial<AgentMarkupConfig> = {}): AgentMarkupConfig {
  return {
    site: 'https://example.com',
    name: 'Example',
    ...overrides,
  };
}

describe('generateLlmsTxt', () => {
  it('returns null when no llmsTxt config', () => {
    const result = generateLlmsTxt(makeConfig());
    expect(result).toBeNull();
  });

  it('generates valid llms.txt with H1 and sections', () => {
    const result = generateLlmsTxt(
      makeConfig({
        description: 'An example site',
        llmsTxt: {
          sections: [
            {
              title: 'Docs',
              entries: [
                { title: 'Getting Started', url: '/docs/start', description: 'Quick start guide' },
                { title: 'API', url: '/docs/api' },
              ],
            },
          ],
        },
      })
    );

    expect(result).not.toBeNull();
    expect(result).toContain('# Example');
    expect(result).toContain('> An example site');
    expect(result).toContain('## Docs');
    expect(result).toContain('- [Getting Started](https://example.com/docs/start): Quick start guide');
    expect(result).toContain('- [API](https://example.com/docs/api)');
  });

  it('includes instructions block', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          instructions: 'This site provides technical documentation.',
          sections: [{ title: 'Pages', entries: [] }],
        },
      })
    );

    expect(result).toContain('This site provides technical documentation.');
  });

  it('resolves relative URLs to absolute', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          sections: [
            {
              title: 'Pages',
              entries: [{ title: 'About', url: '/about' }],
            },
          ],
        },
      })
    );

    expect(result).toContain('https://example.com/about');
  });

  it('preserves absolute URLs', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          sections: [
            {
              title: 'External',
              entries: [{ title: 'GitHub', url: 'https://github.com/example' }],
            },
          ],
        },
      })
    );

    expect(result).toContain('https://github.com/example');
  });

  it('prefers markdown mirrors for same-site page routes when markdown generation is enabled', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          sections: [
            {
              title: 'Pages',
              entries: [
                { title: 'Home', url: '/' },
                { title: 'Docs', url: '/docs/start/' },
                { title: 'Guide', url: 'https://example.com/guides/intro' },
              ],
            },
          ],
        },
        markdownPages: {
          enabled: true,
        },
      })
    );

    expect(result).toContain('https://example.com/index.md');
    expect(result).toContain('https://example.com/docs/start.md');
    expect(result).toContain('https://example.com/guides/intro.md');
  });

  it('keeps same-site non-html files unchanged when markdown generation is enabled', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          sections: [
            {
              title: 'Files',
              entries: [
                { title: 'llms', url: '/llms.txt' },
                { title: 'robots', url: '/robots.txt' },
                { title: 'feed', url: '/feed.xml' },
                { title: 'markdown', url: '/docs/start.md' },
              ],
            },
          ],
        },
        markdownPages: {
          enabled: true,
        },
      })
    );

    expect(result).toContain('https://example.com/llms.txt');
    expect(result).toContain('https://example.com/robots.txt');
    expect(result).toContain('https://example.com/feed.xml');
    expect(result).toContain('https://example.com/docs/start.md');
  });

  it('allows opting out of markdown mirror URLs in llms.txt', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          preferMarkdownMirrors: false,
          sections: [
            {
              title: 'Pages',
              entries: [{ title: 'Docs', url: '/docs/start/' }],
            },
          ],
        },
        markdownPages: {
          enabled: true,
        },
      })
    );

    expect(result).toContain('https://example.com/docs/start/');
    expect(result).not.toContain('https://example.com/docs/start.md');
  });

  it('handles trailing slash on site URL', () => {
    const result = generateLlmsTxt(
      makeConfig({
        site: 'https://example.com/',
        llmsTxt: {
          sections: [
            {
              title: 'Pages',
              entries: [{ title: 'About', url: '/about' }],
            },
          ],
        },
      })
    );

    expect(result).toContain('https://example.com/about');
    expect(result).not.toContain('https://example.com//about');
  });

  it('throws a descriptive error when config.site is not an absolute url', () => {
    expect(() =>
      generateLlmsTxt(
        makeConfig({
          site: 'example.com',
          llmsTxt: {
            sections: [
              {
                title: 'Pages',
                entries: [{ title: 'About', url: '/about' }],
              },
            ],
          },
        })
      )
    ).toThrow(/Invalid config\.site "example\.com"/);
  });

  it('rejects non-http schemes for config.site', () => {
    expect(() =>
      generateLlmsTxt(
        makeConfig({
          site: 'file:///tmp/example',
          llmsTxt: {
            sections: [
              {
                title: 'Pages',
                entries: [{ title: 'About', url: '/about' }],
              },
            ],
          },
        })
      )
    ).toThrow(/Expected an absolute http\(s\) URL/);
  });

  it('generates llms-full.txt with inlined same-site markdown content', () => {
    const result = generateLlmsFullTxt(
      makeConfig({
        description: 'An example site',
        llmsTxt: {
          sections: [
            {
              title: 'Docs',
              entries: [
                { title: 'Guide', url: '/docs/guide/', description: 'Implementation guide' },
                { title: 'External', url: 'https://external.example/docs' },
              ],
            },
          ],
        },
        llmsFullTxt: {
          enabled: true,
        },
        markdownPages: {
          enabled: true,
        },
      }),
      {
        contentByUrl: {
          'https://example.com/docs/guide.md': [
            '# Guide',
            '',
            '> Implementation guide',
            '',
            'Source: https://example.com/docs/guide/',
            '',
            '## Setup',
            '',
            'Ship the final HTML first.',
          ].join('\n'),
        },
      }
    );

    expect(result).toContain('# Example');
    expect(result).toContain('## Docs');
    expect(result).toContain('- [Guide](https://example.com/docs/guide.md): Implementation guide');
    expect(result).toContain('### Guide');
    expect(result).toContain('Source: https://example.com/docs/guide/');
    expect(result).toContain('Preferred fetch: https://example.com/docs/guide.md');
    expect(result).toContain('## Setup');
    expect(result).toContain('Ship the final HTML first.');
    expect(result).toContain('- [External](https://external.example/docs)');
    expect(
      result?.match(/Source: https:\/\/example\.com\/docs\/guide\//g)
    ).toHaveLength(1);
    expect(result).not.toContain('\n# Guide\n');
    expect(result).not.toContain('> Implementation guide\n\nSource: https://example.com/docs/guide/\n\n## Setup');
  });

  it('builds a discoverable llms.txt alternate link and detects it in HTML', () => {
    const link = generateLlmsTxtDiscoveryLink();
    expect(link).toContain('type="text/plain"');
    expect(link).toContain('href="/llms.txt"');
    expect(
      hasLlmsTxtDiscoveryLink(`<html><head>${link}</head><body></body></html>`)
    ).toBe(true);
  });
});
