import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function MarkdownPages() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="7 min read" />
        <h1>Build-time markdown mirrors for agent readability: how they compare to Cloudflare&apos;s approach</h1>
        <p className="doc-intro">
          When an AI agent visits your website, it gets HTML. On some sites
          that is fine. On JS-heavy or layout-heavy pages, the content is buried
          in noise. Build-time markdown mirrors can give agents a cleaner fetch
          target without changing the canonical HTML page.
        </p>

        <section>
          <h2>Not every site needs a markdown mirror</h2>
          <p>
            If your pages already ship substantial, well-structured HTML, the
            raw page may already be a good enough fetch target for agents.
            Markdown mirrors are most useful when the raw HTML is thin, heavily
            templated, or dominated by layout chrome.
          </p>
          <p>
            That is the more honest framing for this feature: markdown mirrors
            are an optional machine-facing artifact for the pages that benefit
            from them, not a blanket rule that every site should publish a
            public <code>.md</code> companion for every page.
          </p>
        </section>

        <section>
          <h2>The problem: some HTML is a bad fetch target</h2>
          <p>
            Many agents can extract useful text from HTML, but the quality of
            the result still depends on what your raw response looks like. A
            typical web page can be heavy with navigation, cookie banners,
            analytics tags, scripts, and layout wrappers that have nothing to
            do with the main body content.
          </p>
          <p>
            When the raw HTML is mostly shell and very little body content,
            fetch-based agents either miss the important text or have to guess
            too much. That is the case markdown mirrors try to fix.
          </p>
        </section>

        <section>
          <h2>What are markdown mirrors?</h2>
          <p>
            A markdown mirror is a <code>.md</code> file that contains the same
            content as your HTML page, but stripped of layout, navigation, and
            scripts. Just the content, in clean markdown format.
          </p>
          <p>
            For example, <code>/blog/my-post/index.html</code> gets a companion
            file at <code>/blog/my-post.md</code>. An AI agent can fetch the
            markdown version directly instead of parsing the HTML.
          </p>
          <p>
            Your pages also get a
            <code>&lt;link rel=&quot;alternate&quot; type=&quot;text/markdown&quot;&gt;</code>{' '}
            tag in the HTML head, so crawlers can discover the markdown version
            automatically when you enable the feature.
          </p>
        </section>

        <section>
          <h2>How agentmarkup generates markdown mirrors</h2>
          <p>
            Enable the feature in your config and it runs at build time on
            every HTML page in your output:
          </p>
          <CodeBlock code={`// shared agentmarkup config
const agentmarkupConfig = {
  site: 'https://example.com',
  name: 'My Site',
  markdownPages: {
    enabled: true,
  },
}`} />
          <p>The converter:</p>
          <ol>
            <li>Extracts the page title, meta description, and canonical URL from the HTML head</li>
            <li>Finds the main content area (<code>&lt;main&gt;</code>, <code>&lt;article&gt;</code>, or <code>&lt;body&gt;</code>)</li>
            <li>Strips navigation, headers, footers, sidebars, scripts, styles, SVGs, and forms</li>
            <li>Converts headings, lists, links, bold, italic, code, and blockquotes to markdown syntax</li>
            <li>Preserves code blocks intact</li>
            <li>Normalizes whitespace and deduplicates the page title</li>
            <li>Injects a <code>&lt;link rel=&quot;alternate&quot;&gt;</code> tag into the HTML for discovery</li>
          </ol>
          <p>
            The result is a clean markdown file that an agent can read without
            wading through layout chrome.
          </p>
        </section>

        <section>
          <h2>Cloudflare&apos;s approach: runtime readability extraction</h2>
          <p>
            Cloudflare offers a readability extraction feature that strips HTML
            to readable content at request time. It is based on Mozilla&apos;s
            Readability library and runs on Cloudflare&apos;s edge network.
          </p>
          <p>
            The key difference is runtime versus build time. Cloudflare
            processes pages on every request. You do not control the exact
            output. The extraction algorithm decides what is content and what is
            noise using heuristics.
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
          <h2>Why build-time can be a good fit for your own content</h2>
          <p>
            Cloudflare&apos;s runtime extraction makes sense for consuming other
            people&apos;s content, like a reader mode. For your own website,
            build-time generation can be a better fit because:
          </p>
          <ul>
            <li><strong>You control the output.</strong> If the markdown is wrong, you can debug it. You see the actual .md files in your build directory.</li>
            <li><strong>It works with client-rendered apps.</strong> agentmarkup checks for noscript fallback content in SPAs and uses it when the rendered body is thin. Runtime extractors often get empty content from JavaScript-rendered pages.</li>
            <li><strong>No vendor dependency.</strong> The markdown files are static. Deploy them anywhere. They work on Cloudflare Pages, Netlify, Vercel, S3, or any static host.</li>
            <li><strong>Integrated with the rest of the stack.</strong> Markdown mirrors work alongside llms.txt, JSON-LD, and robots.txt. One config, one build, everything consistent.</li>
          </ul>
        </section>

        <section>
          <h2>How agentmarkup reduces the downside</h2>
          <p>
            Public markdown mirrors do create tradeoffs. The main risks are
            duplicate fetches, indexing ambiguity, and output drift if the
            markdown becomes a second source of truth.
          </p>
          <p>
            agentmarkup tries to keep those risks contained by generating the
            mirrors from final built HTML, preserving HTML as the canonical
            page, and writing canonical headers from each <code>.md</code> file
            back to the HTML route. If your raw HTML is already substantial, you
            can also keep <code>llms.txt</code> pointing at HTML by setting
            <code>llmsTxt.preferMarkdownMirrors</code> to <code>false</code>.
          </p>
        </section>

        <section>
          <h2>What the output looks like</h2>
          <p>
            For a blog post with a title, description, headings, and
            paragraphs, the generated markdown looks like:
          </p>
          <CodeBlock code={`# Why llms.txt matters

> LLMs answer questions by synthesizing web content. llms.txt gives them a structured overview.

Source: https://example.com/blog/why-llms-txt-matters/

## The shift from search engines to AI answers

For two decades, the path to online visibility was clear: optimize for Google...

## What is llms.txt?

llms.txt is a proposed standard that gives LLMs a structured overview of your website...`} />
          <p>
            Clean, readable, no HTML artifacts. An AI agent reading this file
            understands the page quickly.
          </p>
        </section>

        <section>
          <h2>Getting started</h2>
          <p>
            Add <code>markdownPages: {'{ enabled: true }'}</code> to your
            agentmarkup config when your raw HTML needs a cleaner machine-facing
            fetch path. On the next build, every HTML page in your output gets a
            companion <code>.md</code> file. When markdown mirrors are enabled,
            same-site page entries in <code>llms.txt</code> also default to the
            generated markdown URLs so cold agents discover the cleaner fetch
            path first. Check the <a href="/docs/llms-txt/">llms.txt guide</a>{' '}
            for the opt-out if you want HTML-first links instead.
          </p>
          <p>
            If your site already serves rich raw HTML, you do not need to treat
            markdown mirrors as mandatory. They are a tactical option, not the
            whole product.
          </p>
          <CodeBlock code={`pnpm add -D @agentmarkup/vite  # or @agentmarkup/astro or @agentmarkup/next`} />
        </section>
      </article>
      <BlogFooter currentSlug="markdown-mirrors" />
    </main>
  )
}

export default MarkdownPages
