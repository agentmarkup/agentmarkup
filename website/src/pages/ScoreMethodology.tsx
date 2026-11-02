import {
  AI_SEARCH_AGENTS,
  BONUS_CAP,
  BONUS_PER_SIGNAL,
  CHALLENGE_MARKERS,
  GRADE_BANDS,
  GRADE_LABELS,
  MAX_EVALUATED_BODY_CHARS,
  NOT_FOUND_PROBE_ACCEPT,
  NOT_FOUND_PROBE_PATH,
  POOLS,
  SCORE_CATALOG,
  SCORE_CATALOG_VERSION,
  SCORE_FORMULA_VERSION,
  TOP_FIXES_LIMIT,
  TRAINING_CRAWLERS,
} from '@agentmarkup/core/score'
import type { CheckDefinition, CheckTier } from '@agentmarkup/core/score'

import { RESOURCE_LABELS } from '../checker/check-copy'
import '../ui/score.css'

// Every number on this page is computed from the catalog and formula constants
// so the copy cannot drift from the code that produces the score.
const TIERS: ReadonlyArray<{ tier: CheckTier; title: string; pool: string }> = [
  { tier: 'required', title: 'Required checks', pool: `${POOLS.required}-point pool, even weight over eligible checks` },
  { tier: 'recommended', title: 'Recommended checks', pool: `${POOLS.recommended}-point pool, even weight over eligible checks` },
  { tier: 'bonus', title: 'Bonus signals', pool: `${BONUS_PER_SIGNAL} points each times the fraction, capped at +${BONUS_CAP}, never subtracts` },
]

const rowsFor = (tier: CheckTier) => SCORE_CATALOG.filter((definition) => definition.tier === tier)
const implemented = SCORE_CATALOG.filter((definition) => definition.availability === 'now')
const catalogTwo = SCORE_CATALOG.filter((definition) => definition.availability === 'catalog-2.0')
const later = SCORE_CATALOG.filter((definition) => definition.availability === 'later')
const implementedFor = (tier: CheckTier) => implemented.filter((definition) => definition.tier === tier).length
const requiredNow = implementedFor('required')
const recommendedNow = implementedFor('recommended')
const bonusNow = implementedFor('bonus')
const fetchCount = Object.keys(RESOURCE_LABELS).length
const maxBonusBeforeCap = bonusNow * BONUS_PER_SIGNAL

const bands = GRADE_BANDS.map(([min, grade], index) => ({
  grade,
  min,
  max: index === 0 ? 100 : GRADE_BANDS[index - 1][0] - 1,
  label: GRADE_LABELS[grade],
}))

function availabilityLabel(definition: CheckDefinition): string {
  if (definition.availability === 'now') {
    return `Scored (catalog ${SCORE_CATALOG_VERSION})`
  }
  if (definition.availability === 'catalog-2.0') {
    return 'Not measured: needs one extra fetch, a catalog 2.0 decision'
  }
  if (definition.surface) {
    return `Not measured: listed for parity; not applicable without a ${definition.surface} surface`
  }
  return 'Not measured: listed for parity with the Ora catalog'
}

const divergences = [
  'A real 404 or 410 for a path that cannot exist earns full credit on nav.not-found; an agent-readable (markdown or JSON) 404 body is the separate bonus nav.not-found-markdown. Ora gives partial credit for the status alone.',
  'The two robots.txt policy checks are scored as one recommended check, robots.ai-search-access, over the AI search and agent user agents only. Blocking training crawlers is reported as a policy note and never subtracts.',
  'MCP and API checks are not applicable to a site without an MCP or API surface, so a public content website is not penalized for omitting an interface it does not provide. Ora scores mcp-server for every site.',
  'The ax.* checks are static-HTML proxies of a browser accessibility tree: they count elements and attributes in the served HTML and cannot see handlers bound by JavaScript.',
  'trust.anchors measures whether About, Contact and Privacy pages are linked from the homepage, not the depth of those pages.',
  'llms.agent-instruction is a presence rule: it looks for explicit guidance wording or a summary blockquote, not for the quality of the advice.',
  'jsonld.identity is evaluated over parseable JSON-LD blocks only; an unparseable block is reported by jsonld.syntax, an upside-only bonus shown as an error-level finding that never subtracts from the score.',
  'A check whose evidence never completed (a timed-out or failed fetch, a 429 or a 5xx without challenge markers) is unverified: it leaves the denominator, marks the run provisional with a pessimistic-to-optimistic range, and is never cached or stored.',
]

