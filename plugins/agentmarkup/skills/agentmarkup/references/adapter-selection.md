# Adapter Selection

Choose the package that can affect the final deployed output.

## Vite

Use `@agentmarkup/vite` when Vite writes the final HTML files that are deployed.

Typical fit:

- plain Vite apps
- Vite static sites where `dist/*.html` is the deploy artifact
- Vite builds without a later prerender, SSR, worker rewrite, or framework output step

Do not rely on the Vite adapter for JSON-LD if another system creates or rewrites the final HTML after Vite finishes.

## Astro

Use `@agentmarkup/astro` when Astro owns the built HTML in the final output directory.

Typical fit:

- Astro static builds
- Astro sites where the `astro:build:done` output is the deployed artifact

## Next.js

Use `@agentmarkup/next` when Next owns the final build output.

Typical fit:

- static export with `output: 'export'`
- prerendered pages where Next emits build-time HTML
- server deployments that can use merged `headers()` output for Content-Signal and markdown canonical headers

For fully dynamic SSR routes where Next does not emit build-time HTML, use the re-exported `@agentmarkup/core` helpers directly in the route, page, or layout that owns the response.

## Nuxt

Use `@agentmarkup/nuxt` when Nuxt prerenders the HTML that gets deployed.

Typical fit:

- `nuxt generate`
- routes configured with `prerender: true`
- any build where `.output/public` is the deploy artifact

The module runs on Nitro's `prerender:done` hook. Fully dynamic SSR routes never emit build-time HTML and are not patched; use the re-exported `@agentmarkup/core` helpers in app code for those.

Config lives under an `agentmarkup` key in `nuxt.config.ts`, alongside `modules: ['@agentmarkup/nuxt']`. It is not a function call.

## CLI

Use `@agentmarkup/cli` when the site is already built and no first-party adapter fits.

Typical fit:

- Eleventy, Hugo, Jekyll, Gatsby, Docusaurus, plain static HTML
- any pipeline that ends with a directory of emitted HTML
- CI gating, via `agentmarkup check`

Run `agentmarkup generate <outDir>` after the site's own build. Output directory resolution is: explicit argument, then `outDir` in the config, then `dist` / `build` / `out` / `_site`. `public/` is never auto-guessed because it is a source directory in many frameworks.

Config is a plain object exported from `agentmarkup.config.mjs` (or `.js` / `.cjs`) in the project root, or a path passed with `--config`.

## Audit

`@agentmarkup/audit` is not an integration point; it is a check against a live URL.

Use it after deploying, when hosting headers or edge rewrites might differ from local output. It fetches the deployed origin as a browser and as several AI crawler user agents, then diffs the results.

Two things to keep straight:

- `@agentmarkup/audit` is the tool that uses crawler user agents. The agentmarkup.dev website checker does not; it identifies itself honestly and reports what a plain fetch sees.
- A 403 to a spoofed crawler user agent is a warning, not proof that a site blocks AI. WAF and bot-management rules produce the same response.

Only run it against origins the user owns or operates.

## Core

Use `@agentmarkup/core` when a custom pipeline owns final output.

Typical fit:

- custom prerender or post-build scripts
- frameworks that render final HTML after Vite or another bundler finishes
- server, edge, or worker steps that rewrite HTML
- projects that already curate `llms.txt`, `robots.txt`, or JSON-LD and only need shared generators or validators

## Anti-Patterns

- Do not choose an adapter based only on the package already installed; choose based on final-output ownership.
- Do not use markdown mirrors as a substitute for meaningful final HTML.
- Do not clobber curated metadata unless the user explicitly requests replacement.
- Do not enable A2A Agent Card output unless an actual A2A-compatible service exists.
