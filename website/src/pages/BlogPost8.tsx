import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function WebsiteCheckerGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="8 min read" />
        <h1>Is your website ready for AI? Use the free agentmarkup checker to find out</h1>
        <p className="doc-intro">
          Most websites are invisible to AI systems. Not because the content is bad, but because the metadata is missing, broken, or incomplete. The <a href="/checker/">agentmarkup checker</a> audits your website in seconds and tells you exactly what to fix.
        </p>

        <section>
          <h2>Why you need to check your website</h2>
          <p>
            When ChatGPT, Claude, or Perplexity answers a question about your industry, does your website show up? In most cases, the answer is no. Not because your content is not relevant, but because AI systems cannot understand your site.
          </p>
          <p>
            The difference between a website that gets cited by AI and one that
            does not often comes down to a few missing files and metadata tags.
            A robots.txt that accidentally blocks AI crawlers. Missing JSON-LD
            structured data. No llms.txt file. No readable fallback when the
            raw HTML is thin or heavily client-rendered.
          </p>
          <p>
            These are not complex problems. They are configuration gaps that take minutes to fix once you know they exist. The hard part is knowing they exist.
          </p>
        </section>

        <section>
          <h2>What the checker audits</h2>
          <p>
            Enter any public URL at <a href="/checker/">agentmarkup.dev/checker</a> and the tool fetches your homepage, llms.txt, robots.txt, sitemap, markdown mirrors, and a sample internal page. It runs 20+ deterministic checks and categorizes each as a pass, warning, or error.
          </p>

          <h3>Homepage structure</h3>
          <ul>
            <li>Is your homepage publicly reachable over HTTPS?</li>
            <li>Does it have a canonical URL tag?</li>
            <li>Is there a meta description?</li>
            <li>Is the HTML lang attribute set?</li>
            <li>Does it have an H1 heading?</li>
            <li>Does the X-Robots-Tag header block indexing?</li>
          </ul>

          <h3>JSON-LD structured data</h3>
          <ul>
            <li>Are there any JSON-LD blocks in the page?</li>
            <li>Is the JSON-LD syntactically valid?</li>
            <li>Is there a WebSite schema identifying your site?</li>
            <li>Is there an Organization schema with your brand name and logo?</li>
          </ul>

          <h3>llms.txt</h3>
          <ul>
            <li>Does <code>/llms.txt</code> exist and is it accessible?</li>
            <li>Is the file structurally valid?</li>
            <li>Does your homepage advertise it via a link tag?</li>
          </ul>

          <h3>Markdown mirrors</h3>
          <ul>
            <li>If the raw HTML is thin, does your homepage have a markdown alternate link?</li>
            <li>Is the markdown file accessible and substantial (not empty or raw HTML)?</li>
            <li>If a linked page also serves thin HTML, is there a useful markdown fallback there too?</li>
          </ul>

          <h3>Robots.txt and AI crawlers</h3>
          <ul>
            <li>Does robots.txt exist?</li>
            <li>Are there explicit rules for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and CCBot?</li>
            <li>Does robots.txt reference your sitemap?</li>
          </ul>

          <h3>Sitemap</h3>
          <ul>
            <li>Is a sitemap available at <code>/sitemap.xml</code> or referenced in robots.txt?</li>
            <li>Is the sitemap valid XML?</li>
          </ul>
        </section>

        <section>
          <h2>How to read the results</h2>
          <p>
            Results use three levels. There are no scores, no percentages, no arbitrary numbers. Just deterministic checks with clear outcomes:
          </p>
          <ul>
            <li><strong>Error</strong> - something is blocking AI access. Homepage unreachable, noindex header present, invalid JSON-LD.</li>
            <li><strong>Warning</strong> - something important is missing. No Organization schema, no explicit AI crawler rules, or thin HTML without adequate markdown coverage.</li>
            <li><strong>Pass</strong> - a best practice is met. Homepage reachable, canonical URL present, llms.txt valid.</li>
          </ul>
          <p>
            Each finding includes a title, a detail explaining why it matters, and an action step telling you what to do. Where relevant, findings link to the documentation guides on this site.
          </p>
        </section>

        <section>
          <h2>For e-commerce websites</h2>
          <p>
            E-commerce sites have the most to gain from AI discoverability. When someone asks an AI "best running shoes under $150," the AI recommends products from stores it can understand. The checker tells you whether your store is one of them.
          </p>
          <p>
            Key checks for e-commerce:
          </p>
          <ul>
            <li><strong>Product JSON-LD</strong> - does your product page have structured data with name, price, availability? Without it, AI cannot recommend your products accurately.</li>
            <li><strong>Organization schema</strong> - does AI know your brand name and logo? This is how AI associates products with your store in its answers.</li>
            <li><strong>AI crawler access</strong> - is your robots.txt accidentally blocking GPTBot or PerplexityBot? Many e-commerce platforms ship with broad disallow rules that block AI crawlers along with everything else.</li>
            <li><strong>Markdown mirrors</strong> - can AI agents read clean content from your product pages, or do they get an empty JavaScript shell?</li>
          </ul>
          <p>
            Run your store through the checker. If you see warnings for missing Organization schema or no AI crawler rules, those are the first things to fix.
          </p>
        </section>

        <section>
          <h2>For brand and content websites</h2>
          <p>
            If your business depends on being known - a consultancy, an agency, a SaaS product - the checker shows whether AI can accurately describe what you do.
          </p>
          <ul>
            <li><strong>Organization schema</strong> tells AI your exact name, description, and social profiles. Without it, AI might confuse you with another company.</li>
            <li><strong>llms.txt</strong> gives AI a structured overview of your services and pages. Instead of crawling every page, AI reads one file and understands your site.</li>
            <li><strong>Meta description and H1</strong> are the first things AI reads. If they are generic ("Welcome to our website"), AI has nothing useful to work with.</li>
          </ul>
        </section>

        <section>
          <h2>What makes this different from SEO auditors</h2>
          <p>
            Traditional SEO tools check whether Google can index your pages. The agentmarkup checker checks whether AI systems can understand your content. These overlap but are not the same.
          </p>
          <ul>
            <li><strong>llms.txt</strong> is not checked by any SEO tool. It is AI-specific.</li>
            <li><strong>Markdown mirrors</strong> are irrelevant to Google but useful when the raw HTML is thin, heavily client-rendered, or cluttered with layout noise.</li>
            <li><strong>AI crawler rules</strong> (GPTBot, ClaudeBot) are separate from Googlebot rules. You might have perfect Google indexing while being completely invisible to ChatGPT.</li>
            <li><strong>No scores.</strong> SEO tools love to give you a number out of 100. The checker gives you specific, actionable findings. "Your robots.txt does not include explicit rules for GPTBot" is more useful than "Your AI readiness score is 47."</li>
          </ul>
        </section>

        <section>
          <h2>Try it now</h2>
          <p>
            Go to <a href="/checker/">agentmarkup.dev/checker</a>, enter your
            website URL, and see the results in seconds. It is free and requires
            no signup. The deployed checker may retain normalized check records
            briefly for caching, rate limiting, and recent-history views, but it
            is not a lead form.
          </p>
          <p>
            If the checker finds issues, the documentation guides on this site
            explain how to fix each one. Or install{' '}
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a>{' '}
            for Vite or Astro and it handles llms.txt, JSON-LD, robots.txt,
            markdown mirrors, optional headers, and validation automatically at
            build time.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="website-checker" />
    </main>
  )
}

export default WebsiteCheckerGuide
