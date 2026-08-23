---
name: agentmarkup
description: Install, configure, audit, and fix AgentMarkup machine-readable website metadata in JavaScript web repos. Use when adding @agentmarkup/vite, @agentmarkup/astro, @agentmarkup/next, @agentmarkup/nuxt, @agentmarkup/cli, @agentmarkup/audit, or @agentmarkup/core; configuring llms.txt, llms-full.txt, JSON-LD, markdown mirrors, AI crawler robots.txt, Content-Signal headers, or A2A Agent Cards; or auditing and repairing generated output for deployed sites.
license: MIT
metadata:
  compatibility: Requires a JavaScript or TypeScript web repository with package-manager and build access. Network access is useful for package install and deployed-site audits. On surfaces without a shell or repository, this skill advises and drafts config instead of installing.
---

# AgentMarkup

## Overview

Use this skill to add AgentMarkup to an existing web repository, configure it from the user's preferences, audit the generated metadata, and implement fixes until the repo or deployed site has a coherent machine-readable surface.

AgentMarkup can generate or validate `llms.txt`, optional `llms-full.txt`, JSON-LD, markdown mirrors, AI crawler `robots.txt` rules, `_headers`/Content-Signal headers, and optional A2A Agent Card discovery.

## Compatibility

Best used in JavaScript or TypeScript web repositories where you can inspect source files, install dev dependencies, run the normal build, and read generated output.

**Without a shell or a repository** (for example a plain chat surface), steps 1 and 5 through 9 below are not possible. Do not narrate an installation you cannot perform. Instead: read what the user pastes or links, identify the final-HTML owner, recommend the package, and write out the config and the `llms.txt` / JSON-LD they should apply themselves. Say plainly that they need to run the install and build in their own environment.

## Workflow

1. Inspect the target repo before editing. This is read-only and needs no approval.
   - Read `package.json`, lockfiles, framework config, build scripts, existing `public/` assets, and generated output if present.
   - Identify the package manager from lockfiles and existing scripts.
   - Note existing `llms.txt`, `robots.txt`, `_headers`, JSON-LD, sitemap, canonical tags, and deployed URL hints.
2. Choose the integration point by final HTML ownership, not by the first build tool in the stack.
   - Read [references/adapter-selection.md](references/adapter-selection.md).
   - `@agentmarkup/vite`, `@agentmarkup/astro`, `@agentmarkup/next`, `@agentmarkup/nuxt`, `@agentmarkup/cli`, or `@agentmarkup/core`, whichever can actually affect the final deployed output.
   - Present the recommendation and say why that layer owns the final HTML.
3. Capture preferences the repo cannot reveal.
   - Read [references/preferences.md](references/preferences.md).
   - Ask only for missing high-impact preferences such as public site URL, crawler policy, Content-Signal policy, markdown mirror preference, `llms-full.txt`, schema priorities, or A2A Agent Card details.
4. **Stop and get explicit approval before changing anything.**
   - This gate covers all of: installing a package or editing `package.json`/the lockfile, writing or patching config files, running a build, and making an outbound audit request to a deployed site.
   - Present it as **one plan, asked once**: the package to install, every file that would change, the exact commands to run, and the audit target URL if there will be one. Do not ask piecemeal, one permission at a time.
   - If there will be a live audit, name the origin and ask the user to confirm it is a site they own or operate. `@agentmarkup/audit` sends requests from the user's machine under crawler user agents; it is not for pointing at third parties.
   - Do not proceed on silence. If the user declines, stop.
5. After approval, install the selected package with the repo's package manager.
   - `pnpm add -D <package>` when `pnpm-lock.yaml` exists.
   - `npm install -D <package>` when `package-lock.json` exists.
   - `yarn add -D <package>` when `yarn.lock` exists.
   - `bun add -d <package>` when `bun.lock` or `bun.lockb` exists.
6. Apply the matching template as a pattern, not as a blind overwrite.
   - Vite: [assets/templates/vite.config.agentmarkup.ts](assets/templates/vite.config.agentmarkup.ts)
   - Astro: [assets/templates/astro.config.agentmarkup.ts](assets/templates/astro.config.agentmarkup.ts)
   - Next.js: [assets/templates/next.config.agentmarkup.ts](assets/templates/next.config.agentmarkup.ts)
   - Nuxt: [assets/templates/nuxt.config.agentmarkup.ts](assets/templates/nuxt.config.agentmarkup.ts)
   - CLI, any built static output: [assets/templates/agentmarkup.config.mjs](assets/templates/agentmarkup.config.mjs)
   - Custom final-output pipeline: [assets/templates/core-postbuild.agentmarkup.ts](assets/templates/core-postbuild.agentmarkup.ts)
7. Build.
   - Run the repo's normal build command.
   - For `@agentmarkup/cli`, run `agentmarkup generate <outDir>` **after** the site's own build finishes. Use `--dry-run` first to show planned writes without touching anything.
   - `agentmarkup check <outDir>` validates what is already on disk and never writes, which makes it the right CI gate.
8. Audit.
   - Inspect generated HTML and root assets in the deployed output directory.
   - Read [references/audit-and-fix.md](references/audit-and-fix.md) before classifying findings or implementing fixes.
   - If a public URL is available and the user approved it in step 4, audit the deployed site too, because hosting headers and final rewrites can differ from local output.
9. Implement fixes and rerun validation until the remaining issues are either resolved or outside AgentMarkup's scope.
   - **Anything beyond the plan approved in step 4 needs fresh approval.** A new file, a command that was not listed, a different audit target, or a different kind of change means stop and present a new plan. Approval covers the plan that was shown, not the rest of the session.

## Guardrails

- Preserve curated `llms.txt`, `robots.txt`, `_headers`, existing markdown files, and existing JSON-LD unless the user explicitly opts into replacement.
- Do not force `@agentmarkup/vite` to inject JSON-LD when a later framework or deploy step creates the final HTML.
- Treat markdown mirrors as useful for thin, noisy, or client-rendered HTML. Do not present them as required when raw HTML is already substantial.
- Enable `agentCard` only when the site already has a real A2A-compatible agent service to advertise. AgentMarkup emits discovery metadata; it does not implement an A2A runtime.
- Keep changes scoped to AgentMarkup setup and metadata fixes. Do not refactor unrelated app code to satisfy the audit unless the issue cannot be fixed otherwise.
- For Next.js and Nuxt, fully dynamic SSR routes that do not emit build-time HTML need route-level `@agentmarkup/core` helpers for JSON-LD rather than static output patching.
- Report findings as concrete pass/warn/error facts. Do not invent readiness scores, letter grades, or percentage ratings; AgentMarkup's validation is deterministic and deliberately has none.
- Do not claim a site "blocks AI" based on a crawler-user-agent response. A 403 to a spoofed user agent can be a WAF rule rather than an intentional policy, so report it as a warning to investigate.

## Expected Output

When reporting results, include:

- final-output owner and selected adapter
- package installed and config files changed
- preferences used and defaults assumed
- audit findings by severity
- build/deployed-site checks run
- remaining issues that require non-AgentMarkup site or hosting changes
