import CodeBlock from '../CodeBlock'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'
import { ResponsiveTable } from '../ui/ResponsiveTable'

const heroMarkup = `<main class="home-page">
  <header class="home-hero">
    <h1>Build websites AI can understand.</h1>`

function AFixIsNotAVerification() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-08-23" readingTime="7 min read" slug="a-fix-is-not-a-verification" />
        <h1>The fix for our soft-404 published a second soft-404</h1>
        <p className="doc-intro">
          I shipped a fix for the{' '}
          <a href="/blog/soft-404-ai-discoverability-tools/">
            soft-404 on agentmarkup.dev
          </a>
          , then found that the fix had recreated the same defect at a new URL.
          That was only the first verification failure. The audit could not see
          the new URL, our own thin-content check could not see the homepage
          defect it was meant to catch, the external CLI returned stale results,
          and a green lint command was enforcing zero rules.
        </p>

        <section>
          <h2>The fix created a real page that should not exist</h2>
          <p>
            The original defect came from Cloudflare Pages&apos; assets binding.
            When the output contained no <code>404.html</code>, an unknown path
            fell back to <code>index.html</code> with HTTP 200. Agents probing{' '}
            <code>/openapi.json</code>, <code>/developers</code>, or{' '}
            <code>/about</code> received the app shell and had every reason to
            conclude that those resources existed.
          </p>
          <p>
            The fix was to emit a real prerendered 404 page so Pages could answer
            404 on its own. The worker only negotiates the body. A client that
            explicitly ranks markdown or plain text above HTML receives the
            machine-readable version. Other clients receive the prerendered
            page. Both variants include <code>Vary: Accept</code>, and the
            accepted content type is echoed back verbatim.
          </p>
          <p>
            Then the build did exactly what I had configured it to do. The site
            generates markdown mirrors of its pages. The new 404 page was a page,
            so the build generated <code>/404.md</code>. That URL returned HTTP
            200 with not-found text and carried a canonical link to a URL that
            returned 404.
          </p>
          <p>
            The fix for the original soft-404 had created the original defect
            again at a new URL. The difference was that <code>/404.md</code>{' '}
            genuinely existed, so an audit that probed invented paths would not
            have found it. The response was wrong because the build had
            deliberately published the file.
          </p>
          <p>
            Removing that one file was not enough. A markdown mirror appears in
            more than one generated output, so I added a{' '}
            <code>markdownPages.exclude</code> option and applied it in five
            places: mirror generation, alternate-link injection, canonical
            headers, <code>llms.txt</code> mirror URLs, and mirror-coverage
            validation.
          </p>
          <p>
            The exclusion also had to behave consistently in Vite, Astro, Next,
            and the shared <code>processStaticOutput</code> path used by the CLI
            and the Nuxt module. Excluding <code>404.html</code> from generation
            alone would have removed the file while leaving four other outputs
            pointing at it. Each individual output could look valid while the
            complete artifact set contradicted itself.
          </p>
          <p>
            That is the part I want to keep. A generated asset is rarely just a
            file. It participates in discovery links, headers, indexes, and
            validation. A fix is complete only when every reference agrees with
            what the build actually emitted.
          </p>
        </section>

        <section>
          <h2>The H1 was present and still invisible</h2>
          <p>
            The same external audit reported only 5,055 characters of text
            content and no H1 on the homepage. I checked three times and rejected
            the conclusion each time. The document had exactly one H1, and a
            plain <code>curl</code> returned 7,949 characters of body text. The
            response was byte-identical across four user agents, including{' '}
            <code>GPTBot/1.0</code>.
          </p>
          <p>Both measurements were accurate. My conclusion did not follow.</p>
          <CodeBlock code={heroMarkup} />
          <p>
            Readability-style extractors commonly remove{' '}
            <code>&lt;header&gt;</code> as boilerplate, even when it is nested
            inside <code>&lt;main&gt;</code>. The live page produced these
            measurements before the fix:
          </p>
          <ResponsiveTable label="Homepage text extraction, before the fix">
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>&lt;main&gt;</code> text, headers intact
                </td>
                <td>5,402 chars</td>
              </tr>
              <tr>
                <td>
                  <code>&lt;main&gt;</code> text, headers stripped
                </td>
                <td>4,750 chars, no H1 survives</td>
              </tr>
              <tr>
                <td>What the audit reported</td>
                <td>5,055 chars, no H1</td>
              </tr>
            </tbody>
          </ResponsiveTable>
          <p>
            The reported 5,055 characters sit inside that band. Testing four
            user agents did not test the finding because the fetcher was never
            the variable. The extractor was. I had repeated the same raw-document
            measurement more carefully instead of reproducing the transformation
            that produced the evidence.
          </p>
          <p>
            Five pages wrapped their H1 in a header: the homepage, blog index,
            checker, learn page, and security scan. I replaced those wrappers
            with plain <code>div</code> elements. No CSS depended on the semantic
            tag, so the change had zero visual effect. After the swap, the H1
            survives header stripping and the extracted text is 5,402
            characters.
          </p>
        </section>

        <section>
          <h2>Our own thin-HTML check has the same blind spot</h2>
          <p>
            This was a gap in our own tooling, found by someone else&apos;s.{' '}
            <code>@agentmarkup/audit</code> has a{' '}
            <code>js.thin-html</code> finding, and the hosted checker has a
            thin-HTML card. Both count text in the raw document. Neither models
            boilerplate removal, so neither would have caught this defect on
            agentmarkup.dev. Neither would catch the same defect on another site
            today.
          </p>
          <p>
            The corrective check is now on the backlog: strip{' '}
            <code>&lt;header&gt;</code>, <code>&lt;footer&gt;</code>, and{' '}
            <code>&lt;nav&gt;</code> before counting text, then separately test
            whether an H1 survives that strip.
          </p>
          <p>
            An H1 exists and an H1 survives boilerplate removal are different
            questions. The homepage passed the first one for months while failing
            the second. The useful finding is specifically an H1 present in the
            document but absent from extracted content.
          </p>
          <p>
            That check needs to land in both surfaces: the CLI finding and the
            hosted checker card. It requires no extra network request and no
            heuristic score. It is deterministic and derived entirely from the
            response bytes already fetched. If the required H1 disappears during
            the defined extraction, that is an error. If a recommended item is
            missing, that is a warning. That is the whole scale.
          </p>
        </section>

        <section>
          <h2>The verification command returned an old result</h2>
          <p>
            After shipping the changes, I ran{' '}
            <code>npx is-agentic &lt;domain&gt;</code> again. The command
            retrieves a result, but it does not necessarily start a scan. Its
            methodology says a result may come from a six-hour freshness cache.
            Triggering a new scan requires the web page.
          </p>
          <p>
            One finding in our report was already stale when I read it. The site
            had been serving <code>text/markdown; charset=utf-8</code> with{' '}
            <code>vary: Accept</code> for hours before the report said otherwise.
            Re-running the CLI continued to return the cached report, so the
            apparent verification step never observed the deployed fix.
          </p>
          <p>
            Once I triggered a fresh scan, the tool&apos;s reported score moved
            from 65 to 87. That was 87 at the time of the scan, with more of the
            remaining items addressed after it. The number is what the external
            tool reported, not a measure I use for site quality.
          </p>
          <p>
            The useful evidence was that a fresh fetch saw different responses.
            A fix-then-verify loop where the verify step silently returns cached
            data is not a loop. It is two reads of the same observation.
          </p>
        </section>

        <section>
          <h2>A green lint check was enforcing zero rules</h2>
          <p>
            The same review found a quieter version of the problem in the
            repository. The root <code>pnpm lint</code> command ran ESLint over{' '}
            <code>scripts/</code> and <code>test/</code>, but neither directory
            matched a configuration block. ESLint resolved zero rules there.
            The command passed on every commit and had never checked those files.
          </p>
          <p>
            I also found a misleading failure path in the post-build skill
            template. It wrapped <code>readFile</code> and{' '}
            <code>writeFile</code> in one <code>try/catch</code>, and the error
            message always blamed the read. A permissions or disk failure during
            the write could leave the homepage without JSON-LD while reporting a
            read failure.
          </p>
          <p>
            In both cases, the green or readable result implied more than the
            underlying operation established. The next question for any passing
            check has to be concrete: which inputs did it inspect, which rules
            ran, and which artifact proves that the intended write completed?
          </p>
        </section>

        <section>
          <h2>Validate the artifact, then validate the check</h2>
          <p>
            agentmarkup generates the machine-readable layer at build time:{' '}
            <code>llms.txt</code>, JSON-LD, markdown mirrors, AI-crawler rules,
            and Content-Signal headers. It validates the output the build
            actually produced. The <code>markdownPages.exclude</code> work
            shipped as a package option, including every reference path, so the
            fix is available to the reader rather than existing only in this
            account of the bug.
          </p>
          <p>
            <code>agentmarkup check</code> can run against built output on every
            commit and fail CI when a required artifact is broken. That is a
            better foundation than waiting for a periodic external scan, because
            the check travels with the code and sees the exact artifact intended
            for deployment.
          </p>
          <p>
            It is not complete. A build-time check cannot catch a defect it does
            not model, as our raw thin-HTML count demonstrates. External audits
            found two real defects that our own tooling could not see, and I am
            glad they did.
          </p>
          <p>
            The standard I can defend is narrower: define the failure
            deterministically, run the check against the real built files, and
            keep evidence that the check exercised the rule it claims to enforce.
            A green result is still a claim. It needs verification too.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="a-fix-is-not-a-verification" />
    </main>
  )
}

export default AFixIsNotAVerification