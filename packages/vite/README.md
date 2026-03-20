# @agentmarkup/vite

Build-time `llms.txt`, JSON-LD, AI crawler controls, and validation for Vite websites.

## Install

```bash
pnpm add -D @agentmarkup/vite
```

## Usage

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentmarkup } from '@agentmarkup/vite';

export default defineConfig({
  plugins: [
    react(),
    agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      description: 'Machine-readable metadata for an example site.',
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
        CCBot: 'disallow',
      },
      validation: {
        warnOnMissingSchema: true,
      },
    }),
  ],
});
```

## What It Does

- Generates `/llms.txt` from config
- Injects JSON-LD into built HTML pages
- Patches or creates `robots.txt` with AI crawler directives
- Validates common schema and crawler mistakes at build time

## Presets

- `webSite`
- `organization`
- `article`
- `faqPage`
- `product`
- `offer`

You can also pass custom schema objects with your own `@type`.

## Example Output

```text
  @agentmarkup/vite

  ✓ llms.txt generated (6 entries, 2 sections)
  ✓ JSON-LD injected into 1 pages
  ✓ robots.txt patched (5 AI crawlers configured)

  No issues found
```

See the example app in the GitHub repo at [`examples/vite-react`](https://github.com/agentmarkup/agentmarkup/tree/main/examples/vite-react).

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
