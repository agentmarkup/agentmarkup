import CodeBlock from '../CodeBlock'

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

        <section>
          <h2>Which AI crawlers exist?</h2>
          <p>
            Major AI companies identify their crawlers with specific user-agent strings. agentmarkup supports the following crawlers out of the box:
          </p>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Company</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>GPTBot</code></td><td>OpenAI</td><td>Training data and browsing for ChatGPT</td></tr>
              <tr><td><code>ClaudeBot</code></td><td>Anthropic</td><td>Training data for Claude</td></tr>
              <tr><td><code>PerplexityBot</code></td><td>Perplexity</td><td>Real-time web search for AI answers</td></tr>
              <tr><td><code>Google-Extended</code></td><td>Google</td><td>Training data for Gemini (separate from Google Search)</td></tr>
              <tr><td><code>CCBot</code></td><td>Common Crawl</td><td>Open web dataset used by many AI models</td></tr>
            </tbody>
          </table>
          <p>
            You can also add custom crawler names for any bot not in the built-in list.
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
            Combined with <a href="/docs/llms-txt/">llms.txt</a> and <a href="/docs/json-ld/">JSON-LD structured data</a>, controlling AI crawler access is one of three pillars of making your website machine-readable.
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
