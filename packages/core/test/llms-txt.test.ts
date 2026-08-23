import { describe, it, expect } from 'vitest';
import {
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateLlmsTxtDiscoveryLink,
  hasLlmsTxtDiscoveryLink,
  resolveLlmsTxtSections,
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

  it('escapes bracket characters in link titles', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          sections: [
            {
              title: 'Docs',
              entries: [{ title: 'A [bracket] title', url: '/a' }],
            },
          ],
        },
      })
    );

    expect(result).toContain('- [A \\[bracket\\] title](https://example.com/a)');
  });

  it('percent-encodes parentheses in link URLs so they do not close the link early', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          sections: [
            {
              title: 'Docs',
              entries: [{ title: 'Paren url', url: 'https://example.com/x?a=(b)&c=1' }],
            },
          ],
        },
      })
    );

    expect(result).toContain(
      '- [Paren url](https://example.com/x?a=%28b%29&c=1)'
    );
    expect(result).not.toContain('(b)&c=1)');
  });

  it('collapses multi-line titles, descriptions and site name to single lines', () => {
    const result = generateLlmsTxt(
      makeConfig({
        name: 'Line1\nLine2',
        description: 'Desc line 1\nDesc line 2',
        llmsTxt: {
          sections: [
            {
              title: 'Docs',
              entries: [
                { title: 'Wrapped\nTitle', url: '/a', description: 'D1\nD2' },
              ],
            },
          ],
        },
      })
    );

    expect(result).toContain('# Line1 Line2');
    expect(result).toContain('> Desc line 1 Desc line 2');
    expect(result).toContain('- [Wrapped Title](https://example.com/a): D1 D2');
    // The blockquote summary must stay a single line.
    expect(result).not.toMatch(/>[^\n]*\nDesc line 2/);
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

  it('renders when-to-use guidance in the details block before the first section', () => {
    const result = generateLlmsTxt(
      makeConfig({
        description: 'An example site',
        llmsTxt: {
          instructions: 'Example is a build-time toolkit.',
          whenToUse: [
            'The user asks whether a website is readable by AI crawlers.',
            'The user needs an llms.txt or JSON-LD generated at build time.',
          ],
          sections: [
            { title: 'Docs', entries: [{ title: 'Start', url: '/docs/start' }] },
          ],
        },
      })
    );

    expect(result).toContain('**When to use Example:**');
    expect(result).toContain(
      '- The user asks whether a website is readable by AI crawlers.'
    );
    expect(result!.indexOf('**When to use Example:**')).toBeGreaterThan(
      result!.indexOf('Example is a build-time toolkit.')
    );
    expect(result!.indexOf('**When to use Example:**')).toBeLessThan(
      result!.indexOf('## Docs')
    );
  });

  it('omits the when-to-use block when it is absent or entirely blank', () => {
    const withoutGuidance = generateLlmsTxt(
      makeConfig({
        llmsTxt: { sections: [{ title: 'Docs', entries: [{ title: 'Start', url: '/docs/start' }] }] },
      })
    );
    const withBlankGuidance = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          whenToUse: ['   ', ''],
          sections: [{ title: 'Docs', entries: [{ title: 'Start', url: '/docs/start' }] }],
        },
      })
    );

    expect(withoutGuidance).not.toContain('When to use');
    expect(withBlankGuidance).not.toContain('When to use');
  });

  it('collapses a multi-line when-to-use item so it cannot escape its list item', () => {
    const result = generateLlmsTxt(
      makeConfig({
        llmsTxt: {
          whenToUse: ['First line\n## Injected Section\nsecond line'],
          sections: [{ title: 'Docs', entries: [{ title: 'Start', url: '/docs/start' }] }],
        },
      })
    );

    expect(result).toContain('- First line ## Injected Section second line');
    expect(result).not.toContain('\n## Injected Section');
  });

  it('repeats when-to-use guidance in llms-full.txt', () => {
    const result = generateLlmsFullTxt(
      makeConfig({
        llmsFullTxt: { enabled: true },
        llmsTxt: {
          whenToUse: ['The user wants a machine-readable website.'],
          sections: [{ title: 'Docs', entries: [{ title: 'Start', url: '/docs/start' }] }],
        },
      })
    );

    expect(result).toContain('**When to use Example:**');
    expect(result).toContain('- The user wants a machine-readable website.');
  });

  it('never advertises a markdown mirror for a page in markdownPages.exclude', () => {
    const config = makeConfig({
      markdownPages: { enabled: true, exclude: ['/404'] },
      llmsFullTxt: { enabled: true },
      llmsTxt: {
        sections: [
          {
            title: 'Pages',
            entries: [
              { title: 'Docs', url: '/docs/start' },
              { title: 'Not found', url: '/404' },
            ],
          },
        ],
      },
    });

    const llmsTxt = generateLlmsTxt(config);
    const llmsFullTxt = generateLlmsFullTxt(config);
    const [entries] = resolveLlmsTxtSections(config).map((section) => section.entries);

    // The excluded page keeps its HTML URL; the ordinary page still prefers its mirror.
    expect(llmsTxt).toContain('- [Docs](https://example.com/docs/start.md)');
    expect(llmsTxt).toContain('- [Not found](https://example.com/404)');
    expect(llmsTxt).not.toContain('/404.md');
    expect(llmsFullTxt).not.toContain('/404.md');

    expect(entries[0].markdownUrl).toBe('https://example.com/docs/start.md');
    expect(entries[1].markdownUrl).toBeNull();
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
