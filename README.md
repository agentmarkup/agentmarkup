# agentmarkup

Build-time `llms.txt`, JSON-LD, AI crawler controls, and validation for Vite and Astro websites.

## What This Repo Contains

- `packages/core` — the framework-agnostic engine used by adapters and manual pipelines
- `packages/vite` — the publishable `@agentmarkup/vite` adapter
- `packages/astro` — the publishable `@agentmarkup/astro` adapter
- `website` — the dogfooding landing page built against the workspace package boundary
- `examples/vite-react` — a minimal example app for local verification and onboarding

## Quick Start

```bash
pnpm add -D @agentmarkup/vite
```

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
      description: 'Structured, machine-readable metadata for your site.',
      llmsTxt: {
        sections: [
          {
            title: 'Pages',
            entries: [
              {
                title: 'Docs',
                url: '/docs',
                description: 'Documentation and guides',
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
      ],
      aiCrawlers: {
        GPTBot: 'allow',
        ClaudeBot: 'allow',
      },
    }),
  ],
});
```

On build, the adapters can:

- emit `llms.txt`
- inject JSON-LD into generated HTML
- patch or create `robots.txt` with AI crawler directives
- report deterministic validation warnings and errors in the terminal

By default, agentmarkup coexists with existing machine-readable assets. If a site already has a curated `llms.txt`, matching crawler rules, or hand-authored JSON-LD for a schema type, those are preserved unless you explicitly opt into replacement.

If your site already has a custom prerender or post-build step, `@agentmarkup/core` exposes reusable `llms.txt`, JSON-LD, and `robots.txt` helpers so you can keep one final output pipeline instead of duplicating that logic.

`@agentmarkup/vite` is best when Vite owns the final HTML files. Meta-frameworks that render or prerender final HTML after Vite's build phases may still benefit from `llms.txt` and `robots.txt`, but they usually need either `@agentmarkup/core` in the final output step or a dedicated adapter to guarantee JSON-LD reaches the deployed HTML.

## Current Features

- Vite and Astro adapters
- `llms.txt` generation
- JSON-LD injection
- schema presets for website and ecommerce basics
- AI crawler `robots.txt` management
- deterministic validation checks
- reusable generation and validation helpers for custom prerender pipelines

## Local Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Package details live in [packages/vite/README.md](./packages/vite/README.md), [packages/astro/README.md](./packages/astro/README.md), and [packages/core/README.md](./packages/core/README.md).
Contribution guidelines live in [CONTRIBUTING.md](./CONTRIBUTING.md).

Website deploys are manual via `./deploy/website-deploy.sh`.

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).
