import { useState } from 'react'
import CodeBlock from './CodeBlock'
import { normalizeWebsiteInput } from './normalizeWebsiteInput'

const viteExample = `// vite.config.ts
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  plugins: [
    agentmarkup({
      site: 'https://myshop.com',
      name: 'My Shop',
      globalSchemas: [
        { preset: 'webSite', name: 'My Shop', url: 'https://myshop.com' },
        { preset: 'organization', name: 'My Shop', url: 'https://myshop.com' },
      ],
      llmsTxt: {
        sections: [{ title: 'Products', entries: [
          { title: 'Wallets', url: '/products/wallets', description: 'Leather wallets' },
        ]}],
      },
      llmsFullTxt: {
        enabled: true,
      },
      markdownPages: {
        enabled: true,
      },
      contentSignalHeaders: {
        enabled: true,
      },
      aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow', CCBot: 'disallow' },
    }),
  ],
})`

const astroExample = `// astro.config.mjs
import { agentmarkup } from '@agentmarkup/astro'

export default defineConfig({
  integrations: [
    agentmarkup({
      site: 'https://myblog.com',
      name: 'My Blog',
      globalSchemas: [
        { preset: 'webSite', name: 'My Blog', url: 'https://myblog.com' },
        { preset: 'organization', name: 'My Blog', url: 'https://myblog.com' },
      ],
      llmsTxt: {
        sections: [{ title: 'Posts', entries: [
          { title: 'Hello World', url: '/blog/hello', description: 'First post' },
        ]}],
      },
      llmsFullTxt: {
        enabled: true,
      },
      markdownPages: {
        enabled: true,
      },
      contentSignalHeaders: {
        enabled: true,
      },
      aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow' },
    }),
  ],
})`

type Framework = 'vite' | 'astro'

const installCommands: Record<Framework, string> = {
  vite: 'pnpm add -D @agentmarkup/vite',
  astro: 'pnpm add -D @agentmarkup/astro',
}

const examples: Record<Framework, string> = {
  vite: viteExample,
  astro: astroExample,
}

const configFiles: Record<Framework, string> = {
  vite: 'vite.config.ts',
  astro: 'astro.config.mjs',
}

