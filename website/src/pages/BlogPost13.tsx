import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

const usageExample = `# Audit any live URL as the major AI crawlers
npx @agentmarkup/audit https://example.com

# JSON for CI or comparisons
npx @agentmarkup/audit https://example.com --json`

const reportExample = `✓ OpenAI gptbot can reach the page
✓ Anthropic claudebot can reach the page
✓ Content is present without JavaScript
⚠ llms.txt is missing
✓ robots.txt does not block the expected AI crawlers
✓ JSON-LD structured data present

9/10 checks passed`

function AuditGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-07-02" readingTime="6 min read" />
        <h1>See your website the way AI crawlers do</h1>
        <p className="doc-intro">
          Most tools that grade a website fetch it once, as a browser, and score
          the HTML. But the systems that increasingly decide whether your brand
          shows up in an answer, ChatGPT, Claude, Perplexity, Google's AI
          surfaces, do not arrive as your browser. They arrive as GPTBot,
          ClaudeBot, PerplexityBot, OAI-SearchBot, and Google-Extended, and they
          can get a very different response.{' '}
          <code>@agentmarkup/audit</code> shows you that response.
        </p>

        <section>
          <h2>The blind spot</h2>
          <p>
            A page can look perfect in your browser and still be a poor citation
            target for AI. The homepage might be an empty JavaScript shell that
            only fills in after a framework hydrates, so a crawler that does not
            run JavaScript sees nothing. A CDN or WAF rule might treat a crawler
            user-agent differently than a browser. There might be no{' '}
            <code>llms.txt</code>, or a malformed one. The JSON-LD that powers
            rich results and AI summaries might be missing or broken. None of
            that is visible from a single browser fetch.
          </p>
        </section>

        <section>
          <h2>What the audit does</h2>
          <p>
            It fetches your URL once as a normal browser to establish a baseline,
            then again as each major AI crawler, and diffs the responses. On top
            of that it checks the machine-readable surface: <code>robots.txt</code>{' '}
            intent, Content-Signal, <code>llms.txt</code>, JSON-LD, and whether
            the raw HTML is actually readable without JavaScript.
          </p>
          <CodeBlock code={usageExample} />
          <p>A run reads like this:</p>
          <CodeBlock code={reportExample} />
        </section>

        <section>
          <h2>Honest by design</h2>
          <p>
            Here is the part that makes the audit trustworthy rather than
            alarmist. It spoofs a crawler's <strong>user-agent</strong> from an
            ordinary IP, which is not what the real, verified bot does. So a{' '}
            <code>403</code> for a spoofed <code>GPTBot</code> user-agent is
            genuinely ambiguous: it could be a user-agent WAF rule that also
            blocks the real GPTBot, or it could be IP allowlisting where the
            verified GPTBot is let through just fine. The audit cannot tell those
            apart from a spoofed request, so it reports them as{' '}
            <strong>warnings with both explanations and the raw evidence</strong>,
            never as a bare "your site blocks AI" error.
          </p>
          <p>
            Error-level findings, the ones that fail CI, are reserved for things
            provable from the response itself: a <code>robots.txt</code> that
            literally disallows the crawler, an empty JavaScript shell, or invalid{' '}
            <code>llms.txt</code> / JSON-LD. That is why the exit code is safe to
            gate a build on.
          </p>
        </section>

        <section>
          <h2>Where it fits</h2>
          <p>
            The agentmarkup adapters and the{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/cli" target="_blank" rel="noopener noreferrer">CLI</a>{' '}
            <em>generate</em> machine-readable output at build time.{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/audit" target="_blank" rel="noopener noreferrer">@agentmarkup/audit</a>{' '}
            <em>verifies</em> what a deployed site actually serves to AI crawlers.
            It is the command-line sibling of the hosted{' '}
            <a href="/checker/">website checker</a>: the checker is the quick
            browser lookup, the audit is the scriptable, CI-friendly version.
          </p>
          <p>
            Read the <a href="/docs/audit/">audit guide</a> for the full check
            list, then use the <a href="/docs/llms-txt/">llms.txt</a>,{' '}
            <a href="/docs/json-ld/">JSON-LD</a>, and{' '}
            <a href="/docs/ai-crawlers/">AI crawlers</a> guides to fix whatever it
            surfaces.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="audit-ai-crawler-access" />
    </main>
  )
}

export default AuditGuide
