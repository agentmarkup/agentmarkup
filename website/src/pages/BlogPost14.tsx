import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Byline from '../Byline'
import BlogFooter from '../BlogFooter'
import { fortune500, type F500Row } from '../data/fortune500'

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

const SIGNALS: { name: string; note: string; on: (r: F500Row) => boolean }[] = [
  { name: 'Structured data', note: '201 / 370 · 54%', on: (r) => r.j === 2 },
  { name: 'llms.txt', note: '50 / 370 · 14%', on: (r) => r.l === 2 },
  { name: 'Content-Signal', note: '3 / 370 · under 1%', on: (r) => r.c === 1 },
]

function SignalGrid({
  signal,
  onPick,
}: {
  signal: (typeof SIGNALS)[number]
  onPick: (i: number) => void
}) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div>
      <div className="f500-unit-cap">
        <span className="f500-unit-name">{signal.name}</span>
        <span className="f500-unit-val">{signal.note}</span>
      </div>
      <div
        className="f500-grid is-interactive"
        ref={ref}
        onClick={(e) => {
          const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]')
          if (cell) onPick(Number(cell.dataset.idx))
        }}
      >
        {fortune500.map((r, i) => {
          const on = signal.on(r)
          return (
            <span
              key={i}
              data-idx={i}
              title={r.d}
              className={on ? 'f500-cell is-on' : 'f500-cell'}
              style={on ? ({ ['--i']: i } as CSSProperties) : undefined}
            />
          )
        })}
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
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prev?.focus?.()
    }
  }, [onClose])

  return (
    <div className="f500-modal-backdrop" onClick={onClose}>
      <div
        className="f500-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Audit results for ${row.d}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="f500-modal-close" ref={closeRef} onClick={onClose} aria-label="Close">
          &times;
        </button>
        <div className="f500-modal-domain">{row.d}</div>
        <div className={row.w === 'e' ? 'f500-modal-verdict is-err' : 'f500-modal-verdict'}>
          {row.w === 'e' ? 'Has a build-breaking error' : 'Warnings only, no hard errors'}
        </div>
        <ul className="f500-modal-list">
          {verdictRows(row).map(([label, val, ok]) => (
            <li key={label}>
              <span className={ok ? 'f500-modal-mark ok' : 'f500-modal-mark no'} aria-hidden="true">
                {ok ? '✓' : '✕'}
              </span>
              <span className="f500-modal-k">{label}</span>
              <span className="f500-modal-v">{val}</span>
            </li>
          ))}
        </ul>
        <pre className="f500-cmd"><code>npx @agentmarkup/audit https://{row.d}</code></pre>
      </div>
    </div>
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
        Click any square, or search, to see that company's full result.
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
        <span className="f500-key on" aria-hidden="true" />has the signal
        <span className="f500-key off" aria-hidden="true" />does not &middot; click a square for details
      </p>

      {selected && <CompanyModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function FortuneReport() {
  return (
    <main>
      <article className="doc-page blog-post">
        <Byline date="2026-07-02" readingTime="5 min read" />
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
            <Stat kicker="Structured data" end={46} suffix="%" label="have no usable JSON-LD" sub="nothing machine-readable saying what the page is" />
            <Stat kicker="Discovery" end={86} suffix="%" label="have no llms.txt" sub="the emerging AI-discovery file" />
            <Stat kicker="Usage rules" end={99} suffix="%" label="set no AI-usage signal" sub="Content-Signal, the new opt-in standard" />
            <Stat kicker="Broken" end={7} label="serve crawlers a blank page" sub="content hidden behind JavaScript they don't run" />
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
            <Stat kicker="robots.txt" end={7} label="disallow an AI crawler" sub="block GPTBot or a peer outright" />
            <Stat kicker="Structured data" end={6} label="ship broken JSON-LD" sub="markup an agent cannot parse" />
            <Stat kicker="Bait and switch" end={6} label="show crawlers less than a browser" sub="the bot gets a thinner page than you" />
            <Stat kicker="Near-empty" end={17} label="serve thin HTML" sub="barely enough for a crawler to use" />
          </div>
          <p style={{ marginTop: '1.5rem' }}>
            And not one earned a clean bill of health. Every site tripped at least
            one check, most often the missing llms.txt; 27 tripped a hard,
            build-breaking error.
          </p>
          <div className="f500-segbar" aria-hidden="true">
            <div className="f500-seg err" style={{ width: '7.3%' }} />
            <div className="f500-seg warn" style={{ width: '92.7%' }} />
          </div>
          <div className="f500-seglabels">
            <span><b>27</b> hard errors</span>
            <span><b>343</b> with warnings</span>
            <span><b>0</b> fully clean</span>
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
          <pre className="f500-cmd"><code>npx @agentmarkup/audit https://yourdomain.com</code></pre>
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
      <BlogFooter currentSlug="fortune-500-ai-audit" />
    </main>
  )
}

export default FortuneReport
