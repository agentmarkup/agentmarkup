# @agentmarkup/vite

Build-time `llms.txt`, JSON-LD, AI crawler controls, and validation for Vite websites.

`@agentmarkup/vite` is the Vite adapter in the `agentmarkup` package family. Framework-agnostic helpers live in `@agentmarkup/core`, and Astro sites use `@agentmarkup/astro`.

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
- Exposes the same generators and validators for custom prerender or post-build scripts

If the page already contains JSON-LD for a schema type, or the site already ships a curated `llms.txt` or matching crawler rules, the adapter preserves those by default. Set `llmsTxt.replaceExisting` or `jsonLd.replaceExistingTypes` only when you want Vite output to replace existing assets.

The adapter assumes Vite controls the final HTML output. If a framework does an additional server-render or prerender pass after Vite finishes, use `@agentmarkup/core` in that final step or reach for a dedicated adapter instead of assuming JSON-LD injection will carry through automatically.

## Presets

- `webSite`
- `organization`
- `article`
- `faqPage`
- `product`
- `offer`

You can also pass custom schema objects with your own `@type`.

## Custom Pipelines

If your site already has a final prerender or post-build step, you can reuse the public helpers instead of maintaining a separate `llms.txt` or `robots.txt` implementation.

```ts
import {
  generateLlmsTxt,
  patchRobotsTxt,
  generateJsonLdTags,
  presetToJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/vite';

const llms = generateLlmsTxt({
  site: 'https://example.com',
  name: 'Example',
  description: 'Machine-readable metadata for an example site.',
  llmsTxt: {
    sections: [
      {
        title: 'Public pages',
        entries: [{ title: 'Pricing', url: '/pricing', description: 'Plans and billing' }],
      },
    ],
  },
});

const robots = patchRobotsTxt(existingRobotsTxt, {
  GPTBot: 'allow',
  ClaudeBot: 'allow',
});

const jsonLd = generateJsonLdTags([
  presetToJsonLd({ preset: 'webSite', name: 'Example', url: 'https://example.com' }),
]);

const llmsIssues = validateLlmsTxt(llms ?? '');
const robotsIssues = validateRobotsTxt(robots, {
  GPTBot: 'allow',
  ClaudeBot: 'allow',
});
```

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