function ScoreMethodology() {
  return (
    <main>
      <article className="doc-page score-page">
        <p className="license-kicker section-kicker">Score methodology</p>
        <h1>How the agent-readiness score is computed</h1>
        <p className="doc-intro">
          The <a href="/checker/">website checker</a> reports a deterministic 0-100 agent-readiness
          score with a letter grade. This page is the formula. Every constant, every check and every
          threshold below is rendered from the same code that produces the score, so there is no
          unpublished formula and no hidden weighting.
        </p>

        <div className="score-page-facts" aria-label="Score facts">
          <div className="score-page-fact"><span>Catalog</span><strong>v{SCORE_CATALOG_VERSION}</strong></div>
          <div className="score-page-fact"><span>Formula</span><strong>v{SCORE_FORMULA_VERSION}</strong></div>
          <div className="score-page-fact"><span>Checks scored now</span><strong>{implemented.length}</strong></div>
          <div className="score-page-fact"><span>Required pool</span><strong>{POOLS.required}</strong></div>
          <div className="score-page-fact"><span>Recommended pool</span><strong>{POOLS.recommended}</strong></div>
          <div className="score-page-fact"><span>Bonus cap</span><strong>+{BONUS_CAP}</strong></div>
        </div>

        <section id="what">
          <h2>What the score is</h2>
          <p>
            A deterministic 0-100 agent-readiness score for public content websites, computed from the{' '}
            {fetchCount} fetches the checker already makes (homepage, one sampled internal page, their
            markdown mirrors, llms.txt, robots.txt, the sitemap and a probe for a path that cannot exist).
            No LLM, no heuristics, no off-site search, and no extra request per check. The same engine runs
            in the browser on the checker page and in Node, and both compute identical numbers from the
            same evidence.
          </p>
          <p>
            The score does not predict inclusion, ranking, traffic or citation by any AI system. It states
            what the fetched responses show, check by check, and how those checks add up under the rules
            below.
          </p>
        </section>

        <section id="lens">
          <h2>The lens</h2>
          <p>
            The structure is Essentials-shaped: required checks share a {POOLS.required}-point pool,
            recommended checks share {POOLS.recommended} points, and bonus signals add {BONUS_PER_SIGNAL}{' '}
            points each up to a cap of +{BONUS_CAP}. That structure is modelled on the published Essentials
            layer of Ora (is-agentic.com, contract version 1.38.0, audit of agentmarkup.dev dated
            2026-10-10). This is not Ora&apos;s score: Ora&apos;s headline grade is a different, layered
            lens, several of its checks need fetches this engine does not make, and the divergences are
            listed below. Agreement with Ora was checked on one site only; no calibration is claimed for
            any other site.
          </p>
        </section>

        <section id="statuses">
          <h2>Status semantics</h2>
          <p>Each check ends in exactly one status. Only the first three sit in the denominator.</p>
          <ul>
            <li><strong>pass</strong>: fraction 1. Eligible.</li>
            <li><strong>partial</strong>: fraction strictly between 0 and 1, earning proportional credit. Eligible.</li>
            <li><strong>fail</strong>: fraction 0. Eligible.</li>
            <li><strong>not applicable</strong>: the applicability rule says the check does not apply to this site (no form fields, no served markdown, no API or MCP surface, a blocked homepage). Leaves the denominator; listed in the panel with the reason.</li>
            <li><strong>could not be verified</strong>: the evidence the check needs did not complete (status 0, a transport error, a 2xx without a body, a skipped fetch, a 429 or a 5xx without challenge markers). Leaves the denominator. One such check marks the whole run <strong>provisional</strong>: the panel shows the score with a pessimistic-to-optimistic range (every unverified check at fraction 0 and at fraction 1), the worker never caches the run, and it is never stored as a monthly reading. A timed-out fetch therefore never lowers the score.</li>
            <li><strong>not measured</strong>: listed in the catalog for parity but not implemented in this version. Leaves the denominator.</li>
          </ul>
          <p>
            Two homepage rules sit above everything else. If the homepage itself could not be verified,
            every check is unverified, the run is <strong>blocked</strong> and there is no score. If the
            homepage answers a bot challenge or a 401/403, reach.bot-detection scores 0 with the status and
            marker quoted, every other homepage-derived check is not applicable, and the score is computed
            from what remains (robots.txt, llms.txt, the sitemap and the probe). A challenge page is never
            evaluated for headings, JSON-LD or landmarks.
          </p>
        </section>

        <section id="catalog">
          <h2>The catalog</h2>
          <p>
            {SCORE_CATALOG.length} rows: {implemented.length} scored in catalog {SCORE_CATALOG_VERSION}{' '}
            ({requiredNow} required, {recommendedNow} recommended, {bonusNow} bonus), {catalogTwo.length}{' '}
            that need one extra fetch each and wait for a catalog 2.0 decision, and {later.length} listed for
            parity with Ora&apos;s catalog and not measured (off-site search, API, MCP and payment surfaces).
            Each row names what it reads, the exact rule with thresholds, the Ora counterpart, and the
            sentence a non-technical client sees on a pass and on a fail.
          </p>
          {TIERS.map(({ tier, title, pool }) => (
            <div key={tier}>
              <h3>{title}</h3>
              <p>{pool}.</p>
              <div className="table-scroll" role="region" aria-label={`${title} table`} tabIndex={0}>
                <table className="doc-table score-catalog-table">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Applies when</th>
                      <th>Reads</th>
                      <th>Rule</th>
                      <th>Status in this version</th>
                      <th>Ora counterpart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsFor(tier).map((definition) => (
                      <tr key={definition.id} id={definition.id}>
                        <td>
                          <strong>{definition.name}</strong>
                          <br />
                          <code>{definition.id}</code>
                          <span className="score-catalog-sentence">Pass: {definition.clientSentence.pass}</span>
                          <span className="score-catalog-sentence">Fail: {definition.clientSentence.fail}</span>
                        </td>
                        <td>{definition.applicability}</td>
                        <td>{definition.evidence}</td>
                        <td>{definition.rule}</td>
                        <td className="score-catalog-narrow">{availabilityLabel(definition)}</td>
                        <td className="score-catalog-narrow">{definition.oraCounterpart ?? 'none (agentmarkup only)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>

        <section id="formula">
          <h2>Formula v{SCORE_FORMULA_VERSION} and grade bands</h2>
          <ol>
            <li>The eligible set per tier is the checks in that tier with status pass, partial or fail. Not applicable, could-not-be-verified and not-measured checks leave the denominator.</li>
            <li><code>required.earned = {POOLS.required} x sum(fraction over eligible required) / count(eligible required)</code>, and <code>recommended.earned = {POOLS.recommended} x sum(fraction over eligible recommended) / count(eligible recommended)</code>. Partial results earn proportional credit.</li>
            <li><code>bonus.points = min({BONUS_CAP}, {BONUS_PER_SIGNAL} x sum(fraction over bonus checks with status pass or partial))</code>. The absence of a bonus signal never subtracts. With {bonusNow} bonus signals scored now the maximum is {maxBonusBeforeCap} points before the cap binds.</li>
            <li><code>raw = required.earned + recommended.earned + bonus.points</code>, reported to two decimals beside the integer; <code>score = min(100, round-half-up(raw))</code>.</li>
            <li>The grade comes from the bands below and the label from the grade. The bands are agentmarkup&apos;s own: they are not evidenced in any Ora file or page.</li>
            <li>A run is <strong>complete</strong> when no check is unverified, <strong>provisional</strong> when at least one is (with the pessimistic-to-optimistic range), and <strong>blocked</strong> when the homepage is unverified (no score).</li>
            <li>A tier with zero eligible checks contributes 0 and is reported as not applicable. This cannot happen for the required tier on a reachable HTML homepage because reach.bot-detection is always eligible.</li>
            <li>The catalog and formula versions are embedded in every report; a comparison between reports with different major versions is refused (&quot;formula changed, re-baseline&quot;).</li>
          </ol>
          <div className="table-scroll" role="region" aria-label="Grade bands" tabIndex={0}>
            <table className="doc-table score-bands">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Score</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((band) => (
                  <tr key={band.grade}>
                    <td>{band.grade}</td>
                    <td>{band.min} to {band.max}</td>
                    <td>{band.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Quantisation</h3>
          <p>
            Required steps are {POOLS.required} / N for N eligible required checks:{' '}
            {(POOLS.required / requiredNow).toFixed(1)} points per full fail at N = {requiredNow} (every
            required check eligible), {(POOLS.required / (requiredNow - 1)).toFixed(1)} at N ={' '}
            {requiredNow - 1} (for example, a homepage without form fields). One required flip can cross a
            grade band. This is inherent to the pool structure; the mitigations are that an unverified check
            never counts, that multi-rule checks earn proportional credit, that the raw score is shown beside
            the integer, and that transient HTTP states (429, 5xx) never score.
          </p>
        </section>

        <section id="gain">
          <h2>Estimated gain and top fixes</h2>
          <p>Every non-passing eligible check carries the gain this score would get if the check reached fraction 1 with the current denominator:</p>
          <ul>
            <li><code>required / recommended: round1((1 - fraction) x pool / count(eligible in tier))</code></li>
            <li><code>bonus: round2(min((1 - fraction) x {BONUS_PER_SIGNAL}, {BONUS_CAP} - bonus.points))</code></li>
            <li>null when the check already passes; not applicable, unverified and not-measured checks never carry a gain.</li>
          </ul>
          <p>
            Top fixes are ranked by estimated gain, then tier (required, recommended, bonus), then catalog
            order; the panel lists the first {TOP_FIXES_LIMIT}. Gains assume the current denominator: a fix
            that makes other checks eligible (serving markdown makes markdown.code-fences eligible) changes
            the count, so gains are estimates. When the score is already 100 the panel says &quot;at the
            cap&quot; and still lists the remaining gains so required gaps stay visible.
          </p>
        </section>

        <section id="divergences">
          <h2>Divergences from Ora</h2>
          <ul>
            {divergences.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>

        <section id="sampling">
          <h2>Sampling, caps and published lists</h2>
          <ul>
            <li><strong>Sample page</strong>: the first same-origin link in document order on the homepage, resolved against the final homepage URL after redirects. Every report names it; a navigation reorder can change it.</li>
            <li><strong>Same origin</strong> is judged against the origin of the final homepage URL, never the requested one, so an apex-to-www redirect does not fail trust.anchors.</li>
            <li><strong>Evaluation cap</strong>: checks read at most the first {MAX_EVALUATED_BODY_CHARS.toLocaleString('en-US')} characters of any body; a truncated body is flagged in the evidence.</li>
            <li><strong>Missing-path probe</strong>: <code>{NOT_FOUND_PROBE_PATH}</code> at the final-URL origin, following no redirects, with <code>Accept: {NOT_FOUND_PROBE_ACCEPT}</code> so a compliant negotiator can answer markdown or JSON.</li>
            <li><strong>Challenge markers</strong> (a response header <code>cf-mitigated</code> containing <code>challenge</code>, or any of these strings in the first 20 KB of the body): {CHALLENGE_MARKERS.map((marker, index) => (<span key={marker}>{index > 0 ? ', ' : ''}<code>{marker}</code></span>))}. Additions bump the catalog minor version.</li>
            <li><strong>AI search and agent user agents</strong> scored by robots.ai-search-access: {AI_SEARCH_AGENTS.join(', ')}.</li>
            <li><strong>Training crawlers</strong> reported as a policy note, never scored: {TRAINING_CRAWLERS.join(', ')}.</li>
            <li><strong>Text resource</strong>: a 2xx response whose content type is not HTML and whose body is not an HTML document. A host answering 200 HTML for llms.txt, robots.txt or a markdown URL reads as absent for that resource; a 200 status is not proof.</li>
          </ul>
        </section>

        <section id="versioning">
          <h2>Versioning</h2>
          <p>
            The catalog and the formula carry semantic versions. Any change to required or recommended
            membership (adding, removing or re-tiering a check) bumps the catalog MAJOR version because it
            changes denominators; a rule change inside a check bumps MINOR; a copy-only change bumps PATCH.
            Scores compare only within a major version, and every report embeds both versions so a stale
            comparison is refused instead of silently mixing formulas. The {catalogTwo.length} checks that
            need an extra fetch are therefore a catalog 2.0 decision, not a point release.
          </p>
        </section>

        <section id="reproduce">
          <h2>Reproduce it yourself</h2>
          <p>
            The checker&apos;s &quot;Technical details and resources&quot; panel shows the fetched
            resources, and every finding carries the evidence string the rule read: counts, ids, URLs,
            attribute and header values, never raw HTML. The engine itself is open source in the{' '}
            <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer">agentmarkup repository</a>{' '}
            under <code>packages/core/src/score/</code> as the <code>score</code> entry of{' '}
            <code>@agentmarkup/core</code> (<code>evaluateSiteChecks</code> and <code>scoreChecks</code>).
            From Node, <code>npx @agentmarkup/audit &lt;url&gt; --score</code> prints the same report once
            the audit release that carries the flag is on npm.
          </p>
        </section>

        <section id="changelog">
          <h2>Change log</h2>
          <ul>
            <li>
              Catalog {SCORE_CATALOG_VERSION} and formula {SCORE_FORMULA_VERSION} (November 2026): first
              public version. {implemented.length} checks scored with zero extra fetches, {catalogTwo.length}{' '}
              awaiting a catalog 2.0 decision, {later.length} listed for parity and not measured.
            </li>
          </ul>
        </section>
      </article>
    </main>
  )
}

export default ScoreMethodology
