import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function MarkdownPages() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="7 min read" />
        <h1>Markdown mirrors for every page: why your website needs them and how they compare to Cloudflare's approach</h1>
        <p className="doc-intro">
          When an AI agent visits your website, it gets HTML. Navigation menus, cookie banners, analytics scripts, layout divs. The actual content is buried in noise. Markdown mirrors solve this by giving AI a clean, readable version of every page, generated automatically at build time.
        </p>

        <section>
          <h2>The problem: AI cannot read your website well</h2>
          <p>
            LLMs are surprisingly bad at extracting content from raw HTML. A typical web page is 20% content and 80% markup, navigation, scripts, and layout. When GPTBot or ClaudeBot crawls your site, it has to guess which parts matter and which are noise.
          </p>
          <p>
            This is why AI answers sometimes get your content wrong, miss key details, or ignore pages entirely. The HTML is technically accessible, but the signal-to-noise ratio is terrible.
          </p>
        </section>

        <section>
          <h2>What are markdown mirrors?</h2>
          <p>
            A markdown mirror is a <code>.md</code> file that contains the same content as your HTML page, but stripped of all layout, navigation, and scripts. Just the content, in clean markdown format.
          </p>
          <p>
            For example, <code>/blog/my-post/index.html</code> gets a companion file at <code>/blog/my-post.md</code>. An AI agent can fetch the markdown version directly instead of parsing the HTML.
          </p>
          <p>
            Your pages also get a <code>&lt;link rel="alternate" type="text/markdown"&gt;</code> tag in the HTML head, so crawlers can discover the markdown version automatically.
          </p>
        </section>

        <section>
          <h2>How agentmarkup generates markdown mirrors</h2>
          <p>
            Enable the feature in your config and it runs at build time on every HTML page in your output:
          </p>
          <CodeBlock code={`// vite.config.ts or astro.config.mjs
agentmarkup({
  site: 'https://example.com',
  name: 'My Site',
  markdownPages: {
    enabled: true,
  },
})`} />
          <p>
            The converter:
          </p>
          <ol>
            <li>Extracts the page title, meta description, and canonical URL from the HTML head</li>
            <li>Finds the main content area (<code>&lt;main&gt;</code>, <code>&lt;article&gt;</code>, or <code>&lt;body&gt;</code>)</li>
            <li>Strips navigation, headers, footers, sidebars, scripts, styles, SVGs, and forms</li>
            <li>Converts headings, lists, links, bold, italic, code, and blockquotes to markdown syntax</li>
            <li>Preserves code blocks intact</li>
            <li>Normalizes whitespace and deduplicates the page title</li>
            <li>Injects a <code>&lt;link rel="alternate"&gt;</code> tag into the HTML for discovery</li>
          </ol>
          <p>
            The result is a clean markdown file that an AI can read in seconds.
          </p>
        </section>

        <section>
          <h2>Cloudflare's approach: runtime readability extraction</h2>
          <p>
            Cloudflare offers a readability extraction feature that strips HTML to readable content at request time. It is based on Mozilla's Readability library (the same engine behind Firefox's Reader View) and runs on Cloudflare's edge network.
          </p>
          <p>
            The key difference: Cloudflare's approach is runtime. It processes pages on every request. You do not control the output. The extraction algorithm decides what is "content" and what is "noise" using heuristics.
          </p>
        </section>

        <section>
          <h2>Build-time vs runtime: why it matters</h2>
          <table className="doc-table">
            <thead>
              <tr><th></th><th>agentmarkup (build-time)</th><th>Cloudflare (runtime)</th></tr>
            </thead>
            <tbody>
              <tr><td>When it runs</td><td>Once, during build</td><td>Every request</td></tr>
              <tr><td>Output control</td><td>You see the .md files in your build output</td><td>Opaque, algorithm decides</td></tr>
              <tr><td>Consistency</td><td>Deterministic, same output every build</td><td>May vary with algorithm updates</td></tr>
              <tr><td>Performance cost</td><td>Zero runtime cost</td><td>Added latency per request</td></tr>
              <tr><td>Works with SPAs</td><td>Yes, uses noscript fallback or pre-rendered HTML</td><td>Depends on SSR availability</td></tr>
              <tr><td>Discovery</td><td>Link tag in HTML head + static .md URL</td><td>Special URL parameter or header</td></tr>
              <tr><td>Vendor lock-in</td><td>None, output is static files</td><td>Requires Cloudflare</td></tr>
              <tr><td>Customization</td><td>Choose which pages, preserve existing .md files</td><td>All or nothing</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Why build-time is better for your own content</h2>
          <p>
            Cloudflare's runtime extraction makes sense for consuming other people's content (like a reader mode). For your own website, build-time generation is better because:
          </p>
          <ul>
            <li><strong>You control the output.</strong> If the markdown is wrong, you can debug it. You see the actual .md files in your build directory.</li>
            <li><strong>It works with client-rendered apps.</strong> agentmarkup checks for noscript fallback content in SPAs and uses it when the rendered body is thin. Runtime extractors often get empty content from JavaScript-rendered pages.</li>
            <li><strong>No vendor dependency.</strong> The markdown files are static. Deploy them anywhere. They work on Cloudflare Pages, Netlify, Vercel, S3, or any static host.</li>
            <li><strong>Integrated with the rest of the stack.</strong> Markdown mirrors work alongside llms.txt (which can reference them), JSON-LD (which describes the page), and robots.txt (which controls access). One config, one build, everything consistent.</li>
          </ul>
        </section>

        <section>
          <h2>What the output looks like</h2>
          <p>
            For a blog post with a title, description, headings, and paragraphs, the generated markdown looks like:
          </p>
          <CodeBlock code={`# Why llms.txt matters

> LLMs answer questions by synthesizing web content. llms.txt gives them a structured overview.

Source: https://example.com/blog/why-llms-txt-matters/

## The shift from search engines to AI answers

For two decades, the path to online visibility was clear: optimize for Google...

## What is llms.txt?

llms.txt is a proposed standard that gives LLMs a structured overview of your website...`} />
          <p>
            Clean, readable, no HTML artifacts. An AI agent reading this file understands the page instantly.
          </p>
        </section>

        <section>
          <h2>Getting started</h2>
          <p>
            Add <code>markdownPages: {'{ enabled: true }'}</code> to your
            agentmarkup config. On the next build, every HTML page in your
            output gets a companion .md file. When markdown mirrors are enabled,
            same-site page entries in <code>llms.txt</code> also default to the
            generated markdown URLs so cold agents discover the cleaner fetch
            path first. Check the <a href="/docs/llms-txt/">llms.txt guide</a>{' '}
            for the opt-out if you want HTML-first links instead.
          </p>
          <CodeBlock code={`pnpm add -D @agentmarkup/vite  # or @agentmarkup/astro`} />
        </section>
      </article>
      <BlogFooter currentSlug="markdown-mirrors" />
    </main>
  )
}

export default MarkdownPages
