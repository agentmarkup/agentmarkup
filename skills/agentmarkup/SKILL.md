---
name: agentmarkup
description: Install, configure, audit, and fix AgentMarkup machine-readable website metadata in JavaScript web repos. Use when adding @agentmarkup/vite, @agentmarkup/astro, @agentmarkup/next, or @agentmarkup/core; configuring llms.txt, llms-full.txt, JSON-LD, markdown mirrors, AI crawler robots.txt, Content-Signal headers, or A2A Agent Cards; or auditing and repairing generated output for deployed sites.
license: MIT
metadata:
  compatibility: Requires a JavaScript or TypeScript web repository with package-manager and build access. Network access is useful for package install and deployed-site audits.
---

# AgentMarkup

## Overview

Use this skill to add AgentMarkup to an existing web repository, configure it from the user's preferences, audit the generated metadata, and implement fixes until the repo or deployed site has a coherent machine-readable surface.

AgentMarkup can generate or validate `llms.txt`, optional `llms-full.txt`, JSON-LD, markdown mirrors, AI crawler `robots.txt` rules, `_headers`/Content-Signal headers, and optional A2A Agent Card discovery.

## Compatibility

Use in JavaScript or TypeScript web repositories where the agent can inspect source files, install dev dependencies, run the normal build, and read generated output. Network access is useful for package installation and deployed-site audits.

## Workflow

1. Inspect the target repo before editing.
   - Read `package.json`, lockfiles, framework config, build scripts, existing `public/` assets, and generated output if present.
   - Identify the package manager from lockfiles and existing scripts.
   - Note existing `llms.txt`, `robots.txt`, `_headers`, JSON-LD, sitemap, canonical tags, and deployed URL hints.
2. Choose the integration point by final HTML ownership, not by the first build tool in the stack.
   - Read [references/adapter-selection.md](references/adapter-selection.md).
   - Use `@agentmarkup/vite`, `@agentmarkup/astro`, `@agentmarkup/next`, or `@agentmarkup/core` only where it can affect the final deployed output.
3. Capture preferences the repo cannot reveal.
   - Read [references/preferences.md](references/preferences.md).
   - Ask only for missing high-impact preferences such as public site URL, crawler policy, Content-Signal policy, markdown mirror preference, `llms-full.txt`, schema priorities, or A2A Agent Card details.
4. Install the selected package with the repo's package manager.
   - `pnpm add -D <package>` when `pnpm-lock.yaml` exists.
   - `npm install -D <package>` when `package-lock.json` exists.
   - `yarn add -D <package>` when `yarn.lock` exists.
   - `bun add -d <package>` when `bun.lock` or `bun.lockb` exists.
5. Apply the matching template as a pattern, not as a blind overwrite.
   - Vite: [assets/templates/vite.config.agentmarkup.ts](assets/templates/vite.config.agentmarkup.ts)
   - Astro: [assets/templates/astro.config.agentmarkup.ts](assets/templates/astro.config.agentmarkup.ts)
   - Next.js: [assets/templates/next.config.agentmarkup.ts](assets/templates/next.config.agentmarkup.ts)
   - Custom final-output pipeline: [assets/templates/core-postbuild.agentmarkup.ts](assets/templates/core-postbuild.agentmarkup.ts)
6. Build and audit.
   - Run the repo's normal build command.
   - Inspect generated HTML and root assets in the deployed output directory.
   - Read [references/audit-and-fix.md](references/audit-and-fix.md) before classifying findings or implementing fixes.
   - If a public URL is available, audit the deployed site too because hosting headers and final rewrites can differ from local output.
7. Implement fixes and rerun validation until the remaining issues are either resolved or outside AgentMarkup's scope.

## Guardrails

- Preserve curated `llms.txt`, `robots.txt`, `_headers`, existing markdown files, and existing JSON-LD unless the user explicitly opts into replacement.
- Do not force `@agentmarkup/vite` to inject JSON-LD when a later framework or deploy step creates the final HTML.
- Treat markdown mirrors as useful for thin, noisy, or client-rendered HTML. Do not present them as required when raw HTML is already substantial.
- Enable `agentCard` only when the site already has a real A2A-compatible agent service to advertise. AgentMarkup emits discovery metadata; it does not implement an A2A runtime.
- Keep changes scoped to AgentMarkup setup and metadata fixes. Do not refactor unrelated app code to satisfy the audit unless the issue cannot be fixed otherwise.
- For Next.js, remember that fully dynamic SSR routes that do not emit build-time HTML need route-level `@agentmarkup/core` helpers for JSON-LD rather than relying on static output patching.

## Expected Output

When reporting results, include:

- final-output owner and selected adapter
- package installed and config files changed
- preferences used and defaults assumed
- audit findings by severity
- build/deployed-site checks run
- remaining issues that require non-AgentMarkup site or hosting changes
