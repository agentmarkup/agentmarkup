import CodeBlock from '../CodeBlock'
import { ResponsiveTable } from '../ui/ResponsiveTable'
import { PlainLanguageSummary } from '../ui/PlainLanguageSummary'

const configExample = `agentmarkup({
  site: 'https://example.com',
  name: 'My Website',
  aiCrawlers: {
    GPTBot: 'allow',
    ClaudeBot: 'allow',
    PerplexityBot: 'allow',
    'Google-Extended': 'allow',
    CCBot: 'disallow',
  },
})`

const outputExample = `User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml

# BEGIN agentmarkup AI crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Disallow: /

# END agentmarkup AI crawlers`

function AiCrawlers() {
  return (
    <main>
      <article className="doc-page">
        <h1>How to manage AI crawlers in your robots.txt</h1>
        <p className="doc-intro">
          AI companies use web crawlers to collect training data and power AI-generated answers. Your robots.txt file controls which AI bots can access your site. agentmarkup generates or patches your robots.txt with AI-specific directives at build time.
        </p>

        <PlainLanguageSummary level="Intermediate" audience="Website owners and people who manage hosting" readingTime="About 9 minutes" action={{ href: '/security-scan/', label: 'Check your website access rules' }}>
          <p>AI services use automated visitors called crawlers. Your robots.txt file can tell those visitors which public areas they may use, but it does not replace login controls or real security.</p>
        </PlainLanguageSummary>

        <section>
          <h2>Which AI crawlers exist?</h2>
          <p>
            Major AI companies identify their crawlers with specific user-agent strings, grouped here by intent. Because robots.txt rules are per user-agent, you can block training crawlers while keeping search and retrieval crawlers allowed, so your site stays eligible for citation in AI answers. agentmarkup recognizes the following crawlers out of the box:
          </p>
          <ResponsiveTable label="AI crawler directory">
            <thead>
              <tr><th>Crawler</th><th>Company</th><th>Intent</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row"><code>GPTBot</code></th><td>OpenAI</td><td>Model training</td></tr>
              <tr><th scope="row"><code>ClaudeBot</code></th><td>Anthropic</td><td>Model training</td></tr>
              <tr><th scope="row"><code>Google-Extended</code></th><td>Google</td><td>Model training (separate from Google Search)</td></tr>
              <tr><th scope="row"><code>CCBot</code></th><td>Common Crawl</td><td>Model training (open web dataset)</td></tr>
              <tr><th scope="row"><code>Applebot-Extended</code></th><td>Apple</td><td>Model training</td></tr>
              <tr><th scope="row"><code>Amazonbot</code></th><td>Amazon</td><td>Model training and search</td></tr>
              <tr><th scope="row"><code>OAI-SearchBot</code></th><td>OpenAI</td><td>AI search / retrieval</td></tr>
              <tr><th scope="row"><code>PerplexityBot</code></th><td>Perplexity</td><td>AI search / retrieval</td></tr>
              <tr><th scope="row"><code>Claude-SearchBot</code></th><td>Anthropic</td><td>AI search / retrieval</td></tr>
              <tr><th scope="row"><code>DuckAssistBot</code></th><td>DuckDuckGo</td><td>AI search / retrieval</td></tr>
              <tr><th scope="row"><code>ChatGPT-User</code></th><td>OpenAI</td><td>User-triggered fetch</td></tr>
              <tr><th scope="row"><code>Claude-User</code></th><td>Anthropic</td><td>User-triggered fetch</td></tr>
              <tr><th scope="row"><code>Perplexity-User</code></th><td>Perplexity</td><td>User-triggered fetch</td></tr>
            </tbody>
          </ResponsiveTable>
          <p>
            You can also add custom crawler names for any bot not in the built-in list. Note that some crawlers, such as Bytespider and xAI/Grok agents, comply poorly with robots.txt, so directives are not a guarantee.
          </p>
        </section>

        <section>
          <h2>Configuration</h2>
          <p>
            Set each crawler to <code>'allow'</code> or <code>'disallow'</code>. Only configure the crawlers you care about. Missing crawlers are not added to your robots.txt.
          </p>
          <CodeBlock code={configExample} />
        </section>

        <section>
          <h2>How it works</h2>
          <p>
            agentmarkup uses marker comments to manage its section of your robots.txt. If you already have a robots.txt, the plugin patches it without touching your existing rules. If you do not have one, it creates a new file.
          </p>
          <CodeBlock code={outputExample} />
          <p>
            The markers (<code># BEGIN agentmarkup AI crawlers</code> / <code># END agentmarkup AI crawlers</code>) allow the plugin to update its rules on every build without duplicating entries or breaking your custom rules.
          </p>
        </section>

        <section>
          <h2>Conflict detection</h2>
          <p>
            If your existing robots.txt has a <code>User-agent: *</code> with <code>Disallow: /</code>, and you configure a crawler to be allowed, agentmarkup warns you about the conflict during build. A broad disallow rule overrides specific allow rules for most crawlers.
          </p>
          <p>
            This validation catches a common mistake: you intend to allow GPTBot but your existing robots.txt blocks all bots. Without this check, your allow directive would have no effect.
          </p>
        </section>

        <section>
          <h2>Should you allow or block AI crawlers?</h2>
          <p>
            This is a business decision, not a technical one. Consider:
          </p>
          <ul>
            <li><strong>Allow</strong> if you want your content to appear in AI-generated answers, search summaries, and chatbot responses</li>
            <li><strong>Disallow</strong> if you do not want your content used for AI model training or AI-powered search results</li>
            <li><strong>Selective access:</strong> Allow some crawlers (like PerplexityBot for search) while blocking others (like CCBot for training data)</li>
          </ul>
          <p>
            Combined with <a href="/docs/llms-txt/">llms.txt</a>,{' '}
            <a href="/docs/json-ld/">JSON-LD structured data</a>, and{' '}
            <a href="/blog/markdown-mirrors/">markdown mirrors</a>, crawler
            access is one part of a machine-readable website instead of a
            standalone fix.
          </p>
        </section>
        <section className="faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Does blocking an AI crawler actually work?</summary>
            <p>Most major AI companies (OpenAI, Anthropic, Google) have committed to respecting robots.txt directives for their crawlers. Compliance is voluntary but widely honored. Smaller or unknown crawlers may not comply.</p>
          </details>
          <details>
            <summary>What is the difference between GPTBot and ChatGPT-User?</summary>
            <p>GPTBot crawls pages for training data. ChatGPT-User is used when a ChatGPT user asks the model to browse a specific URL. They are separate user agents with separate purposes. agentmarkup supports both.</p>
          </details>
          <details>
            <summary>Can I add custom crawler names?</summary>
            <p>Yes. The <code>aiCrawlers</code> config accepts any string as a key, not just the built-in names. This lets you add rules for new or niche crawlers as they appear.</p>
          </details>
        </section>
      </article>
    </main>
  )
}

export default AiCrawlers
