import { useState } from 'react'
import './App.css'
import CodeBlock from './CodeBlock'

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
      aiCrawlers: { GPTBot: 'allow', ClaudeBot: 'allow' },
    }),
  ],
})`

type Framework = 'vite' | 'astro'

const installCommands: Record<Framework, string> = {
  vite: 'pnpm add -D @agentmarkup/vite',
  astro: 'pnpm add -D @agentmarkup/astro',
}

const buildOutputs: Record<Framework, string> = {
  vite: `@agentmarkup/vite

✓ llms.txt generated (1 entry, 1 section)
✓ JSON-LD injected into 3 pages
✓ robots.txt patched (3 AI crawlers configured)

Checks:
✓ All JSON-LD schemas have required fields
✓ AI crawlers not blocked by existing robots.txt
⚠ /about: No structured data configured for this page`,
  astro: `@agentmarkup/astro

✓ llms.txt generated (1 entry, 1 section)
✓ JSON-LD injected into 3 pages
✓ robots.txt patched (3 AI crawlers configured)

Checks:
✓ All JSON-LD schemas have required fields
✓ AI crawlers not blocked by existing robots.txt
⚠ /about: No structured data configured for this page`,
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

  return (
    <>
      <header>
        <h1>Make your website machine-readable for LLMs and AI agents</h1>
        <p className="tagline">Build-time llms.txt, JSON-LD structured data, AI crawler controls, and validation for Vite and Astro websites.</p>
        <p className="subtitle">Zero runtime cost. Type-safe. Open source.</p>

        <div className="fw-tabs-hero">
          <button className={fw === 'vite' ? 'fw-tab active' : 'fw-tab'} onClick={() => setFw('vite')}>Vite</button>
          <button className={fw === 'astro' ? 'fw-tab active' : 'fw-tab'} onClick={() => setFw('astro')}>Astro</button>
        </div>
        <pre className="install-hero"><code>{installCommands[fw]}</code></pre>
      </header>

      <main>
        <section className="about">
          <p>
            agentmarkup makes your website understandable by LLMs and AI agents. It generates <a href="/docs/llms-txt/">llms.txt</a> files, injects <a href="/docs/json-ld/">schema.org JSON-LD</a>, manages <a href="/docs/ai-crawlers/">AI crawler robots.txt rules</a>, and validates everything at build time. Same config, same features, whether you use Vite or Astro.
          </p>
        </section>

        <section className="features">
          <div className="feature">
            <h2>llms.txt generation</h2>
            <p>Auto-generate an llms.txt file following the <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a> spec. Define your site name, description, sections, and page entries, and the plugin outputs a spec-compliant file at build time.</p>
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
            <h2>Build-time validation</h2>
            <p>Catch missing required fields, incomplete schema.org schemas, AI crawler conflicts, and malformed llms.txt before you deploy, not in production.</p>
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
          <p className="output-note">This is the actual output from building agentmarkup.dev with <code>@agentmarkup/vite</code>.</p>
          <img
            src="/agentmarkup-build-output.webp"
            alt="agentmarkup build output showing llms.txt generated with 17 entries, JSON-LD injected into 13 pages, robots.txt patched with 5 AI crawlers configured, and no issues found"
            className="output-screenshot"
            width="880"
            height="424"
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
            <p>It adds three things to your build output: an <code>llms.txt</code> file that describes your site for LLMs, <code>&lt;script type="application/ld+json"&gt;</code> tags with structured data in your HTML, and <code>robots.txt</code> rules for AI crawlers. It also validates all of this at build time and warns you about problems.</p>
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
