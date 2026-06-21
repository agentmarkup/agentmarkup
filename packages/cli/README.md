# @agentmarkup/cli

Run [agentmarkup](https://agentmarkup.dev) on **any** built static site — no framework adapter required. Point it at a directory of emitted HTML and it generates `llms.txt`, markdown mirrors, JSON-LD, AI-crawler `robots.txt`, and `_headers`, then validates the result. Works for Eleventy, Gatsby, Hugo, Jekyll, Docusaurus, plain static HTML, and CI pipelines.

## Install

```bash
npm install -D @agentmarkup/cli
```

## Usage

```bash
# Inject + write machine-readable assets into a build output directory
agentmarkup generate ./dist

# Validate what is already on disk (CI gate) — exits non-zero on errors
agentmarkup check ./dist

# Preview without writing anything
agentmarkup generate ./dist --dry-run
```

Add a config file in your project root:

```js
// agentmarkup.config.mjs
export default {
  site: 'https://example.com',
  name: 'Example',
  outDir: 'dist', // optional CLI-only default; or pass the dir as an argument
  llmsTxt: {
    sections: [
      { title: 'Docs', entries: [{ title: 'Home', url: 'https://example.com/' }] },
    ],
  },
  markdownPages: { enabled: true },
  aiCrawlers: { GPTBot: 'disallow' },
};
```

## Commands

| Command | What it does | Exit code |
|---|---|---|
| `generate [outDir]` | Injects discovery links + JSON-LD into HTML and writes `llms.txt`, `llms-full.txt`, markdown mirrors, `robots.txt`, `_headers`. | `0` |
| `generate [outDir] --dry-run` | Runs the full pass in memory and reports planned writes; mutates nothing. | `0` |
| `check [outDir]` | Validates the files exactly as they are on disk and **warns when a configured artifact (`llms.txt`, `llms-full.txt`, markdown mirrors, `robots.txt` rules, Agent Card) is missing from the output**. Never writes. Use as a CI gate. | `1` on any error finding (`--strict` also fails on warnings), else `0` |

### Options

- `--config <path>` — path to an agentmarkup config (`.mjs` / `.js` / `.cjs`). Defaults to `agentmarkup.config.*` in the working directory.
- `--dry-run` — (generate) report planned writes without mutating files.
- `--strict` — (check) treat warnings as failures.
- `-h, --help`, `-v, --version`.

### Output directory resolution

Explicit argument → config `outDir` → common build defaults (`dist`, `build`, `out`, `_site`). `public/` is **never** auto-guessed because it is a source asset directory in many frameworks; pass it explicitly if you really mean it.

## Coexistence

Existing curated `llms.txt`, existing `robots.txt` rules, and existing page JSON-LD are preserved by default; the CLI only fills gaps. Opt into replacement per feature via the config (`llmsTxt.replaceExisting`, `markdownPages.replaceExisting`, `jsonLd.replaceExistingTypes`, etc.).

## Programmatic API

```ts
import { processStaticOutput, loadConfig, resolveOutDir } from '@agentmarkup/cli';
```

All `@agentmarkup/core` helpers are re-exported as well.

## License

MIT — Sebastian Cochinescu and Anima Felix.
