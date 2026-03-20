# @agentmarkup/astro

Build-time `llms.txt`, optional `llms-full.txt`, JSON-LD, markdown mirrors, AI crawler `robots.txt`, headers, and validation for Astro websites.

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
- Generates optional `/llms-full.txt` with inlined same-site markdown content
- Injects the homepage `llms.txt` discovery link automatically
- Validates JSON-LD already present in page HTML
- Generates `.md` mirrors from the final HTML output when a cleaner agent-facing fetch path is useful
- Patches or creates `robots.txt` with AI crawler directives
- Patches or creates `_headers` with `Content-Signal` and canonical `Link` headers for markdown mirrors
- Validates common schema and crawler mistakes at build time
- Warns when a page looks like a thin client-rendered HTML shell
- Warns when markdown alternate links or `llms.txt` mirror coverage drift out of sync
- Re-exports `@agentmarkup/core` helpers for custom pipelines

By default, the Astro adapter coexists with existing machine-readable assets. If a page already contains JSON-LD for a schema type, or the site already ships a curated `llms.txt` or matching crawler rules, those are preserved unless you opt into replacement.

Markdown mirrors are optional. They are usually most useful for thin, noisy, or client-rendered HTML where the raw page is a weak fetch target for agents. The generated `.md` files stay directly fetchable for agents, while their `_headers` entries point search engines back at the HTML page as canonical. Existing files are still preserved unless you opt into replacement with `markdownPages.replaceExisting` or `contentSignalHeaders.replaceExisting`.

When markdown mirrors are enabled, the adapter also writes canonical `Link` headers for those `.md` files so search engines can keep the HTML route as the preferred indexed URL without making the markdown mirror unavailable to direct fetchers.

When markdown mirrors are enabled, same-site page entries in `llms.txt` automatically point at the generated `.md` mirrors by default. Set `llmsTxt.preferMarkdownMirrors: false` if you want `llms.txt` to keep linking to HTML routes instead.

Enable `llmsFullTxt` when you want a richer companion file for agents that can consume more than the compact `llms.txt` manifest. The generated `llms-full.txt` keeps the same section structure but inlines same-site markdown mirror content when those mirrors exist.

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
