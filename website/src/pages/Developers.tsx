function Developers() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">For developers</p>
        <h1>agentmarkup developer resources</h1>
        <p className="doc-intro">
          Everything needed to build with agentmarkup, in one place: the
          packages, the machine-readable files this site publishes about itself,
          the API behind the public tools, and the agent integrations. There are
          no API keys and no accounts, because nothing here needs one.
        </p>

        <section>
          <h2>Install a package</h2>
          <p>
            agentmarkup is a build-time dependency. Pick the adapter that owns
            your final build output:
          </p>
          <ul>
            <li>
              <code>@agentmarkup/vite</code>, <code>@agentmarkup/astro</code>,{' '}
              <code>@agentmarkup/next</code> and <code>@agentmarkup/nuxt</code>{' '}
              are the framework adapters.
            </li>
            <li>
              <code>@agentmarkup/cli</code> runs the same pipeline over any
              built static output and gates a CI job with{' '}
              <code>agentmarkup check ./dist</code>.
            </li>
            <li>
              <code>@agentmarkup/audit</code> fetches a live URL as each major
              AI crawler and diffs against a browser:{' '}
              <code>npx @agentmarkup/audit https://example.com</code>.
            </li>
            <li>
              <code>@agentmarkup/core</code> exposes the generators and
              validators for custom prerender pipelines.
            </li>
          </ul>
          <p>
            Setup guides live in the{' '}
            <a href="/learn/">Learning Center</a>:{' '}
            <a href="/docs/llms-txt/">llms.txt</a>,{' '}
            <a href="/docs/json-ld/">JSON-LD</a>,{' '}
            <a href="/docs/ai-crawlers/">AI crawlers</a> and{' '}
            <a href="/docs/audit/">auditing a live site</a>.
          </p>
        </section>

        <section>
          <h2>API reference</h2>
          <p>
            The <a href="/checker/">website checker</a> and the{' '}
            <a href="/security-scan/">security scan</a> are backed by two
            read-only HTTP endpoints. They are described by an OpenAPI 3.1
            document at{' '}
            <a href="/openapi.json">
              <code>/openapi.json</code>
            </a>
            , with a unique operation ID, typed parameters and response schemas
            for every operation.
          </p>
          <ul>
            <li>
              <code>GET</code> or <code>POST /api/v1/check</code> - fetch a
              public site&apos;s homepage, llms.txt, robots.txt, sitemap and
              markdown mirrors, and return the raw resources.
            </li>
            <li>
              <code>POST /api/v1/security-scan</code> - passive checks over
              publicly observable headers and DNS records.
            </li>
          </ul>
          <p>
            The stable contract is versioned in the path. The unversioned{' '}
            <code>/api/check</code> and <code>/api/security-scan</code> are
            permanent aliases for v1 and will keep working, but integrate
            against the versioned form. A breaking change would ship as{' '}
            <code>/api/v2/</code> rather than changing v1, and a version
            scheduled for removal would carry <code>Deprecation</code> and{' '}
            <code>Sunset</code> headers with at least 180 days notice. Nothing
            is deprecated today.
          </p>
          <p>
            Every response carries the IETF{' '}
            <code>RateLimit-Policy</code>, <code>RateLimit-Limit</code>,{' '}
            <code>RateLimit-Remaining</code> and <code>RateLimit-Reset</code>{' '}
            header fields, and a 429 adds <code>Retry-After</code>. Read them
            and self-throttle rather than discovering the limit by being
            refused. Everything under <code>/api/</code> answers JSON, including
            errors for paths that do not exist.
          </p>
          <p>
            No key is required. Both are rate limited per client IP and may ask
            for a Cloudflare Turnstile token after repeated requests, and every
            error response carries a stable machine-readable{' '}
            <code>code</code> alongside a human-readable <code>error</code>.
            Point them only at sites you own or are authorised to test; the{' '}
            <a href="/terms/">Terms of Service</a> set out the limits and the{' '}
            <a href="/privacy/">Privacy Policy</a> covers what is stored.
          </p>
          <p>
            These endpoints exist to serve the tools on this site. They are
            documented so that agents use them correctly rather than by
            guessing, not as a hosted product, and there is no uptime guarantee.
          </p>
        </section>

        <section>
          <h2>Machine-readable files</h2>
          <p>
            This site is built with agentmarkup, so its own machine-readable
            surface is generated by the packages you would install:
          </p>
          <ul>
            <li>
              <a href="/llms.txt">/llms.txt</a> - the site manifest, including
              when to use agentmarkup
            </li>
            <li>
              <a href="/llms-full.txt">/llms-full.txt</a> - the same manifest
              with page content inlined
            </li>
            <li>
              <a href="/openapi.json">/openapi.json</a> - the API surface above
            </li>
            <li>
              <a href="/sitemap.xml">/sitemap.xml</a> and{' '}
              <a href="/robots.txt">/robots.txt</a> - every indexable URL, and
              the AI crawler directives
            </li>
            <li>
              A markdown mirror of every page, at the same path with a{' '}
              <code>.md</code> extension, for example{' '}
              <a href="/developers.md">/developers.md</a>. Requesting any page
              with <code>Accept: text/markdown</code> returns the mirror at the
              original URL.
            </li>
          </ul>
        </section>

        <section>
          <h2>Agent integrations</h2>
          <p>
            The{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/tree/main/skills/agentmarkup"
              target="_blank"
              rel="noopener noreferrer"
            >
              agentmarkup agent skill
            </a>{' '}
            teaches a coding agent to install the right package, configure it
            from what the repository already declares, audit the output, and fix
            what it finds. It never invents a readiness score and never claims a
            site blocks AI from a single blocked request.
          </p>
          <p>
            The same skill ships as a Claude Code plugin from the{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/tree/main/plugins/agentmarkup"
              target="_blank"
              rel="noopener noreferrer"
            >
              repository marketplace
            </a>
            .
          </p>
        </section>

        <section>
          <h2>Source and support</h2>
          <p>
            The{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup"
              target="_blank"
              rel="noopener noreferrer"
            >
              source
            </a>{' '}
            is MIT licensed. Bugs and feature requests belong in{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub issues
            </a>
            ; see <a href="/support/">Support</a> for where to start and{' '}
            <a href="/contact/">Contact</a> for direct addresses, including
            security reports.
          </p>
        </section>
      </article>
    </main>
  )
}

export default Developers
