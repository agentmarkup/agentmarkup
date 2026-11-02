# @agentmarkup/audit

Audit any live URL the way AI crawlers actually see it.

Most SEO tools fetch a page once, as a browser, and grade the HTML. `@agentmarkup/audit` fetches the **same URL as GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, and Google-Extended**, diffs each response against a normal browser, and reports where AI systems get a different - often worse - view than your human visitors. It also checks the machine-readable surface: `robots.txt` intent, Content-Signal, `llms.txt`, JSON-LD, and JavaScript-dependence.

It is deterministic (pass / warn / error) and CI-friendly. With `--score` it also prints the agentmarkup agent-readiness score: a deterministic 0-100 number from a published formula (catalog v1.0.0), where every point is traceable to a check you can see; no LLM, no heuristics, no off-site search.

## Usage

```bash
npx @agentmarkup/audit https://example.com
```

```bash
# JSON for CI / league tables
npx @agentmarkup/audit https://example.com --json

# custom per-request timeout
npx @agentmarkup/audit example.com --timeout 15000

# add the 0-100 agent-readiness score (published formula)
npx @agentmarkup/audit example.com --score
```

Bare domains are normalized to `https://`. Exit code is `1` when any **error**-level finding is present (a CI gate), `0` otherwise, `2` on a usage error.

## What it checks

| Area | What it does |
| --- | --- |
| **Crawler access** | Fetches as each AI crawler user-agent and diffs against a browser control. Flags challenges, differential blocks, rate limits, origin errors, and when an *accessible* crawler gets materially less content than a browser (JS-gated or cloaked pages). |
| **JS dependence** | Measures whether the raw (un-executed) HTML actually contains content, or is an empty `#root`/`#app` shell that only fills in after JavaScript runs. |
| **robots.txt** | Reuses `@agentmarkup/core` to detect whether the crawlers you likely want are shadowed by a wildcard `Disallow`, and whether a canonical Content-Signal policy is present. |
| **llms.txt** | Fetches `/llms.txt` (guarding against HTML soft-404s), validates it, and checks the homepage links it for discovery. |
| **JSON-LD** | Extracts JSON-LD and flags only unparseable or type-less blocks; parseable structured data (including `@graph`) passes. |
| **Markdown mirror** | Detects a fetchable markdown mirror or a `text/markdown` alternate link - the clean, low-noise version agents prefer. |
| **Sitemap** | Checks for `/sitemap.xml`, a `Sitemap:` directive in robots.txt, or common non-standard sitemap paths. |
| **Page metadata** | Checks for a title, meta description, and canonical link. |

## The agent-readiness score (`--score`)

`--score` runs a second, checker-shaped pass over the site (the same eight fetches the hosted checker at [agentmarkup.dev](https://agentmarkup.dev) makes: homepage, one sample page, their markdown mirrors, `llms.txt`, `robots.txt`, the sitemap and a not-found probe) and scores the recorded evidence with `@agentmarkup/core/score`. The report is the same one the website computes, from the same code:

- required checks share an 80-point pool at even weight, recommended checks share 20, bonus signals add 0.25 each up to +5 and never subtract;
- a check that does not apply to the site leaves the denominator; a check whose evidence could not be fetched in time is `unverified`, leaves the denominator, marks the reading provisional and is shown with a pessimistic/optimistic range instead of lowering the score;
- grades: A+ 95-100, A 86-94, B 70-85, C 48-69, D 28-47, F 0-27.

The score is computed from the checker-shaped pass only. The crawler user-agent probes above stay informational findings: a `403` for a spoofed user-agent is ambiguous (see below) and must never move a score. Methodology, the full check catalog and every divergence from other tools: [agentmarkup.dev/score/](https://agentmarkup.dev/score/).

The text report adds a score block (score, grade, tier totals, provisional range when applicable, top fixes with their estimated gain, catalog and formula versions); `--json` adds a `score` object (`ScoreReport`). The exit code is unchanged: it still reflects error-level findings only.

Politeness: the score pass keeps at most 4 requests in flight, waits at least 1 s between request starts to one hostname, stops after 25 s per site and 30 requests, and identifies itself as `agentmarkup-checker/<version> (+https://agentmarkup.dev; batch)`.

## An honest note on "blocked" crawlers

This tool spoofs a crawler's **user-agent** from an ordinary IP. That is exactly what a browser extension or a curious developer can do, and it is *not* what the real, verified bot does. So a `403` for a spoofed `GPTBot` user-agent is genuinely ambiguous:

- it can be a **user-agent WAF rule** - which also blocks the real GPTBot (a real problem), **or**
- it can be **IP allowlisting** - where the verified GPTBot, coming from OpenAI's published IP ranges, is let through just fine (no problem at all).

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

For the score, `collectSiteEvidence(url, options)` records the checker-shaped `SiteEvidence` (bodies included) that `evaluateSiteChecks` and `scoreChecks` from `@agentmarkup/core/score` consume; `refetchUnverified` retries the resources that did not complete, and `stripEvidenceBodies` removes bodies before the evidence is written to disk:

```ts
import { collectSiteEvidence, refetchUnverified } from '@agentmarkup/audit';
import { evaluateSiteChecks, scoreChecks } from '@agentmarkup/core/score';

let evidence = await collectSiteEvidence('https://example.com');
if (evidence.fetchSummary.analysisStatus !== 'complete') {
  evidence = await refetchUnverified(evidence); // two retries, 20 s apart
}
const report = scoreChecks(evaluateSiteChecks(evidence));
console.log(report.score, report.grade, report.analysisStatus);
```

## Safety

Requests are made with an SSRF-safe fetch: `localhost`, private, loopback, link-local, CGNAT, and IPv6-bypass address forms are refused, ports other than 80 and 443 are refused, redirects are followed manually and re-validated per hop, and responses are size- and time-bounded. The blocklist mirrors the hosted checker at [agentmarkup.dev](https://agentmarkup.dev).

## License

MIT © Sebastian Cochinescu and Anima Felix

Part of [agentmarkup](https://agentmarkup.dev) - build-time tooling to make websites machine-readable for LLMs and AI agents.
