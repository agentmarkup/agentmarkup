import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

const installExample = `pnpm add -D @agentmarkup/nuxt`

const nuxtConfigExample = `// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@agentmarkup/nuxt'],
  agentmarkup: {
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
})`

const outputExample = `.output/public/
  llms.txt
  llms-full.txt
  robots.txt
  _headers
  docs/getting-started/index.html
  docs/getting-started.md`

function NuxtGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-06-21" readingTime="7 min read" />
        <h1>How to add llms.txt, JSON-LD, and AI crawler controls to Nuxt</h1>
        <p className="doc-intro">
          Nuxt sites need the same machine-readable surface as any other modern website:{' '}
          <code>llms.txt</code>, structured data, markdown mirrors, crawler rules, and validation. The
          key is hooking into the build at the moment Nuxt has actually written your prerendered HTML to
          disk, so those artifacts reflect the final output.
        </p>

        <section>
          <h2>Where the Nuxt adapter runs</h2>
          <p>
            <a href="https://www.npmjs.com/package/@agentmarkup/nuxt" target="_blank" rel="noopener noreferrer">@agentmarkup/nuxt</a>{' '}
            is a Nuxt module that runs after Nitro finishes prerendering. It hooks Nitro&apos;s{' '}
            <code>prerender:done</code> event and processes the emitted{' '}
            <code>.output/public</code> directory: the same final-output-first model the other
            agentmarkup adapters use.
          </p>
          <p>
            That means it is strongest on the <code>nuxt generate</code> path and on any route you
            prerender with <code>routeRules</code> or <code>prerender: true</code>. Those are the
            routes that produce build-time HTML files for the module to read and augment.
          </p>
        </section>

        <section>
          <h2>What the Nuxt adapter gives you</h2>
          <ul>
            <li><strong><code>llms.txt</code></strong> generation from your config, with the homepage discovery link injected automatically</li>
            <li><strong>Optional <code>llms-full.txt</code></strong> with inlined same-site markdown context when mirrors exist</li>
            <li><strong>JSON-LD injection</strong> into emitted HTML plus validation of existing schema blocks</li>
            <li><strong>Optional markdown mirrors</strong> for thin or noisy prerendered pages that need a cleaner fetch target for agents</li>
            <li><strong><code>robots.txt</code> patching</strong> for AI crawler directives like GPTBot, ClaudeBot, and Google-Extended</li>
            <li><strong>Header support</strong> for Content-Signal and markdown canonicals through the static <code>_headers</code> output</li>
            <li><strong>Build-time validation</strong> for schema mistakes, crawler conflicts, thin HTML, and markdown drift</li>
          </ul>
        </section>

        <section>
          <h2>Basic setup</h2>
          <p>Install the module:</p>
          <CodeBlock code={installExample} />
          <p>Then register it and pass the shared config under the <code>agentmarkup</code> key:</p>
          <CodeBlock code={nuxtConfigExample} />
          <p>
            The config shape is the same <code>AgentMarkupConfig</code> used by the Vite, Astro, and
            Next.js adapters. Only the integration point changes: Nuxt reads it from the{' '}
            <code>agentmarkup</code> key.
          </p>
        </section>

        <section>
          <h2>Where it works best</h2>
          <p>
            Run a prerendered build and you get the full output flow written into{' '}
            <code>.output/public</code>:
          </p>
          <CodeBlock code={outputExample} />
          <p>
            Because the module reads the directory Nitro actually wrote, the artifacts reflect your real
            final HTML rather than an earlier build step.
          </p>
        </section>

        <section>
          <h2>The one caveat that matters</h2>
          <p>
            Fully dynamic SSR routes are the boundary. If a route is rendered on demand by the Nitro
            server and never emits a build-time HTML file, there is no final file for the module to
            patch afterward.
          </p>
          <p>
            That does <strong>not</strong> make the package useless for Nuxt apps. It just means you
            should be precise about ownership:
          </p>
          <ul>
            <li><strong>Use <code>@agentmarkup/nuxt</code></strong> for prerendered routes, <code>nuxt generate</code> output, generated root artifacts, and header output</li>
            <li><strong>Use the re-exported <code>@agentmarkup/core</code> helpers</strong> inside app code (for example a server route or Nitro handler) for truly dynamic routes that have no build-time HTML file</li>
          </ul>
        </section>

        <section>
          <h2>Should you enable markdown mirrors?</h2>
          <p>
            Only when they add signal. If your prerendered HTML is already substantial, keep HTML as the
            primary fetch target. If the built page is thin, noisy, or heavily shell-like, generated
            markdown mirrors can give fetch-based agents a cleaner path.
          </p>
          <p>
            agentmarkup keeps that feature disciplined by generating mirrors from final HTML, keeping
            them directly fetchable, and adding canonical headers back to the HTML route so search
            engines keep the page itself as the preferred URL.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            If your Nuxt app prerenders its pages,{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/nuxt" target="_blank" rel="noopener noreferrer">@agentmarkup/nuxt</a>{' '}
            is the natural module. It gives you build-time machine-readable output on the same config
            surface as the other adapters, without stitching the pieces together by hand.
          </p>
          <p>
            Start with the module for the routes Nuxt prerenders, keep markdown mirrors optional, and use{' '}
            <a href="https://www.npmjs.com/package/@agentmarkup/core" target="_blank" rel="noopener noreferrer">@agentmarkup/core</a>{' '}
            directly only where fully dynamic SSR makes that necessary.
          </p>
          <p>
            If you need the underlying pieces in more detail, read the{' '}
            <a href="/docs/llms-txt/">llms.txt guide</a>, the{' '}
            <a href="/docs/json-ld/">JSON-LD guide</a>, and the{' '}
            <a href="/docs/ai-crawlers/">AI crawlers guide</a>.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="nuxt-llms-txt-json-ld" />
    </main>
  )
}

export default NuxtGuide
