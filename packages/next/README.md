# @agentmarkup/next

Build-time `llms.txt`, optional `llms-full.txt`, JSON-LD, markdown mirrors, AI crawler controls, headers, and validation for Next.js websites.

`@agentmarkup/next` is the Next.js adapter in the `agentmarkup` package family. It uses Next's config and build-adapter hooks for server deployments, and it post-processes final exported HTML when `output: 'export'` is enabled.

## Install

```bash
pnpm add -D @agentmarkup/next
```

## Usage

```ts
import type { NextConfig } from 'next';
import { withAgentmarkup } from '@agentmarkup/next';

const nextConfig: NextConfig = {
  output: 'export',
};

export default withAgentmarkup(
  {
    site: 'https://example.com',
    name: 'Example',
    description: 'Machine-readable metadata for a Next.js site.',
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
      CCBot: 'disallow',
    },
    validation: {
      warnOnMissingSchema: true,
    },
  },
  nextConfig
);
```

## What It Does

- Generates `/llms.txt` from config
- Generates optional `/llms-full.txt` with inlined same-site markdown content
- Injects the homepage `llms.txt` discovery link automatically into emitted HTML pages
- Injects JSON-LD into emitted HTML pages
- Validates JSON-LD already present in emitted HTML
- Generates `.md` mirrors from the final exported or prerendered HTML output when a cleaner agent-facing fetch path is useful
- Configures `Content-Signal` and markdown-canonical headers for server deployments through `next.config` headers
- Generates `_headers` with `Content-Signal` and markdown-canonical `Link` headers for static export output
- Generates or patches `robots.txt` with AI crawler directives
- Validates common schema and crawler mistakes at build time
- Warns when emitted HTML looks like a thin client-rendered shell
- Warns when markdown alternate links or `llms.txt` mirror coverage drift out of sync
- Re-exports `@agentmarkup/core` helpers for custom pipeline steps or dynamic-route integration

By default, the Next adapter coexists with existing machine-readable assets. If a page already contains JSON-LD for a schema type, or the site already ships a curated `llms.txt` or matching crawler rules, those are preserved unless you opt into replacement.

Important: `@agentmarkup/next` is a final-output adapter. It works best where Next emits build-time HTML that can be patched or post-processed. If a route is fully dynamic SSR and Next does not emit an HTML file for it during build, use the re-exported `@agentmarkup/core` helpers directly inside your layout or page code for that route.

Markdown mirrors are optional. They are usually most useful for thin, noisy, or client-rendered HTML where the raw page is a weak fetch target for agents. The generated `.md` files stay directly fetchable for agents, while their server headers or `_headers` entries point search engines back at the HTML page as canonical.

When markdown mirrors are enabled, same-site page entries in `llms.txt` automatically point at the generated `.md` mirrors by default. Set `llmsTxt.preferMarkdownMirrors: false` if you want `llms.txt` to keep linking to HTML routes instead.

Enable `llmsFullTxt` when you want a richer companion file for agents that can consume more than the compact `llms.txt` manifest. The generated `llms-full.txt` keeps the same section structure but inlines same-site markdown mirror content when those mirrors exist.

## Scope Notes

- Static export gets the full file-emission flow: HTML patching, markdown mirrors, `llms.txt`, `llms-full.txt`, `robots.txt`, and `_headers`.
- Server deployments still get generated root assets plus merged `headers()` rules for `Content-Signal` and markdown canonicals.
- On server deployments, generated root assets are written into your app's `public/` directory so Next can serve them. Keep that in mind if you are comparing builds with different configs or checking generated files into source control.
- JSON-LD, discovery-link, and markdown-alternate injection only apply where Next emits HTML files at build time. Fully dynamic server-rendered routes should use the re-exported `@agentmarkup/core` helpers directly inside their own layout or page code.
- If the adapter hook is misconfigured, for example because a serialized config cannot be decoded or a chained adapter import fails, `@agentmarkup/next` now emits an explicit warning instead of silently no-oping.

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
