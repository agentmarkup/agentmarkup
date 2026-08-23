import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

const claudeInstall = `/plugin marketplace add agentmarkup/agentmarkup
/plugin install agentmarkup@agentmarkup`

function Soft404DiscoverabilityTools() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-08-23" readingTime="5 min read" slug="soft-404-ai-discoverability-tools" />
        <h1>agentmarkup.dev served a soft-404. Our own tooling missed it.</h1>
        <p className="doc-intro">
          agentmarkup is a tool for making websites machine-readable. Its own
          website was telling machines that pages existed when they did not.
          Every unknown path returned HTTP 200 with the app shell, so an agent
          probing <code>/openapi.json</code> or <code>/about</code> could
          reasonably conclude that both resources existed. At the time, neither
          did.
        </p>

        <section>
          <h2>The bug was real, and the blind spot was ours</h2>
          <p>
            The cause was ordinary hosting behavior. Cloudflare Pages falls
            back to <code>index.html</code> when the deployed output has no{' '}
            <code>404.html</code>. That fallback returned the application shell
            with a successful status for any invented path. To a person, it
            looked like a not-found page after the client app loaded. To a
            fetch-based agent, it looked like a page that existed.
          </p>
          <p>
            I fixed it the same week. The build now emits a real prerendered{' '}
            <code>404.html</code>, and the worker negotiates the response body.
            Agents that explicitly prefer markdown or plain text get a short
            machine-readable 404. Everyone else gets the HTML page. Both
            variants return HTTP 404 and include <code>Accept</code> in the{' '}
            <code>Vary</code> header.
          </p>
          <p>
            The uncomfortable part is why the bug survived. Neither the hosted
            checker nor <code>@agentmarkup/audit</code> requests a path that
            should not exist. Both defend against soft-404 responses on the
            assets they already fetch, but neither performs a deliberate probe.
            My own tooling did not catch my own mistake. That is a known gap,
            and I intend to close it.
          </p>
          <p>
            The honest output is a
            specific limitation, a reproducible case, and a check that still
            needs to be added.
          </p>
        </section>

        <section>
          <h2>In Claude&apos;s plugin catalogs, most of these tools stop at the report</h2>
          <p>
            On 2026-08-23, I fetched the two Claude plugin catalog manifests
            directly and matched every entry name and description against{' '}
            <code>llms.txt</code>, GEO, AEO, AI search, and AI crawler keywords,
            then read the matches.
          </p>
          <ul>
            <li>
              Anthropic&apos;s <code>claude-plugins-official</code> catalog
              contained <strong>286 plugins</strong>. Not one was an{' '}
              <code>llms.txt</code> or AI-discoverability plugin of any kind.
            </li>
            <li>
              The <code>claude-community</code> catalog contained{' '}
              <strong>2,281 plugins</strong>. I found <strong>23</strong> close
              to this space.
            </li>
            <li>
              Those 23 were near-uniformly auditors and scorers. The pattern
              across their descriptions is consistent: 0-100 health scores,
              letter grades, fixed-dimension check counts, and brand-perception
              scoring across assistants.
            </li>
            <li>
              Not one of the 23 installs a build-time dependency that emits the
              missing artifacts. None gates CI.
            </li>
          </ul>
          <p>
            This is a dated catalog snapshot, not a claim about every tool on
            the internet. It does show a clear pattern in these catalogs: run an audit,
            summarize the findings, produce a score, and stop. Audits are
            useful, including ours. But after a report says your{' '}
            <code>llms.txt</code> is missing or your structured data is invalid,
            the site is still exactly as it was before the report ran.
          </p>
        </section>

        <section>
          <h2>What a build integration does instead</h2>
          <p>
            The agentmarkup plugin starts by inspecting which layer owns the
            final HTML. It then proposes one plan: the package to install, the
            files to change, the commands to run, and any live origin it would
            audit. Nothing is installed, written, built, or fetched until the
            user approves that plan.
          </p>
          <p>
            Once approved, it installs the appropriate build-time integration,
            writes the configuration, runs the real site build, and validates
            the emitted output. Depending on the project, that can mean{' '}
            <code>@agentmarkup/vite</code>, <code>@agentmarkup/astro</code>,{' '}
            <code>@agentmarkup/next</code>, <code>@agentmarkup/nuxt</code>, the{' '}
            framework-agnostic <code>@agentmarkup/cli</code>, or direct helpers
            from <code>@agentmarkup/core</code>.
          </p>
          <p>The resulting build can contain:</p>
          <ul>
            <li>
              a generated <code>llms.txt</code> and optional{' '}
              <code>llms-full.txt</code>
            </li>
            <li>validated JSON-LD and an injected discovery link</li>
            <li>
              AI crawler rules and optional Content-Signal headers that preserve
              existing hand-written policy
            </li>
            <li>
              optional markdown mirrors for thin, noisy, or client-rendered
              HTML, not as a universal requirement
            </li>
            <li>
              an optional A2A Agent Card for discovery only, not an agent runtime
              or task endpoint
            </li>
          </ul>
          <p>
            The CLI&apos;s <code>check</code> command can then run after the
            normal build and exit non-zero when required output is broken. That
            is the practical difference. The result is not another report to
            remember. It is a dependency, configuration, generated artifacts,
            and a CI condition that remain with the repository.
          </p>
        </section>

        <section>
          <h2>No score is part of the honesty</h2>
          <p>
            agentmarkup deliberately does not produce a readiness score, grade,
            or percentage. A missing required field is an error. A missing
            recommended field is a warning. That is the entire scale.
          </p>
          <p>
            Collapsing unrelated checks into one number requires hidden choices
            about how much each item is worth. It also invites a much larger
            inference: that a higher number predicts inclusion, ranking, traffic,
            or citation by an AI system. We do not have evidence for that, so the
            tool does not make the claim.
          </p>
          <p>
            What it can establish is narrower and useful: whether an artifact
            exists, whether it parses, whether required fields are present,
            whether crawler rules conflict, whether final HTML contains real
            content, and whether the build stays valid in CI. When a check does
            not exist, as with our soft-404 probe, the right response is to say
            so plainly.
          </p>
        </section>

        <section>
          <h2>Why I built it this way</h2>
          <p>
            Anima Felix needed this first. ChatGPT and Claude could find the
            site, but they could not really understand it. I fixed it there,
            then open-sourced the tooling we used.
          </p>
          <p>
            That origin still sets the standard. The work is only useful when
            it changes what the site serves and keeps that output from drifting.
            A good audit points to the problem. A build integration makes the
            fix part of the site.
          </p>
        </section>

        <section>
          <h2>Use the plugin where you already work</h2>
          <p>
            agentmarkup was published in OpenAI&apos;s Plugin Directory on
            2026-08-23. That directory is shared by ChatGPT and Codex, and the
            plugin can be installed from there.
          </p>
          <p>
            The plugin has also been submitted to Anthropic&apos;s community
            directory and is pending review. Claude Code users can install it
            today from the repository&apos;s own marketplace:
          </p>
          <CodeBlock code={claudeInstall} />
          <p>
            The current build-time release is <strong>0.6.0</strong> across{' '}
            <code>core</code>, <code>vite</code>, <code>astro</code>,{' '}
            <code>next</code>, <code>nuxt</code>, and <code>cli</code>. The live
            crawler package, <code>@agentmarkup/audit</code>, is{' '}
            <strong>0.2.3</strong>.
          </p>
          <p>
            Before a live audit, the plugin names the target origin and asks the
            user to confirm that they own or operate it. Approval covers the
            stated plan, not the rest of the session.
          </p>
          <p>
            The plugin will not promise that an AI system will include, rank,
            cite, or send traffic to a site. It will make the site&apos;s
            machine-readable layer concrete, testable, and part of the build.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="soft-404-ai-discoverability-tools" />
    </main>
  )
}

export default Soft404DiscoverabilityTools
