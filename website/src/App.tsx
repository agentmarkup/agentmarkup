import { useState } from 'react'
import CodeBlock from './CodeBlock'
import { normalizeWebsiteInput } from './normalizeWebsiteInput'

type Framework = 'next' | 'vite' | 'astro' | 'nuxt'

const examples: Record<Framework, string> = {
  next: `// next.config.ts
import type { NextConfig } from 'next'
import { withAgentmarkup } from '@agentmarkup/next'

const nextConfig: NextConfig = { output: 'export' }

export default withAgentmarkup(
  {
    site: 'https://myapp.com',
    name: 'My App',
    globalSchemas: [
      { preset: 'webSite', name: 'My App', url: 'https://myapp.com' },
      { preset: 'organization', name: 'My App', url: 'https://myapp.com' },
    ],
    llmsTxt: { sections: [{ title: 'Docs', entries: [] }] },
    llmsFullTxt: { enabled: true },
    markdownPages: { enabled: true },
    contentSignalHeaders: { enabled: true },
    aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow' },
  },
  nextConfig,
)`,
  vite: `// vite.config.ts
import { defineConfig } from 'vite'
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  plugins: [agentmarkup({
    site: 'https://myshop.com',
    name: 'My Shop',
    globalSchemas: [
      { preset: 'webSite', name: 'My Shop', url: 'https://myshop.com' },
      { preset: 'organization', name: 'My Shop', url: 'https://myshop.com' },
    ],
    llmsTxt: { sections: [{ title: 'Products', entries: [] }] },
    llmsFullTxt: { enabled: true },
    markdownPages: { enabled: true },
    contentSignalHeaders: { enabled: true },
    aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow', CCBot: 'disallow' },
  })],
})`,
  astro: `// astro.config.mjs
import { defineConfig } from 'astro/config'
import { agentmarkup } from '@agentmarkup/astro'

export default defineConfig({
  integrations: [agentmarkup({
    site: 'https://myblog.com',
    name: 'My Blog',
    globalSchemas: [
      { preset: 'webSite', name: 'My Blog', url: 'https://myblog.com' },
      { preset: 'organization', name: 'My Blog', url: 'https://myblog.com' },
    ],
    llmsTxt: { sections: [{ title: 'Posts', entries: [] }] },
    llmsFullTxt: { enabled: true },
    markdownPages: { enabled: true },
    contentSignalHeaders: { enabled: true },
    aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow' },
  })],
})`,
  nuxt: `// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agentmarkup/nuxt'],
  agentmarkup: {
    site: 'https://mysite.com',
    name: 'My Site',
    globalSchemas: [
      { preset: 'webSite', name: 'My Site', url: 'https://mysite.com' },
      { preset: 'organization', name: 'My Site', url: 'https://mysite.com' },
    ],
    llmsTxt: { sections: [{ title: 'Docs', entries: [] }] },
    llmsFullTxt: { enabled: true },
    markdownPages: { enabled: true },
    contentSignalHeaders: { enabled: true },
    aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow' },
  },
})`,
}

const configFiles: Record<Framework, string> = {
  next: 'next.config.ts',
  vite: 'vite.config.ts',
  astro: 'astro.config.mjs',
  nuxt: 'nuxt.config.ts',
}

