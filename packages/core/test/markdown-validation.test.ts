import { describe, expect, it } from 'vitest';
import {
  validateLlmsTxtMarkdownCoverage,
  validateMarkdownAlternateLink,
  validateMarkdownContent,
} from '../src/validation/markdown.js';
import { resolveLlmsTxtSections } from '../src/generators/llms-txt.js';

describe('markdown validation helpers', () => {
  it('warns when a markdown mirror is too thin', () => {
    const results = validateMarkdownContent(
      ['# Guide', '', '> Summary', '', 'Source: https://example.com/guide/', '', 'Tiny.'].join('\n'),
      '/guide/'
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.message).toContain('very little useful body content');
  });

  it('treats fenced-code body content as meaningful markdown text', () => {
    const results = validateMarkdownContent(
      [
        '# License',
        '',
        '> MIT License',
        '',
        'Source: https://example.com/license/',
        '',
        '# MIT License',
        '',
        '```',
        'Permission is hereby granted, free of charge, to any person obtaining a copy',
        'of this software and associated documentation files.',
        '```',
      ].join('\n'),
      '/license/'
    );

    expect(results).toHaveLength(0);
  });

  it('warns when the markdown alternate link is missing or incorrect', () => {
    expect(validateMarkdownAlternateLink('<html><head></head><body></body></html>', '/docs/guide/')).toHaveLength(1);
    expect(
      validateMarkdownAlternateLink(
        '<html><head><link rel="alternate" type="text/markdown" href="/wrong.md" /></head><body></body></html>',
        '/docs/guide/'
      )[0]?.message
    ).toContain('/docs/guide.md');
  });

  it('warns when llms.txt points to a markdown mirror that was not emitted', () => {
    const sections = resolveLlmsTxtSections({
      site: 'https://example.com',
      name: 'Example',
      llmsTxt: {
        sections: [
          {
            title: 'Docs',
            entries: [{ title: 'Guide', url: '/docs/guide/' }],
          },
        ],
      },
      markdownPages: {
        enabled: true,
      },
    });

    const results = validateLlmsTxtMarkdownCoverage(sections, new Set());
    expect(results).toHaveLength(1);
    expect(results[0]?.message).toContain('https://example.com/docs/guide.md');
    expect(results[0]?.path).toBe('/docs/guide');
  });
});
