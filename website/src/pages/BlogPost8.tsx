import { SCORE_CATALOG_VERSION, implementedChecks } from '@agentmarkup/core/score'
import type { CheckTier } from '@agentmarkup/core/score'

import Byline from '../Byline'
import BlogFooter from '../BlogFooter'

// Rendered from the catalog so the post cannot drift from the checks that run.
const scoredChecks = implementedChecks()
const checksFor = (tier: CheckTier) => scoredChecks.filter((definition) => definition.tier === tier)
// The same rule as the checker's levelForCheck: a failing required check is an
// error, a failing upside-only bonus signal is an error that never subtracts,
// any other failing check, a partial and an unverified check are warnings.
const upsideOnlyNames = scoredChecks
  .filter((definition) => definition.upsideOnly)
  .map((definition) => definition.name)
  .join(' and ')
const upsideOnlyException = `The exception is the upside-only signals (${upsideOnlyNames}): a failure is shown as an error so it stands out, but it still never subtracts from the score.`
const upsideOnlyError = `Upside-only bonus signals (${upsideOnlyNames}) are also shown as errors when they fail, but they never subtract from the score.`
const TIER_SECTIONS: ReadonlyArray<{ tier: CheckTier; title: string; intro: string }> = [
  { tier: 'required', title: 'Required checks', intro: 'Each one is a gap an agent trips over on the first fetch. A failing required check is reported as an error.' },
  { tier: 'recommended', title: 'Recommended checks', intro: 'Each one makes the site easier to understand or cite. A failing recommended check is reported as a warning.' },
  { tier: 'bonus', title: 'Bonus signals', intro: `Extra credit that never subtracts: a missing bonus signal is a warning that points at an upside, not a penalty. ${upsideOnlyException}` },
]

