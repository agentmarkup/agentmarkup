import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function WhyLlmsTxtMatters() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="6 min read" />
        <h1>Why llms.txt matters: making your website discoverable by AI</h1>
        <p className="doc-intro">
          Search is changing. LLMs like ChatGPT, Claude, and Perplexity now answer questions by synthesizing information from the web. If your website is not structured for these systems to understand, you are invisible to a growing share of how people find information.
        </p>

        <section>
          <h2>The shift from search engines to AI answers</h2>
          <p>
            For two decades, the path to online visibility was clear: optimize for Google, get ranked, get clicked. That model is not going away, but it is being joined by a second discovery channel. When someone asks ChatGPT "what is the best leather wallet under $100" or asks Perplexity "how do I add structured data to my Vite site," the answer comes from synthesized web content, not a list of blue links.
          </p>
          <p>
            The question for website owners is no longer just "can Google index my pages?" but also "can an LLM understand what my site is about?"
          </p>
        </section>

        <section>
          <h2>What is llms.txt?</h2>
          <p>
            <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llms.txt</a> is a proposed standard that gives LLMs a structured overview of your website. It is a plain text file served at <code>/llms.txt</code>, written in simple markdown, that describes your site name, purpose, and pages.
          </p>
          <p>
            Think of it as robots.txt for AI understanding. While robots.txt tells crawlers what they can access, llms.txt tells them what your site actually is.
          </p>
          <CodeBlock code={`# My Shop

> Handcrafted leather goods since 2015.

## Products

- [Wallets](https://myshop.com/products/wallets): Full-grain leather bifold wallets
- [Bags](https://myshop.com/products/bags): Handmade leather messenger bags

## Support

- [FAQ](https://myshop.com/faq): Common questions about orders and shipping
- [Contact](https://myshop.com/contact): Get in touch with our team`} />
        </section>

        <section>
          <h2>Why not just let AI read your HTML?</h2>
          <p>
            HTML pages are designed for humans. They contain navigation menus, cookie banners, ad scripts, analytics tags, and layout markup that has nothing to do with your actual content. An LLM reading your raw HTML has to guess what matters and what is noise.
          </p>
          <p>
            llms.txt gives the LLM a clean, noise-free map of your site. No guessing required. It is the equivalent of handing someone a table of contents instead of making them skim every page.
          </p>
        </section>

        <section>
          <h2>Is llms.txt actually used today?</h2>
          <p>
            Honestly, adoption is early. Perplexity has shown interest in consuming llms.txt. Other major AI systems have not publicly committed to it. The format is a proposal from llmstxt.org, not an official standard.
          </p>
          <p>
            But the cost of generating it is near zero. A build-time plugin like <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a> can produce it automatically from your existing site config. The downside risk is an extra text file in your build output. The upside is being ready when AI systems start looking for it.
          </p>
        </section>

        <section>
          <h2>The three layers of machine readability</h2>
          <p>
            llms.txt is one piece of a larger picture. A truly machine-readable website has three layers:
          </p>
          <ol>
            <li><strong>llms.txt</strong> - a high-level map of what your site is and what pages exist</li>
            <li><strong>JSON-LD structured data</strong> - page-level metadata telling search engines and AI what each page represents (a product, an article, a FAQ)</li>
            <li><strong>robots.txt AI crawler rules</strong> - explicit permissions for which AI bots can access your content</li>
          </ol>
          <p>
            Each layer serves a different purpose. llms.txt is for AI discovery. JSON-LD is for search engine rich results. robots.txt is for access control. Together, they make your site understandable by both traditional search engines and the new generation of AI systems.
          </p>
        </section>

        <section>
          <h2>How to add llms.txt to your site</h2>
          <p>
            You can write llms.txt by hand, but keeping it in sync with your actual pages is tedious. A build-time tool does it automatically.
          </p>
          <p>
            With agentmarkup, you configure your site structure once and the plugin generates llms.txt, injects JSON-LD, and patches robots.txt on every build:
          </p>
          <CodeBlock code={`pnpm add -D @agentmarkup/vite  # or @agentmarkup/astro or @agentmarkup/next`} />
          <p>
            Read the <a href="/docs/llms-txt/">full llms.txt guide</a> for configuration details.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            The web is getting a second audience. Humans still matter, but AI systems are increasingly the first reader of your content. llms.txt is a low-cost, low-risk way to make sure those systems understand what you have built. Whether or not it becomes a formal standard, the practice of structuring your site for machine readability is here to stay.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="why-llms-txt-matters" />
    </main>
  )
}

export default WhyLlmsTxtMatters