function Home() {
  const [fw, setFw] = useState<Framework>('vite')
  const [checkerUrl, setCheckerUrl] = useState('')

  function handleHeroCheckerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedUrl = normalizeWebsiteInput(checkerUrl)
    if (!normalizedUrl) {
      return
    }

    setCheckerUrl(normalizedUrl)
    window.location.assign(`/checker/?url=${encodeURIComponent(normalizedUrl)}`)
  }

  return (
    <>
      <header>
        <h1>Make your website machine-readable for LLMs and AI agents</h1>
        <p className="tagline">Build-time llms.txt, JSON-LD, markdown mirrors, AI crawler controls, Content-Signal headers, and validation for Vite and Astro websites.</p>
        <p className="subtitle">Zero runtime cost. Type-safe. Open source.</p>

        <section className="hero-checker" aria-labelledby="hero-checker-title">
          <div className="hero-checker-copy">
            <h2 id="hero-checker-title">Run the website checker first</h2>
            <p>
              Check any public site for llms.txt, JSON-LD, markdown mirrors,
              robots.txt, sitemap discovery, canonical tags, and thin HTML
              before you install anything.
            </p>
          </div>
          <form className="hero-checker-form" action="/checker/" method="get" onSubmit={handleHeroCheckerSubmit}>
            <label className="hero-checker-label" htmlFor="hero-checker-url">
              Website URL
            </label>
            <p className="hero-checker-note">
              Only the root website is checked first. Enter any public page URL
              and the checker will normalize it to the site root before
              fetching metadata.
            </p>
            <div className="checker-form-row hero-checker-row">
              <input
                id="hero-checker-url"
                className="checker-input"
                type="text"
                name="url"
                placeholder="https://example.com"
                value={checkerUrl}
                onChange={(event) => setCheckerUrl(event.target.value)}
                onBlur={() => setCheckerUrl((currentUrl) => normalizeWebsiteInput(currentUrl))}
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                required
              />
              <button className="checker-submit" type="submit">
                Check website
              </button>
            </div>
          </form>
        </section>

        <div className="fw-tabs-hero">
          <button className={fw === 'vite' ? 'fw-tab active' : 'fw-tab'} onClick={() => setFw('vite')}>Vite</button>
          <button className={fw === 'astro' ? 'fw-tab active' : 'fw-tab'} onClick={() => setFw('astro')}>Astro</button>
        </div>
        <pre className="install-hero"><code>{installCommands[fw]}</code></pre>
      </header>

      <main>
        <section className="about">
          <p>
            agentmarkup makes your website understandable by LLMs and AI agents. It generates <a href="/docs/llms-txt/">llms.txt</a> and optional <code>llms-full.txt</code> files, injects <a href="/docs/json-ld/">schema.org JSON-LD</a>, can generate <a href="/blog/markdown-mirrors/">markdown mirrors</a> from final HTML when raw pages are thin or noisy, manages <a href="/docs/ai-crawlers/">AI crawler robots.txt rules</a>, patches <code>_headers</code> with Content-Signal directives, and validates the final output at build time. Same config, same features, whether you use Vite or Astro.
          </p>
        </section>

        <section className="features">
          <div className="feature">
            <h2>llms.txt generation</h2>
            <p>Auto-generate an llms.txt file following the <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a> spec, inject the homepage discovery link automatically, and optionally emit <code>llms-full.txt</code> with inlined same-site markdown context.</p>
          </div>
          <div className="feature">
            <h2>JSON-LD structured data</h2>
            <p>Inject schema.org JSON-LD into every page with XSS-safe serialization. Use 6 built-in presets for common types or bring your own custom schemas.</p>
          </div>
          <div className="feature">
            <h2>AI crawler management</h2>
            <p>Allow or block AI crawlers like GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and CCBot with idempotent robots.txt patching that will not break your existing rules.</p>
          </div>
          <div className="feature">
            <h2>Markdown mirrors</h2>
            <p>Optionally generate a clean <code>.md</code> companion for built HTML pages when fetch-based agents need a better path than the raw HTML. Useful for thin or noisy output. If your HTML already ships substantial content, keep HTML as the primary fetch target. <a href="/blog/when-markdown-mirrors-help/">Read when mirrors help and when they do not</a>.</p>
          </div>
          <div className="feature">
            <h2>Content-Signal headers</h2>
            <p>Patch or generate a host-friendly <code>_headers</code> file with <code>Content-Signal</code> directives for platforms like Cloudflare Pages and Netlify.</p>
          </div>
          <div className="feature">
            <h2>Final-output validation</h2>
            <p>Catch missing required fields, incomplete schema.org schemas, thin client-shell HTML, broken markdown alternate links, missing llms mirror coverage, AI crawler conflicts, and malformed llms files before you deploy.</p>
          </div>
        </section>

        <section className="checker-cta">
          <div className="checker-cta-card">
            <h2>Check your website before you ship it</h2>
            <p>
              Run the built-in website checker to inspect any public homepage for llms.txt, JSON-LD, markdown mirrors, robots.txt, sitemap discovery, canonical tags, and thin-HTML issues. It follows at most one same-origin link, does not invent a score, and tells you exactly what is missing.
            </p>
            <a className="checker-cta-link" href="/checker/">Open the website checker</a>
          </div>
        </section>

        <section className="presets">
          <h2>Schema.org presets</h2>
          <p className="presets-description">Type-safe builders for common structured data types. Apply globally or per-page.</p>
          <div className="preset-list">
            <span className="preset">webSite</span>
            <span className="preset">organization</span>
            <span className="preset">article</span>
            <span className="preset">faqPage</span>
            <span className="preset">product</span>
            <span className="preset">offer</span>
          </div>
        </section>

        <section className="example">
          <div className="fw-tabs">
            <button className={fw === 'vite' ? 'fw-tab active' : 'fw-tab'} onClick={() => setFw('vite')}>Vite</button>
            <button className={fw === 'astro' ? 'fw-tab active' : 'fw-tab'} onClick={() => setFw('astro')}>Astro</button>
          </div>
          <h2>Add to {configFiles[fw]}</h2>
          <CodeBlock code={examples[fw]} />
        </section>

        <section className="output">
          <h2>Build output from this website</h2>
          <p className="output-note">This is a recent build output from agentmarkup.dev with <code>@agentmarkup/vite</code>. The exact page and entry counts change as the docs site grows.</p>
          <img
            src="/agentmarkup-build-output.webp"
            alt="Terminal output from a recent agentmarkup.dev build showing llms.txt generation, JSON-LD injection, markdown page generation, Content-Signal headers, markdown canonical headers, and a clean validation report"
            className="output-screenshot"
            width="974"
            height="534"
            loading="lazy"
          />
        </section>

        <section className="packages">
          <h2>All packages</h2>
          <div className="package-grid">
            <div className="package-card">
              <h3><a href="https://www.npmjs.com/package/@agentmarkup/vite" target="_blank" rel="noopener noreferrer">@agentmarkup/vite</a></h3>
              <p className="package-desc">Vite plugin. Works with React, Vue, Svelte, or plain HTML.</p>
            </div>
            <div className="package-card">
              <h3><a href="https://www.npmjs.com/package/@agentmarkup/astro" target="_blank" rel="noopener noreferrer">@agentmarkup/astro</a></h3>
              <p className="package-desc">Astro integration. Works with any Astro project.</p>
            </div>
            <div className="package-card">
              <h3><a href="https://www.npmjs.com/package/@agentmarkup/core" target="_blank" rel="noopener noreferrer">@agentmarkup/core</a></h3>
              <p className="package-desc">Framework-agnostic generators and validators for custom build pipelines.</p>
            </div>
          </div>
        </section>

        <section className="use-cases">
          <h2>Use cases</h2>
          <div className="blog-list">
            <a href="/blog/ecommerce-llm-optimization/" className="blog-card">
              <h3>E-commerce</h3>
              <p>Make your products visible in AI shopping recommendations. Product schema, llms.txt catalogs, and crawler access so ChatGPT and Perplexity can cite your store.</p>
            </a>
            <a href="/blog/brand-awareness-ai/" className="blog-card">
              <h3>Brand awareness</h3>
              <p>Get your brand mentioned in AI conversations. Organization schema, FAQ markup, and clear positioning so AI systems accurately represent what you do.</p>
            </a>
            <a href="/blog/json-ld-structured-data-guide/" className="blog-card">
              <h3>Content websites</h3>
              <p>Power Google rich results and AI citations with Article, FAQ, and WebSite schemas. Build-time validation catches broken markup before it goes live.</p>
            </a>
          </div>
        </section>

        <section className="faq">
          <h2>Frequently asked questions</h2>

          <details>
            <summary>What does agentmarkup actually do?</summary>
            <p>It adds machine-readable build output: an <code>llms.txt</code> file, optional <code>llms-full.txt</code> context, the homepage <code>llms.txt</code> discovery link, <code>&lt;script type="application/ld+json"&gt;</code> tags with structured data, optional markdown mirrors for built pages, <code>robots.txt</code> rules for AI crawlers, and optional <code>_headers</code> entries with Content-Signal plus markdown-canonical directives. It also validates the final output and warns you about thin HTML, schema issues, broken markdown discovery, and crawler conflicts.</p>
          </details>

          <details>
            <summary>Does this improve my search rankings?</summary>
            <p>JSON-LD structured data is proven to power Google rich results (star ratings, FAQ dropdowns, product cards). llms.txt is a newer proposal and not yet consumed by all AI systems. agentmarkup does not promise rankings or traffic. It gives you the tools to make your site machine-readable.</p>
          </details>

          <details>
            <summary>Is llms.txt a standard?</summary>
            <p>It is a proposal from <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a>, not an official standard. The format is simple, the cost of generating it is near zero, and the structured data features provide proven value regardless.</p>
          </details>

          <details>
            <summary>Is the config the same for Vite and Astro?</summary>
            <p>Yes. The configuration object is identical. The only difference is the import path (<code>@agentmarkup/vite</code> vs <code>@agentmarkup/astro</code>) and where you put it (<code>plugins</code> in Vite, <code>integrations</code> in Astro). Both adapters use the same core engine under the hood.</p>
          </details>

          <details>
            <summary>What is @agentmarkup/core for?</summary>
            <p>The core package contains the generators and validators without any framework binding. Use it if you have a custom build script, a prerender pipeline, or a framework we do not have an adapter for yet. The Vite and Astro packages use core internally.</p>
          </details>

          <details>
            <summary>Does it add any runtime JavaScript?</summary>
            <p>No. Everything happens at build time. The plugin runs during your Vite or Astro build and outputs static files. Zero JavaScript is shipped to the browser.</p>
          </details>

          <details>
            <summary>Do I need markdown mirrors on every page?</summary>
            <p>No. They are most useful when the raw HTML is thin, noisy, or heavily client-rendered. If your pages already serve substantial HTML, keep HTML as the primary fetch target and treat markdown mirrors as optional extra coverage.</p>
          </details>

          <details>
            <summary>Can I use my own JSON-LD schemas instead of presets?</summary>
            <p>Yes. Pass any object with an <code>@type</code> field. agentmarkup automatically adds the <code>@context</code>, escapes the output for XSS safety, and validates that the <code>@type</code> is present.</p>
          </details>

          <details>
            <summary>Will this break my existing robots.txt?</summary>
            <p>No. The plugin uses marker comments to identify its own section. It patches your existing robots.txt without touching your other rules. On every build, it updates only the section between the markers.</p>
          </details>
        </section>
      </main>
    </>
  )
}

export default Home
