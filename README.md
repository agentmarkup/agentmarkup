# agentmarkup

Build-time `llms.txt`, optional `llms-full.txt`, optional A2A Agent Cards, JSON-LD, markdown mirrors, AI crawler controls, and validation for Vite, Astro, and Next.js websites.

## What This Repo Contains

- `packages/core` — the framework-agnostic engine used by adapters and manual pipelines
- `packages/vite` — the publishable `@agentmarkup/vite` adapter
- `packages/astro` — the publishable `@agentmarkup/astro` adapter
- `packages/next` — the publishable `@agentmarkup/next` adapter
- `website` — the dogfooding landing page built against the workspace package boundary
- `examples/vite-react` — a minimal example app for local verification and onboarding

## Quick Start

Choose the adapter that owns your final output:

- `@agentmarkup/vite` for Vite
- `@agentmarkup/astro` for Astro
- `@agentmarkup/next` for Next.js

```bash
pnpm add -D @agentmarkup/vite
# or: pnpm add -D @agentmarkup/astro
# or: pnpm add -D @agentmarkup/next
```

Vite example:

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

- emit optional `/.well-known/agent-card.json` for existing A2A services
- emit `llms.txt`
- emit optional `llms-full.txt` with inlined same-site markdown context
- inject the homepage `llms.txt` discovery link automatically
- inject JSON-LD into generated HTML
- validate JSON-LD already present in page HTML
- emit page-level `.md` mirrors from final HTML output when a cleaner agent-facing fetch path is useful
- patch or create `robots.txt` with AI crawler directives
- patch or create `_headers`, or merge server header rules, with `Content-Signal` and canonical `Link` headers for markdown mirrors
- report deterministic validation warnings and errors in the terminal, including markdown alternate-link and mirror-coverage issues

By default, agentmarkup coexists with existing machine-readable assets. If a site already has a curated `llms.txt`, matching crawler rules, or hand-authored JSON-LD for a schema type, those are preserved unless you explicitly opt into replacement.

Optional A2A Agent Card support is intentionally narrow. If you already run a real A2A-compatible agent service, agentmarkup can emit a static `/.well-known/agent-card.json` discovery file for that service from the same build pipeline. It does not implement the A2A runtime protocol or agent server itself. When you enable `agentCard`, provide a `version`, at least one `supportedInterfaces` entry, and a non-empty description through either the top-level `description` or `agentCard.description`.

Markdown mirrors are optional. They are usually most useful for thin, noisy, or client-rendered HTML where the raw page is a poor fetch target for agents. When enabled, same-site page entries in `llms.txt` default to the generated `.md` URLs so cold agents discover the cleaner fetch path first. Set `llmsTxt.preferMarkdownMirrors: false` if you want `llms.txt` to keep pointing at HTML routes instead.

If your site already has a custom prerender or post-build step, `@agentmarkup/core` exposes reusable `llms.txt`, JSON-LD, and `robots.txt` helpers so you can keep one final output pipeline instead of duplicating that logic.

`@agentmarkup/vite` is best when Vite owns the final HTML files. Meta-frameworks that render or prerender final HTML after Vite's build phases may still benefit from `llms.txt` and `robots.txt`, but they usually need either `@agentmarkup/core` in the final output step or a dedicated adapter to guarantee JSON-LD reaches the deployed HTML.

`@agentmarkup/next` is best when Next owns the final build output. Static export gets the full post-build file flow, prerendered and server deployments still get generated assets plus header integration, but fully dynamic SSR routes are still a per-route integration point: if Next does not emit build-time HTML for that route, use the re-exported `@agentmarkup/core` helpers directly inside app code.

## Current Features

- Vite, Astro, and Next.js adapters
- optional A2A Agent Card generation plus config and output validation
- `llms.txt` generation
- optional `llms-full.txt` generation
- automatic `llms.txt` discovery-link injection
- JSON-LD injection
- existing JSON-LD validation
- markdown page generation
- markdown alternate-link and mirror-coverage validation
- schema presets for website and ecommerce basics
- AI crawler `robots.txt` management
- `Content-Signal` header generation
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

Package details live in [packages/vite/README.md](./packages/vite/README.md), [packages/astro/README.md](./packages/astro/README.md), [packages/next/README.md](./packages/next/README.md), and [packages/core/README.md](./packages/core/README.md).
Contribution guidelines live in [CONTRIBUTING.md](./CONTRIBUTING.md).

Website deploys are manual via `./deploy/website-deploy.sh`.

## Codex Skill

This repo includes a repo-local Codex skill at `.agents/skills/agentmarkup-audit` for auditing and improving machine-readable website metadata.

Use it to:

- determine final-output ownership
- recommend `@agentmarkup/vite`, `@agentmarkup/astro`, `@agentmarkup/next`, or `@agentmarkup/core`
- audit `llms.txt`, `llms-full.txt`, JSON-LD, `robots.txt`, `_headers`, and markdown mirrors
- compare a site or repo against the same expectations used by the website checker

This skill is repo tooling, not part of the published package runtime surface.

Example prompt:

```text
Use the repo-local agentmarkup-audit skill on this repo or site. Determine who owns the final HTML, audit llms.txt, llms-full.txt, JSON-LD, robots.txt, _headers, and tell me whether markdown mirrors plus @agentmarkup/vite, @agentmarkup/astro, @agentmarkup/next, or @agentmarkup/core are the right fit.
```

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).
