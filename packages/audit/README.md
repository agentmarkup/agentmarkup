# @agentmarkup/audit

Audit any live URL the way AI crawlers actually see it.

Most SEO tools fetch a page once, as a browser, and grade the HTML. `@agentmarkup/audit` fetches the **same URL as GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, and Google-Extended**, diffs each response against a normal browser, and reports where AI systems get a different — often worse — view than your human visitors. It also checks the machine-readable surface: `robots.txt` intent, Content-Signal, `llms.txt`, JSON-LD, and JavaScript-dependence.

It is deterministic (pass / warn / error, no invented scores) and CI-friendly.

## Usage

```bash
npx @agentmarkup/audit https://example.com
```

```bash
# JSON for CI / league tables
npx @agentmarkup/audit https://example.com --json

# custom per-request timeout
npx @agentmarkup/audit example.com --timeout 15000
```

Bare domains are normalized to `https://`. Exit code is `1` when any **error**-level finding is present (a CI gate), `0` otherwise, `2` on a usage error.

## What it checks

| Area | What it does |
| --- | --- |
| **Crawler access** | Fetches as each AI crawler user-agent and diffs status against a browser control. Flags challenges, differential blocks, rate limits, and origin errors. |
| **JS dependence** | Measures whether the raw (un-executed) HTML actually contains content, or is an empty `#root`/`#app` shell that only fills in after JavaScript runs. |
| **robots.txt** | Reuses `@agentmarkup/core` to detect whether the crawlers you likely want are shadowed by a wildcard `Disallow`, and whether a canonical Content-Signal policy is present. |
| **llms.txt** | Fetches `/llms.txt`, validates it, and checks the homepage links it for discovery. |
| **JSON-LD** | Extracts and structurally validates JSON-LD blocks on the page. |

## An honest note on "blocked" crawlers

This tool spoofs a crawler's **user-agent** from an ordinary IP. That is exactly what a browser extension or a curious developer can do, and it is *not* what the real, verified bot does. So a `403` for a spoofed `GPTBot` user-agent is genuinely ambiguous:

- it can be a **user-agent WAF rule** — which also blocks the real GPTBot (a real problem), **or**
- it can be **IP allowlisting** — where the verified GPTBot, coming from OpenAI's published IP ranges, is let through just fine (no problem at all).

From a spoofed request we cannot tell these apart, so the audit reports them as **warnings with both explanations and the raw evidence**, never as a bare "your site blocks AI" error. Error-level findings are reserved for things that are provable from the response itself: a `robots.txt` that literally disallows the crawler, an empty JavaScript shell, or invalid `llms.txt` / JSON-LD.

## Programmatic use

```ts
import { audit, renderText } from '@agentmarkup/audit';

const report = await audit('https://example.com', {
  fetchedAt: new Date().toISOString(),
});
console.log(report.summary); // { pass, warn, error, checks, passed, worst }
process.stdout.write(renderText(report));
```

The exported analyzers (`analyzeCrawlerAccess`, `analyzeRobots`, `analyzeJsDependence`, `analyzeMachineReadable`) and the SSRF-safe `safeFetch` are available for building custom pipelines.

## Safety

Requests are made with an SSRF-safe fetch: `localhost`, private, loopback, link-local, CGNAT, and IPv6-bypass address forms are refused, redirects are followed manually and re-validated per hop, and responses are size- and time-bounded. The blocklist mirrors the hosted checker at [agentmarkup.dev](https://agentmarkup.dev).

## License

MIT © Sebastian Cochinescu and Anima Felix

Part of [agentmarkup](https://agentmarkup.dev) — build-time tooling to make websites machine-readable for LLMs and AI agents.