function WebsiteCheckerGuide() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-03-20" readingTime="8 min read" slug="website-checker" />
        <h1>Is your website ready for AI? Use the free agentmarkup checker to find out</h1>
        <p className="doc-intro">
          Most websites are invisible to AI systems. Not because the content is bad, but because the metadata is missing, broken, or incomplete. The <a href="/checker/">agentmarkup checker</a> audits your website in seconds and tells you exactly what to fix.
        </p>

        <section>
          <h2>Why you need to check your website</h2>
          <p>
            When ChatGPT, Claude, or Perplexity answers a question about your industry, does your website show up? In most cases, the answer is no. Not because your content is not relevant, but because AI systems cannot understand your site.
          </p>
          <p>
            The difference between a website that gets cited by AI and one that
            does not often comes down to a few missing files and metadata tags.
            A robots.txt that accidentally blocks AI crawlers. Missing JSON-LD
            structured data. No llms.txt file. No readable fallback when the
            raw HTML is thin or heavily client-rendered.
          </p>
          <p>
            These are not complex problems. They are configuration gaps that take minutes to fix once you know they exist. The hard part is knowing they exist.
          </p>
        </section>

        <section>
          <h2>What the checker audits</h2>
          <p>
            Enter any public URL at <a href="/checker/">agentmarkup.dev/checker</a> and the tool fetches your homepage, llms.txt, robots.txt, sitemap, markdown mirrors, a sample internal page, and a path that cannot exist. It runs {scoredChecks.length} deterministic checks from a published catalog (v{SCORE_CATALOG_VERSION}), reports each as a pass, warning, or error, and adds them up into a 0-100 agent-readiness score. The lists below are rendered from that catalog.
          </p>

          {TIER_SECTIONS.map(({ tier, title, intro }) => (
            <div key={tier}>
              <h3>{title}</h3>
              <p>{intro}</p>
              <ul>
                {checksFor(tier).map((definition) => (
                  <li key={definition.id}>
                    <strong>{definition.name}</strong>: {definition.rule}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section>
          <h2>How to read the results</h2>
          <p>
            The report opens with a deterministic 0-100 score from a published formula (catalog v{SCORE_CATALOG_VERSION}): every point is traceable to a check you can see; no LLM, no heuristics, no off-site search. Required checks share the largest pool, recommended checks share a smaller one, and bonus signals add a capped extra that never subtracts. The <a href="/score/">methodology page</a> renders the whole formula, the grade bands, and every check from the same code that computes the number.
          </p>
          <p>
            Under the score, each check lands in one of three levels:
          </p>
          <ul>
            <li><strong>Error</strong> - a required check fails. The homepage answers a bot challenge, a path that cannot exist answers 200, there is no readable HTML without JavaScript, or a form field has no label. {upsideOnlyError}</li>
            <li><strong>Warning</strong> - a recommended check or any other bonus signal fails, a check earns only partial credit, or a resource could not be verified in time. A fetch that never completed leaves the denominator instead of lowering the score, and the run is marked provisional with a range.</li>
            <li><strong>Pass</strong> - the check is met, with the evidence it read: counts, ids, URLs, attribute and header values.</li>
          </ul>
          <p>
            Each finding includes the sentence a client would understand, the evidence the rule read, the estimated gain in points, and an action step telling you what to do. The top five fixes by estimated gain are listed first, and a plain-text client summary is one click away.
          </p>
        </section>

        <section>
          <h2>For e-commerce websites</h2>
          <p>
            E-commerce sites have the most to gain from AI discoverability. When someone asks an AI "best running shoes under $150," the AI recommends products from stores it can understand. The checker tells you whether your store is one of them.
          </p>
          <p>
            Key checks for e-commerce:
          </p>
          <ul>
            <li><strong>Product JSON-LD</strong> - does your product page have structured data with name, price, availability? Without it, AI cannot recommend your products accurately.</li>
            <li><strong>Organization schema</strong> - does AI know your brand name and logo? This is how AI associates products with your store in its answers.</li>
            <li><strong>AI crawler access</strong> - is your robots.txt accidentally blocking GPTBot or PerplexityBot? Many e-commerce platforms ship with broad disallow rules that block AI crawlers along with everything else.</li>
            <li><strong>Markdown mirrors</strong> - can AI agents read clean content from your product pages, or do they get an empty JavaScript shell?</li>
          </ul>
          <p>
            Run your store through the checker. If you see warnings for missing Organization schema or no AI crawler rules, those are the first things to fix.
          </p>
        </section>

        <section>
          <h2>For brand and content websites</h2>
          <p>
            If your business depends on being known - a consultancy, an agency, a SaaS product - the checker shows whether AI can accurately describe what you do.
          </p>
          <ul>
            <li><strong>Organization schema</strong> tells AI your exact name, description, and social profiles. Without it, AI might confuse you with another company.</li>
            <li><strong>llms.txt</strong> gives AI a structured overview of your services and pages. Instead of crawling every page, AI reads one file and understands your site.</li>
            <li><strong>Meta description and H1</strong> are the first things AI reads. If they are generic ("Welcome to our website"), AI has nothing useful to work with.</li>
          </ul>
        </section>

        <section>
          <h2>What makes this different from SEO auditors</h2>
          <p>
            Traditional SEO tools check whether Google can index your pages. The agentmarkup checker checks whether AI systems can understand your content. These overlap but are not the same.
          </p>
          <ul>
            <li><strong>llms.txt</strong> is not checked by any SEO tool. It is AI-specific.</li>
            <li><strong>Markdown mirrors</strong> are irrelevant to Google but useful when the raw HTML is thin, heavily client-rendered, or cluttered with layout noise.</li>
            <li><strong>AI crawler rules</strong> (GPTBot, ClaudeBot) are separate from Googlebot rules. You might have perfect Google indexing while being completely invisible to ChatGPT.</li>
            <li><strong>A score you can audit.</strong> SEO tools give you a number out of 100 from a weighting you never see. The checker&apos;s score comes from a <a href="/score/">published formula</a>: every point is traceable to a check you can see, and each finding still names the exact change, so &quot;your robots.txt blocks PerplexityBot&quot; sits next to the points it would recover.</li>
          </ul>
        </section>

        <section>
          <h2>Try it now</h2>
          <p>
            Go to <a href="/checker/">agentmarkup.dev/checker</a>, enter your
            website URL, and see the results in seconds. It is free and requires
            no signup. The deployed checker may retain normalized check records
            briefly for caching, rate limiting, and recent-history views, but it
            is not a lead form.
          </p>
          <p>
            If the checker finds issues, the documentation guides on this site
            explain how to fix each one. Or install{' '}
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup</a>{' '}
            for Vite, Astro, or Next.js and it handles llms.txt, JSON-LD,
            robots.txt, markdown mirrors, optional headers, and validation
            automatically at build time.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="website-checker" />
    </main>
  )
}

export default WebsiteCheckerGuide
