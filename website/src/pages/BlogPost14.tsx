import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'
import { fortune500, type F500Row } from '../data/company-audit'

// Reveal a block once it scrolls into view (adds `is-revealed`).
// Hydration-safe: the class is only added on the client, after mount.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-revealed')
            io.disconnect()
          }
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

function CountUp({ end, suffix = '' }: { end: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    let started = false
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || started) continue
          started = true
          const startedAt = performance.now()
          const duration = 1000
          const tick = (now: number) => {
            const t = Math.min(1, (now - startedAt) / duration)
            const eased = 1 - Math.pow(1 - t, 3)
            el.textContent = Math.round(end * eased) + suffix
            if (t < 1) requestAnimationFrame(tick)
            else el.textContent = end + suffix
          }
          el.textContent = '0' + suffix
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [end, suffix])
  return (
    <span ref={ref}>
      {end}
      {suffix}
    </span>
  )
}

function Stat({
  kicker,
  end,
  suffix,
  label,
  sub,
}: {
  kicker: string
  end: number
  suffix?: string
  label: string
  sub: string
}) {
  return (
    <div className="f500-stat">
      <div className="f500-kicker">{kicker}</div>
      <div className="f500-stat-num">
        <CountUp end={end} suffix={suffix} />
      </div>
      <div className="f500-stat-label">{label}</div>
      <div className="f500-stat-sub">{sub}</div>
    </div>
  )
}

const countRows = (predicate: (row: F500Row) => boolean) => fortune500.filter(predicate).length
const percentOfRows = (count: number) => Math.round((count / fortune500.length) * 100)
const GRID_COLUMNS = 28
const AUDIT_SUMMARY = {
  total: fortune500.length,
  usableJsonLd: countRows((row) => row.j === 2),
  validLlmsTxt: countRows((row) => row.l === 2),
  contentSignalSet: countRows((row) => row.c === 1),
  blankPage: countRows((row) => row.s === 0),
  thinHtml: countRows((row) => row.s === 1),
  robotsDisallow: countRows((row) => row.r === 1),
  brokenJsonLd: countRows((row) => row.j === 1),
  crawlerGetsLess: countRows((row) => row.x === 1),
  hardErrors: countRows((row) => row.w === 'e'),
  warnings: countRows((row) => row.w === 'w'),
}
const fullyClean = AUDIT_SUMMARY.total - AUDIT_SUMMARY.hardErrors - AUDIT_SUMMARY.warnings

const SIGNALS: { name: string; note: string; on: (r: F500Row) => boolean }[] = [
  {
    name: 'Structured data',
    note: `${AUDIT_SUMMARY.usableJsonLd} / ${AUDIT_SUMMARY.total} · ${percentOfRows(AUDIT_SUMMARY.usableJsonLd)}%`,
    on: (r) => r.j === 2,
  },
  {
    name: 'llms.txt',
    note: `${AUDIT_SUMMARY.validLlmsTxt} / ${AUDIT_SUMMARY.total} · ${percentOfRows(AUDIT_SUMMARY.validLlmsTxt)}%`,
    on: (r) => r.l === 2,
  },
  {
    name: 'Content-Signal',
    note: `${AUDIT_SUMMARY.contentSignalSet} / ${AUDIT_SUMMARY.total} · under 1%`,
    on: (r) => r.c === 1,
  },
]

