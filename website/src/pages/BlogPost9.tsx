import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

function WhenMarkdownMirrorsHelp() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="7 min read" />
        <h1>When markdown mirrors help, and when they do not</h1>
        <p className="doc-intro">
          Generated markdown mirrors are useful for some sites and unnecessary
          for others. The honest answer depends on what your raw HTML already
          looks like and whether agents need a cleaner fetch target than the
          page you already serve.
        </p>

        <section>
          <h2>The problem mirrors are trying to solve</h2>
          <p>
            A public page can be technically crawlable and still be a bad
            machine-facing document. If the response is mostly app shell,
            navigation, layout wrappers, and scripts, fetch-based agents have to
            infer the real page body from noisy HTML.
          </p>
          <p>
            A generated markdown mirror gives those agents a simpler fetch path:
            title, description, source URL, headings, lists, paragraphs, and
            code blocks without the surrounding chrome.
          </p>
        </section>

        <section>
          <h2>Where markdown mirrors help</h2>
          <ul>
            <li><strong>Thin client-rendered pages.</strong> If the raw HTML is mostly shell before JavaScript runs, a mirror can be the only useful body content a fetch-based agent sees.</li>
            <li><strong>Layout-heavy pages.</strong> Marketing pages with large nav trees, cookie UI, scripts, and repeated components can benefit from a cleaner derivative.</li>
            <li><strong>Sites that want an explicit machine-facing fetch target.</strong> A mirror can sit alongside <code>llms.txt</code> and JSON-LD as another agent-readable artifact.</li>
            <li><strong>Teams that want deterministic output.</strong> A build-time derivative is easier to inspect and debug than a runtime readability layer you do not control.</li>
          </ul>
        </section>

        <section>
          <h2>Where markdown mirrors do not add much</h2>
          <ul>
            <li><strong>Server-rendered content sites with good HTML.</strong> If the raw page already contains substantial readable body content, HTML may already be enough.</li>
            <li><strong>Markdown-authored static sites.</strong> If you already author in markdown and publish strong HTML, a second public markdown output is often unnecessary.</li>
            <li><strong>Pages where the extraction loses meaning.</strong> Tables, interactive widgets, or complex layouts can become less accurate when flattened to markdown.</li>
          </ul>
          <p>
            This is why the strongest version of the feature is not &quot;every
            page should publish markdown&quot;. It is &quot;some pages benefit from a
            cleaner machine-facing artifact&quot;.
          </p>
        </section>

        <section>
          <h2>The real tradeoffs</h2>
          <p>
            The objections are real. Public mirrors can create duplicate fetches
            and indexing ambiguity. If they are hand-maintained, they also
            create a second source of truth that will eventually drift.
          </p>
          <p>
            There is also a product risk: as agent tooling gets better at
            reading messy HTML directly, the gap that mirrors solve may narrow.
            That makes this more likely to be a tactical feature than the final
            shape of machine-readable publishing.
          </p>
        </section>

        <section>
          <h2>How agentmarkup tries to keep the feature disciplined</h2>
          <ul>
            <li><strong>Generated from final HTML.</strong> The mirror is derived from the built page, not maintained separately by hand.</li>
            <li><strong>Canonical headers point back to HTML.</strong> The HTML page stays the preferred canonical page for search engines.</li>
            <li><strong>The checker is conditional.</strong> Missing markdown is treated as a real issue only when the paired HTML is thin.</li>
            <li><strong><code>llms.txt</code> can stay HTML-first.</strong> If your raw HTML is already substantial, set <code>llmsTxt.preferMarkdownMirrors</code> to <code>false</code>.</li>
          </ul>
        </section>

        <section>
          <h2>The more durable product surface</h2>
          <p>
            The long-term durable value is probably not &quot;every site needs
            markdown mirrors&quot;. It is better tooling around agent-readiness:
            checking raw HTML quality, validating machine-readable outputs,
            verifying crawler policy, and making tradeoffs explicit.
          </p>
          <p>
            That is why the checker matters. It can tell you whether the HTML is
            already good enough, whether a markdown mirror would add signal, and
            whether the rest of your machine-readable surface is coherent.
          </p>
        </section>

        <section>
          <h2>The bottom line</h2>
          <p>
            Markdown mirrors make sense as an optional, tactical feature for
            thin or noisy HTML. They are not a universal best practice, and they
            should not be marketed as one.
          </p>
          <p>
            If your raw HTML already reads cleanly, keep HTML as the primary
            fetch target. If it does not, a generated markdown derivative can be
            a pragmatic bridge while the broader machine-readable stack keeps
            improving.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="when-markdown-mirrors-help" />
    </main>
  )
}

export default WhenMarkdownMirrorsHelp
