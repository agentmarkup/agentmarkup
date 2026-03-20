import CodeBlock from '../CodeBlock'

const presetsExample = `agentmarkup({
  site: 'https://myshop.com',
  name: 'My Shop',
  globalSchemas: [
    { preset: 'webSite', name: 'My Shop', url: 'https://myshop.com' },
    { preset: 'organization', name: 'My Shop', url: 'https://myshop.com', logo: '/logo.png' },
  ],
  pages: [
    {
      path: '/faq',
      schemas: [{
        preset: 'faqPage',
        url: 'https://myshop.com/faq',
        questions: [
          { question: 'Do you ship internationally?', answer: 'Yes, to 50+ countries.' },
        ],
      }],
    },
  ],
})`

const customExample = `pages: [
  {
    path: '/products/wallets',
    schemas: [{
      '@type': 'Product',
      name: 'Classic Leather Wallet',
      description: 'Full-grain leather bifold wallet.',
      image: 'https://myshop.com/images/wallet.jpg',
      sku: 'WALLET-001',
      offers: {
        '@type': 'Offer',
        price: '89',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    }],
  },
]`

const outputExample = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"WebSite","name":"My Shop","url":"https://myshop.com"}
</script>`

function JsonLd() {
  return (
    <main>
      <article className="doc-page">
        <h1>How to add JSON-LD structured data to your Vite website</h1>
        <p className="doc-intro">
          JSON-LD (JavaScript Object Notation for Linked Data) is the format Google, Bing, and other search engines use to understand your page content. agentmarkup injects schema.org JSON-LD into your HTML pages at build time with XSS-safe serialization and type-safe presets.
        </p>

        <section>
          <h2>What is JSON-LD structured data?</h2>
          <p>
            Structured data tells search engines exactly what your page is about. Instead of guessing from HTML content, search engines read your JSON-LD and understand that a page is a Product with a price, an Article with a publish date, or an Organization with a logo.
          </p>
          <p>
            This powers rich results in Google Search, including star ratings, FAQ dropdowns, product cards, and knowledge panels. Without structured data, search engines can only guess at your page content.
          </p>
        </section>

        <section>
          <h2>Built-in schema.org presets</h2>
          <p>
            agentmarkup includes 6 type-safe presets for common structured data types. Each preset validates required fields at build time and generates spec-compliant JSON-LD.
          </p>
          <table className="doc-table">
            <thead>
              <tr><th>Preset</th><th>Schema type</th><th>Use case</th></tr>
            </thead>
            <tbody>
              <tr><td><code>webSite</code></td><td>WebSite</td><td>Site-level schema with optional search action</td></tr>
              <tr><td><code>organization</code></td><td>Organization</td><td>Company or brand identity</td></tr>
              <tr><td><code>article</code></td><td>Article</td><td>Blog posts, news, content pages</td></tr>
              <tr><td><code>faqPage</code></td><td>FAQPage</td><td>Question and answer pages</td></tr>
              <tr><td><code>product</code></td><td>Product</td><td>E-commerce product pages</td></tr>
              <tr><td><code>offer</code></td><td>Offer</td><td>Pricing and availability</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Using presets</h2>
          <p>
            Apply schemas globally (every page) or per-page. Global schemas like <code>webSite</code> and <code>organization</code> go in <code>globalSchemas</code>. Page-specific schemas go in <code>pages</code>.
          </p>
          <CodeBlock code={presetsExample} />
        </section>

        <section>
          <h2>Custom schemas</h2>
          <p>
            You can use any schema.org type by passing an object with an <code>@type</code> field. agentmarkup automatically adds the <code>@context</code> and handles serialization.
          </p>
          <CodeBlock code={customExample} />
        </section>

        <section>
          <h2>XSS-safe output</h2>
          <p>
            agentmarkup escapes dangerous characters (<code>&lt;</code>, <code>&gt;</code>, <code>&amp;</code>, <code>'</code>) to unicode escapes before injecting JSON-LD into HTML. This prevents XSS attacks through structured data injection.
          </p>
          <CodeBlock code={outputExample} />
        </section>

        <section>
          <h2>Build-time validation</h2>
          <p>
            Every schema is validated during build. Missing required fields produce errors. Missing recommended fields produce warnings. You see exactly what needs fixing in your terminal before deploying.
          </p>
          <ul>
            <li><strong>Required field errors:</strong> Product without <code>name</code>, Article without <code>headline</code></li>
            <li><strong>Recommended field warnings:</strong> Organization without <code>logo</code>, Product without <code>sku</code></li>
            <li><strong>Custom schema checks:</strong> Every custom schema must have an <code>@type</code> field</li>
          </ul>
          <p>
            Combined with <a href="/docs/llms-txt/">llms.txt generation</a> and <a href="/docs/ai-crawlers/">AI crawler management</a>, this gives your website complete machine-readability coverage.
          </p>
        </section>
        <section className="faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Do I need JSON-LD if I already have meta tags?</summary>
            <p>Yes. Meta tags (title, description) help search engines understand a single page. JSON-LD tells them what kind of thing the page represents (a product, an article, an FAQ) with structured fields they can use for rich results.</p>
          </details>
          <details>
            <summary>Can I add multiple schemas to one page?</summary>
            <p>Yes. Use the <code>pages</code> config to add multiple schemas per path. Each schema generates its own <code>&lt;script type="application/ld+json"&gt;</code> tag. Global schemas are also added to every page.</p>
          </details>
          <details>
            <summary>What if I need a schema type that is not a preset?</summary>
            <p>Pass any object with an <code>@type</code> field. agentmarkup will add <code>@context</code> automatically and serialize it safely. Presets just save you from remembering required fields.</p>
          </details>
        </section>
      </article>
    </main>
  )
}

export default JsonLd
