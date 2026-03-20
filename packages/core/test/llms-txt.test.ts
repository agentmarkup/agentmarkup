import { describe, it, expect } from 'vitest';
import { generateLlmsTxt } from '../src/generators/llms-txt.js';
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
});
