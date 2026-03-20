# agentmarkup

Build-time `llms.txt`, JSON-LD, AI crawler controls, and validation for Vite websites.

## What This Repo Contains

- `packages/vite` — the publishable `@agentmarkup/vite` package
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

On build, the plugin can:

- emit `llms.txt`
- inject JSON-LD into generated HTML
- patch or create `robots.txt` with AI crawler directives
- report deterministic validation warnings and errors in the terminal

## Current Features

- `llms.txt` generation
- JSON-LD injection
- schema presets for website and ecommerce basics
- AI crawler `robots.txt` management
- deterministic validation checks

## Local Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Package details live in [packages/vite/README.md](./packages/vite/README.md).
Contribution guidelines live in [CONTRIBUTING.md](./CONTRIBUTING.md).

Website deploys are manual via `./deploy/website-deploy.sh`.

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).
