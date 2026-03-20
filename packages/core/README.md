# @agentmarkup/core

Framework-agnostic `llms.txt`, JSON-LD, AI crawler `robots.txt`, and validation primitives for machine-readable websites.

## Install

```bash
pnpm add -D @agentmarkup/core
```

## Usage

`@agentmarkup/core` is for adapter authors and for sites that already own a custom prerender or post-build pipeline.

The helpers are coexistence-friendly: `patchRobotsTxt()` leaves matching manual crawler rules untouched, and adapters built on core can preserve curated `llms.txt` files or existing JSON-LD by default.

```ts
import {
  generateLlmsTxt,
  generateJsonLdTags,
  patchRobotsTxt,
  presetToJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';

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

const llmsIssues = validateLlmsTxt(llms ?? '');
const robotsIssues = validateRobotsTxt(robots, {
  GPTBot: 'allow',
  ClaudeBot: 'allow',
});
```

## What It Includes

- `llms.txt` generators and validators
- JSON-LD serialization and HTML injection helpers
- schema.org preset builders
- AI crawler `robots.txt` generation and patching
- deterministic schema and crawler validation

## Maintainer

Copyright (c) 2026 [Sebastian Cochinescu](https://www.cochinescu.com). MIT License.

Used in production on [Anima Felix](https://animafelix.com).

## License

MIT.
