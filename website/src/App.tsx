import { useState } from 'react'
import { homeFaqs } from './data/page-faqs'
import { normalizeWebsiteInput } from './normalizeWebsiteInput'
import { GitHubIcon } from './ui/GitHubIcon'
import { ResultPreview } from './ui/ResultPreview'

type Framework = 'next' | 'vite' | 'astro' | 'nuxt'

const frameworks: Array<{ id: Framework; label: string }> = [
  { id: 'next', label: 'Next.js' },
  { id: 'vite', label: 'Vite' },
  { id: 'astro', label: 'Astro' },
  { id: 'nuxt', label: 'Nuxt' },
]

function Home() {
  const [framework, setFramework] = useState<Framework>('next')
  const [installCopied, setInstallCopied] = useState(false)
  const [checkerUrl, setCheckerUrl] = useState('')
  const packageName = `@agentmarkup/${framework}`
  const installCommand = `pnpm add -D ${packageName}`

  async function copyInstallCommand() {
    try {
      await navigator.clipboard.writeText(installCommand)
      setInstallCopied(true)
    } catch {
      setInstallCopied(false)
    }
  }

  function handleCheckerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedUrl = normalizeWebsiteInput(checkerUrl)
    if (!normalizedUrl) return

    setCheckerUrl(normalizedUrl)
    window.location.assign(`/checker/?url=${encodeURIComponent(normalizedUrl)}`)
  }

  return (
    <main className="home-page">
      <header className="home-hero">
        <div className="hero-copy">
          <p className="hero-overline">A clearer web for people and AI</p>
          <h1>Help AI understand your website.</h1>
          <p className="tagline">Get a clear answer and simple next steps in seconds.</p>
          <form className="hero-checker-form" action="/checker/" method="get" onSubmit={handleCheckerSubmit}>
            <label className="sr-only" htmlFor="home-checker-url">Website address</label>
            <div className="checker-form-row">
              <input
                id="home-checker-url"
                className="checker-input"
                type="text"
                name="url"
                value={checkerUrl}
                onChange={(event) => setCheckerUrl(event.target.value)}
                onBlur={() => setCheckerUrl((value) => normalizeWebsiteInput(value))}
                placeholder="yourwebsite.com"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                required
              />
              <button className="checker-submit" type="submit">Check my website</button>
            </div>
            <p>Free check of any public site. We normalize the address to its website root.</p>
          </form>
        </div>

        <section className="quick-install" aria-labelledby="quick-install-title">
          <div className="quick-install-copy">
            <h2 id="quick-install-title">Install AgentMarkup.</h2>
            <p>Choose the framework that builds your website, then add its AgentMarkup package.</p>
          </div>
          <div className="quick-install-tool">
            <div className="framework-tabs" aria-label="Choose your framework">
              {frameworks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={framework === item.id}
                  className={framework === item.id ? 'is-active' : undefined}
                  onClick={() => {
                    setFramework(item.id)
                    setInstallCopied(false)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="install-command-row">
              <pre aria-live="polite"><code>{installCommand}</code></pre>
              <button type="button" onClick={copyInstallCommand}>
                {installCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <a href={`https://www.npmjs.com/package/${packageName}`} target="_blank" rel="noopener noreferrer">
              View {packageName} on npm
            </a>
          </div>
        </section>

        <div className="result-preview-stage">
          <div className="result-preview-intro">
            <p className="section-kicker">A result you can understand</p>
            <h3>See what matters, then read why.</h3>
            <p>The overall answer tells you where to start. Open any finding for a plain-language explanation and a practical next step.</p>
          </div>
          <ResultPreview />
        </div>
      </header>

      <section className="product-options" id="product-options" aria-labelledby="product-options-title">
        <div className="home-section-heading product-options-heading">
          <p className="section-kicker">Choose a check</p>
          <h2 id="product-options-title">Start with your website.</h2>
          <p>Pick the result you need. Each check gives you a clear answer and practical next steps.</p>
        </div>

        <div className="product-option-grid">
          <a className="product-option-card" href="/checker/">
            <span className="product-option-label">AI visibility</span>
            <h3>Website Checker</h3>
            <p>See what AI can find and understand, including whether your access rules are clear.</p>
            <strong>Open website checker</strong>
          </a>
          <a className="product-option-card" href="/security-scan/">
            <span className="product-option-label">Public security</span>
            <h3>Security Scan</h3>
            <p>See what your website exposes publicly, from HTTPS and security headers to cookie settings.</p>
            <strong>Open security scan</strong>
          </a>
        </div>

        <a className="developer-route" href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">
          <span className="developer-route-icon"><GitHubIcon /></span>
          <span className="developer-route-copy"><span className="developer-route-label">For developers</span><strong>Setup guides, packages, and implementation details</strong></span>
        </a>
      </section>

      <section className="technical-coverage" aria-labelledby="technical-coverage-title">
        <div className="home-section-heading">
          <p className="section-kicker">Technical coverage</p>
          <h2 id="technical-coverage-title">The signals AI systems actually use.</h2>
          <p>AgentMarkup creates and validates the public files, structured data, discovery links, and access rules that help machines interpret a website reliably.</p>
        </div>
        <div className="technical-coverage-grid">
          <article><h3>llms.txt discovery</h3><p>Generate <code>llms.txt</code> and optional <code>llms-full.txt</code>, then publish the homepage discovery link.</p><a href="/docs/llms-txt/">Read the llms.txt guide</a></article>
          <article><h3>JSON-LD structured data</h3><p>Add XSS-safe schema.org markup with built-in presets or your own custom schemas.</p><a href="/docs/json-ld/">Read the JSON-LD guide</a></article>
          <article><h3>AI crawler access</h3><p>Manage GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and existing <code>robots.txt</code> rules.</p><a href="/docs/ai-crawlers/">Read the crawler guide</a></article>
          <article><h3>Markdown mirrors</h3><p>Publish clean <code>.md</code> companions with canonical relationships when raw HTML is not the clearest machine-readable source.</p><a href="/blog/markdown-mirrors/">Understand markdown mirrors</a></article>
          <article><h3>Usage signals</h3><p>Publish Content-Signal headers and an optional A2A Agent Card without changing the runtime application.</p><a href="/learn/">Explore the learning center</a></article>
          <article><h3>Build validation</h3><p>Audit the final public output locally, in CI, or through the hosted checker before it reaches production.</p><a href="/docs/audit/">Read the audit guide</a></article>
        </div>
      </section>

      <section className="use-cases" aria-labelledby="use-cases-title">
        <div className="home-section-heading">
          <h2 id="use-cases-title">Useful whether you sell, publish, or build a brand.</h2>
        </div>
        <div className="blog-list">
          <a href="/blog/ecommerce-llm-optimization/" className="blog-card"><span className="use-case-label">Products</span><h3>E-commerce</h3><p>Make products visible in AI shopping recommendations with product schema, llms.txt catalogs, and crawler access.</p><strong>Explore e-commerce guidance</strong></a>
          <a href="/blog/brand-awareness-ai/" className="blog-card"><span className="use-case-label">Reputation</span><h3>Brand awareness</h3><p>Use organization schema, FAQ markup, and clear positioning so AI systems accurately represent your brand.</p><strong>Explore brand guidance</strong></a>
          <a href="/blog/json-ld-structured-data-guide/" className="blog-card"><span className="use-case-label">Publishing</span><h3>Content websites</h3><p>Power Google rich results and AI citations with Article, FAQ, and WebSite schemas before broken markup goes live.</p><strong>Explore content guidance</strong></a>
        </div>
      </section>

      <section className="faq-home" aria-labelledby="faq-title">
        <div className="faq-home-heading">
          <p className="section-kicker">Questions, answered</p>
          <h2 id="faq-title">Frequently Asked Questions</h2>
          <p>Read clear answers about the checks, setup, and what AgentMarkup changes on your website.</p>
        </div>
        <div className="faq faq-common">
          {homeFaqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  )
}

export default Home
