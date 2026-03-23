import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function EcommerceLlmOptimization() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="8 min read" />
        <h1>Why LLM-optimized e-commerce websites sell more</h1>
        <p className="doc-intro">
          When a shopper asks ChatGPT "what is the best leather wallet under $100" or Perplexity "where can I buy organic coffee beans," the AI pulls its answer from the web. If your product pages have structured data, your store gets cited. If they do not, you are invisible. Here is how to fix that.
        </p>

        <section>
          <h2>How AI is changing product discovery</h2>
          <p>
            Shoppers are increasingly skipping Google and going straight to AI. A 2025 survey found that 37% of US online shoppers have used an AI chatbot to research products before buying. By 2026, that number is higher.
          </p>
          <p>
            When someone asks an AI "best running shoes for flat feet" or "noise-cancelling headphones under $200," the AI does not show a list of links. It gives a direct answer. It names specific products, cites specific stores, and sometimes includes prices and availability. The stores it cites are the ones whose product data is machine-readable.
          </p>
          <p>
            This is not hypothetical. Try asking ChatGPT or Perplexity about a product category. The answers consistently favor websites with clear structured data over those without it.
          </p>
        </section>

        <section>
          <h2>What makes an e-commerce site LLM-ready</h2>
          <p>
            Three things determine whether AI systems can understand and recommend your products:
          </p>
          <ol>
            <li>
              <strong>Product structured data (JSON-LD).</strong> Each product page needs a Product schema with name, description, price, currency, availability, SKU, brand, and images. This is the single most impactful thing you can do. Without it, AI has to guess what your product is from HTML soup.
            </li>
            <li>
              <strong>Site overview (llms.txt).</strong> An llms.txt file tells AI systems what your store is, what categories you have, and where to find key pages. Think of it as a product catalog for machines.
            </li>
            <li>
              <strong>Crawler access (robots.txt).</strong> If your robots.txt blocks GPTBot or PerplexityBot, your products will not appear in AI answers. Many e-commerce sites accidentally block AI crawlers through overly broad disallow rules.
            </li>
          </ol>
        </section>

        <section>
          <h2>The structured data that matters for e-commerce</h2>

          <h3>Product schema</h3>
          <p>The most important schema for any online store. Include every field you have data for:</p>
          <CodeBlock code={`{
  "@type": "Product",
  "name": "Classic Leather Bifold Wallet",
  "description": "Full-grain leather bifold wallet with RFID blocking.",
  "image": "https://myshop.com/images/wallet.jpg",
  "sku": "WALLET-001",
  "brand": { "@type": "Brand", "name": "My Shop" },
  "offers": {
    "@type": "Offer",
    "price": "89.00",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "url": "https://myshop.com/products/classic-wallet"
  }
}`} />

          <h3>FAQ schema on product pages</h3>
          <p>If your product pages have a Q&A section, mark it up as FAQPage. This gives AI systems direct answers about your products (sizing, shipping, materials) and powers Google's FAQ rich result.</p>

          <h3>Organization schema</h3>
          <p>Tell AI systems who you are. Name, logo, URL, and social profiles. This helps AI associate your products with your brand when generating answers.</p>

          <h3>BreadcrumbList</h3>
          <p>Category hierarchy helps AI understand where a product fits. "Home &gt; Accessories &gt; Wallets &gt; Classic Leather Bifold" gives context that "Classic Leather Bifold" alone does not.</p>
        </section>

        <section>
          <h2>Real example: what AI sees vs what it misses</h2>
          <p>
            Consider two wallet stores. Store A has Product schema on every page. Store B has none.
          </p>
          <p>
            When someone asks Perplexity "best leather wallets under $100," Store A's wallet appears with name, price, and a direct link. Store B's wallet exists on the web but Perplexity has no structured way to know it is a wallet, what it costs, or whether it is in stock. Store A gets the citation. Store B does not.
          </p>
          <p>
            The same content exists on both sites. The difference is whether a machine can parse it.
          </p>
        </section>

        <section>
          <h2>llms.txt for product catalogs</h2>
          <p>
            An llms.txt file gives AI a high-level map of your store. Structure it by category:
          </p>
          <CodeBlock code={`# My Shop

> Handcrafted leather goods since 2015.

## Categories

- [Wallets](https://myshop.com/wallets): Full-grain leather wallets
- [Bags](https://myshop.com/bags): Messenger bags and backpacks
- [Belts](https://myshop.com/belts): Dress and casual belts

## Popular Products

- [Classic Bifold](https://myshop.com/products/classic-bifold): Best-selling wallet, $89
- [Messenger Bag](https://myshop.com/products/messenger): Leather messenger bag, $249

## Support

- [Shipping](https://myshop.com/shipping): Free shipping over $50
- [Returns](https://myshop.com/returns): 30-day return policy`} />
          <p>
            This takes five minutes to configure and gives AI systems everything they need to understand and recommend your store.
          </p>
        </section>

        <section>
          <h2>Common e-commerce mistakes</h2>
          <ul>
            <li><strong>Product pages with no structured data.</strong> The most common issue. If AI cannot read your price and availability, it cannot recommend you.</li>
            <li><strong>Blocking AI crawlers accidentally.</strong> Many e-commerce platforms ship with broad <code>Disallow</code> rules that block AI bots along with everything else.</li>
            <li><strong>Missing prices in schema.</strong> Some stores add Product schema but omit the Offer with price. Without a price, the product is less useful to AI answering comparison questions.</li>
            <li><strong>No availability data.</strong> If your product is out of stock, your schema should say so. AI systems that recommend out-of-stock products lose user trust and stop citing those sources.</li>
            <li><strong>Duplicate product schemas.</strong> Multiple conflicting Product schemas on one page confuse search engines. One product, one schema.</li>
          </ul>
        </section>

        <section>
          <h2>Automating it with agentmarkup</h2>
          <p>
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a> generates llms.txt, injects Product/Organization/FAQ JSON-LD, and manages AI crawler rules at build time. For e-commerce sites on Vite, Astro, or Next.js, it handles the entire machine-readability stack in one adapter.
          </p>
          <CodeBlock code={`agentmarkup({
  site: 'https://myshop.com',
  name: 'My Shop',
  globalSchemas: [
    { preset: 'organization', name: 'My Shop', url: 'https://myshop.com', logo: '/logo.png' },
  ],
  pages: [
    {
      path: '/products/classic-wallet',
      schemas: [{
        preset: 'product',
        name: 'Classic Leather Bifold Wallet',
        url: 'https://myshop.com/products/classic-wallet',
        description: 'Full-grain leather bifold wallet with RFID blocking.',
        sku: 'WALLET-001',
        brand: 'My Shop',
        offers: [{ price: 89, priceCurrency: 'USD', availability: 'InStock' }],
      }],
    },
  ],
  aiCrawlers: { GPTBot: 'allow', PerplexityBot: 'allow', ClaudeBot: 'allow' },
})`} />
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            AI-driven product discovery is not coming. It is here. Shoppers are asking AI for product recommendations today. The stores that show up in those answers are the ones with machine-readable product data. JSON-LD, llms.txt, and proper crawler access are not SEO tricks. They are the infrastructure that makes your products visible in a new discovery channel.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="ecommerce-llm-optimization" />
    </main>
  )
}

export default EcommerceLlmOptimization
