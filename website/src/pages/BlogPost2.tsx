import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function WhatIsGeo() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="7 min read" />
        <h1>What is GEO? Generative Engine Optimization explained for developers</h1>
        <p className="doc-intro">
          GEO, or Generative Engine Optimization, is the practice of making your website more likely to be cited, summarized, or recommended by AI systems. It is the AI-era counterpart to SEO, and it matters whether or not you believe the hype.
        </p>

        <section>
          <h2>SEO vs GEO: what changed</h2>
          <p>
            SEO optimizes for search engine result pages. You write titles, meta descriptions, and structured data so Google shows your page in a list of blue links. The user clicks, visits your site, and reads your content.
          </p>
          <p>
            GEO optimizes for AI-generated answers. When someone asks ChatGPT, Claude, or Perplexity a question, the AI synthesizes an answer from web content. Your goal is not to rank in a list but to be cited in the answer. The user may never visit your site directly, but your content, brand, and expertise still shape the response.
          </p>
          <p>
            This is not a replacement for SEO. It is an additional channel. Both matter.
          </p>
        </section>

        <section>
          <h2>What GEO actually involves</h2>
          <p>
            Strip away the marketing buzzwords and GEO comes down to a few
            practical things:
          </p>
          <ol>
            <li>
              <strong>Structured data that machines can parse.</strong> JSON-LD tells AI systems exactly what your page is about. A product page with price, availability, and reviews in JSON-LD is far more useful to an AI than the same information buried in HTML divs.
            </li>
            <li>
              <strong>Machine-readable site descriptions.</strong> llms.txt gives AI systems a clean overview of your site. Instead of crawling every page, an LLM can read your llms.txt and understand your site structure in seconds.
            </li>
            <li>
              <strong>Explicit crawler permissions.</strong> Your robots.txt determines which AI bots can access your content. If you block GPTBot, your content will not appear in ChatGPT answers. If you allow it, it might.
            </li>
            <li>
              <strong>Clean fetchable content.</strong> If your raw HTML is a
              thin client shell, many fetch-based agents still see almost
              nothing. Prerendered HTML or markdown mirrors give them a readable
              body instead of an empty app shell.
            </li>
          </ol>
        </section>

        <section>
          <h2>The honest truth about GEO</h2>
          <p>
            There is a lot of noise in the GEO space. Consultants promise "AI visibility scores" and "generative rankings." Most of these are made up. There is no public ranking algorithm for AI answers the way there is for Google Search.
          </p>
          <p>
            What is real:
          </p>
          <ul>
            <li>JSON-LD structured data is proven to power Google rich results and is used by AI systems to understand page content</li>
            <li>robots.txt directives for AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are respected by major AI companies</li>
            <li>llms.txt is early but low-cost to adopt</li>
            <li>Well-structured, clearly written content gets cited more than poorly structured content</li>
          </ul>
          <p>
            What is not real:
          </p>
          <ul>
            <li>"GEO scores" with specific numbers</li>
            <li>Guaranteed placement in AI answers</li>
            <li>Any tool that promises to "rank" you in ChatGPT</li>
            <li>The idea that GEO replaces SEO</li>
          </ul>
        </section>

        <section>
          <h2>Why developers should care</h2>
          <p>
            If you build websites, the people who use those websites are increasingly finding information through AI. A potential customer asking Claude "what is the best project management tool for small teams" might get an answer that includes or excludes your product based entirely on whether your site has clear, machine-readable content.
          </p>
          <p>
            The good news: most of what GEO requires is just good web
            development practice. Structured data, clean content, readable raw
            output, and intentional robots.txt rules. These are things you
            should be doing anyway.
          </p>
        </section>

        <section>
          <h2>Practical GEO for your website</h2>
          <p>
            Here is what you can do today, ordered by impact:
          </p>
          <ol>
            <li>
              <strong>Add JSON-LD structured data.</strong> Start with WebSite and Organization schemas on every page. Add Article, Product, FAQ, or other types on relevant pages. This helps both Google and AI systems.
            </li>
            <li>
              <strong>Configure your robots.txt for AI crawlers.</strong> Decide which AI bots you want to allow or block. Be intentional, not accidental. A default robots.txt might be blocking crawlers you want to allow.
            </li>
            <li>
              <strong>Add llms.txt.</strong> Create a machine-readable overview of your site. Even if not all AI systems consume it today, the effort is minimal and the format is likely to gain adoption.
            </li>
            <li>
              <strong>Publish readable raw output.</strong> Prefer prerendered
              HTML, and if needed add markdown mirrors so fetch-based agents do
              not have to reverse-engineer your page from a JavaScript shell.
            </li>
            <li>
              <strong>Validate everything at build time.</strong> Broken
              JSON-LD, conflicting robots.txt rules, malformed llms.txt, and
              thin HTML are invisible bugs. Catch them before they go to
              production.
            </li>
          </ol>
        </section>

        <section>
          <h2>Automating GEO with agentmarkup</h2>
          <p>
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a>{' '}
            is an open-source package family with adapters for Vite, Astro, and
            Next.js that handles all of the above at build time. One config can
            generate llms.txt, inject JSON-LD, emit markdown mirrors, patch
            robots.txt and host-friendly headers, and validate everything. No
            runtime code, no SaaS, no recurring cost.
          </p>
          <p>
            It does not promise AI rankings. It gives you the tools to make your site machine-readable and lets you decide what that means for your business.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            GEO is real in the sense that AI systems are a growing discovery channel. It is overhyped in the sense that nobody can guarantee placement in AI answers. The practical response is to make your website machine-readable using proven techniques (JSON-LD, robots.txt) and emerging ones (llms.txt), and to do so without overspending or overcomplicating your stack.
          </p>
          <p>
            The websites that will benefit most from AI-driven discovery are the ones that were already well-built: clear content, proper metadata, structured data. GEO is not a revolution. It is a reminder to do the fundamentals well.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="what-is-geo" />
    </main>
  )
}

export default WhatIsGeo