function SignalGrid({
  signal,
  onPick,
}: {
  signal: (typeof SIGNALS)[number]
  onPick: (i: number) => void
}) {
  const ref = useReveal<HTMLDivElement>()
  const [activeIndex, setActiveIndex] = useState(0)
  const gridRows = Array.from({ length: Math.ceil(fortune500.length / GRID_COLUMNS) }, (_, rowIndex) =>
    fortune500.slice(rowIndex * GRID_COLUMNS, (rowIndex + 1) * GRID_COLUMNS),
  )

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const grid = event.currentTarget.closest('[role="grid"]')
    const columns = GRID_COLUMNS
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = Math.min(fortune500.length - 1, index + 1)
    else if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1)
    else if (event.key === 'ArrowDown') nextIndex = Math.min(fortune500.length - 1, index + columns)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - columns)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = fortune500.length - 1
    else return
    event.preventDefault()
    setActiveIndex(nextIndex)
    grid?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus()
  }

  return (
    <div>
      <div className="f500-unit-cap">
        <span className="f500-unit-name">{signal.name}</span>
        <span className="f500-unit-val">{signal.note}</span>
      </div>
      <div
        className="f500-grid is-interactive"
        ref={ref}
        role="grid"
        aria-label={`${signal.name} by company. Use arrow keys to explore.`}
      >
        {gridRows.map((row, rowIndex) => (
          <div className="f500-grid-row" role="row" key={row[0].d}>
            {row.map((company, columnIndex) => {
              const index = rowIndex * GRID_COLUMNS + columnIndex
              const on = signal.on(company)
              return (
                <button
                  type="button"
                  key={company.d}
                  data-idx={index}
                  title={company.d}
                  className={on ? 'f500-cell on' : 'f500-cell off'}
                  style={on ? ({ ['--i']: index } as CSSProperties) : undefined}
                  role="gridcell"
                  tabIndex={activeIndex === index ? 0 : -1}
                  aria-label={`${company.d}: ${on ? `has ${signal.name}` : `does not have ${signal.name}`}`}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleGridKeyDown(event, index)}
                  onClick={() => onPick(index)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function verdictRows(r: F500Row): [string, string, boolean][] {
  return [
    ['Structured data (JSON-LD)', r.j === 2 ? 'Present' : r.j === 1 ? 'Broken' : 'Missing', r.j === 2],
    ['llms.txt', r.l === 2 ? 'Present' : r.l === 1 ? 'Malformed' : 'Missing', r.l === 2],
    ['Content-Signal usage rules', r.c ? 'Set' : 'None', !!r.c],
    ['Content without JavaScript', r.s === 2 ? 'Server-rendered' : r.s === 1 ? 'Thin' : 'Empty shell', r.s === 2],
    ['Sitemap discovered', r.m ? 'Yes' : 'No', !!r.m],
    ['robots.txt AI-crawler rule', r.r ? 'Disallows a crawler' : 'No block', !r.r],
    ['Crawler vs browser content', r.x ? 'Crawler gets less' : 'Parity', !r.x],
  ]
}

function CompanyModal({ row, onClose }: { row: F500Row; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    dialog?.showModal()
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      prev?.focus?.()
    }
  }, [])

  return (
      <dialog
        ref={dialogRef}
        className="f500-modal"
        aria-labelledby="f500-dialog-title"
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); dialogRef.current?.close() } }}
        onClose={onClose}
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close() }}
      >
        <button className="f500-modal-close" ref={closeRef} onClick={() => dialogRef.current?.close()} aria-label="Close">
          &times;
        </button>
        <h2 className="f500-modal-domain" id="f500-dialog-title">{row.d}</h2>
        <div className={row.w === 'e' ? 'f500-modal-verdict is-err' : 'f500-modal-verdict'}>
          {row.w === 'e' ? 'Has a build-breaking error' : 'Warnings only, no hard errors'}
        </div>
        <ul className="f500-modal-list">
          {verdictRows(row).map(([label, val, ok]) => (
            <li key={label}>
              <span className={ok ? 'f500-modal-mark ok' : 'f500-modal-mark no'} aria-hidden="true">
                {ok ? (
                  <svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.5 3.5 7.5-8" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="m8 8 8 8M16 8l-8 8" /></svg>
                )}
              </span>
              <span className="f500-modal-k">{label}</span>
              <span className="f500-modal-v">{val}</span>
            </li>
          ))}
        </ul>
        <pre className="f500-cmd" tabIndex={0} aria-label="Audit command"><code>npx @agentmarkup/audit https://{row.d}</code></pre>
      </dialog>
  )
}

