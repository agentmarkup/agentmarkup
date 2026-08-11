import CodeBlock from '../CodeBlock'
import { ResponsiveTable } from '../ui/ResponsiveTable'
import { PlainLanguageSummary } from '../ui/PlainLanguageSummary'

const usageExample = `# Audit any live URL
npx @agentmarkup/audit https://example.com

# JSON output for CI or league tables
npx @agentmarkup/audit https://example.com --json

# Bare domains are normalized to https://
npx @agentmarkup/audit example.com --timeout 15000`

const ciExample = `# .github/workflows/ci.yml (excerpt)
- run: npx @agentmarkup/audit https://example.com`

const programmaticExample = `import { audit, renderText } from '@agentmarkup/audit'

const report = await audit('https://example.com', {
  fetchedAt: new Date().toISOString(),
})

console.log(report.summary) // { pass, warn, error, checks, passed, worst }
process.stdout.write(renderText(report))`

function Audit() {
  return (
    <main>
      <article className="doc-page">
        <h1>Audit your site the way AI crawlers see it</h1>
        <p className="doc-intro">
          Most SEO tools fetch a page once, as a browser, and grade the HTML.{' '}
          <code>@agentmarkup/audit</code> fetches the <strong>same URL as
          GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, and
          Google-Extended</strong>, diffs each response against a normal
          browser, and reports where AI systems get a different, often worse,
          view than your human visitors. It is the command-line companion to the{' '}
          <a href="/checker/">website checker</a>, built for local runs and CI.
        </p>

        <PlainLanguageSummary level="Advanced" audience="People who build and maintain websites" readingTime="About 12 minutes" action={{ href: '/blog/website-checker/', label: 'Start with a plain-language overview' }}>
          <p>This command checks whether several AI crawlers receive the same useful public page that a normal browser receives. It is most useful when a developer wants a repeatable check during a build or before publishing.</p>
        </PlainLanguageSummary>

        <section>
          <h2>Usage</h2>
          <CodeBlock code={usageExample} />
          <p>
            It is deterministic (pass / warn / error, no invented scores). The
            exit code is <code>1</code> when any error-level finding is present
            (a CI gate), <code>0</code> otherwise, and <code>2</code> on a usage
            error.
          </p>
        </section>

        <section>
          <h2>What it checks</h2>
          <ResponsiveTable label="Audit checks">
            <thead>
              <tr><th>Area</th><th>What it does</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row"><strong>Crawler access</strong></th>
                <td>Fetches as each AI crawler user-agent and diffs against a browser control. Flags challenges, differential blocks, rate limits, origin errors, and when an accessible crawler gets materially less content than a browser (JS-gated or cloaked pages).</td>
              </tr>
              <tr>
                <th scope="row"><strong>JS dependence</strong></th>
                <td>Measures whether the raw, un-executed HTML actually contains content, or is an empty shell that only fills in after JavaScript runs.</td>
              </tr>
              <tr>
                <th scope="row"><strong>robots.txt</strong></th>
                <td>Detects whether the crawlers you likely want are shadowed by a wildcard <code>Disallow</code>, and whether a canonical Content-Signal policy is present.</td>
              </tr>
              <tr>
                <th scope="row"><strong>llms.txt</strong></th>
                <td>Fetches <code>/llms.txt</code> (guarding against HTML soft-404s), validates it, and checks whether the homepage links it for discovery.</td>
              </tr>
              <tr>
                <th scope="row"><strong>JSON-LD</strong></th>
                <td>Extracts the JSON-LD blocks and flags only unparseable or type-less ones; parseable structured data, including <code>@graph</code>, passes.</td>
              </tr>
              <tr>
                <th scope="row"><strong>Markdown mirror</strong></th>
                <td>Detects a fetchable markdown mirror or a <code>text/markdown</code> alternate link, the clean low-noise version agents prefer.</td>
              </tr>
              <tr>
                <th scope="row"><strong>Sitemap</strong></th>
                <td>Checks for <code>/sitemap.xml</code>, a <code>Sitemap:</code> directive in robots.txt, or common non-standard sitemap paths.</td>
              </tr>
              <tr>
                <th scope="row"><strong>Page metadata</strong></th>
                <td>Checks for a title, meta description, and canonical link that AI systems use to attribute the page.</td>
              </tr>
            </tbody>
          </ResponsiveTable>
        </section>

        <section>
          <h2>An honest note on "blocked" crawlers</h2>
          <p>
            The audit spoofs a crawler's <strong>user-agent</strong> from an
            ordinary IP. That is exactly what a browser extension or a curious
            developer can do, and it is <em>not</em> what the real, verified bot
            does. So a <code>403</code> for a spoofed <code>GPTBot</code>{' '}
            user-agent is genuinely ambiguous:
          </p>
          <ul>
            <li>it can be a <strong>user-agent WAF rule</strong>, which also blocks the real GPTBot (a real problem), <strong>or</strong></li>
            <li>it can be <strong>IP allowlisting</strong>, where the verified GPTBot, coming from OpenAI's published IP ranges, is let through just fine (no problem at all).</li>
          </ul>
          <p>
            From a spoofed request the tool cannot tell these apart, so it
            reports them as <strong>warnings with both explanations and the raw
            evidence</strong>, never as a bare "your site blocks AI" error.
            Error-level findings are reserved for things provable from the
            response itself: a <code>robots.txt</code> that literally disallows
            the crawler, an empty JavaScript shell, or invalid{' '}
            <code>llms.txt</code> / JSON-LD.
          </p>
        </section>

        <section>
          <h2>Use it as a CI gate</h2>
          <p>
            Because the exit code is non-zero only on provable errors, the audit
            is safe to run in CI without false failures from the ambiguous
            cases:
          </p>
          <CodeBlock code={ciExample} />
        </section>

        <section>
          <h2>Programmatic use</h2>
          <p>The same audit is available as a library:</p>
          <CodeBlock code={programmaticExample} />
          <p>
            The exported analyzers (<code>analyzeCrawlerAccess</code>,{' '}
            <code>analyzeRobots</code>, <code>analyzeJsDependence</code>,{' '}
            <code>analyzeMachineReadable</code>) and the SSRF-safe{' '}
            <code>safeFetch</code> are available for building custom pipelines.
          </p>
        </section>

        <section>
          <h2>How it relates to the rest of agentmarkup</h2>
          <p>
            The build-time adapters and the <a href="https://www.npmjs.com/package/@agentmarkup/cli" target="_blank" rel="noopener noreferrer">CLI</a>{' '}
            <em>generate</em> machine-readable output;{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/audit" target="_blank" rel="noopener noreferrer">@agentmarkup/audit</a>{' '}
            <em>verifies</em> what a live site actually serves to AI crawlers. It
            pairs naturally with the{' '}
            <a href="/docs/llms-txt/">llms.txt</a>,{' '}
            <a href="/docs/json-ld/">JSON-LD</a>, and{' '}
            <a href="/docs/ai-crawlers/">AI crawler</a> guides: use those to fix
            what the audit finds.
          </p>
        </section>

        <section className="faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Does a 403 for GPTBot mean my site blocks AI?</summary>
            <p>Not necessarily. The audit spoofs the user-agent from a generic IP, so a 403 can be a user-agent WAF rule (which does block the real bot) or IP allowlisting (where the verified bot, from the vendor's published IP ranges, is fine). The audit reports this as a warning with both explanations, not as a definitive block.</p>
          </details>
          <details>
            <summary>Is it safe to point at any URL?</summary>
            <p>Requests use an SSRF-safe fetch: localhost, private, loopback, link-local, CGNAT, and IPv6-bypass address forms are refused, redirects are followed manually and re-validated per hop, and responses are size- and time-bounded. The blocklist mirrors the hosted checker.</p>
          </details>
          <details>
            <summary>How is this different from the website checker?</summary>
            <p>They run the same idea. The <a href="/checker/">checker</a> is the hosted, browser-based version for a quick lookup; <code>@agentmarkup/audit</code> is the command-line version for local runs, scripting, and CI, with a non-zero exit code on provable errors.</p>
          </details>
        </section>
      </article>
    </main>
  )
}

export default Audit
