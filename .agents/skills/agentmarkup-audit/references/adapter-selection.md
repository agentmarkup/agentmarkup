# Adapter Selection

Start by identifying who owns the final deployed HTML, not who starts the build.

## Choose `@agentmarkup/vite`

Use `@agentmarkup/vite` when Vite owns the final HTML written to the deployed output.

Typical fit:

- plain Vite sites
- Vite builds where the emitted HTML is the real final page
- setups without a later prerender, SSR, worker rewrite, or custom final-output step

## Choose `@agentmarkup/astro`

Use `@agentmarkup/astro` when Astro owns the built HTML in the final output directory.

Typical fit:

- Astro sites that ship Astro's built HTML as the final deploy artifact

## Choose `@agentmarkup/next`

Use `@agentmarkup/next` when Next owns the final build output.

Typical fit:

- static export with `output: 'export'`
- prerendered pages where Next emits build-time HTML
- server deployments that can use merged `headers()` output for Content-Signal and markdown canonical headers

For fully dynamic SSR routes where Next does not emit build-time HTML, use the re-exported `@agentmarkup/core` helpers directly inside app code for that route.

## Choose `@agentmarkup/core`

Use `@agentmarkup/core` when something else owns the final output after Vite or another build tool finishes.

Typical fit:

- custom prerender or post-build pipelines
- frameworks that render final HTML after Vite's normal hooks
- server, worker, or deploy steps that rewrite or replace the HTML
- apps that already curate `llms.txt` or `robots.txt` and only want reusable helpers

## Anti-patterns

- Do not force `@agentmarkup/vite` to own JSON-LD if the final HTML is generated later by another system.
- Do not use markdown mirrors as a substitute for real final HTML.
- Do not clobber curated `llms.txt`, `robots.txt`, or existing schema types unless the user explicitly wants replacement.

## Website checker overlap

The website checker is useful for validating deployed end-state behavior, but it does not decide the integration point by itself. Use it to confirm outcomes after you decide who owns the final output.
