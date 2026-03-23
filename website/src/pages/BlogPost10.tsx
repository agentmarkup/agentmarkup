import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

const installExample = `pnpm add -D @agentmarkup/next`

const nextConfigExample = `// next.config.ts
import type { NextConfig } from 'next'
import { withAgentmarkup } from '@agentmarkup/next'

const nextConfig: NextConfig = {
  output: 'export',
}

export default withAgentmarkup(
  {
    site: 'https://example.com',
    name: 'Example Docs',
    description: 'Technical docs and product pages.',
    globalSchemas: [
      { preset: 'webSite', name: 'Example Docs', url: 'https://example.com' },
      { preset: 'organization', name: 'Example Inc.', url: 'https://example.com' },
    ],
    llmsTxt: {
      sections: [
        {
          title: 'Documentation',
          entries: [
            {
              title: 'Getting Started',
              url: '/docs/getting-started',
              description: 'Setup guide and first steps',
            },
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
    contentSignalHeaders: {
      enabled: true,
    },
    aiCrawlers: {
      GPTBot: 'allow',
      ClaudeBot: 'allow',
      PerplexityBot: 'allow',
      'Google-Extended': 'allow',
      CCBot: 'disallow',
    },
  },
  nextConfig,
)`

const outputExample = `out/
  llms.txt
  llms-full.txt
  robots.txt
  _headers
  docs/getting-started/index.html
  docs/getting-started.md`

function NextJsGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-23" readingTime="8 min read" />
        <h1>How to add llms.txt, JSON-LD, and AI crawler controls to Next.js</h1>
        <p className="doc-intro">
          Next.js sites need the same machine-readable surface as any other modern website:{' '}
          <code>llms.txt</code>, structured data, crawler rules, and validation. The tricky part is
          choosing the right integration point so those artifacts reflect your final output instead of an
          earlier build step.
        </p>

        <section>
          <h2>Why Next.js is slightly different</h2>
          <p>
            With plain Vite or Astro, the final HTML output is usually obvious. Next.js can mix static
            export, prerendered pages, server deployments, and fully dynamic SSR routes in the same app.
            That means a useful Next integration cannot just be a generic bundler plugin. It has to respect
            what Next actually emits at build time.
          </p>
          <p>
            That is what <a href="https://www.npmjs.com/package/@agentmarkup/next" target="_blank" rel="noopener noreferrer">@agentmarkup/next</a>{' '}
            is for. It is a final-output-first adapter built around Next&apos;s config and build hooks rather
            than a Vite-style HTML transform.
          </p>
        </section>

        <section>
          <h2>What the Next.js adapter gives you</h2>
          <ul>
            <li><strong><code>llms.txt</code></strong> generation from your config, with the homepage discovery link injected automatically</li>
            <li><strong>Optional <code>llms-full.txt</code></strong> with inlined same-site markdown context when mirrors exist</li>
            <li><strong>JSON-LD injection</strong> into emitted HTML plus validation of existing schema blocks</li>
            <li><strong>Optional markdown mirrors</strong> for thin or noisy built pages that need a cleaner fetch target for agents</li>
            <li><strong><code>robots.txt</code> patching</strong> for AI crawler directives like GPTBot, ClaudeBot, and Google-Extended</li>
            <li><strong>Header support</strong> for Content-Signal and markdown canonicals through static <code>_headers</code> output or merged Next header rules</li>
            <li><strong>Build-time validation</strong> for schema mistakes, crawler conflicts, thin HTML, and markdown drift</li>
          </ul>
        </section>

        <section>
          <h2>Basic setup</h2>
          <p>
            Install the package:
          </p>
          <CodeBlock code={installExample} />
          <p>
            Then wrap your Next config:
          </p>
          <CodeBlock code={nextConfigExample} />
          <p>
            The important thing to notice is that the config shape is shared across the first-party adapters.
            The shared <code>AgentMarkupConfig</code> stays framework-agnostic. Only the wrapper
            changes.
          </p>
        </section>

        <section>
          <h2>Where it works best</h2>
          <p>
            The strongest fit is static export and any route where Next emits build-time HTML that can be
            patched or post-processed. That includes a lot of real App Router sites: docs, marketing pages,
            blog pages, changelogs, and mixed apps with a meaningful prerendered surface.
          </p>
          <p>
            On those builds, you get the full output flow:
          </p>
          <CodeBlock code={outputExample} />
          <p>
            Server deployments are still useful too. You keep generated root artifacts and header integration,
            even when the deployment is not a pure static export.
          </p>
        </section>

        <section>
          <h2>The one caveat that matters</h2>
          <p>
            Fully dynamic SSR routes are the boundary. If Next never emits an HTML file for a route at build
            time, there is no final file for the adapter to patch afterward.
          </p>
          <p>
            That does <strong>not</strong> make the package useless for Next apps. It just means you should
            be precise about ownership:
          </p>
          <ul>
            <li><strong>Use <code>@agentmarkup/next</code></strong> for static export, prerendered pages, generated root artifacts, and header integration</li>
            <li><strong>Use the re-exported <code>@agentmarkup/core</code> helpers</strong> inside app code for truly dynamic routes that have no build-time HTML file</li>
          </ul>
          <p>
            That is the honest model for Next. The package is strongest where Next has a final-output artifact.
            For routes without one, route-level core helpers are the right tool.
          </p>
        </section>

        <section>
          <h2>Should you enable markdown mirrors?</h2>
          <p>
            Only when they add signal. If your emitted HTML is already substantial, keep HTML as the primary
            fetch target. If the built page is thin, noisy, or heavily shell-like, generated markdown mirrors
            can give fetch-based agents a cleaner path.
          </p>
          <p>
            agentmarkup keeps that feature disciplined by generating mirrors from final HTML, keeping them
            directly fetchable, and adding canonical headers back to the HTML route so search engines keep the
            page itself as the preferred URL.
          </p>
        </section>

        <section>
          <h2>Why this is useful for the Next.js community</h2>
          <p>
            A lot of Next.js teams already care about structured metadata, crawlability, and build output
            quality. They just do not want four separate solutions for <code>llms.txt</code>, JSON-LD,
            crawler policy, markdown mirrors, and validation.
          </p>
          <p>
            The practical value of <code>@agentmarkup/next</code> is that it keeps those concerns in one build
            step, on the same config surface, with the same rules the public checker looks for on deployed sites.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            If your Next.js app has a real static or prerendered surface,{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/next" target="_blank" rel="noopener noreferrer">@agentmarkup/next</a>{' '}
            is the natural adapter. It gives you build-time machine-readable output without making you stitch
            the pieces together manually.
          </p>
          <p>
            Start with the adapter for the routes Next emits, keep markdown mirrors optional, and use{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/core" target="_blank" rel="noopener noreferrer">@agentmarkup/core</a>{' '}
            directly only where fully dynamic SSR makes that necessary. That is the cleanest model for shipping a
            machine-readable Next.js website today.
          </p>
          <p>
            If you need the underlying pieces in more detail, read the{' '}
            <a href="/docs/llms-txt/">llms.txt guide</a>, the{' '}
            <a href="/docs/json-ld/">JSON-LD guide</a>, and the{' '}
            <a href="/docs/ai-crawlers/">AI crawlers guide</a>.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="nextjs-llms-txt-json-ld" />
    </main>
  )
}

export default NextJsGuide
