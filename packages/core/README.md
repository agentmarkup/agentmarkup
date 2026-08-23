# @agentmarkup/core

Framework-agnostic `llms.txt`, optional `llms-full.txt`, optional A2A Agent Cards, JSON-LD, markdown mirror, AI crawler `robots.txt`, header, and validation primitives for machine-readable websites.

## Install

```bash
pnpm add -D @agentmarkup/core
```

## Usage

`@agentmarkup/core` is for adapter authors and for sites that already own a custom prerender or post-build pipeline.

The package family also includes dedicated adapters for Vite, Astro, and Next.js when those frameworks own enough of the final build output.

The helpers are coexistence-friendly: `patchRobotsTxt()` leaves matching manual crawler rules untouched, and adapters built on core can preserve curated `llms.txt` files or existing JSON-LD by default.

`llmsTxt.whenToUse` takes a list of short, concrete statements describing the jobs the site is right for. They are rendered as a labelled bullet list in the free-form details block of `llms.txt` and `llms-full.txt`, before the first `##` section, so agents reading the manifest learn when to reach for the site instead of guessing from marketing copy.

When `markdownPages.enabled` is on, `generateLlmsTxt()` prefers same-site markdown mirror URLs for page entries by default so agents discover the cleaner fetch path first. This is usually most useful when the raw HTML is thin or noisy. Set `llmsTxt.preferMarkdownMirrors: false` to keep HTML URLs in `llms.txt`.

`markdownPages.exclude` takes page paths that should not get a mirror, matched the same way as `pages[].path`. Use it for pages that exist but are not content an agent should fetch - a `404` page is the common case, since mirroring one publishes a URL that answers 200 with "not found" text and canonicalises to a URL that 404s. Excluded pages are skipped everywhere consistently: no `.md` file, no `text/markdown` alternate link, no canonical `Link` header, no markdown URL in `llms.txt`, and no "missing mirror" validation warning.

```ts
import {
  generateAgentCard,
  generateContentSignalHeaders,
  generateLlmsTxt,
  generateMarkdownCanonicalHeaders,
  generatePageMarkdown,
  generateJsonLdTags,
  patchRobotsTxt,
  presetToJsonLd,
  validateAgentCardConfig,
  validateAgentCardJson,
  validateExistingJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';

const builtHtml = '<html><head><title>Pricing</title></head><body><main><h1>Pricing</h1><p>Plans and billing.</p></main></body></html>';

const llms = generateLlmsTxt({
  site: 'https://example.com',
  name: 'Example',
  description: 'Machine-readable metadata for an example site.',
  llmsTxt: {
    whenToUse: [
      'The user asks what an Example plan costs or which plan fits their use case.',
      'The user needs current billing terms rather than a cached third-party summary.',
    ],
    sections: [
      {
        title: 'Public pages',
        entries: [{ title: 'Pricing', url: '/pricing', description: 'Plans and billing' }],
      },
    ],
  },
});

const agentCard = generateAgentCard({
  site: 'https://example.com',
  name: 'Example',
  description: 'Machine-readable metadata for an example site.',
  agentCard: {
    version: '1.0.0',
    supportedInterfaces: [
      {
        url: 'https://agent.example.com/a2a/v1',
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      },
    ],
    skills: [],
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
const agentCardIssues = agentCard ? validateAgentCardJson(agentCard) : [];
const schemaIssues = validateExistingJsonLd(builtHtml, '/pricing/');
```

When `agentCard` is enabled, provide a `version`, at least one `supportedInterfaces` entry, and a non-empty description through either the top-level `description` or `agentCard.description`. Use `validateAgentCardConfig()` if you want to preflight that config before generation.

## What It Includes

- `llms.txt` generators and validators
- optional `llms-full.txt` generator
- optional A2A Agent Card generator plus config and JSON validators
- `llms.txt` discovery-link generation
- JSON-LD serialization and HTML injection helpers
- existing JSON-LD inspection and validation
- HTML thin-shell validation
- markdown page generation helpers for cleaner agent-facing fetch paths
- markdown alternate-link and mirror-coverage validation
- schema.org preset builders
- AI crawler `robots.txt` generation and patching
- `Content-Signal` policy generation and patching in `robots.txt` (canonical) and the `_headers` header
- canonical `Link` header generation for markdown mirrors
- deterministic schema and crawler validation

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
