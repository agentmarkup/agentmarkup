function About() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">About</p>
        <h1>About agentmarkup</h1>
        <p className="doc-intro">
          agentmarkup is an open-source, MIT-licensed toolkit that makes a
          website machine-readable at build time. It generates llms.txt,
          injects JSON-LD structured data, can produce markdown mirrors of
          final HTML, manages AI crawler directives in robots.txt, emits
          Content-Signal headers, and validates all of it before the build
          finishes. It is built and maintained by Sebastian Cochinescu at Anima
          Felix.
        </p>

        <section>
          <h2>Why it exists</h2>
          <p>
            Anima Felix had the same problem most sites have. ChatGPT and
            Claude could find the site, but they could not really understand
            it. The pages were a client-rendered shell, the structured data was
            incomplete, there was no llms.txt, and nothing in the build caught
            any of that. Every fix was manual, and every fix drifted the next
            time the site changed.
          </p>
          <p>
            So the fixes were moved into the build. That internal tooling
            became agentmarkup, and it was open sourced because the problem is
            not specific to one site. If the machine-readable layer of a
            website is not generated and validated by the build, it goes stale
            the moment someone ships a redesign.
          </p>
        </section>

        <section>
          <h2>What it is, and what it is not</h2>
          <p>
            agentmarkup is a build-time dependency you install from npm. There
            is no SaaS, no account, no runtime service, and nothing phones
            home. It runs inside your build, writes files into your output
            directory, and gets out of the way.
          </p>
          <p>
            It is also deliberately not a scoring tool. Validation is
            deterministic: a missing required field is an error, a missing
            recommended field is a warning, and there are no readiness scores,
            letter grades, or percentages anywhere in the output. A number that
            nobody can reproduce is not a finding, and the field is already
            full of them.
          </p>
        </section>

        <section>
          <h2>What ships today</h2>
          <p>
            The published package family covers the frameworks that own enough
            of their final build output to make a build-time pass meaningful:
          </p>
          <ul>
            <li>
              <a
                href="https://www.npmjs.com/package/@agentmarkup/vite"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/vite
              </a>
              ,{' '}
              <a
                href="https://www.npmjs.com/package/@agentmarkup/astro"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/astro
              </a>
              ,{' '}
              <a
                href="https://www.npmjs.com/package/@agentmarkup/next"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/next
              </a>{' '}
              and{' '}
              <a
                href="https://www.npmjs.com/package/@agentmarkup/nuxt"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/nuxt
              </a>{' '}
              are the framework adapters.
            </li>
            <li>
              <a
                href="https://www.npmjs.com/package/@agentmarkup/cli"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/cli
              </a>{' '}
              runs the same pipeline over any built static output and gates a
              CI job.
            </li>
            <li>
              <a
                href="https://www.npmjs.com/package/@agentmarkup/audit"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/audit
              </a>{' '}
              fetches a live URL as each major AI crawler and diffs the result
              against a browser fetch.
            </li>
            <li>
              <a
                href="https://www.npmjs.com/package/@agentmarkup/core"
                target="_blank"
                rel="noopener noreferrer"
              >
                @agentmarkup/core
              </a>{' '}
              exposes the generators and validators for custom prerender
              pipelines.
            </li>
          </ul>
          <p>
            This website is built with agentmarkup. Its llms.txt, JSON-LD,
            markdown mirrors, robots.txt crawler rules and Content-Signal
            headers are all generated by the same packages you would install.
          </p>
        </section>

        <section>
          <h2>Who maintains it</h2>
          <p>
            <a href="/authors/sebastian-cochinescu/">Sebastian Cochinescu</a>{' '}
            maintains agentmarkup at{' '}
            <a
              href="https://animafelix.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anima Felix
            </a>
            , where it runs in production. Maintenance is handled by one
            person, so support is best effort. The{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup"
              target="_blank"
              rel="noopener noreferrer"
            >
              source code
            </a>{' '}
            is public, the{' '}
            <a href="/license/">license is MIT</a>, and contributions go through
            GitHub. For anything else, see <a href="/contact/">Contact</a>.
          </p>
        </section>
      </article>
    </main>
  )
}

export default About
