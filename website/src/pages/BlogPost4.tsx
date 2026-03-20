import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function AiCrawlers2026() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="8 min read" />
        <h1>Every AI crawler indexing your website in 2026</h1>
        <p className="doc-intro">
          AI companies use web crawlers to collect training data and power real-time AI search. Here is a complete list of every known AI crawler, what company runs it, what it does, and how to control access through your robots.txt.
        </p>

        <section>
          <h2>What are AI crawlers?</h2>
          <p>
            AI crawlers are automated bots that visit websites to collect content. Some crawlers gather training data for language models. Others power real-time search features where AI generates answers from live web content. They identify themselves through user-agent strings in their HTTP requests.
          </p>
          <p>
            Unlike traditional search engine crawlers (Googlebot, Bingbot) that build search indexes, AI crawlers serve a different purpose: feeding content into AI models. This distinction matters because you might want Google to index your site for search results while blocking your content from being used as AI training data.
          </p>
        </section>

        <section>
          <h2>The complete list</h2>

          <h3>OpenAI</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>GPTBot</code></td><td>Collects training data for GPT models. Also powers ChatGPT's browsing feature when searching the web.</td></tr>
              <tr><td><code>ChatGPT-User</code></td><td>Used when a ChatGPT user explicitly asks the model to visit and read a specific URL. This is browsing on demand, not bulk crawling.</td></tr>
              <tr><td><code>OAI-SearchBot</code></td><td>Powers ChatGPT Search (formerly SearchGPT). Crawls pages to generate real-time search answers.</td></tr>
            </tbody>
          </table>

          <h3>Anthropic</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>ClaudeBot</code></td><td>Collects training data for Claude models. Anthropic has committed to respecting robots.txt directives.</td></tr>
              <tr><td><code>anthropic-ai</code></td><td>Older user-agent string used by Anthropic. Some sites still reference it in robots.txt.</td></tr>
            </tbody>
          </table>

          <h3>Google</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>Google-Extended</code></td><td>Collects data for Gemini and other AI products. Separate from Googlebot, so blocking it does not affect your Google Search rankings.</td></tr>
            </tbody>
          </table>

          <h3>Perplexity</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>PerplexityBot</code></td><td>Powers Perplexity's AI search engine. Crawls pages to generate real-time answers with source citations.</td></tr>
            </tbody>
          </table>

          <h3>Amazon</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>Amazonbot</code></td><td>Collects data for Alexa and Amazon's AI services. Respects robots.txt.</td></tr>
            </tbody>
          </table>

          <h3>Common Crawl</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>CCBot</code></td><td>Builds the Common Crawl open dataset, which is used as training data by many AI companies including those building open-source models. Blocking CCBot is a broad way to reduce training data exposure.</td></tr>
            </tbody>
          </table>

          <h3>Apple</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>Applebot-Extended</code></td><td>Collects data for Apple Intelligence features. Separate from the main Applebot used for Siri and Spotlight search.</td></tr>
            </tbody>
          </table>

          <h3>Meta</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>Meta-ExternalAgent</code></td><td>Collects data for Meta AI products. Respects robots.txt since mid-2024.</td></tr>
              <tr><td><code>FacebookBot</code></td><td>Primarily renders link previews for Facebook and Instagram. Not used for AI training.</td></tr>
            </tbody>
          </table>

          <h3>Other notable crawlers</h3>
          <table className="doc-table">
            <thead>
              <tr><th>Crawler</th><th>Company</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td><code>Bytespider</code></td><td>ByteDance</td><td>Training data for TikTok and ByteDance AI products</td></tr>
              <tr><td><code>cohere-ai</code></td><td>Cohere</td><td>Training data for Cohere's enterprise AI models</td></tr>
              <tr><td><code>Diffbot</code></td><td>Diffbot</td><td>Web data extraction for knowledge graphs</td></tr>
              <tr><td><code>Timpibot</code></td><td>Timpi</td><td>Decentralized search index</td></tr>
              <tr><td><code>YouBot</code></td><td>You.com</td><td>AI search engine</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>How to control AI crawler access</h2>
          <p>
            Your <code>robots.txt</code> file is the standard mechanism. Add <code>User-agent</code> directives for each crawler you want to allow or block:
          </p>
          <ul>
            <li><strong>Allow all AI crawlers:</strong> Do nothing. The default is open access.</li>
            <li><strong>Block specific crawlers:</strong> Add <code>User-agent: GPTBot</code> with <code>Disallow: /</code></li>
            <li><strong>Allow specific crawlers:</strong> If you have a blanket <code>Disallow</code>, add specific <code>Allow</code> rules for bots you want</li>
          </ul>
          <p>
            Tools like <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a> automate this at build time, patching your robots.txt without breaking existing rules and validating for conflicts. See the <a href="/docs/ai-crawlers/">AI crawlers guide</a> for configuration.
          </p>
        </section>

        <section>
          <h2>Do AI crawlers respect robots.txt?</h2>
          <p>
            Compliance is voluntary, not enforced. That said, the major companies have publicly committed to respecting robots.txt:
          </p>
          <ul>
            <li><strong>OpenAI:</strong> Committed to respecting robots.txt for GPTBot since 2023. Published documentation with opt-out instructions.</li>
            <li><strong>Anthropic:</strong> ClaudeBot respects robots.txt. Anthropic published a dedicated page for webmasters.</li>
            <li><strong>Google:</strong> Google-Extended is fully controlled through robots.txt, separate from Googlebot.</li>
            <li><strong>Perplexity:</strong> PerplexityBot respects robots.txt. Perplexity has faced criticism in the past but has since improved compliance.</li>
          </ul>
          <p>
            Smaller or less-known crawlers may not comply. There is no technical enforcement mechanism for robots.txt. It is a social contract.
          </p>
        </section>

        <section>
          <h2>Training data vs real-time search</h2>
          <p>
            An important distinction: some crawlers collect data for model training (a one-time or periodic process), while others power real-time AI search (your content appears in live answers).
          </p>
          <ul>
            <li><strong>Training crawlers:</strong> GPTBot, ClaudeBot, Google-Extended, CCBot, Meta-ExternalAgent. Your content becomes part of the model's knowledge.</li>
            <li><strong>Search crawlers:</strong> PerplexityBot, OAI-SearchBot, ChatGPT-User. Your content is fetched and cited in real-time answers.</li>
          </ul>
          <p>
            You might want to block training crawlers (you do not want your content used to train models) while allowing search crawlers (you do want your content cited in AI answers). This selective approach is possible because each crawler uses a different user-agent string.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            AI crawlers are a permanent part of the web. The question is not whether they visit your site but whether you control the terms. A clear robots.txt policy, configured intentionally rather than by accident, is the minimum. Combined with <a href="/docs/llms-txt/">llms.txt</a> and <a href="/docs/json-ld/">JSON-LD structured data</a>, you can make your site both accessible and understandable to AI systems on your terms.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="ai-crawlers-2026" />
    </main>
  )
}

export default AiCrawlers2026
