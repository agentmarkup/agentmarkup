# @agentmarkup/astro

Build-time `llms.txt`, JSON-LD, markdown mirrors, AI crawler `robots.txt`, headers, and validation for Astro websites.

## Install

```bash
pnpm add -D @agentmarkup/astro
```

## Usage

```ts
import { defineConfig } from 'astro/config';
import { agentmarkup } from '@agentmarkup/astro';

export default defineConfig({
  integrations: [
    agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      description: 'Machine-readable metadata for an Astro site.',
      llmsTxt: {
        sections: [
          {
            title: 'Documentation',
            entries: [
              {
                title: 'Getting Started',
                url: '/docs/getting-started',
                description: 'Setup guide and first steps',
              },
            ],
          },
        ],
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
              questions: [
                {
                  question: 'Do you ship internationally?',
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
        PerplexityBot: 'allow',
        'Google-Extended': 'allow',
      },
      validation: {
        warnOnMissingSchema: true,
      },
    }),
  ],
});
```

## What It Does

- Injects JSON-LD into built HTML pages during the Astro build
- Generates `/llms.txt` from config
- Validates JSON-LD already present in page HTML
- Generates `.md` mirrors from the final HTML output
- Patches or creates `robots.txt` with AI crawler directives
- Patches or creates `_headers` with `Content-Signal`
- Validates common schema and crawler mistakes at build time
- Warns when a page looks like a thin client-rendered HTML shell
- Re-exports `@agentmarkup/core` helpers for custom pipelines

By default, the Astro adapter coexists with existing machine-readable assets. If a page already contains JSON-LD for a schema type, or the site already ships a curated `llms.txt` or matching crawler rules, those are preserved unless you opt into replacement.

Markdown mirrors and `_headers` follow the same rule: existing files are preserved unless you opt into replacement with `markdownPages.replaceExisting` or `contentSignalHeaders.replaceExisting`.

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
