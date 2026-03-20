import CodeBlock from '../CodeBlock'

const example = `import { defineConfig } from 'vite'
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  plugins: [
    agentmarkup({
      site: 'https://example.com',
      name: 'My Website',
      description: 'A short description of your website.',
      llmsTxt: {
        instructions: 'Optional instructions for LLMs visiting this site.',
        sections: [
          {
            title: 'Pages',
            entries: [
              { title: 'About', url: '/about', description: 'About us' },
              { title: 'Blog', url: '/blog', description: 'Latest posts' },
            ],
          },
        ],
      },
      llmsFullTxt: {
        enabled: true,
      },
      markdownPages: {
        enabled: true,
      },
    }),
  ],
})`

const output = `# My Website

> A short description of your website.

Optional instructions for LLMs visiting this site.

## Pages

- [About](https://example.com/about.md): About us
- [Blog](https://example.com/blog.md): Latest posts`

const fullOutput = `# My Website

> A short description of your website.

Optional instructions for LLMs visiting this site.

This optional agentmarkup context file expands the published llms.txt manifest with inline same-site markdown content when those mirrors are available.

## Pages

- [About](https://example.com/about.md): About us
- [Blog](https://example.com/blog.md): Latest posts

### About

> About us

Source: https://example.com/about
Preferred fetch: https://example.com/about.md

About the company, team, and public positioning...`

function LlmsTxt() {
  return (
    <main>
      <article className="doc-page">
        <h1>How to generate llms.txt for your website</h1>
        <p className="doc-intro">
          llms.txt is a proposed standard from <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer">llmstxt.org</a> that gives LLMs and AI agents a structured overview of your website. It is a plain text file served at <code>/llms.txt</code> that describes your site name, purpose, and pages in a format optimized for language models.
        </p>

        <section>
          <h2>What is llms.txt?</h2>
          <p>
            When an LLM or AI assistant visits your website, it needs to understand what your site is about, what pages exist, and what content is available. HTML pages are designed for humans. llms.txt is designed for machines.
          </p>
          <p>
            The format is simple markdown: an H1 heading with your site name, an optional blockquote description, optional instructions, and H2 sections grouping page links with short descriptions.
          </p>
        </section>

        <section>
          <h2>Why generate llms.txt at build time?</h2>
          <p>
            Manually maintaining an llms.txt file means keeping it in sync with your actual pages, remembering the correct markdown format, and resolving relative URLs to absolute ones. agentmarkup handles all of this automatically during your Vite or Astro build.
          </p>
          <ul>
            <li>Your llms.txt is always in sync with your site configuration</li>
            <li>Relative URLs are automatically resolved to absolute URLs</li>
            <li>The output follows the llmstxt.org spec exactly</li>
            <li>Build-time validation catches formatting errors before you deploy</li>
          </ul>
        </section>

        <section>
          <h2>Configuration</h2>
          <p>
            Add the <code>llmsTxt</code> option to your agentmarkup plugin configuration. Define sections and entries that describe the pages on your site.
          </p>
          <CodeBlock code={example} />
        </section>

        <section>
          <h2>Generated output</h2>
          <p>
            The plugin outputs a spec-compliant <code>/llms.txt</code> file in your build directory:
          </p>
          <CodeBlock code={output} />
          <p>
            With markdown mirrors enabled in the example above, same-site page
            entries in <code>llms.txt</code> default to the generated
            <code>.md</code> URLs so cold agents discover the cleaner fetch
            path first. Set <code>llmsTxt.preferMarkdownMirrors</code> to
            <code>false</code> if your raw HTML is already substantial and you
            want <code>llms.txt</code> to keep pointing at HTML routes.
          </p>
        </section>

        <section>
          <h2>Optional llms-full.txt</h2>
          <p>
            If you enable <code>llmsFullTxt</code>, agentmarkup also emits an
            optional <code>/llms-full.txt</code> file. It keeps the same
            high-level manifest structure as <code>llms.txt</code> but inlines
            same-site markdown mirror content when those mirrors exist, which
            gives agents a richer machine-readable context file without making
            you hand-maintain a second document.
          </p>
          <CodeBlock code={fullOutput} />
        </section>

        <section>
          <h2>Validation</h2>
          <p>
            agentmarkup validates your <code>llms.txt</code> and
            <code>llms-full.txt</code> output at build time. It checks that the
            files start with an H1 heading, have at least one section, and that
            all links have valid titles and URLs. If markdown mirrors are
            enabled, it also warns when <code>llms.txt</code> points to a
            markdown URL that was never emitted.
          </p>
        </section>

        <section>
          <h2>LLM discovery</h2>
          <p>
            agentmarkup injects the homepage <code>llms.txt</code> discovery
            link automatically when you generate or ship an <code>llms.txt</code>
            file. The tag looks like this:
          </p>
          <CodeBlock code={`<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable site summary" />`} />
          <p>
            Combined with a proper <a href="/docs/ai-crawlers/">robots.txt configuration</a> that allows AI crawlers, this makes your site discoverable and understandable by AI agents.
          </p>
        </section>
        <section className="faq">
          <h2>Frequently asked questions</h2>
          <details>
            <summary>Do AI models actually read llms.txt?</summary>
            <p>Some AI systems like Perplexity have started checking for llms.txt. The format is still early, but the cost of generating it is near zero and it provides a clean machine-readable overview of your site.</p>
          </details>
          <details>
            <summary>Can I have both llms.txt and llms-full.txt?</summary>
            <p>Yes. llms.txt is the summary. llms-full.txt is optional expanded context. agentmarkup can generate both, and when markdown mirrors are enabled it inlines the same-site mirror content into llms-full.txt automatically.</p>
          </details>
          <details>
            <summary>What happens if I do not configure llmsTxt?</summary>
            <p>No llms.txt file is generated. The other features (JSON-LD, markdown mirrors, robots.txt, optional headers, and validation) still work independently. You can enable features selectively.</p>
          </details>
        </section>
      </article>
    </main>
  )
}

export default LlmsTxt
