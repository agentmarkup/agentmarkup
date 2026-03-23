# @agentmarkup/core

Framework-agnostic `llms.txt`, optional `llms-full.txt`, JSON-LD, markdown mirror, AI crawler `robots.txt`, header, and validation primitives for machine-readable websites.

## Install

```bash
pnpm add -D @agentmarkup/core
```

## Usage

`@agentmarkup/core` is for adapter authors and for sites that already own a custom prerender or post-build pipeline.

The package family also includes dedicated adapters for Vite, Astro, and Next.js when those frameworks own enough of the final build output.

The helpers are coexistence-friendly: `patchRobotsTxt()` leaves matching manual crawler rules untouched, and adapters built on core can preserve curated `llms.txt` files or existing JSON-LD by default.

When `markdownPages.enabled` is on, `generateLlmsTxt()` prefers same-site markdown mirror URLs for page entries by default so agents discover the cleaner fetch path first. This is usually most useful when the raw HTML is thin or noisy. Set `llmsTxt.preferMarkdownMirrors: false` to keep HTML URLs in `llms.txt`.

```ts
import {
  generateContentSignalHeaders,
  generateLlmsTxt,
  generateMarkdownCanonicalHeaders,
  generatePageMarkdown,
  generateJsonLdTags,
  patchRobotsTxt,
  validateExistingJsonLd,
  presetToJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';

const builtHtml = '<html><head><title>Pricing</title></head><body><main><h1>Pricing</h1><p>Plans and billing.</p></main></body></html>';

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

const jsonLd = generateJsonLdTags([
  presetToJsonLd({ preset: 'webSite', name: 'Example', url: 'https://example.com' }),
]);

const robots = patchRobotsTxt(existingRobotsTxt, {
  GPTBot: 'allow',
  ClaudeBot: 'allow',
});

const markdown = generatePageMarkdown({
  html: builtHtml,
  pagePath: '/pricing/',
  siteUrl: 'https://example.com',
});

const headers = generateContentSignalHeaders({
  aiTrain: 'yes',
  search: 'yes',
  aiInput: 'yes',
});

const markdownCanonicalHeaders = generateMarkdownCanonicalHeaders([
  {
    markdownPath: '/pricing.md',
    canonicalUrl: 'https://example.com/pricing',
  },
]);

const llmsIssues = validateLlmsTxt(llms ?? '');
const robotsIssues = validateRobotsTxt(robots, {
  GPTBot: 'allow',
  ClaudeBot: 'allow',
});
const schemaIssues = validateExistingJsonLd(builtHtml, '/pricing/');
```

## What It Includes

- `llms.txt` generators and validators
- optional `llms-full.txt` generator
- `llms.txt` discovery-link generation
- JSON-LD serialization and HTML injection helpers
- existing JSON-LD inspection and validation
- HTML thin-shell validation
- markdown page generation helpers for cleaner agent-facing fetch paths
- markdown alternate-link and mirror-coverage validation
- schema.org preset builders
- AI crawler `robots.txt` generation and patching
- `Content-Signal` header generation and patching
- canonical `Link` header generation for markdown mirrors
- deterministic schema and crawler validation

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
