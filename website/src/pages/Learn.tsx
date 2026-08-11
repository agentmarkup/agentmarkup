import { WebThreads } from '../ui/WebThreads'

const statusIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v18M3 12h18" />
  </svg>
)

function Learn() {
  return (
    <main>
      <div className="learn-page">
        <header className="learn-hero">
          <WebThreads className="learn-hero-threads" />
          <div className="learn-hero-content">
            <p className="section-kicker">AgentMarkup learning center</p>
            <h1>Learn how AI sees your website</h1>
            <p className="learn-lead">You do not need a technical background. Start with what you want to know, then follow a short path to a clear explanation or a practical website check.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/checker/">Check my website</a>
              <a className="button button-secondary" href="#basics">Start with the basics</a>
            </div>
          </div>
        </header>

        <section className="learn-section" id="basics">
          <div className="learn-section-heading">
            <p className="section-kicker">Choose one goal</p>
            <h2>Start with what you need</h2>
            <p>There is no required reading order. Pick the closest match and you will reach the right starting point in one step.</p>
          </div>
          <div className="path-grid path-grid-three">
            <a className="path-card" href="/checker/">{statusIcon}<span><strong>I want to check my website</strong><small>Run a free check and get clear next steps.</small></span></a>
            <a className="path-card" href="/blog/website-checker/">{statusIcon}<span><strong>I want to understand AI readiness</strong><small>Learn what a useful, accessible website looks like to AI.</small></span></a>
            <a className="path-card" href="/security-scan/">{statusIcon}<span><strong>I want to check website security</strong><small>Review passive security signals with permission.</small></span></a>
          </div>
        </section>

        <section className="learn-section">
          <div className="learn-section-heading">
            <p className="section-kicker">A simple mental model</p>
            <h2>The three things AI needs</h2>
            <p>Most problems fit into three questions: can AI find the site, understand each important page, and access the public content you intended to share?</p>
          </div>
          <div className="learn-triad">
            <article><span>01</span><h3>Find your website</h3><p>Give automated systems a dependable map of your useful public pages.</p><a href="/docs/llms-txt/">Read the llms.txt guide</a><a href="/blog/why-llms-txt-matters/">Why llms.txt matters</a></article>
            <article><span>02</span><h3>Understand your pages</h3><p>Add explicit information about products, articles, organizations, and other page types.</p><a href="/docs/json-ld/">Read the JSON-LD guide</a><a href="/blog/json-ld-structured-data-guide/">Structured data explained</a></article>
            <article><span>03</span><h3>Access your content</h3><p>Make deliberate choices about which AI crawlers may visit your public pages.</p><a href="/docs/ai-crawlers/">Read the AI crawlers guide</a><a href="/blog/ai-crawlers-2026/">See the crawler directory</a></article>
          </div>
        </section>

        <section className="learn-section">
          <div className="learn-section-heading">
            <p className="section-kicker">Advice that fits</p>
            <h2>Choose your type of website</h2>
            <p>The same foundations apply everywhere, but the most useful signals depend on what your website is trying to help people do.</p>
          </div>
          <div className="path-grid path-grid-three">
            <a className="path-card is-quiet" href="/blog/ecommerce-llm-optimization/"><span><strong>E-commerce</strong><small>Help AI understand products, availability, and store information.</small></span></a>
            <a className="path-card is-quiet" href="/blog/brand-awareness-ai/"><span><strong>Brand or company</strong><small>Make your identity and public positioning easier to interpret.</small></span></a>
            <a className="path-card is-quiet" href="/blog/json-ld-structured-data-guide/"><span><strong>Publisher or content website</strong><small>Clarify authorship, article structure, and the meaning of each page.</small></span></a>
          </div>
        </section>

        <section className="learn-section learn-developer-zone">
          <div className="learn-section-heading">
            <p className="section-kicker">Technical paths</p>
            <h2>For people who build websites</h2>
            <p>Choose the implementation guide that matches your stack. These pages include commands, configuration, and build-time behavior.</p>
          </div>
          <nav className="developer-paths" aria-label="Developer learning paths">
            <a href="/blog/nextjs-llms-txt-json-ld/">Next.js</a>
            <a href="/blog/nuxt-llms-txt-json-ld/">Nuxt</a>
            <a href="/blog/agentmarkup-cli-any-static-site/">Static-site CLI</a>
            <a href="/docs/audit/">AI crawler audit</a>
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://www.npmjs.com/search?q=%40agentmarkup" target="_blank" rel="noopener noreferrer">npm</a>
          </nav>
        </section>

        <section className="learn-section learn-research">
          <div>
            <p className="section-kicker">Observed across real websites</p>
            <h2>Research and evidence</h2>
          </div>
          <div>
            <p>AgentMarkup audited 500 large-company homepages using the same public signals covered in these guides. The findings show patterns in a specific dataset and moment in time; they are observations, not a universal quality score or a promise about AI visibility.</p>
            <a className="text-link" href="/blog/ai-crawler-audit-500-companies/">Explore the Fortune 500 audit</a>
          </div>
        </section>

        <section className="learn-final-cta">
          <p className="section-kicker">Your website, not a generic score</p>
          <h2>Get a clear answer for your website</h2>
          <p>Enter your public website in the checker to see what already works, what needs attention, and the most useful next step. The check is free and does not require an account.</p>
          <a className="button button-primary" href="/checker/">Check my website</a>
        </section>
      </div>
    </main>
  )
}

export default Learn
