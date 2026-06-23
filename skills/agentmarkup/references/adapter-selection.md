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
