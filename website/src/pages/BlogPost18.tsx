import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'
import { ResponsiveTable } from '../ui/ResponsiveTable'

const reducerSnippet = `const previousState = stateRef.current
const nextState = studioReducer(previousState, action)
stateRef.current = nextState

dispatch(action)`

const starterPrompt = `Make my site friendly to AI search but keep my content out of training data.`

function WebMcpAgentMarkupStudio() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline
          date="2026-08-27"
          readingTime="9 min read"
          slug="webmcp-agentmarkup-studio"
        />
        <h1>I built AgentMarkup Studio with WebMCP</h1>
        <p className="doc-intro">
          <a href="/studio/">AgentMarkup Studio</a> is now live. A browser AI
          agent can edit a visible draft of a website&apos;s machine-readable
          surface while the person at the keyboard watches every change. A
          deterministic compiler turns that draft into real artifacts in the
          browser, and cross-surface contradiction rules check whether those
          artifacts agree.
        </p>
        <p>
          I built the Studio as agentmarkup&apos;s entry for{' '}
          <a
            href="https://webmcp.devpost.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            The WebMCP Challenge
          </a>
          . Judging has not happened. The work was deciding what an agent
          should be allowed to change, how it should learn what actually
          changed, and how to catch a draft whose individually reasonable
          choices conflict.
        </p>

        <section>
          <h2>What does WebMCP change on a web page?</h2>
          <p>
            The tools live in the page. WebMCP lets the page register
            structured JavaScript actions through{' '}
            <code>document.modelContext.registerTool</code>, with a{' '}
            <code>navigator.modelContext</code> fallback and an AbortController
            tied to the page lifetime. The compatible browser exposes those
            actions to its agent while the page remains visible.
          </p>
          <p>
            The agent is not operating on a hidden copy of the form. It reads
            and edits the same in-memory draft shown in the UI. A manual edit
            and an agent tool call pass through the same reducer, update the same artifact previews, and
            appear in the same activity log.
          </p>
          <p>The Studio registers eight tools:</p>
          <ResponsiveTable label="AgentMarkup Studio WebMCP tools">
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>get_studio_state</code></td>
                <td>Reads a compact draft, contradictions, and recent activity.</td>
              </tr>
              <tr>
                <td><code>set_site_identity</code></td>
                <td>Sets the site identity and optional Organization data.</td>
              </tr>
              <tr>
                <td><code>set_access_policy</code></td>
                <td>Sets crawler rules by intent group or name, plus Content-Signal.</td>
              </tr>
              <tr>
                <td><code>curate_agent_pages</code></td>
                <td>Edits llms.txt sections, usage guidance, and mirror settings.</td>
              </tr>
              <tr>
                <td><code>configure_agent_card</code></td>
                <td>Configures and validates the optional A2A Agent Card.</td>
              </tr>
              <tr>
                <td><code>compile_agent_surface</code></td>
                <td>Compiles the draft and reports artifact sizes and findings.</td>
              </tr>
              <tr>
                <td><code>export_build_plan</code></td>
                <td>Returns the complete config when it fits the result budget.</td>
              </tr>
              <tr>
                <td><code>inspect_site</code></td>
                <td>Imports a bounded starting point from the website checker.</td>
              </tr>
            </tbody>
          </ResponsiveTable>
          <p>
            WebMCP is an emerging proposal, not a shipped web standard.
            Browser support is still narrow, which is why the page keeps every
            control available for manual editing when no agent is connected.
          </p>
        </section>

        <section>
          <h2>Why does the Studio need a contradiction engine?</h2>
          <p>
            Two settings can pass validation on their own and still express
            conflicting policies once combined. A validator that checks each
            file in isolation never sees it.
          </p>
          <p>
            C1, &quot;Cited content blocks retrieval&quot;, is the clearest
            example. The draft has one or more pages in{' '}
            <a href="/docs/llms-txt/"><code>llms.txt</code></a>, which presents
            those pages for discovery and use. At the same time, the{' '}
            <a href="/docs/ai-crawlers/">AI crawler policy</a> blocks every
            search and retrieval crawler known to the Studio: OAI-SearchBot,
            PerplexityBot, Claude-SearchBot, and DuckAssistBot.
          </p>
          <p>
            Neither side is malformed. The <code>llms.txt</code> entry has a
            title and URL. The <code>robots.txt</code> directives are valid. In
            combination, the site asks for cited content to be found while
            blocking the crawlers that retrieve it. C1 reports both surfaces
            and the number of listed entries. It does not promise that allowing
            retrieval will make any AI system include, rank, cite, or send
            traffic to the site.
          </p>
          <p>
            C2 through C8 apply the same test to Content-Signal against{' '}
            <code>llms.txt</code> and mirrors, listed pages against mirror
            exclusions, site identity against Organization{' '}
            <a href="/docs/json-ld/">JSON-LD</a> and the Agent Card, training
            rules against the training signal, and guidance with nothing behind
            it. Each finding names the surfaces involved.
          </p>
          <p>
            The Studio produces errors and warnings, not a readiness score. The finding has to point
            to a defined disagreement that a person can inspect. That is also
            the line I draw in the broader explanation of{' '}
            <a href="/blog/what-is-geo/">what GEO can and cannot claim</a>.
          </p>
        </section>

        <section>
          <h2>What stays human-only when an agent edits the draft?</h2>
          <p>
            The agent can set identity, access, content, and Agent Card fields.
            It can compile the result and read the build plan. It has no tool
            for undo, reset, or download. Those controls stay in the visible
            page for the human.
          </p>
          <p>
            Every reducer action records its source at dispatch. The activity
            table shows an Agent or Human badge beside the exact summary of the
            applied change. Provenance is part of the state transition, not a
            label inferred later from whichever control happened to move.
          </p>
          <p>
            Undo rewinds the shared log, reset clears the working draft, and
            download writes a file that can leave the browser. The person can
            reverse an agent change; the agent cannot reverse that correction
            or save a file on its own.
          </p>
          <p>
            The draft is in-memory only. Nothing the agent does in the Studio
            changes a live website. The human downloads{' '}
            <code>agentmarkup.config.mjs</code>, reviews it, installs it in a
            repository, and runs the normal build and deployment separately.
          </p>
        </section>

        <section>
          <h2>How does the agent read exactly what was applied?</h2>
          <p>
            Returning the arguments from a successful tool call would be easy,
            but it would also be false whenever the reducer sanitized a field or
            dropped a crawler at the configured cap. Mutating tool results are
            authored from the reducer&apos;s latest activity entry. The agent
            reads what landed, including the dropped count, instead of an echo
            of what it requested.
          </p>
          <p>
            Because React dispatch is asynchronous, a tool could dispatch an
            action and then read the previous reducer state. The UI would be
            correct a render later, but the agent&apos;s result would be one
            action behind.
          </p>
          <p>
            The reducer is pure, so the tool path now pre-applies it to a ref
            before handing the same action to React:
          </p>
          <CodeBlock code={reducerSnippet} />
          <p>
            Immediate reads use <code>stateRef.current</code>. React then
            computes the identical next state and the render pass resynchronizes
            the ref. That small ordering fix made the tool result truthful at
            the moment the agent receives it.
          </p>
        </section>

        <section>
          <h2>Does this add runtime support to the npm packages?</h2>
          <p>
            No. The <code>@agentmarkup/*</code> packages are still build-time
            only, by design. The Studio is the website gaining a WebMCP tool
            layer. Its browser compiler imports the browser-safe{' '}
            <code>@agentmarkup/core</code> entry and uses the same deterministic
            generators and validators that a user&apos;s build uses.
          </p>
          <p>
            As the draft changes, the compiler previews <code>llms.txt</code>,
            optional <code>llms-full.txt</code>, <code>robots.txt</code>,
            Content-Signal headers, JSON-LD, an optional Agent Card, and the
            config file that describes them. The existing articles on{' '}
            <a href="/blog/why-llms-txt-matters/">why llms.txt matters</a> and{' '}
            <a href="/blog/ai-crawlers-2026/">the crawler intent split</a> cover
            the individual surfaces.
          </p>
          <p>
            The optional <code>inspect_site</code> intake calls the same-origin{' '}
            <a href="/checker/">website checker</a>. Its agent-facing result
            forwards only structured <code>{'{level, title}'}</code> findings,
            never remote page text. The imported draft patch is bounded too.
          </p>
        </section>

        <section>
          <h2>What was built for the WebMCP Challenge?</h2>
          <p>
            The npm packages and the public site predate the hackathon. Everything up to commit{' '}
            <code>93f84f0</code> on 2026-08-23 is prior work.
          </p>
          <p>
            Work for the challenge started on 2026-08-26: the Studio page, the
            eight WebMCP tools, browser wiring for the compiler, the C1-C8
            contradiction workflow, provenance with human-only undo, reset, and
            download, plus the checker-backed inspection intake. The published
            npm packages were not modified for it. The commit split and source
            paths are recorded in the{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/blob/main/HACKATHON.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              repository disclosure
            </a>
            .
          </p>
        </section>

        <section>
          <h2>How can I try AgentMarkup Studio?</h2>
          <p>
            Open <a href="/studio/">agentmarkup.dev/studio/</a> in the ChatGPT
            desktop app&apos;s in-app browser. I verified that path on macOS. The
            banner reads &quot;Agent connected: 8 tools registered.&quot;
          </p>
          <p>
            The alternative is Chrome 149 or newer with{' '}
            <code>chrome://flags/#enable-webmcp-testing</code> enabled, followed
            by a restart. I verified the flow on Chrome 151. iOS does not work
            because its browsers are WebKit-limited.
          </p>
          <p>Start with this:</p>
          <CodeBlock code={starterPrompt} />
          <p>
            If prompted, approve the mutating tool calls. Then say: &quot;now block the AI
            search crawlers too - just do it.&quot; C1 appears in the Findings
            panel. Then say: &quot;fix the contradictions, keep training
            blocked.&quot; Inspect the crawler rules and Content-Signal values
            yourself.
          </p>
          <p>
            Review the generated config before adding it to your repository.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="webmcp-agentmarkup-studio" />
    </main>
  )
}

export default WebMcpAgentMarkupStudio
