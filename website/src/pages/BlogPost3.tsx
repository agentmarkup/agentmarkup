import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function JsonLdGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="10 min read" />
        <h1>JSON-LD structured data: the complete guide for web developers</h1>
        <p className="doc-intro">
          JSON-LD is the format Google, Bing, and AI systems use to understand your pages. This guide covers what it is, why it matters, which schema types to use, and how to add it to your site without shipping broken markup.
        </p>

        <section>
          <h2>What is JSON-LD?</h2>
          <p>
            JSON-LD (JavaScript Object Notation for Linked Data) is a way to embed structured data in your HTML pages. It lives inside a <code>&lt;script type="application/ld+json"&gt;</code> tag in your page's <code>&lt;head&gt;</code> and describes what the page represents using the <a href="https://schema.org" target="_blank" rel="noopener noreferrer">schema.org</a> vocabulary.
          </p>
          <p>
            Unlike microdata or RDFa, JSON-LD does not require changes to your visible HTML. You add a single script tag and search engines read it separately from your page content. This makes it easier to maintain, less error-prone, and the format Google explicitly recommends.
          </p>
          <CodeBlock code={`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Acme Corp",
  "url": "https://acme.com",
  "logo": "https://acme.com/logo.png"
}
</script>`} />
        </section>

        <section>
          <h2>Why JSON-LD matters</h2>
          <p>
            Without structured data, search engines guess what your page is about from HTML content. With JSON-LD, you tell them explicitly. This enables:
          </p>
          <ul>
            <li><strong>Google rich results</strong> - star ratings, FAQ accordions, product cards, recipe cards, event listings. These are powered entirely by structured data.</li>
            <li><strong>Knowledge panels</strong> - the info boxes that appear for organizations, people, and products in search results.</li>
            <li><strong>AI understanding</strong> - LLMs and AI agents like ChatGPT and Perplexity use structured data to understand page content more accurately.</li>
            <li><strong>Voice assistants</strong> - Google Assistant and Siri use structured data to answer spoken queries.</li>
          </ul>
          <p>
            Google's own documentation states that pages with valid structured data are eligible for rich results that pages without it cannot receive.
          </p>
        </section>

        <section>
          <h2>JSON-LD vs microdata vs RDFa</h2>
          <p>
            All three formats encode the same schema.org vocabulary. The difference is where they live:
          </p>
          <ul>
            <li><strong>JSON-LD</strong> - separate script tag in the head. No changes to visible HTML. Google's recommended format.</li>
            <li><strong>Microdata</strong> - attributes (<code>itemscope</code>, <code>itemprop</code>) added directly to HTML elements. Tightly coupled to markup. Harder to maintain.</li>
            <li><strong>RDFa</strong> - similar to microdata but uses different attributes (<code>vocab</code>, <code>property</code>). More flexible but more complex.</li>
          </ul>
          <p>
            For new projects, JSON-LD is the clear choice. It is easier to generate programmatically, easier to validate, and easier to maintain because it is decoupled from your HTML structure.
          </p>
        </section>

        <section>
          <h2>The most important schema types</h2>
          <p>
            Schema.org defines hundreds of types. In practice, a handful cover the vast majority of use cases:
          </p>

          <h3>WebSite</h3>
          <p>Add to every page. Tells search engines this is a website with a name, URL, and optional search action (for sitelinks search boxes).</p>
          <CodeBlock code={`{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "My Shop",
  "url": "https://myshop.com"
}`} />

          <h3>Organization</h3>
          <p>Add to every page or your homepage. Defines your brand with name, logo, URL, and social profiles.</p>

          <h3>Article / BlogPosting</h3>
          <p>Add to blog posts and content pages. Include headline, author, publish date, and optionally an image. Powers the article rich result in Google.</p>

          <h3>Product</h3>
          <p>Add to product pages. Include name, description, image, price, availability, and reviews. Powers the product card in Google Shopping and search results.</p>

          <h3>FAQPage</h3>
          <p>Add to pages with question/answer content. Powers the FAQ accordion that expands directly in search results, giving you significantly more SERP real estate.</p>

          <h3>BreadcrumbList</h3>
          <p>Add to pages with hierarchical navigation. Shows the breadcrumb trail in search results (Home &gt; Category &gt; Page).</p>
        </section>

        <section>
          <h2>Common mistakes</h2>
          <p>
            Most broken structured data is broken silently. Your pages look fine but search engines ignore the markup. Here are the most common problems:
          </p>
          <ul>
            <li><strong>Missing required fields.</strong> A Product without <code>name</code> or an Article without <code>headline</code> is invalid and will be ignored.</li>
            <li><strong>XSS vulnerabilities.</strong> If your JSON-LD contains user-generated content (product names, descriptions), unescaped <code>&lt;</code> or <code>&gt;</code> characters can break your HTML or create security holes.</li>
            <li><strong>Wrong @type.</strong> Using <code>BlogPost</code> instead of <code>BlogPosting</code>, or <code>FAQ</code> instead of <code>FAQPage</code>. Schema.org types are specific.</li>
            <li><strong>Duplicate schemas.</strong> Multiple conflicting schemas of the same type on one page confuse search engines.</li>
            <li><strong>Missing @context.</strong> Every JSON-LD block needs <code>"@context": "https://schema.org"</code>. Without it, the data is meaningless.</li>
          </ul>
        </section>

        <section>
          <h2>Validating your structured data</h2>
          <p>
            Google provides two tools for checking structured data:
          </p>
          <ul>
            <li><a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">Rich Results Test</a> - checks if your page is eligible for rich results</li>
            <li><a href="https://validator.schema.org" target="_blank" rel="noopener noreferrer">Schema Markup Validator</a> - validates your JSON-LD against the schema.org spec</li>
          </ul>
          <p>
            The problem with both tools: they check after deployment. If your structured data is broken, you do not find out until someone tests a live URL. Build-time validation catches these problems before they reach production.
          </p>
          <p>
            Tools like <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a> validate required fields, check for common mistakes, and warn about incomplete schemas during your Vite or Astro build. See the <a href="/docs/json-ld/">JSON-LD documentation</a> for details.
          </p>
        </section>

        <section>
          <h2>Adding JSON-LD to Vite and Astro sites</h2>
          <p>
            You can add JSON-LD manually by writing script tags in your HTML. For sites with multiple pages and schema types, a build-time approach is more maintainable:
          </p>
          <CodeBlock code={`// vite.config.ts or astro.config.mjs
agentmarkup({
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
})`} />
          <p>
            Global schemas are injected into every page. Per-page schemas are injected only on matching paths. All output is XSS-safe and validated at build time.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            JSON-LD is not optional for modern websites. It powers rich results, helps AI systems understand your content, and is the foundation of machine-readable web pages. The format is simple, the tooling is mature, and the upside is measurable. If you are not using it, you are leaving search visibility on the table.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="json-ld-structured-data-guide" />
    </main>
  )
}

export default JsonLdGuide
