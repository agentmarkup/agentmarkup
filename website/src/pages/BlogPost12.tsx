import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

const installExample = `pnpm add -D @agentmarkup/cli`

const configExample = `// agentmarkup.config.mjs
export default {
  site: 'https://example.com',
  name: 'Example',
  outDir: 'dist', // optional default; or pass the directory as an argument
  llmsTxt: {
    sections: [
      {
        title: 'Docs',
        entries: [
          { title: 'Home', url: 'https://example.com/', description: 'Start here' },
        ],
      },
    ],
  },
  markdownPages: { enabled: true },
  aiCrawlers: { GPTBot: 'disallow' },
}`

const usageExample = `# Inject + write llms.txt, markdown mirrors, JSON-LD, robots.txt, _headers
agentmarkup generate ./dist

# Validate what is already on disk (CI gate) - exits non-zero on errors
agentmarkup check ./dist

# Preview without writing anything
agentmarkup generate ./dist --dry-run`

const ciExample = `# .github/workflows/ci.yml (excerpt)
- run: pnpm build
- run: pnpm exec agentmarkup check ./dist`

function CliGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-06-21" readingTime="6 min read" />
        <h1>Run agentmarkup on any static site with the CLI</h1>
        <p className="doc-intro">
          Not every site uses a framework with a dedicated adapter. <code>@agentmarkup/cli</code> runs
          the same machine-readable pipeline over <strong>any</strong> built static output directory,
          and adds a CI <code>check</code> command that fails the build when machine-readability is
          broken.
        </p>

        <section>
          <h2>Why a CLI</h2>
          <p>
            The Vite, Astro, Next.js, and Nuxt adapters each hook a specific build. The CLI has zero
            framework coupling: point it at a directory of emitted HTML and it generates{' '}
            <code>llms.txt</code>, markdown mirrors, JSON-LD, AI-crawler <code>robots.txt</code>, and{' '}
            <code>_headers</code>, then validates the result. That makes it the right tool for Eleventy,
            Gatsby, Hugo, Jekyll, Docusaurus, plain static HTML, and any pipeline without a dedicated
            adapter.
          </p>
        </section>

        <section>
          <h2>Setup</h2>
          <p>Install the CLI:</p>
          <CodeBlock code={installExample} />
          <p>Add a config file in your project root:</p>
          <CodeBlock code={configExample} />
          <p>
            The config is the same <code>AgentMarkupConfig</code> the adapters use, plus an optional
            CLI-only <code>outDir</code> for path resolution.
          </p>
        </section>

        <section>
          <h2>Three modes</h2>
          <CodeBlock code={usageExample} />
          <ul>
            <li><strong><code>generate</code></strong> injects discovery links and JSON-LD into your HTML and writes <code>llms.txt</code>, <code>llms-full.txt</code>, markdown mirrors, <code>robots.txt</code>, and <code>_headers</code>.</li>
            <li><strong><code>generate --dry-run</code></strong> reports every planned write without touching any files.</li>
            <li><strong><code>check</code></strong> validates the files exactly as they are on disk and never writes. It exits non-zero on any error, and warns when a configured artifact is missing.</li>
          </ul>
        </section>

        <section>
          <h2>A real CI gate</h2>
          <p>
            <code>check</code> is the piece the build-time adapters cannot offer on their own: a
            standalone command that fails CI when your deployed output would not be machine-readable.
            Add it after your build step:
          </p>
          <CodeBlock code={ciExample} />
          <p>
            Use <code>--strict</code> to also fail on warnings (for example a configured artifact that
            never got generated).
          </p>
        </section>

        <section>
          <h2>Coexistence by default</h2>
          <p>
            Existing curated <code>llms.txt</code>, existing <code>robots.txt</code> rules, and existing
            page JSON-LD are preserved by default; the CLI only fills gaps. Opt into replacement per
            feature in the config when you want the CLI to take over an output.
          </p>
          <p>
            One safety note worth knowing: the CLI never auto-guesses <code>public/</code> as an output
            directory, because it is a source asset directory in many frameworks. Pass it explicitly if
            you really mean it.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            If your site emits static HTML,{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/cli" target="_blank" rel="noopener noreferrer">@agentmarkup/cli</a>{' '}
            gives you the full agentmarkup pipeline without an adapter, plus a CI gate to keep your
            machine-readable output honest over time.
          </p>
          <p>
            For more on the underlying pieces, read the{' '}
            <a href="/docs/llms-txt/">llms.txt guide</a>, the{' '}
            <a href="/docs/json-ld/">JSON-LD guide</a>, and the{' '}
            <a href="/docs/ai-crawlers/">AI crawlers guide</a>.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="agentmarkup-cli-any-static-site" />
    </main>
  )
}

export default CliGuide
