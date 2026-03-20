import './App.css'
import CodeBlock from './CodeBlock'

const usageCode = `import { defineConfig } from 'vite'
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  plugins: [
    agentmarkup({
      site: 'https://myshop.com',
      name: 'My Shop',
      description: 'Handcrafted leather goods.',
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

const buildOutput = `@agentmarkup/vite v0.1.0

✓ llms.txt generated (1 entry, 1 section)
✓ JSON-LD injected into 3 pages
✓ robots.txt patched (3 AI crawlers configured)

Checks:
✓ All JSON-LD schemas have required fields
✓ AI crawlers not blocked by existing robots.txt
⚠ /about: No structured data configured for this page`

function App() {
  return (
    <div className="container">
      <header>
        <h1>agentmarkup - Vite plugin for machine-readable websites</h1>
        <p className="tagline">Generate llms.txt, inject schema.org JSON-LD structured data, manage AI crawler robots.txt rules, and validate everything at build time.</p>
        <p className="subtitle">Zero runtime cost. One plugin. Type-safe TypeScript API.</p>
        <pre className="install-hero"><code>pnpm add -D @agentmarkup/vite</code></pre>
      </header>

      <main>
        <section className="about">
          <p>
            agentmarkup is an open-source Vite plugin that makes your website machine-readable for LLMs and AI agents. It combines llms.txt generation, JSON-LD structured data injection, AI crawler management, and build-time validation in a single package, so you do not need separate tools for each.
          </p>
        </section>

        <section className="features">
          <div className="feature">
            <h2>llms.txt generation</h2>
            <p>Auto-generate an llms.txt file following the <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a> spec. Define your site name, description, sections, and page entries, and the plugin outputs a spec-compliant file at build time.</p>
          </div>
          <div className="feature">
            <h2>JSON-LD structured data injection</h2>
            <p>Inject schema.org JSON-LD into every page with XSS-safe serialization. Use 6 built-in presets for common types or bring your own custom schemas.</p>
          </div>
          <div className="feature">
            <h2>AI crawler robots.txt management</h2>
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
          <h2>Usage in vite.config.ts</h2>
          <CodeBlock code={usageCode} />
        </section>

        <section className="output">
          <h2>Build output</h2>
          <CodeBlock code={buildOutput} />
        </section>

      </main>

      <footer>
        <div className="footer-links">
          <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://www.npmjs.com/package/@agentmarkup/vite" target="_blank" rel="noopener noreferrer">npm</a>
        </div>
        <p className="credit">
          &copy; 2026 <a href="https://www.cochinescu.com" target="_blank" rel="noopener noreferrer">Sebastian Cochinescu</a>. MIT License.
        </p>
        <p className="credit">
          Used in production on <a href="https://animafelix.com" target="_blank" rel="noopener noreferrer">Anima Felix</a>.
        </p>
      </footer>
    </div>
  )
}

export default App
