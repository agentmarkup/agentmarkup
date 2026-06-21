# @agentmarkup/nuxt

Make your Nuxt site machine-readable for LLMs and AI agents at build time. A thin Nuxt module on top of [`@agentmarkup/core`](https://www.npmjs.com/package/@agentmarkup/core) that generates `llms.txt`, markdown mirrors, JSON-LD, AI-crawler `robots.txt`, and `_headers` from your **prerendered** output.

## Install

```bash
npm install -D @agentmarkup/nuxt
```

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agentmarkup/nuxt'],
  agentmarkup: {
    site: 'https://example.com',
    name: 'Example',
    llmsTxt: {
      sections: [
        { title: 'Docs', entries: [{ title: 'Home', url: 'https://example.com/' }] },
      ],
    },
    markdownPages: { enabled: true },
    aiCrawlers: { GPTBot: 'disallow' },
  },
});
```

The module runs after Nitro finishes prerendering (the `nuxt generate` / `prerender: true` path), injecting discovery + JSON-LD into the emitted HTML and writing the machine-readable assets into the prerender output directory (`.output/public`).

## What it does

- Generates `llms.txt` (and optional `llms-full.txt`) from your config.
- Generates content-centric markdown mirrors (`.md`) for prerendered pages, with canonical `Link` headers in `_headers`.
- Injects an `llms.txt` discovery link and a `text/markdown` alternate link into each page `<head>`.
- Injects gap-aware JSON-LD (only types not already present on the page).
- Adds AI-crawler rules to `robots.txt` and optional `Content-Signal` headers.
- Runs deterministic validation and prints a build-time report.

Existing curated `llms.txt`, `robots.txt` rules, and page JSON-LD are **preserved by default** — the module only fills gaps. Opt into replacement per feature (`llmsTxt.replaceExisting`, `markdownPages.replaceExisting`, `jsonLd.replaceExistingTypes`, etc.).

## Scope

`@agentmarkup/nuxt` processes **prerendered / `nuxt generate` output**. Fully dynamic SSR routes that never emit build-time HTML are not patched automatically — use the re-exported [`@agentmarkup/core`](https://www.npmjs.com/package/@agentmarkup/core) helpers inside app code (e.g. a route handler) for those.

Compatible with Nuxt 4. (The module only uses long-stable Nuxt Kit / Nitro APIs and is expected to work on Nuxt 3.7+, but support is currently scoped to Nuxt 4 until a Nuxt 3 build is verified.)

## License

MIT — Sebastian Cochinescu and Anima Felix.
