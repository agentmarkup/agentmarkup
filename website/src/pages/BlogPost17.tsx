import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'
import { ResponsiveTable } from '../ui/ResponsiveTable'

const claudeInstall = `/plugin marketplace add agentmarkup/agentmarkup
/plugin install agentmarkup@agentmarkup`

function AgentmarkupPluginLaunch() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline
          date="2026-08-23"
          readingTime="8 min read"
          slug="agentmarkup-plugin-chatgpt-codex-claude-code"
        />
        <h1>agentmarkup is now a plugin for ChatGPT, Codex and Claude Code</h1>
        <p className="doc-intro">
          agentmarkup is now published in OpenAI&apos;s Plugin Directory, which
          is shared by ChatGPT and Codex. You can install it there, point it at a
          website repository, and use a guided workflow to choose the right
          package, update the build, inspect the generated output and validate
          what agents will actually receive.
        </p>

        <section>
          <h2>Available now in OpenAI&apos;s Plugin Directory</h2>
          <p>
            I submitted the agentmarkup plugin to OpenAI, and it was approved
            and published on 2026-08-23. Because ChatGPT and Codex share the
            directory, the same listing is available from either product.
          </p>
          <p>
            I have also submitted it to Anthropic&apos;s community plugin
            directory. That submission is still pending review, so agentmarkup
            is not listed in Anthropic&apos;s public catalog yet. Anthropic
            publishes no review-time commitment, and an approved plugin then
            waits for the catalog&apos;s nightly synchronization job.
          </p>
          <p>
            A directory listing provides discovery, not access. Claude Code
            users can install the plugin today from the repository&apos;s own
            marketplace, without waiting for the community directory review:
          </p>
          <CodeBlock code={claudeInstall} />
          <p>
            OpenAI and Anthropic conduct independent reviews. OpenAI&apos;s
            guide explicitly notes that Claude marketplace listings and
            approvals do not transfer, so publication in one directory does not
            imply approval in the other.
          </p>
        </section>

        <section>
          <h2>What the plugin actually does</h2>
          <p>
            The plugin is a skill, so it runs as a guided sequence rather than
            hiding the work behind one command. Its job is to connect the
            repository, the build system and the final machine-readable output
            without assuming that the first framework name it sees is the right
            integration point.
          </p>
          <ol>
            <li>
              <p>
                <strong>It reads the repository first.</strong> This inspection
                changes nothing. It checks <code>package.json</code>, lockfiles,
                framework configuration, build scripts, existing{' '}
                <code>public/</code> assets and generated output. It also records
                whether the project already has <code>llms.txt</code>,{' '}
                <code>robots.txt</code>, <code>_headers</code>, JSON-LD, a
                sitemap or canonical tags.
              </p>
            </li>
            <li>
              <p>
                <strong>It identifies who owns the final HTML.</strong> That
                decision determines the package. The presence of Vite-shaped
                tooling inside a Next.js project does not make the Vite adapter
                the right choice. The important question is which layer
                produces the HTML that will actually be deployed. Choosing an
                earlier layer can leave the generated artifacts describing an
                intermediate shell instead of the finished site.
              </p>
            </li>
            <li>
              <p>
                <strong>It asks once before changing anything.</strong> The
                proposed plan names the package, every file it would modify, the
                exact commands it would run and the audit target URL when a
                live audit is included. One approval gate covers installing a
                package, editing <code>package.json</code> or the lockfile,
                writing or patching configuration, running the build and making
                an outbound request. It does not ask for permission one step at
                a time, and silence is not approval.
              </p>
            </li>
            <li>
              <p>
                <strong>A live audit requires confirmation of the origin.</strong>{' '}
                <code>@agentmarkup/audit</code> sends requests from the
                user&apos;s own machine under real crawler user agents. Before
                it makes those requests, the plugin names the target origin and
                asks the user to confirm that they own or operate it. The audit
                is not intended for probing somebody else&apos;s site.
              </p>
            </li>
            <li>
              <p>
                <strong>It builds and then reads the result.</strong> A valid
                configuration is not proof that the build emitted the intended
                files. The plugin inspects generated HTML and root assets in the
                output directory. When the user approved a live audit, it also
                reads the deployed site because hosting headers, redirects and
                final rewrites can differ from local output.
              </p>
            </li>
            <li>
              <p>
                <strong>It reports deterministic validation results.</strong> A
                missing required field is an error. A missing recommended field
                is a warning. That is the entire scale. I deliberately left out
                grades and readiness ratings because combining unrelated checks
                into a single result would hide the concrete condition that
                needs attention.
              </p>
            </li>
          </ol>
          <p>
            Existing curated <code>llms.txt</code>, <code>robots.txt</code>,{' '}
            <code>_headers</code> and JSON-LD are preserved by default. The
            plugin does not overwrite work already present in the repository
            unless the user explicitly chooses replacement.
          </p>
          <p>
            There is also a clear boundary. In a plain chat window with no shell
            and no repository, the plugin cannot install dependencies or run a
            build. It can read what the user pastes or links, identify which
            layer owns the final HTML, recommend the appropriate package and
            write the configuration for the user to apply. It says that
            directly instead of describing work it did not perform.
          </p>
        </section>

        <section>
          <h2>The packages behind the workflow</h2>
          <p>
            The plugin selects from the published packages according to the
            project and the layer that produces its final output. The build-time
            packages share a release line, while the live audit package tracks
            its own. Current releases are available on npm.
          </p>
          <ResponsiveTable label="agentmarkup packages and their roles">
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">What it is for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/core"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/core</code>
                  </a>
                </td>
                <td>
                  Framework-agnostic generators, presets, validation and HTML
                  helpers. The layer everything else is built on, and the one to
                  use directly for a custom pipeline or a dynamic SSR route.
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/vite"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/vite</code>
                  </a>
                </td>
                <td>Vite adapter.</td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/astro"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/astro</code>
                  </a>
                </td>
                <td>Astro integration.</td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/next"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/next</code>
                  </a>
                </td>
                <td>
                  Next.js adapter, including a final-output build pass over
                  exported or prerendered HTML.
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/nuxt"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/nuxt</code>
                  </a>
                </td>
                <td>
                  Nuxt module, processing prerendered or{' '}
                  <code>nuxt generate</code> output.
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/cli"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/cli</code>
                  </a>
                </td>
                <td>
                  Framework-agnostic command that runs the whole pipeline over
                  any directory of built HTML, plus a <code>check</code>{' '}
                  subcommand that validates without writing and is the right
                  thing to put in CI.
                </td>
              </tr>
              <tr>
                <td>
                  <a
                    href="https://www.npmjs.com/package/@agentmarkup/audit"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <code>@agentmarkup/audit</code>
                  </a>
                </td>
                <td>
                  Fetches a live URL the way AI crawlers see it, under user
                  agents including GPTBot, ClaudeBot and PerplexityBot.
                </td>
              </tr>
            </tbody>
          </ResponsiveTable>
          <p>
            Between them, these packages generate <code>llms.txt</code>, an
            optional <code>llms-full.txt</code>, JSON-LD structured data,
            markdown mirrors, AI crawler rules in <code>robots.txt</code>,{' '}
            <code>_headers</code> with Content-Signal directives and optional
            A2A Agent Card discovery at{' '}
            <code>/.well-known/agent-card.json</code>.
          </p>
          <p>
            Everything runs at build time. There is no runtime component, hosted
            service or account.
          </p>
        </section>

        <section>
          <h2>Why I built it</h2>
          <p>
            I run Anima Felix. ChatGPT and Claude could find the site, but they
            could not really understand what it did. I fixed that for Anima
            Felix first with tools I wrote for the job, then open-sourced those
            tools.
          </p>
          <p>
            That origin still sets the standard. The work is useful when it
            changes what the site actually serves and keeps that output from
            drifting afterwards. An audit points at a problem. A build
            integration makes the fix part of the site, and{' '}
            <code>agentmarkup check</code> in CI stops it from quietly breaking
            again later.
          </p>
        </section>

        <section>
          <h2>What it will not claim</h2>
          <p>
            The plugin will not promise that any AI system will include, rank,
            cite or send traffic to a site. Nobody controls that, and anyone
            selling that promise is guessing.
          </p>
          <p>
            What it will do is make the site&apos;s machine-readable layer
            concrete, testable and part of the build, so what agents receive is
            something you chose deliberately rather than something you
            inherited.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="agentmarkup-plugin-chatgpt-codex-claude-code" />
    </main>
  )
}

export default AgentmarkupPluginLaunch