function Explorer() {
  const [selected, setSelected] = useState<F500Row | null>(null)
  const [query, setQuery] = useState('')

  const submitQuery = (value: string) => {
    const v = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const hit = fortune500.find((r) => r.d === v || r.d === `${v}.com`)
    if (hit) {
      setSelected(hit)
      setQuery('')
    }
  }

  return (
    <div>
      <p className="f500-hint">
        Each square is one of the 370 companies, inked in if it has the signal.
        Click any square, use the arrow keys, or search to see that company's full result.
      </p>
      <input
        className="f500-search"
        list="f500-companies"
        placeholder="Find a company, e.g. netflix.com"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          submitQuery(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitQuery((e.target as HTMLInputElement).value)
        }}
        aria-label="Find a company"
      />
      <datalist id="f500-companies">
        {fortune500.map((r) => (
          <option key={r.d} value={r.d} />
        ))}
      </datalist>

      <div className="f500-units">
        {SIGNALS.map((signal) => (
          <SignalGrid
            key={signal.name}
            signal={signal}
            onPick={(i) => setSelected(fortune500[i])}
          />
        ))}
      </div>
      <p className="f500-units-legend">
        <span className="f500-key on">has the signal</span>
        <span className="f500-key off">does not have the signal</span>
        <span>Click a square or use arrow keys for details.</span>
      </p>

      {selected && <CompanyModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function FortuneReport() {
  return (
    <main>
    <article className="doc-page blog-post f500-report">
        <Byline date="2026-07-02" readingTime="5 min read" slug="ai-crawler-audit-500-companies" />
        <h1>We ran 500 of America's biggest companies through an AI-crawler audit</h1>
        <p className="doc-intro">
          America's biggest companies built their websites for Google's crawler.
          Almost none have built anything for the AI agents now reading the web on
          people's behalf. We fetched 500 corporate homepages the way ChatGPT,
          Claude, and Perplexity do. Most serve readable HTML, but the layer that
          makes a page reliably machine-legible is mostly missing, and seven serve
          a crawler nothing but a blank page.
        </p>

        <section>
          <div className="f500-stats">
            <Stat kicker="Structured data" end={percentOfRows(AUDIT_SUMMARY.total - AUDIT_SUMMARY.usableJsonLd)} suffix="%" label="have no usable JSON-LD" sub="nothing machine-readable saying what the page is" />
            <Stat kicker="Discovery" end={percentOfRows(AUDIT_SUMMARY.total - AUDIT_SUMMARY.validLlmsTxt)} suffix="%" label="have no valid llms.txt" sub="missing or malformed AI-discovery file" />
            <Stat kicker="Usage rules" end={percentOfRows(AUDIT_SUMMARY.total - AUDIT_SUMMARY.contentSignalSet)} suffix="%" label="set no AI-usage signal" sub="Content-Signal, the new opt-in standard" />
            <Stat kicker="Broken" end={AUDIT_SUMMARY.blankPage} label="serve crawlers a blank page" sub="content hidden behind JavaScript they don't run" />
          </div>
        </section>

        <section>
          <h2>The AI-era layer is almost empty</h2>
          <p>
            These are the signals that let an AI agent parse a page with confidence,
            point back to it, and respect how you want it used. Adoption falls off a
            cliff, and you can inspect any single company below.
          </p>
          <Explorer />
        </section>

        <section>
          <h2>It is not just what is missing</h2>
          <p>
            Some of what we found is not an empty field but a broken one: a defect
            provable from the response itself, the kind that fails a CI check.
          </p>
          <div className="f500-stats">
            <Stat kicker="robots.txt" end={AUDIT_SUMMARY.robotsDisallow} label="disallow an AI crawler" sub="block GPTBot or a peer outright" />
            <Stat kicker="Structured data" end={AUDIT_SUMMARY.brokenJsonLd} label="ship broken JSON-LD" sub="markup an agent cannot parse" />
            <Stat kicker="Bait and switch" end={AUDIT_SUMMARY.crawlerGetsLess} label="show crawlers less than a browser" sub="the bot gets a thinner page than you" />
            <Stat kicker="Near-empty" end={AUDIT_SUMMARY.thinHtml} label="serve thin HTML" sub="barely enough for a crawler to use" />
          </div>
          <p style={{ marginTop: '1.5rem' }}>
            And not one earned a clean bill of health. Every site tripped at least
            one check, most often the missing llms.txt; {AUDIT_SUMMARY.hardErrors} tripped a hard,
            build-breaking error.
          </p>
          <div className="f500-segbar" aria-hidden="true">
            <div className="f500-seg err" style={{ width: `${(AUDIT_SUMMARY.hardErrors / AUDIT_SUMMARY.total) * 100}%` }} />
            <div className="f500-seg warn" style={{ width: `${(AUDIT_SUMMARY.warnings / AUDIT_SUMMARY.total) * 100}%` }} />
          </div>
          <div className="f500-seglabels">
            <span><b>{AUDIT_SUMMARY.hardErrors}</b> hard errors</span>
            <span><b>{AUDIT_SUMMARY.warnings}</b> with warnings</span>
            <span><b>{fullyClean}</b> fully clean</span>
          </div>
        </section>

        <section>
          <h2>The pages are readable. The signals are missing.</h2>
          <p>
            Can an AI just read the raw HTML? For most of these sites, yes: 94%
            server-render real content and 87% publish a sitemap, so a crawler can
            reach the words on the page. That is table stakes, and these companies
            clear it. Crawlability was never the hard part.
          </p>
          <p>
            The gap is everything that turns readable text into <em>reliable</em>{' '}
            machine input: <a href="/docs/json-ld/">structured data</a> that
            declares what a page is, an <a href="/docs/llms-txt/">llms.txt</a> that
            points an agent at the canonical summary, and Content-Signal headers
            that state how the content may be used. Those are mostly absent. And for
            seven companies even the baseline fails: the homepage is an empty
            JavaScript shell, so a crawler that does not run JS sees nothing at all.
          </p>
          <p>
            None of this is exotic to fix. These are static files and a few tags,
            the AI-era equivalent of the sitemap every one of these companies
            already ships. The winners are the ones who add them first. A few
            already have: Target, NVIDIA, Adobe, American Express, and Dell all
            serve a valid <code>llms.txt</code> today.
          </p>
        </section>

        <section className="f500-method">
          <h2>How we measured (and what we are not claiming)</h2>
          <ul>
            <li>
              We audited 500 of the largest US public companies in July 2026 with{' '}
              <a href="https://www.npmjs.com/package/@agentmarkup/audit" target="_blank" rel="noopener noreferrer">@agentmarkup/audit</a>:
              one browser fetch as a baseline, then fetches as GPTBot, ClaudeBot,
              PerplexityBot, OAI-SearchBot, and Google-Extended, plus deterministic
              structured-data, llms.txt, robots, and sitemap checks.
            </li>
            <li>
              We ran from a single IP. 130 sites challenged even the browser fetch,
              which is an unknown state, not a failure, so we{' '}
              <strong>discarded them entirely</strong>. Every number above is over
              the <strong>370</strong> sites we could read cleanly.
            </li>
            <li>
              A crawler user-agent getting a different response is ambiguous (a
              firewall rule versus IP allowlisting), so we treat it as a{' '}
              <strong>warning, never a "they block AI" accusation</strong>. The
              headline numbers are the unambiguous, provable ones.
            </li>
            <li>Every finding is reproducible in one command against any site.</li>
          </ul>
        </section>

        <section>
          <h2>Check your own site in one command</h2>
          <p>
            You do not have to take our word for any of this. Point the same audit
            at your homepage:
          </p>
          <pre className="f500-cmd" tabIndex={0} aria-label="Audit command"><code>npx @agentmarkup/audit https://yourdomain.com</code></pre>
          <p>
            Prefer a browser? Run the hosted{' '}
            <a href="/checker/">website checker</a>. When it finds gaps, the{' '}
            <a href="/docs/llms-txt/">llms.txt</a>,{' '}
            <a href="/docs/json-ld/">JSON-LD</a>, and{' '}
            <a href="/docs/ai-crawlers/">AI crawler</a> guides show how to close
            them at build time, and the{' '}
            <a href="/docs/audit/">audit guide</a> explains every check.
          </p>
        </section>
      </article>
      <BlogFooter currentSlug="ai-crawler-audit-500-companies" />
    </main>
  )
}

export default FortuneReport