function Home() {
  const [framework, setFramework] = useState<Framework>('next')
  const [checkerUrl, setCheckerUrl] = useState('')

  function handleHeroCheckerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedUrl = normalizeWebsiteInput(checkerUrl)
    if (!normalizedUrl) return

    setCheckerUrl(normalizedUrl)
    window.location.assign(`/checker/?url=${encodeURIComponent(normalizedUrl)}`)
  }

  return (
    <>
      <header className="home-hero">
        <div className="hero-copy">
          <p className="hero-overline">A clearer web for people and AI</p>
          <h1>Make your website easy for AI to understand.</h1>
          <p className="tagline">Check your site in seconds. Get a clear answer and simple next steps—without needing to learn technical jargon first.</p>
          <form className="hero-checker-form" action="/checker/" method="get" onSubmit={handleHeroCheckerSubmit}>
            <label className="sr-only" htmlFor="hero-checker-url">Website URL</label>
            <div className="checker-form-row hero-checker-row">
              <input
                id="hero-checker-url"
                className="checker-input"
                type="text"
                name="url"
                placeholder="yourwebsite.com"
                value={checkerUrl}
                onChange={(event) => setCheckerUrl(event.target.value)}
                onBlur={() => setCheckerUrl((currentUrl) => normalizeWebsiteInput(currentUrl))}
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                required
              />
              <button className="checker-submit" type="submit">Check my website</button>
            </div>
            <p className="hero-checker-note">Free, public-site check. We start at your homepage.</p>
          </form>
        </div>

        <aside className="hero-checks" aria-labelledby="hero-checks-title">
          <p className="hero-checks-kicker">A clear answer, not a score</p>
          <h2 id="hero-checks-title">What your check answers</h2>
          <ol>
            <li>
              <strong>Can AI find your site?</strong>
              <span>We look for your sitemap, discovery links, and public pages.</span>
            </li>
            <li>
              <strong>Can it understand your pages?</strong>
              <span>We check the content, structured data, and machine-readable versions.</span>
            </li>
            <li>
              <strong>Are your access rules clear?</strong>
              <span>We review your crawler rules so you can see what is allowed or blocked.</span>
            </li>
          </ol>
          <p className="hero-checks-note">You get pass, warning, and error findings with the next step for each.</p>
        </aside>
      </header>

      <main>
        <section className="capabilities" aria-labelledby="capabilities-title">
          <div className="capabilities-intro">
            <p className="section-kicker">What it does</p>
            <h2 id="capabilities-title">Everything your build needs, checked before you ship.</h2>
            <p>AgentMarkup adds the details AI systems need to find and interpret a website, then validates the final output.</p>
          </div>
          <div className="features" aria-label="Website capabilities">
            <div className="feature">
              <h3>llms.txt generation</h3>
              <p>Auto-generate an <code>llms.txt</code> file following the <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a> spec, inject the homepage discovery link automatically, and optionally emit <code>llms-full.txt</code> with inlined same-site markdown context.</p>
            </div>
            <div className="feature">
              <h3>Optional A2A Agent Card</h3>
              <p>Publish <code>/.well-known/agent-card.json</code> for an existing A2A-compatible agent service from the same build pipeline. AgentMarkup handles static discovery and validation, not the runtime A2A server.</p>
            </div>
            <div className="feature">
              <h3>JSON-LD structured data</h3>
              <p>Inject schema.org JSON-LD into every page with XSS-safe serialization. Use six built-in presets for common types or bring your own custom schemas.</p>
            </div>
            <div className="feature">
              <h3>AI crawler management</h3>
              <p>Allow or block AI crawlers like GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and CCBot with idempotent <code>robots.txt</code> patching that will not break existing rules.</p>
            </div>
            <div className="feature">
              <h3>Markdown mirrors</h3>
              <p>Optionally generate a clean <code>.md</code> companion for built HTML pages when fetch-based agents need a better path than raw HTML. If your HTML is already substantial, keep it as the primary target.</p>
            </div>
            <div className="feature">
              <h3>Content-Signal headers</h3>
              <p>Patch or generate a host-friendly <code>_headers</code> file, or merge server header rules, with Content-Signal directives and markdown canonicals.</p>
            </div>
          </div>
        </section>

        <section className="home-overview" aria-label="How AgentMarkup works">
          <p>AgentMarkup makes websites understandable by LLMs and AI agents. It generates <a href="/docs/llms-txt/">llms.txt</a> and optional <code>llms-full.txt</code>, can emit an optional <code>/.well-known/agent-card.json</code>, injects <a href="/docs/json-ld/">schema.org JSON-LD</a>, can generate <a href="/blog/markdown-mirrors/">markdown mirrors</a>, manages <a href="/docs/ai-crawlers/">AI crawler robots.txt rules</a>, patches Content-Signal headers and validates final output for Next.js, Vite, Astro, Nuxt, or any static-output pipeline through the CLI.</p>
        </section>

        <section className="checker-cta" aria-labelledby="checker-guide-title">
          <div className="checker-cta-card">
            <h2 id="checker-guide-title">Check your website before you ship it</h2>
            <div>
              <p>Run the built-in website checker to inspect any public homepage for llms.txt, JSON-LD, markdown mirrors, robots.txt, sitemap discovery, canonical tags, and thin-HTML issues. It follows at most one same-origin link, does not invent a score, and tells you exactly what is missing.</p>
              <p>Prefer the terminal or CI? <a href="https://www.npmjs.com/package/@agentmarkup/audit" target="_blank" rel="noopener noreferrer"><code>@agentmarkup/audit</code></a> fetches your URL as major AI crawlers, compares each response with a browser, and exits non-zero on provable machine-readability errors. Run <code>npx @agentmarkup/audit https://example.com</code>, or <a href="/docs/audit/">read the audit guide</a>.</p>
              <a className="checker-cta-link" href="/checker/">Open the website checker</a>
            </div>
          </div>
        </section>

        <section className="checker-cta" aria-labelledby="skill-title">
          <div className="checker-cta-card">
            <h2 id="skill-title">AgentMarkup agent skill</h2>
            <div>
              <p>Install the public <code>agentmarkup</code> skill from <code>skills/agentmarkup</code> to help a coding agent add AgentMarkup to a Vite, Astro, Next.js, or custom pipeline repo, configure it from your preferences, audit generated output, and implement fixes for llms.txt, JSON-LD, robots.txt, <code>_headers</code>, and markdown mirrors.</p>
              <a className="checker-cta-link" href="https://github.com/agentmarkup/agentmarkup/tree/main/skills/agentmarkup" target="_blank" rel="noopener noreferrer">View the agent skill in GitHub</a>
            </div>
          </div>
        </section>

        <section className="implementation" aria-labelledby="presets-title">
          <div className="implementation-intro">
            <p className="section-kicker">Configuration</p>
            <h2 id="presets-title">Schema.org presets</h2>
            <p>Type-safe builders for common structured data types. Apply globally or per-page.</p>
            <p className="preset-list" aria-label="Available presets">
              <span className="preset">webSite</span><span className="preset">organization</span><span className="preset">article</span><span className="preset">faqPage</span><span className="preset">product</span><span className="preset">offer</span>
            </p>
          </div>
          <div className="implementation-example">
            <div className="fw-tabs" aria-label="Framework example">
              {(Object.keys(configFiles) as Framework[]).map((item) => (
                <button key={item} className={framework === item ? 'fw-tab active' : 'fw-tab'} onClick={() => setFramework(item)} aria-pressed={framework === item}>{item === 'next' ? 'Next.js' : item[0].toUpperCase() + item.slice(1)}</button>
              ))}
            </div>
            <h3>Add to {configFiles[framework]}</h3>
            <CodeBlock code={examples[framework]} maxHeight="28rem" />
          </div>
        </section>

        <section className="output" aria-labelledby="output-title">
          <h2 id="output-title">Final-output validation before you publish</h2>
          <p className="output-note">This is recent build output from agentmarkup.dev, which uses <code>@agentmarkup/vite</code>. AgentMarkup reports what it created, what it checked, and anything that needs attention before the site goes live. It catches incomplete schemas, thin client-shell HTML, broken discovery, missing mirror coverage, crawler conflicts, and malformed llms files.</p>
          <img
            src="/agentmarkup-build-output.webp"
            alt="Terminal output from a recent agentmarkup.dev build showing generated files and a clean validation report"
            className="output-screenshot"
            width="974"
            height="534"
            loading="lazy"
          />
        </section>

        <section className="packages" aria-labelledby="packages-title">
          <h2 id="packages-title">All packages</h2>
          <div className="package-grid">
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/next" target="_blank" rel="noopener noreferrer">@agentmarkup/next</a></h3><p className="package-desc">Next.js adapter for static export, prerendered HTML, and server deployments with build output. Fully dynamic SSR routes should use <code>@agentmarkup/core</code>. <a href="/blog/nextjs-llms-txt-json-ld/">Read the Next.js guide</a>.</p></div>
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/vite" target="_blank" rel="noopener noreferrer">@agentmarkup/vite</a></h3><p className="package-desc">Vite plugin for final-output builds on React, Vue, Svelte, or plain HTML sites.</p></div>
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/astro" target="_blank" rel="noopener noreferrer">@agentmarkup/astro</a></h3><p className="package-desc">Astro integration for sites where Astro owns the built HTML output.</p></div>
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/nuxt" target="_blank" rel="noopener noreferrer">@agentmarkup/nuxt</a></h3><p className="package-desc">Nuxt module for prerendered output. Best for <code>nuxt generate</code>; fully dynamic SSR routes should use <code>@agentmarkup/core</code>. <a href="/blog/nuxt-llms-txt-json-ld/">Read the Nuxt guide</a>.</p></div>
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/core" target="_blank" rel="noopener noreferrer">@agentmarkup/core</a></h3><p className="package-desc">Framework-agnostic generators and validators for custom build pipelines.</p></div>
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/cli" target="_blank" rel="noopener noreferrer">@agentmarkup/cli</a></h3><p className="package-desc">Framework-agnostic command. Run AgentMarkup over any built static output, or use <code>agentmarkup check</code> as a CI gate. <a href="/blog/agentmarkup-cli-any-static-site/">Read the CLI guide</a>.</p></div>
            <div className="package-card"><h3><a href="https://www.npmjs.com/package/@agentmarkup/audit" target="_blank" rel="noopener noreferrer">@agentmarkup/audit</a></h3><p className="package-desc">Runtime CLI that fetches any live URL as major AI crawlers, compares responses against a browser, and reports deterministic machine-readability findings. Run <code>npx @agentmarkup/audit https://example.com</code>. <a href="/docs/audit/">Read the audit guide</a>.</p></div>
          </div>
        </section>

        <section className="use-cases" aria-labelledby="use-cases-title">
          <h2 id="use-cases-title">Use cases</h2>
          <div className="blog-list">
            <a href="/blog/ecommerce-llm-optimization/" className="blog-card"><h3>E-commerce</h3><p>Make products visible in AI shopping recommendations with product schema, llms.txt catalogs, and crawler access.</p></a>
            <a href="/blog/brand-awareness-ai/" className="blog-card"><h3>Brand awareness</h3><p>Use organization schema, FAQ markup, and clear positioning so AI systems accurately represent your brand.</p></a>
            <a href="/blog/json-ld-structured-data-guide/" className="blog-card"><h3>Content websites</h3><p>Power Google rich results and AI citations with Article, FAQ, and WebSite schemas before broken markup goes live.</p></a>
          </div>
        </section>

        <section className="faq faq-home">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>What does agentmarkup actually do?</summary>
            <p>It adds machine-readable build output: an <code>llms.txt</code> file, optional <code>llms-full.txt</code> context, an optional A2A Agent Card, structured data, markdown mirrors, crawler rules, Content-Signal headers, and final-output validation. It warns about thin HTML, schema issues, broken discovery, and crawler conflicts.</p>
          </details>
          <details>
            <summary>Does this improve my search rankings?</summary>
            <p>JSON-LD can support Google rich results. llms.txt is a newer proposal and is not used by every AI system. agentmarkup does not promise rankings or traffic; it makes your site easier to read.</p>
          </details>
          <details>
            <summary>Is llms.txt a standard?</summary>
            <p>It is a proposal from <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a>, not an official standard. The structured-data features provide value regardless.</p>
          </details>
          <details>
            <summary>Is the config the same for Next.js, Vite, Astro, and Nuxt?</summary>
            <p>The shared <code>AgentMarkupConfig</code> object is the same across all adapters. The integration point changes: Next.js uses <code>withAgentmarkup</code>, Vite uses plugins, Astro uses integrations, and Nuxt uses the <code>agentmarkup</code> key. The same config also drives the CLI.</p>
          </details>
          <details>
            <summary>What is @agentmarkup/core for?</summary>
            <p>The core package contains the generators and validators without any framework binding. Use it for a custom build script, prerender pipeline, or a route that needs direct integration instead of an adapter-owned build step.</p>
          </details>
          <details>
            <summary>Does @agentmarkup/next handle fully dynamic SSR routes automatically?</summary>
            <p>No. The Next adapter is strongest where Next emits build-time HTML. For fully dynamic SSR routes with no build-time HTML file, use the re-exported <code>@agentmarkup/core</code> helpers directly in the route.</p>
          </details>
          <details>
            <summary>Does it add any runtime JavaScript?</summary>
            <p>No browser runtime is added by AgentMarkup. The adapters run during build or post-build processing and output static files or server header rules.</p>
          </details>
          <details>
            <summary>Do I need markdown mirrors on every page?</summary>
            <p>No. They are most useful when raw HTML is thin, noisy, or heavily client-rendered. If pages already serve substantial HTML, keep HTML as the primary fetch target.</p>
          </details>
          <details>
            <summary>Can I use my own JSON-LD schemas instead of presets?</summary>
            <p>Yes. Pass any object with an <code>@type</code> field. AgentMarkup adds the <code>@context</code>, escapes the output for XSS safety, and validates that the type is present.</p>
          </details>
          <details>
            <summary>Will this break my existing robots.txt?</summary>
            <p>No. The plugin updates only its marked section and leaves your existing rules intact.</p>
          </details>
        </section>
      </main>
    </>
  )
}

export default Home
