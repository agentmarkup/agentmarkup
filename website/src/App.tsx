import { useState } from 'react'
import { homeFaqs } from './data/page-faqs'
import { normalizeWebsiteInput } from './normalizeWebsiteInput'
import { GitHubIcon } from './ui/GitHubIcon'

type Framework = 'next' | 'vite' | 'astro' | 'nuxt'

const frameworks: Array<{ id: Framework; label: string }> = [
  { id: 'next', label: 'Next.js' },
  { id: 'vite', label: 'Vite' },
  { id: 'astro', label: 'Astro' },
  { id: 'nuxt', label: 'Nuxt' },
]

const packages = [
  { name: '@agentmarkup/next', label: 'Next.js', detail: 'Build-time integration for static Next.js output.' },
  { name: '@agentmarkup/vite', label: 'Vite', detail: 'Plugin for Vite applications and static sites.' },
  { name: '@agentmarkup/astro', label: 'Astro', detail: 'Native integration for Astro builds.' },
  { name: '@agentmarkup/nuxt', label: 'Nuxt', detail: 'Module for prerendered Nuxt output.' },
  { name: '@agentmarkup/cli', label: 'Any static site', detail: 'Run AgentMarkup after any framework finishes building.' },
  { name: '@agentmarkup/audit', label: 'Live audit', detail: 'Test a deployed URL using the user-agents of real AI crawlers.' },
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
          <p className="hero-overline">Open-source npm packages</p>
          <h1>Build websites AI can understand.</h1>
          <p className="tagline">Generate llms.txt, JSON-LD, markdown mirrors, crawler rules, and validation at build time for Next.js, Vite, Astro, Nuxt, or any static site.</p>
        </div>

        <div className="hero-primary-actions">
          <section className="quick-install hero-action" aria-labelledby="quick-install-title">
            <div className="hero-action-copy quick-install-copy">
              <p className="section-kicker">Build with AgentMarkup</p>
              <h2 id="quick-install-title">Install your npm package.</h2>
              <p>Add machine-readable output at build time, without runtime JavaScript.</p>
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

          <section className="product-check hero-action" id="product-check" aria-labelledby="product-check-title">
            <div className="hero-action-copy product-check-copy">
              <p className="section-kicker">Check your website</p>
              <h2 id="product-check-title">Scan what AI can access.</h2>
              <p>Whatever page you enter, we normalize it to the site root and start the scan there.</p>
            </div>
            <form className="hero-checker-form product-check-form" action="/checker/" method="get" onSubmit={handleCheckerSubmit}>
              <label htmlFor="home-checker-url">Website address</label>
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
                <button className="checker-submit" type="submit">Scan website</button>
              </div>
              <p>Free, no account required. <a href="/checker/">Open the checker without a URL</a>, or <a href="/security-scan/">run a security scan</a>.</p>
            </form>
          </section>
        </div>
      </header>

      <section className="package-ecosystem" aria-labelledby="package-ecosystem-title">
        <div className="home-section-heading">
          <p className="section-kicker">One toolkit, every build</p>
          <h2 id="package-ecosystem-title">Choose only the package you need.</h2>
          <p>The framework integrations share the same configuration and output. The CLI covers any static build, while Audit checks what AI crawlers receive after deployment.</p>
        </div>
        <div className="package-grid">
          {packages.map((item) => (
            <a key={item.name} className="package-card" href={`https://www.npmjs.com/package/${item.name}`} target="_blank" rel="noopener noreferrer">
              <span>{item.label}</span>
              <h3><code>{item.name}</code></h3>
              <p>{item.detail}</p>
              <strong>View on npm</strong>
            </a>
          ))}
        </div>
        <div className="package-routes">
          <a href="https://www.npmjs.com/package/@agentmarkup/core" target="_blank" rel="noopener noreferrer">Using a custom integration? View <code>@agentmarkup/core</code>.</a>
          <a className="developer-route" href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">
            <span className="developer-route-icon"><GitHubIcon /></span>
            <span className="developer-route-copy"><span className="developer-route-label">Open source</span><strong>Read the source, examples, and package documentation</strong></span>
          </a>
        </div>
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
