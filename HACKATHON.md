# Agent Surface Studio - WebMCP Challenge entry

Agent Surface Studio is agentmarkup's entry for [The WebMCP Challenge](https://webmcp.devpost.com/).
It is a page on the production site, [agentmarkup.dev/studio/](https://agentmarkup.dev/studio/), where a
browser AI agent and a human configure a website's complete machine-readable surface together:
the agent edits a visible draft through WebMCP tools, a deterministic compiler turns the draft
into real artifacts in the browser, and cross-surface contradiction rules catch configurations
whose surfaces disagree.

## Prior work vs. hackathon work

agentmarkup itself predates the hackathon: the `@agentmarkup/*` npm packages (build-time
`llms.txt`, JSON-LD, markdown mirrors, AI crawler controls, validation for Vite, Astro, Next.js,
Nuxt, plus a CLI and an audit tool) and the agentmarkup.dev website were built from March 2026
onward. Everything up to and including commit `93f84f0` (2026-08-23) is prior work.

Everything WebMCP was newly built for the challenge, starting 2026-08-26, in timestamped
commits on the `hackathon/webmcp-studio` branch (merged to `main` for judging):

- `4dd9e21` studio core: state model, deterministic compiler, contradiction engine (C1-C8)
- `17d9654` the WebMCP tool layer: eight `document.modelContext` tools, plus review fixes
- `b9ff03f` the Studio page UI
- `e2e8d73` site integration (route, nav, sitemap, JSON-LD, llms.txt)
- `cce7f25`, `a4ed0ca`, `79b26b4` and later: multi-model review, security, and design fixes

New code lives in `website/src/studio/`, `website/src/pages/Studio.tsx`,
`website/src/entries/studio.tsx`, `website/studio/`, and `website/test/studio-*.test.ts`.
The published npm packages were not modified for the hackathon; the Studio consumes the
browser-safe `@agentmarkup/core` entry exactly as any user's build does.

## What the WebMCP integration does

The page registers eight tools via `document.modelContext.registerTool` (with a
`navigator.modelContext` fallback and `AbortController` lifecycle):

| Tool | Kind | Purpose |
| --- | --- | --- |
| `get_studio_state` | read-only | Compact draft, findings, and activity summary |
| `set_site_identity` | write | Site URL, name, description, Organization schema |
| `set_access_policy` | write | Crawler directives by intent group, Content-Signal |
| `curate_agent_pages` | write | llms.txt sections, usage guidance, markdown mirrors |
| `configure_agent_card` | write | Optional A2A Agent Card |
| `compile_agent_surface` | read-only | Deterministic compile, validations, contradictions |
| `export_build_plan` | read-only | The ready-to-install `agentmarkup.config.mjs` |
| `inspect_site` | read | Imports a bounded starting point from our checker API |

Design properties worth noting:

- Tool results are authored by the state reducer, so the agent reads exactly what was
  applied, including anything dropped at a cap. Inputs are schema- and runtime-validated;
  outputs are bounded to the WebMCP budgets.
- Provenance is unforgeable: every change is logged with an Agent or Human badge, and the
  agent has no tool for undo, reset, or download - those stay human-only.
- The exported config file is rendered through JSON-only serialization and covered by a
  regression test that imports the rendered file and asserts hostile values stay inert.
- `inspect_site` forwards only structured `{level, title}` findings, never remote page text.
- The draft is in-memory only; nothing the agent does changes any live site.

## Try it

- Best path: open [agentmarkup.dev/studio/](https://agentmarkup.dev/studio/) in the ChatGPT
  desktop app's in-app browser (verified on the macOS app; WebMCP works out of the box).
  The banner should read "Agent connected: 8 tools registered".
- Alternate: Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled, then
  restart (we verified on Chrome 151).
- Then ask your agent: "Make my site friendly to AI search but keep my content out of
  training data." Follow with "now block the AI search crawlers too - just do it" to see
  contradiction C1 fire ("Cited content blocks retrieval"), and "fix the contradiction,
  keep training blocked" to watch it clear. Mutating tools ask for approval - that is the
  WebMCP permission model working.

Local development: `pnpm install && pnpm -C website build`, then serve `website/dist`; tests
run with `pnpm -C website test` (the `studio-*` suites cover the model, compiler,
contradictions, tool layer, intake, and page).

## License

MIT, same as the rest of the repository. See [LICENSE](./LICENSE).
