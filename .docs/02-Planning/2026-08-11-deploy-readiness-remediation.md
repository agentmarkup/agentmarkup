# Deploy readiness remediation

## Goal

Bring the post-pull workspace to a reproducible, deploy-ready state without discarding the approved editorial/mobile redesign or unrelated user changes.

## Scope

1. Make the frozen install reproducible with the pinned pnpm 10.32.1 toolchain.
2. Restore complete crawlable navigation and content in Markdown mirrors, include `/learn/` in sitemap, and synchronize the homepage fallback.
3. Harden the Cloudflare Worker around request limits, abuse protection, Turnstile validation, stored history, public errors, and unknown routes.
4. Restore the homepage URL-check conversion flow and compact technical coverage in the current visual system.
5. Verify all packages, SEO/GEO artifacts, Worker behavior, and every public route at desktop and mobile sizes.

## Stop conditions

- Frozen pinned install, tests, typecheck, lint, build, SEO verification, and diff checks pass.
- The build contains exactly the 27 manifest routes and `/learn/` is in sitemap.
- Markdown mirrors retain useful internal links and semantic article orientation.
- Unknown routes return a real 404 instead of the homepage with status 200.
- Worker tests cover protection failure, request limits, privacy-safe persistence, Turnstile response validation, and method/origin guards.
- Browser checks find no route errors, horizontal overflow, duplicate H1, broken FAQ interaction, or mobile navigation regression.

## Constraints

- No new runtime dependencies.
- No production deploy or secret mutation in this task.
- Preserve unrelated dirty-worktree changes.
- Keep the approved cobalt editorial design and the inline FAQ.
