// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHALLENGE_HEADERS,
  CHALLENGE_MARKERS,
  CHALLENGE_MARKERS_NON_2XX,
  CHALLENGE_STATUSES,
  classifyResource,
  evaluateSiteChecks,
  findChallengeHeader,
  findChallengeMarker,
  scoreChecks,
  type SiteEvidence,
} from '@agentmarkup/core/score'

// @ts-expect-error - the deployed Pages worker is plain JS with no type declarations
import worker from '../public/_worker.js'

const WORKER_SOURCE = readFileSync(new URL('../public/_worker.js', import.meta.url), 'utf8')

/** A top-level `const NAME = [...];` literal of the worker, evaluated in an empty context. */
function workerConstant(name: string): unknown {
  const match = WORKER_SOURCE.match(new RegExp(`^const ${name} = (\\[[\\s\\S]*?\\]);$`, 'm'))
  if (!match) throw new Error(`no top-level array const ${name} in public/_worker.js`)
  return runInNewContext(`(${match[1]})`)
}

/** A top-level `const NAME = ...;` or `function name(...) {...}` of the worker, as source text. */
function workerDeclaration(name: string): string {
  const pattern = new RegExp(`^(?:const ${name} = [\\s\\S]*?;|function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\})$`, 'm')
  const match = WORKER_SOURCE.match(pattern)
  if (!match) throw new Error(`no top-level declaration ${name} in public/_worker.js`)
  return match[0]
}

type Classify = (resource: unknown) => string
type Marker = (resource: unknown) => string | null

/** The worker's own classifier, run from its source with its own constants. */
const WORKER_CLASSIFIER = runInNewContext(
  [
    'CHALLENGE_STATUSES',
    'CHALLENGE_SCAN_CHARS',
    'CHALLENGE_HEADERS',
    'CHALLENGE_MARKERS_NON_2XX',
    'CHALLENGE_MARKERS',
    'statusOf',
    'isChallengeStatus',
    'findChallengeHeader',
    'findChallengeMarker',
    'classifyResource',
  ]
    .map(workerDeclaration)
    .join('\n') + '\n({ classifyResource, findChallengeHeader, findChallengeMarker })'
) as { classifyResource: Classify; findChallengeHeader: Marker; findChallengeMarker: Marker }


// AWS WAF answers (catalog 1.1.0): the Captcha action is 405 with x-amzn-waf-action:
// captcha, the Challenge action 202 with x-amzn-waf-action: challenge; emag.ro served
// its captcha page with 511 (observed 2026-11-09). AWS tells sites to load the SDK on
// normal pages, so the same strings on a 2xx page are integration, not a block.
const AWS_CAPTCHA_PAGE =
  '<!doctype html><html><head><title>Captcha</title><script src="https://b1.eu-central-1.captcha-sdk.awswaf.com/b1/jsapi.js" defer></script></head><body><div id="b"></div><script>AwsWafIntegration.fetch("/x")</script></body></html>'

const PROBE_PATH = '/agentmarkup-probe-404-does-not-exist-9f3a2c'
const PROBE_ACCEPT = 'text/markdown, application/json;q=0.9, text/html;q=0.8, */*;q=0.1'
const HTML_ACCEPT = 'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1'
const CHECK_URL = 'https://agentmarkup.dev/api/check?url=https%3A%2F%2Fexample.com'
const FIVE_MINUTES_MS = 5 * 60 * 1000

const HOMEPAGE_HTML =
  '<!doctype html><html lang="en"><head><title>Example</title></head><body><main><h1>Example</h1><p>Enough text for a homepage.</p><a href="/about/">About</a></main></body></html>'
const ABOUT_HTML =
  '<!doctype html><html lang="en"><head><title>About</title></head><body><main><h1>About</h1><p>About us.</p></main></body></html>'
const NOT_FOUND_HTML = '<html><body><h1>Not found</h1></body></html>'
const ROBOTS_TXT = 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap_index.xml\n'
const AWS_SDK_HOMEPAGE = HOMEPAGE_HTML.replace(
  '</head>',
  '<script src="https://x.token.awswaf.com/x/challenge.js" defer></script><script>AwsWafIntegration.getToken()</script></head>'
)

const SDK_BODY =
  '<html><head><script src="https://x.token.awswaf.com/x/challenge.js" defer></script></head><body><main><h1>Shop</h1><script>AwsWafIntegration.getToken()</script></main></body></html>'
const AWS_HEADER = { 'x-amzn-waf-action': 'challenge' }

function answer(status: number, body: string | null | undefined, headers: Record<string, string> = {}) {
  return { requestedUrl: 'https://example.com/x', finalUrl: 'https://example.com/x', status, ok: status >= 200 && status < 300, contentType: 'text/html', body, headers }
}

/** Shared inputs for the classifier parity test: outcome and marker are core's answers. */
const CLASSIFY_PARITY_CASES = [
  // Finding A: a challenge header on a 2xx is a challenge, whatever the body.
  { name: '202 + x-amzn-waf-action: challenge, HTML body', resource: answer(202, '<html><body>Verifying</body></html>', AWS_HEADER), outcome: 'challenge', marker: 'x-amzn-waf-action: challenge' },
  { name: '202 + x-amzn-waf-action: challenge, empty body', resource: answer(202, '', AWS_HEADER), outcome: 'challenge', marker: 'x-amzn-waf-action: challenge' },
  { name: '202 + x-amzn-waf-action: challenge, null body', resource: answer(202, null, AWS_HEADER), outcome: 'challenge', marker: 'x-amzn-waf-action: challenge' },
  { name: '200 + cf-mitigated: challenge', resource: answer(200, '<html><body>Checking</body></html>', { 'cf-mitigated': 'challenge' }), outcome: 'challenge', marker: 'cf-mitigated: challenge' },
  { name: '200 with the AWS SDK strings and no header', resource: answer(200, SDK_BODY), outcome: 'ok', marker: null },
  { name: '200 with a Cloudflare body marker and no header', resource: answer(200, '<title>Just a moment...</title>'), outcome: 'ok', marker: 'Just a moment...' },
  { name: '404 + cf-mitigated: challenge', resource: answer(404, '', { 'cf-mitigated': 'challenge' }), outcome: 'challenge', marker: 'cf-mitigated: challenge' },
  { name: '302 + cf-mitigated: challenge', resource: answer(302, '', { 'cf-mitigated': 'challenge' }), outcome: 'challenge', marker: 'cf-mitigated: challenge' },
  { name: '500 + x-amzn-waf-action: captcha', resource: answer(500, '', { 'x-amzn-waf-action': 'captcha' }), outcome: 'challenge', marker: 'x-amzn-waf-action: captcha' },
  { name: '202 + x-amzn-waf-action: allow', resource: answer(202, '', { 'x-amzn-waf-action': 'allow' }), outcome: 'ok', marker: null },
  // Finding B: the edge guards and the 404/410 order.
  { name: 'a negative status', resource: answer(-1, 'x'), outcome: 'unverified', marker: null },
  { name: 'a NaN status', resource: answer(Number.NaN, 'x'), outcome: 'unverified', marker: null },
  { name: 'a NaN status with a challenge header', resource: answer(Number.NaN, '', AWS_HEADER), outcome: 'unverified', marker: 'x-amzn-waf-action: challenge' },
  { name: 'an undefined body on a 2xx', resource: answer(200, undefined), outcome: 'unverified', marker: null },
  { name: 'a null body on a 2xx', resource: answer(200, null), outcome: 'unverified', marker: null },
  { name: '404 with a challenge body marker', resource: answer(404, '<title>Just a moment...</title>'), outcome: 'not-found', marker: 'Just a moment...' },
  { name: '410', resource: answer(410, ''), outcome: 'not-found', marker: null },
  { name: '405 with a marker', resource: answer(405, AWS_CAPTCHA_PAGE), outcome: 'challenge', marker: 'awswaf.com' },
  { name: '405 without a marker', resource: answer(405, 'Method Not Allowed'), outcome: 'http-error', marker: null },
  { name: '511 with a marker', resource: answer(511, AWS_CAPTCHA_PAGE), outcome: 'challenge', marker: 'awswaf.com' },
  { name: '511 without a marker', resource: answer(511, '<html><body>Network Authentication Required</body></html>'), outcome: 'unverified', marker: null },
  { name: '429 with a marker', resource: answer(429, 'px-captcha'), outcome: 'challenge', marker: 'px-captcha' },
  { name: '503 with a marker', resource: answer(503, '<title>Just a moment...</title>'), outcome: 'challenge', marker: 'Just a moment...' },
  { name: '500 with a body marker (not a challenge status)', resource: answer(500, '<title>Just a moment...</title>'), outcome: 'unverified', marker: 'Just a moment...' },
]

interface Reply {
  status: number
  body?: string | null
  headers?: Record<string, string>
  /** Fake-timer delay before the reply resolves. */
  delayMs?: number
  /** Never resolve: only the request's abort signal ends the call. */
  never?: boolean
  /** A streamed body instead of `body`, so a test can see it cancelled. */
  bodyStream?: () => ReadableStream<Uint8Array>
}

/** `hit` counts earlier requests for the same pathname. */
type Route = (url: URL, hit: number) => Reply

interface Call {
  url: string
  path: string
  init: RequestInit
  startedAt: number
  endedAt: number | null
}

interface Resource {
  requestedUrl: string
  finalUrl: string
  status: number
  ok: boolean
  body: string | null
  error?: string
  durationMs: number
  hops: number
  skipped?: boolean
  outcome: string
  headers?: Record<string, string>
  bodyBytes?: number
  bodyDropped?: boolean
}

type ResourceKey =
  | 'homepage'
  | 'homepageMarkdown'
  | 'llmsTxt'
  | 'robotsTxt'
  | 'sitemap'
  | 'notFoundProbe'
  | 'samplePage'
  | 'samplePageMarkdown'

type CheckPayload = Record<ResourceKey, Resource | null> & {
  homepage: Resource
  sitemapUrl: string | null
  sitemapSource: string | null
  fetchSummary: {
    analysisStatus: string
    unverified: string[]
    elapsedMs: number
    fetches: number
    hops: number
    d1Statements: number
    samplePageUrl: string | null
  }
  cache: { hit: boolean; cachedAt: string | null; expiresAt: string | null }
  storage: { persisted: boolean; binding?: string; reason?: string }
}

const RESOURCE_KEYS: ResourceKey[] = [
  'homepage',
  'homepageMarkdown',
  'llmsTxt',
  'robotsTxt',
  'sitemap',
  'notFoundProbe',
  'samplePage',
  'samplePageMarkdown',
]

function abortError() {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

function toResponse(reply: Reply) {
  const body = reply.bodyStream ? reply.bodyStream() : reply.body === undefined ? null : reply.body
  return new Response(body, { status: reply.status, headers: reply.headers ?? {} })
}

/**
 * A fetch stub keyed by pathname ('*' is the fallback). It honours the
 * request's abort signal: the worker's timeout is setTimeout + AbortController,
 * so a stub that ignored the signal would never time out under fake timers.
 * Every call is recorded with fake-clock start and end times.
 */
function installFetch(routes: Record<string, Route>) {
  const calls: Call[] = []
  const events: string[] = []
  const hits = new Map<string, number>()
  let inFlight = 0
  let maxInFlight = 0

  const fetchStub = vi.fn((input: string | URL | Request, init: RequestInit = {}) => {
    const urlString =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(urlString)
    const hit = hits.get(url.pathname) ?? 0
    hits.set(url.pathname, hit + 1)
    const route =
      routes[url.pathname] ?? routes['*'] ?? (() => ({ status: 404, body: NOT_FOUND_HTML }))
    const reply = route(url, hit)
    const call: Call = { url: urlString, path: url.pathname, init, startedAt: Date.now(), endedAt: null }
    calls.push(call)
    events.push(`start ${url.pathname}`)
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    const signal = init.signal as AbortSignal | null | undefined

    return new Promise<Response>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const settle = (done: () => void) => {
        inFlight -= 1
        call.endedAt = Date.now()
        events.push(`end ${url.pathname}`)
        done()
      }
      const onAbort = () => {
        if (timer !== undefined) clearTimeout(timer)
        settle(() => reject(abortError()))
      }
      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      if (!reply.never) {
        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          settle(() => resolve(toResponse(reply)))
        }, reply.delayMs ?? 0)
      }
    })
  })

  vi.stubGlobal('fetch', fetchStub)
  return { calls, events, fetchStub, hits, maxInFlight: () => maxInFlight }
}

function healthySite(): Record<string, Route> {
  return {
    '/': () => ({
      status: 200,
      body: HOMEPAGE_HTML,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    '/about/': () => ({
      status: 200,
      body: ABOUT_HTML,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    '/robots.txt': () => ({ status: 200, body: ROBOTS_TXT, headers: { 'content-type': 'text/plain' } }),
    '/sitemap_index.xml': () => ({
      status: 200,
      body: '<?xml version="1.0"?><sitemapindex></sitemapindex>',
      headers: { 'content-type': 'application/xml' },
    }),
    '/llms.txt': () => ({
      status: 200,
      body: '# Example\n\n> A summary.\n',
      headers: { 'content-type': 'text/plain' },
    }),
    '/index.md': () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
    '/about.md': () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
    [PROBE_PATH]: () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
  }
}

function withDelay(routes: Record<string, Route>, delayMs: number, except: string[] = []) {
  const delayed: Record<string, Route> = {}
  for (const [path, route] of Object.entries(routes)) {
    delayed[path] = except.includes(path)
      ? route
      : (url, hit) => ({ ...route(url, hit), delayMs })
  }
  return delayed
}

function callFor(calls: Call[], path: string) {
  const call = calls.find((candidate) => candidate.path === path)
  if (!call) throw new Error(`no fetch() call for ${path}`)
  return call
}

/** Runs one check, advancing the fake clock in 1 s steps until it settles. */
async function runCheck(env: Record<string, unknown> = {}) {
  let settled = false
  const pending = worker.fetch(new Request(CHECK_URL), env) as Promise<Response>
  void pending.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  for (let step = 0; step < 120 && !settled; step += 1) {
    await vi.advanceTimersByTimeAsync(1000)
  }
  const response = await pending
  return { response, payload: (await response.json()) as CheckPayload }
}

interface Prepared {
  bind: (...values: unknown[]) => Prepared
  first: () => Promise<null>
  run: () => Promise<{ success: boolean }>
  all: () => Promise<{ results: never[] }>
}

/** A D1 stand-in that records every prepared statement and finds nothing. */
function fakeD1() {
  const statements: string[] = []
  const prepared: Prepared = {
    bind: () => prepared,
    first: async () => null,
    run: async () => ({ success: true }),
    all: async () => ({ results: [] }),
  }
  return {
    statements,
    prepare: (sql: string) => {
      statements.push(sql.replace(/\s+/g, ' ').trim())
      return prepared
    },
    batch: async (list: unknown[]) => list.map(() => ({ success: true })),
  }
}

/**
 * crypto.subtle.digest resolves on a real event-loop turn, which the fake clock
 * cannot wait for: runCheck kept advancing 1 s steps meanwhile, so under load the
 * IP hash alone used up the 25 s budget before the first fetch. This copy resolves
 * on a microtask with the same SHA-256 bytes.
 */
function stubDigestOnMicrotasks() {
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (_algorithm, data) => {
    const view = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data)
    const hash = createHash('sha256').update(view).digest()
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer
  })
}

const isCacheWrite = (sql: string) => sql.includes('INSERT OR REPLACE INTO checker_cache')
const isRetentionDelete = (sql: string) => sql.startsWith('DELETE FROM')

describe('worker check chain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubDigestOnMicrotasks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches the homepage first, then runs the wave with four requests in flight', async () => {
    const { calls, events, maxInFlight, fetchStub } = installFetch(
      withDelay(healthySite(), 100, ['/'])
    )

    const { response, payload } = await runCheck()

    expect(response.status).toBe(200)
    expect(events.slice(0, 2)).toEqual(['start /', 'end /'])
    // Submission order: robots first (the sitemap chains off it), the two
    // small fetches, then the heavier ones; the sample page waits for a slot.
    expect(calls.map((call) => call.path)).toEqual([
      '/',
      '/robots.txt',
      PROBE_PATH,
      '/llms.txt',
      '/index.md',
      '/about/',
      '/sitemap_index.xml',
      '/about.md',
    ])
    expect(maxInFlight()).toBe(4)
    // Three fetch slots on the critical path (wave, chained sitemap or sample,
    // chained sample markdown) at 100 ms each, instead of eight sequential.
    expect(payload.fetchSummary).toEqual({
      analysisStatus: 'complete',
      unverified: [],
      elapsedMs: 300,
      fetches: 8,
      hops: 0,
      d1Statements: 0,
      samplePageUrl: 'https://example.com/about/',
    })
    expect(payload.fetchSummary.fetches).toBe(fetchStub.mock.calls.length)
    expect(payload.storage).toEqual({ persisted: false, reason: 'binding-not-configured' })
    for (const key of RESOURCE_KEYS) {
      expect(payload[key]).toMatchObject({ durationMs: expect.any(Number), hops: 0 })
      expect(payload[key]).not.toHaveProperty('skipped')
    }
  })

  it('starts the sitemap only after robots.txt answers and uses the URL it declares', async () => {
    const routes = healthySite()
    const robots = routes['/robots.txt']
    routes['/robots.txt'] = (url, hit) => ({ ...robots(url, hit), delayMs: 500 })
    const { calls, events } = installFetch(routes)

    const { payload } = await runCheck()

    const robotsCall = callFor(calls, '/robots.txt')
    const sitemapCall = callFor(calls, '/sitemap_index.xml')
    expect(robotsCall.endedAt).toBe(robotsCall.startedAt + 500)
    expect(sitemapCall.startedAt).toBeGreaterThanOrEqual(robotsCall.endedAt ?? Infinity)
    expect(events.indexOf('end /robots.txt')).toBeLessThan(events.indexOf('start /sitemap_index.xml'))
    expect(calls.some((call) => call.path === '/sitemap.xml')).toBe(false)
    expect(payload.sitemapUrl).toBe('https://example.com/sitemap_index.xml')
    expect(payload.sitemapSource).toBe('robots')
    expect(payload.sitemap?.outcome).toBe('ok')
  })

  it('uses a sitemap declared on the apex when the homepage settles on www (same registrable domain)', async () => {
    const routes = healthySite()
    const home = routes['/']
    routes['/'] = (url, hit) =>
      url.hostname === 'example.com'
        ? { status: 301, headers: { location: 'https://www.example.com/' } }
        : home(url, hit)
    const { calls } = installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.homepage).toMatchObject({ finalUrl: 'https://www.example.com/', outcome: 'ok', hops: 1 })
    expect(callFor(calls, '/robots.txt').url).toBe('https://www.example.com/robots.txt')
    expect(payload.sitemapUrl).toBe('https://example.com/sitemap_index.xml')
    expect(payload.sitemapSource).toBe('robots')
    expect(callFor(calls, '/sitemap_index.xml').url).toBe('https://example.com/sitemap_index.xml')
    expect(calls.some((call) => call.path === '/sitemap.xml')).toBe(false)
    expect(payload.sitemap?.outcome).toBe('ok')
  })

  it('ignores a sitemap declared on another registrable domain and falls back to /sitemap.xml', async () => {
    const routes = healthySite()
    routes['/robots.txt'] = () => ({
      status: 200,
      body: 'User-agent: *\nAllow: /\nSitemap: https://cdn.other.net/sitemap.xml\n',
      headers: { 'content-type': 'text/plain' },
    })
    const { calls } = installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.sitemapUrl).toBe('https://example.com/sitemap.xml')
    expect(payload.sitemapSource).toBe('default')
    expect(calls.some((call) => call.url.startsWith('https://cdn.other.net/'))).toBe(false)
  })

  it('skips a cross-origin markdown alternate and fetches the next same-origin one', async () => {
    const routes = healthySite()
    routes['/'] = () => ({
      status: 200,
      body: HOMEPAGE_HTML.replace(
        '</head>',
        '<link rel="alternate" type="text/markdown" href="https://cdn.other.net/index.md"><link rel="alternate" type="text/markdown" href="/home.md"></head>'
      ),
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
    routes['/home.md'] = () => ({
      status: 200,
      body: '# Example\n\nMarkdown twin.\n',
      headers: { 'content-type': 'text/markdown' },
    })
    const { calls } = installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.homepageMarkdown).toMatchObject({ requestedUrl: 'https://example.com/home.md', outcome: 'ok' })
    expect(calls.some((call) => call.url.startsWith('https://cdn.other.net/'))).toBe(false)
    expect(calls.some((call) => call.path === '/index.md')).toBe(false)
  })

  it('finishes a check of a 5 MB hostile homepage of "<link x", "<a href=x", "<a class=x>" or "<a href=x>" units in well under a second', async () => {
    // The discovery scans once rescanned the rest of the page for every opener that
    // no ">" follows: 16,000 "<link x" units took 2.8 s, and 5 MB is about 750,000.
    vi.useRealTimers()
    const prefix = '<!doctype html><html lang="en"><head><title>x</title></head><body>'
    for (const unit of ['<link x', '<a href=x', '<a class=x>', '<a href=x>']) {
      const body = prefix + unit.repeat(Math.floor((5 * 1024 * 1024 - 4096 - prefix.length) / unit.length))
      const routes = healthySite()
      routes['/'] = () => ({ status: 200, body, headers: { 'content-type': 'text/html; charset=utf-8' } })
      installFetch(routes)

      const started = performance.now()
      const response = (await worker.fetch(new Request(CHECK_URL), {})) as Response
      const elapsed = performance.now() - started
      const payload = (await response.json()) as CheckPayload

      expect(response.status).toBe(200)
      expect(payload.homepage.outcome).toBe('ok')
      expect(payload.homepage.body?.length).toBe(body.length)
      expect(payload.fetchSummary.samplePageUrl).toBeNull()
      expect(elapsed, unit).toBeLessThan(1000)
    }
  })

  it('finishes a check whose robots.txt has 1 MB of blank lines and no Sitemap line in well under a second', async () => {
    // The multiline sitemap regex rescanned the rest of the blank run from every line
    // start when no Sitemap line followed it: 80,000 blank lines took 10 s.
    vi.useRealTimers()
    const routes = healthySite()
    const robots = `User-agent: *\n${'\n'.repeat(1024 * 1024)}Disallow: /private/\n`
    routes['/robots.txt'] = () => ({ status: 200, body: robots, headers: { 'content-type': 'text/plain' } })
    const { calls } = installFetch(routes)

    const started = performance.now()
    const response = (await worker.fetch(new Request(CHECK_URL), {})) as Response
    const elapsed = performance.now() - started
    const payload = (await response.json()) as CheckPayload

    expect(response.status).toBe(200)
    expect(payload.robotsTxt.outcome).toBe('ok')
    expect(payload.sitemapSource).toBe('default')
    expect(calls.some((call) => call.path === '/sitemap.xml')).toBe(true)
    expect(elapsed).toBeLessThan(1000)
  })

  it('C11: reads a markdown alternate whose attributes have spaces around = or no quotes', async () => {
    const routes = healthySite()
    routes['/'] = () => ({
      status: 200,
      body: HOMEPAGE_HTML.replace('</head>', '<link rel = alternate type = "text/markdown" href = /spaced.md></head>'),
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
    routes['/spaced.md'] = () => ({
      status: 200,
      body: '# Example\n\nMarkdown twin.\n',
      headers: { 'content-type': 'text/markdown' },
    })
    installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.homepageMarkdown).toMatchObject({ requestedUrl: 'https://example.com/spaced.md', outcome: 'ok' })
  })

  it('reports a sitemap that never answers as unverified, marks the run partial and skips the cache write', async () => {
    const routes = healthySite()
    routes['/sitemap_index.xml'] = () => ({ status: 0, never: true })
    installFetch(routes)
    const db = fakeD1()

    const { response, payload } = await runCheck({ CHECKS_DB: db })

    expect(response.status).toBe(200)
    expect(payload.sitemap).toMatchObject({
      status: 0,
      ok: false,
      body: null,
      error: 'Request timed out.',
      outcome: 'unverified',
      hops: 0,
    })
    expect(payload.sitemap).not.toHaveProperty('skipped')
    expect(payload.sitemap?.durationMs).toBeGreaterThanOrEqual(10_000)
    expect(payload.fetchSummary.analysisStatus).toBe('partial')
    expect(payload.fetchSummary.unverified).toEqual(['sitemap'])
    expect(payload.cache).toEqual({ hit: false, cachedAt: null, expiresAt: null })
    expect(payload.storage).toEqual({ persisted: true, binding: 'CHECKS_DB' })
    expect(db.statements.some((sql) => sql.includes('INSERT INTO checker_checks'))).toBe(true)
    expect(db.statements.filter(isCacheWrite)).toEqual([])
    expect(payload.fetchSummary.d1Statements).toBeGreaterThan(0)
  })

  it('caches a complete run, so the partial-run skip is a real difference', async () => {
    installFetch(healthySite())
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.fetchSummary.analysisStatus).toBe('complete')
    expect(db.statements.filter(isCacheWrite)).toHaveLength(1)
    expect(payload.cache.cachedAt).not.toBeNull()
    expect(payload.cache.expiresAt).not.toBeNull()
  })

  it('stops at the request budget: the fourth fetch is refused, marked skipped and unverified', async () => {
    const { calls, fetchStub } = installFetch(healthySite())

    const { payload } = await runCheck({ CHECKER_MAX_FETCHES: '3' })

    expect(calls.map((call) => call.path)).toEqual(['/', '/robots.txt', PROBE_PATH])
    expect(payload.fetchSummary.fetches).toBe(3)
    expect(payload.fetchSummary.fetches).toBe(fetchStub.mock.calls.length)
    expect(payload.llmsTxt).toMatchObject({
      status: 0,
      error: 'Checker request budget exhausted.',
      skipped: true,
      outcome: 'unverified',
      hops: 0,
      headers: {},
    })
    for (const key of ['homepageMarkdown', 'samplePage', 'sitemap', 'samplePageMarkdown'] as const) {
      expect(payload[key]).toMatchObject({ error: 'Checker request budget exhausted.', skipped: true })
    }
    expect(payload.fetchSummary.analysisStatus).toBe('partial')
    expect(payload.fetchSummary.unverified).toEqual([
      'homepageMarkdown',
      'llmsTxt',
      'sitemap',
      'samplePage',
      'samplePageMarkdown',
    ])
  })

  it('sends the markdown-first Accept header on the probe only and never follows redirects itself', async () => {
    const { calls } = installFetch(healthySite())

    await runCheck()

    const accept = (call: Call) => new Headers(call.init.headers).get('accept')
    expect(accept(callFor(calls, PROBE_PATH))).toBe(PROBE_ACCEPT)
    expect(accept(callFor(calls, '/'))).toBe(HTML_ACCEPT)
    expect(accept(callFor(calls, '/about/'))).toBe(HTML_ACCEPT)
    expect(accept(callFor(calls, '/llms.txt'))).toBe(HTML_ACCEPT)
    for (const call of calls) {
      expect(call.init.redirect).toBe('manual')
      expect(new Headers(call.init.headers).get('user-agent')).toContain('agentmarkup-checker/')
    }
  })

  it('drops 404 and 410 bodies on every resource but keeps a 2xx probe body', async () => {
    const routes = healthySite()
    routes['/llms.txt'] = () => ({ status: 410, body: 'gone', headers: { 'content-type': 'text/plain' } })
    routes['/sitemap_index.xml'] = () => ({ status: 404, body: NOT_FOUND_HTML })
    routes[PROBE_PATH] = () => ({
      status: 200,
      body: HOMEPAGE_HTML,
      headers: { 'content-type': 'text/html' },
    })
    installFetch(routes)

    const { payload } = await runCheck()

    const notFoundBytes = new TextEncoder().encode(NOT_FOUND_HTML).byteLength
    for (const key of ['homepageMarkdown', 'samplePageMarkdown', 'sitemap'] as const) {
      expect(payload[key]).toMatchObject({
        status: 404,
        body: null,
        bodyDropped: true,
        bodyBytes: notFoundBytes,
        outcome: 'not-found',
      })
    }
    expect(payload.llmsTxt).toMatchObject({
      status: 410,
      body: null,
      bodyDropped: true,
      bodyBytes: 4,
      outcome: 'not-found',
    })
    expect(payload.notFoundProbe).toMatchObject({ status: 200, body: HOMEPAGE_HTML, outcome: 'ok' })
    expect(payload.notFoundProbe).not.toHaveProperty('bodyDropped')
    expect(payload.homepage.bodyBytes).toBe(new TextEncoder().encode(HOMEPAGE_HTML).byteLength)
    expect(JSON.stringify(payload)).not.toContain('Not found</h1>')
  })

  it('captures allowlisted discovery headers, caps them at 512 chars and never carries cookies', async () => {
    const routes = healthySite()
    routes['/'] = () => ({
      status: 200,
      body: HOMEPAGE_HTML,
      headers: {
        'content-type': 'text/html',
        link: '</sitemap.xml>; rel="sitemap"',
        vary: 'Accept',
        'set-cookie': 'session=secret-cookie; HttpOnly',
        'x-robots-tag': 'a'.repeat(600),
        'content-signal': 'ai-train=no',
      },
    })
    installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.homepage.headers).toMatchObject({
      link: '</sitemap.xml>; rel="sitemap"',
      vary: 'Accept',
      'content-signal': 'ai-train=no',
    })
    expect(payload.homepage.headers?.['x-robots-tag']).toHaveLength(512)
    expect(Object.keys(payload.homepage.headers ?? {})).not.toContain('set-cookie')
    expect(JSON.stringify(payload)).not.toContain('secret-cookie')
    for (const key of RESOURCE_KEYS) {
      expect(payload[key]).not.toBeNull()
      expect(payload[key]).not.toHaveProperty('cookies')
      expect(payload[key]).toHaveProperty('headers')
    }
    expect(payload.robotsTxt.headers).toEqual({})
  })

  it('caps redirects per resource and never exceeds 26 fetch() calls on a redirect-heavy site', async () => {
    const redirectForever: Route = (url) => ({
      status: 302,
      headers: { location: `${url.pathname}?again` },
    })
    const { hits, fetchStub } = installFetch({
      '*': redirectForever,
      '/': (url, hit) =>
        hit < 5
          ? { status: 301, headers: { location: `/?hop=${hit + 1}` } }
          : { status: 200, body: HOMEPAGE_HTML, headers: { 'content-type': 'text/html' } },
    })

    const { payload } = await runCheck()

    // homepage 5 + 1, sample 3 + 1, five secondaries at 2 + 1, probe 1.
    expect(fetchStub.mock.calls.length).toBe(26)
    expect(Object.fromEntries(hits)).toEqual({
      '/': 6,
      '/about/': 4,
      '/robots.txt': 3,
      [PROBE_PATH]: 1,
      '/llms.txt': 3,
      '/index.md': 3,
      '/sitemap.xml': 3,
      '/about.md': 3,
    })
    expect(payload.homepage).toMatchObject({
      status: 200,
      hops: 5,
      finalUrl: 'https://example.com/?hop=5',
      outcome: 'ok',
    })
    expect(payload.robotsTxt).toMatchObject({
      status: 0,
      error: 'Too many redirects.',
      hops: 2,
      outcome: 'unverified',
    })
    expect(payload.samplePage).toMatchObject({
      status: 0,
      error: 'Too many redirects.',
      hops: 3,
      outcome: 'unverified',
    })
    // The probe follows nothing: the 3xx is its completed answer, Location kept.
    expect(payload.notFoundProbe).toMatchObject({
      status: 302,
      ok: false,
      body: null,
      hops: 0,
      outcome: 'http-error',
    })
    expect(payload.notFoundProbe).not.toHaveProperty('error')
    expect(payload.notFoundProbe?.headers?.location).toBe(`${PROBE_PATH}?again`)
    expect(payload.sitemapSource).toBe('default')
    expect(payload.fetchSummary).toMatchObject({ analysisStatus: 'partial', fetches: 26, hops: 18 })
  })

  it('classifies 429/5xx as unverified and challenge pages as challenge, never as findings', async () => {
    const routes = healthySite()
    routes['/llms.txt'] = () => ({
      status: 503,
      body: 'Service Unavailable',
      headers: { 'content-type': 'text/plain' },
    })
    routes['/sitemap_index.xml'] = () => ({ status: 429, body: 'Too Many Requests' })
    routes['/index.md'] = () => ({
      status: 403,
      body: '<html><head><title>Just a moment...</title></head></html>',
      headers: { 'content-type': 'text/html' },
    })
    routes['/about.md'] = () => ({
      status: 403,
      body: '<html>Forbidden</html>',
      headers: { 'content-type': 'text/html' },
    })
    routes[PROBE_PATH] = () => ({
      status: 503,
      body: 'checking your browser',
      headers: { 'cf-mitigated': 'challenge' },
    })
    installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.llmsTxt.outcome).toBe('unverified')
    expect(payload.sitemap?.outcome).toBe('unverified')
    expect(payload.homepageMarkdown?.outcome).toBe('challenge')
    expect(payload.samplePageMarkdown?.outcome).toBe('http-error')
    expect(payload.notFoundProbe?.outcome).toBe('challenge')
    expect(payload.notFoundProbe?.headers?.['cf-mitigated']).toBe('challenge')
    expect(payload.fetchSummary.analysisStatus).toBe('partial')
    // C3: a 429/503 challenged probe counts too, as core marks nav.not-found
    // unverified for it; the 403 challenged mirror is a measured answer.
    expect(payload.fetchSummary.unverified).toEqual(['llmsTxt', 'sitemap', 'notFoundProbe'])
  })

  it('C3: a probe that answers a challenge page alone marks the run partial and skips the cache write', async () => {
    const routes = healthySite()
    routes[PROBE_PATH] = () => ({
      status: 503,
      body: 'checking your browser',
      headers: { 'cf-mitigated': 'challenge' },
    })
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.notFoundProbe?.outcome).toBe('challenge')
    expect(payload.fetchSummary.analysisStatus).toBe('partial')
    expect(payload.fetchSummary.unverified).toEqual(['notFoundProbe'])
    expect(db.statements.filter(isCacheWrite)).toEqual([])
    expect(payload.cache.cachedAt).toBeNull()
  })

  it.each([
    {
      name: 'a 403 challenged not-found probe',
      path: PROBE_PATH,
      key: 'notFoundProbe' as const,
    },
    {
      name: 'a 403 challenged homepage mirror',
      path: '/index.md',
      key: 'homepageMarkdown' as const,
    },
  ])('$name is a measured answer: the run is complete, yet it is never cached', async ({ path, key }) => {
    const routes = healthySite()
    routes[path] = () => ({
      status: 403,
      body: '<html><head><title>Just a moment...</title></head></html>',
      headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
    })
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload[key]?.outcome).toBe('challenge')
    // Same status as core: nav.not-found scores a 401/403 challenge as a fail.
    expect(payload.fetchSummary.analysisStatus).toBe('complete')
    expect(payload.fetchSummary.unverified).toEqual([])
    // A challenge is often per-IP and transient, so the run is not pinned.
    expect(db.statements.filter(isCacheWrite)).toEqual([])
    expect(payload.cache).toEqual({ hit: false, cachedAt: null, expiresAt: null })
  })

  // Catalog 1.1.0 parity: the worker keeps its own copies of core's challenge rule.
  it('keeps the challenge statuses, headers and both marker lists equal to core, and captures every challenge header', () => {
    expect(workerConstant('CHALLENGE_STATUSES')).toEqual([...CHALLENGE_STATUSES])
    expect(workerConstant('CHALLENGE_MARKERS')).toEqual([...CHALLENGE_MARKERS])
    expect(workerConstant('CHALLENGE_MARKERS_NON_2XX')).toEqual([...CHALLENGE_MARKERS_NON_2XX])
    expect(workerConstant('CHALLENGE_HEADERS')).toEqual(
      CHALLENGE_HEADERS.map((header) => ({ name: header.name, values: [...header.values] }))
    )
    const allowlist = workerConstant('DISCOVERY_HEADER_NAMES') as string[]
    for (const header of CHALLENGE_HEADERS) {
      expect(allowlist, header.name).toContain(header.name)
    }
  })

  it('classifies AWS WAF answers exactly as core: 511/405 walls are challenges, the SDK on a 2xx is not, no marker keeps the old outcome', async () => {
    const routes = healthySite()
    routes['/'] = () => ({
      status: 200,
      body: AWS_SDK_HOMEPAGE,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
    routes['/llms.txt'] = () => ({ status: 511, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html' } })
    routes['/index.md'] = () => ({ status: 405, body: '', headers: { 'x-amzn-waf-action': 'captcha' } })
    routes['/about.md'] = () => ({ status: 405, body: 'Method Not Allowed', headers: { 'content-type': 'text/plain' } })
    routes['/sitemap_index.xml'] = () => ({ status: 511, body: '<html><body>Network Authentication Required</body></html>' })
    routes[PROBE_PATH] = () => ({ status: 511, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html' } })
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.homepage.outcome).toBe('ok')
    expect(payload.llmsTxt.outcome).toBe('challenge')
    expect(payload.homepageMarkdown?.outcome).toBe('challenge')
    expect(payload.homepageMarkdown?.headers?.['x-amzn-waf-action']).toBe('captcha')
    expect(payload.samplePageMarkdown?.outcome).toBe('http-error')
    expect(payload.sitemap?.outcome).toBe('unverified')
    expect(payload.notFoundProbe?.outcome).toBe('challenge')
    for (const key of RESOURCE_KEYS) {
      const recorded = payload[key]
      if (recorded) {
        expect(recorded.outcome, key).toBe(classifyResource(recorded as unknown as SiteEvidence['homepage']))
      }
    }
    // Same run status as the engine: the unmarked 511 sitemap and the challenged
    // probe (nav.not-found unverified) both count.
    const engine = scoreChecks(evaluateSiteChecks(payload as unknown as SiteEvidence))
    expect(payload.fetchSummary.analysisStatus).toBe(engine.analysisStatus)
    expect(payload.fetchSummary.unverified).toEqual(['sitemap', 'notFoundProbe'])
    expect(engine.checks.find((check) => check.id === 'reach.bot-detection')?.status).toBe('pass')
    expect(db.statements.filter(isCacheWrite)).toEqual([])
  })

  it('a 511 AWS WAF captcha homepage (emag.ro) is a challenge, not a blocked run, and is never cached', async () => {
    const routes = healthySite()
    routes['/'] = () => ({ status: 511, body: AWS_CAPTCHA_PAGE, headers: { 'content-type': 'text/html' } })
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.homepage).toMatchObject({ status: 511, outcome: 'challenge' })
    const engine = scoreChecks(evaluateSiteChecks(payload as unknown as SiteEvidence))
    expect(engine.blockedKind).toBeNull()
    expect(payload.fetchSummary.analysisStatus).not.toBe('blocked')
    expect(payload.fetchSummary.analysisStatus).toBe(engine.analysisStatus)
    expect(engine.checks.find((check) => check.id === 'reach.bot-detection')).toMatchObject({
      status: 'fail',
      evidence: 'HTTP 511, challenge marker "awswaf.com"',
    })
    expect(engine.naChecks.some((entry) => entry.reason === 'homepage-blocked')).toBe(true)
    expect(db.statements.filter(isCacheWrite)).toEqual([])
  })

  it('a 202 homepage with x-amzn-waf-action: challenge is gated like the engine gates it and never cached', async () => {
    const routes = healthySite()
    routes['/'] = () => ({ status: 202, body: '', headers: { 'x-amzn-waf-action': 'challenge' } })
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.homepage).toMatchObject({ status: 202, outcome: 'challenge', headers: { 'x-amzn-waf-action': 'challenge' } })
    const engine = scoreChecks(evaluateSiteChecks(payload as unknown as SiteEvidence))
    expect(engine.analysisStatus).toBe('complete')
    expect(payload.fetchSummary.analysisStatus).toBe(engine.analysisStatus)
    expect(engine.checks.find((check) => check.id === 'reach.bot-detection')?.evidence).toBe(
      'HTTP 202, challenge marker "x-amzn-waf-action: challenge"'
    )
    expect(engine.naChecks.some((entry) => entry.reason === 'homepage-blocked')).toBe(true)
    // A challenge is per-IP and transient: the gated run is not pinned for three minutes.
    expect(db.statements.filter(isCacheWrite)).toEqual([])
    expect(payload.cache).toEqual({ hit: false, cachedAt: null, expiresAt: null })
  })

  it('a 202 with x-amzn-waf-action: challenge on a secondary file keeps the run out of the cache', async () => {
    const routes = healthySite()
    routes['/llms.txt'] = () => ({ status: 202, body: '', headers: { 'x-amzn-waf-action': 'challenge' } })
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.homepage).toMatchObject({ status: 200, outcome: 'ok' })
    expect(payload.llmsTxt).toMatchObject({ status: 202, outcome: 'challenge', headers: { 'x-amzn-waf-action': 'challenge' } })
    expect(db.statements.filter(isCacheWrite)).toEqual([])
    expect(payload.cache).toEqual({ hit: false, cachedAt: null, expiresAt: null })
  })

  it('a clean homepage with a 202-challenged llms.txt and not-found probe: same outcomes and run status as core, probe unverified, never cached', async () => {
    const routes = healthySite()
    const awsChallenge = (body: string) => () => ({
      status: 202,
      body,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-amzn-waf-action': 'challenge' },
    })
    routes['/llms.txt'] = awsChallenge('<html><body>Verifying that you are human</body></html>')
    routes[PROBE_PATH] = awsChallenge('')
    installFetch(routes)
    const db = fakeD1()

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(payload.homepage).toMatchObject({ status: 200, outcome: 'ok' })
    expect(payload.llmsTxt).toMatchObject({ status: 202, outcome: 'challenge' })
    expect(payload.notFoundProbe).toMatchObject({ status: 202, outcome: 'challenge' })
    for (const key of RESOURCE_KEYS) {
      const recorded = payload[key]
      if (recorded) {
        expect(recorded.outcome, key).toBe(classifyResource(recorded as unknown as SiteEvidence['homepage']))
      }
    }
    const engine = scoreChecks(evaluateSiteChecks(payload as unknown as SiteEvidence))
    expect(engine.analysisStatus).toBe('partial')
    expect(payload.fetchSummary.analysisStatus).toBe(engine.analysisStatus)
    expect(payload.fetchSummary.unverified).toEqual(['notFoundProbe'])
    expect(engine.unverifiedChecks).toEqual(['nav.not-found'])
    expect(engine.checks.find((check) => check.id === 'nav.not-found')).toMatchObject({
      status: 'unverified',
      reason: 'probe-challenged',
    })
    // llms.txt reads like a 403 Cloudflare challenge does: a challenge, never "absent".
    const llms = engine.checks.find((check) => check.id === 'llms.exists')
    expect(llms).toMatchObject({
      status: 'fail',
      evidence: 'llms.txt answered HTTP 202 with a bot challenge (x-amzn-waf-action: challenge)',
      challenge: { resource: 'llmsTxt', status: 202, marker: 'x-amzn-waf-action: challenge' },
    })
    expect(engine.checks.find((check) => check.id === 'reach.bot-detection')?.status).toBe('pass')
    expect(db.statements.filter(isCacheWrite)).toEqual([])
    expect(payload.cache).toEqual({ hit: false, cachedAt: null, expiresAt: null })
  })

  // The worker's classifyResource, findChallengeHeader and findChallengeMarker are
  // structurally identical to core's: run straight from the worker source over shared
  // inputs, edge cases included, each answer checked against core and against the
  // expected outcome.
  it.each(CLASSIFY_PARITY_CASES)('classifies $name exactly as core ($outcome)', ({ resource, outcome, marker }) => {
    expect(classifyResource(resource as unknown as SiteEvidence['homepage'])).toBe(outcome)
    expect(WORKER_CLASSIFIER.classifyResource(resource)).toBe(outcome)
    expect(WORKER_CLASSIFIER.findChallengeMarker(resource)).toBe(findChallengeMarker(resource as unknown as SiteEvidence['homepage']))
    expect(WORKER_CLASSIFIER.findChallengeMarker(resource)).toBe(marker)
    expect(WORKER_CLASSIFIER.findChallengeHeader(resource)).toBe(findChallengeHeader(resource as unknown as SiteEvidence['homepage']))
  })

  it('C18: d1Statements counts the cache write, in the live response and in the cached copy', async () => {
    installFetch(healthySite())
    const db = fakeD1()
    const cachedValues: string[] = []
    const prepare = db.prepare
    db.prepare = (sql: string) => {
      const statement = prepare(sql)
      if (!isCacheWrite(sql.replace(/\s+/g, ' ').trim())) return statement
      return {
        ...statement,
        bind: (...values: unknown[]) => {
          cachedValues.push(...values.filter((value): value is string => typeof value === 'string' && value.startsWith('{')))
          return statement
        },
      }
    }

    const { payload } = await runCheck({ CHECKS_DB: db })

    expect(db.statements.filter(isCacheWrite)).toHaveLength(1)
    expect(payload.fetchSummary.d1Statements).toBe(db.statements.length)
    expect(cachedValues).toHaveLength(1)
    expect((JSON.parse(cachedValues[0]) as CheckPayload).fetchSummary.d1Statements).toBe(payload.fetchSummary.d1Statements)
  })

  it('cancels the body of a followed 3xx without a Location header', async () => {
    let cancelled = false
    const routes = healthySite()
    routes['/llms.txt'] = () => ({
      status: 302,
      bodyStream: () =>
        new ReadableStream<Uint8Array>({
          pull: (controller) => controller.enqueue(new TextEncoder().encode('moved')),
          cancel: () => {
            cancelled = true
          },
        }),
    })
    installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.llmsTxt).toMatchObject({ status: 302, error: 'Redirect response had no Location header.' })
    expect(cancelled).toBe(true)
  })

  it('cancels the body of a followed 3xx whose Location is unsafe or cannot be parsed', async () => {
    for (const [location, error] of [
      ['https://127.0.0.1/llms.txt', 'Request was blocked by checker safety rules.'],
      ['http://[::1', 'Request failed.'],
    ]) {
      let cancelled = false
      const routes = healthySite()
      routes['/llms.txt'] = () => ({
        status: 302,
        headers: { location },
        bodyStream: () =>
          new ReadableStream<Uint8Array>({
            pull: (controller) => controller.enqueue(new TextEncoder().encode('moved')),
            cancel: () => {
              cancelled = true
            },
          }),
      })
      installFetch(routes)

      const { payload } = await runCheck()

      expect(payload.llmsTxt, location).toMatchObject({ status: 0, error })
      expect(cancelled, location).toBe(true)
    }
  })

  it('C19: a probe 3xx without a Location header is a completed answer, never an error', async () => {
    const routes = healthySite()
    routes[PROBE_PATH] = () => ({ status: 302, body: '', headers: { 'content-type': 'text/html' } })
    installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.notFoundProbe).toMatchObject({ status: 302, ok: false, body: null, outcome: 'http-error' })
    expect(payload.notFoundProbe?.error ?? null).toBeNull()
    expect(payload.fetchSummary.unverified).toEqual([])
  })

  it('reports a run whose homepage never completes as blocked and still records the other resources', async () => {
    const routes = healthySite()
    routes['/'] = () => ({ status: 0, never: true })
    installFetch(routes)

    const { payload } = await runCheck()

    expect(payload.homepage).toMatchObject({
      status: 0,
      error: 'Request timed out.',
      outcome: 'unverified',
      durationMs: 10_000,
    })
    expect(payload.fetchSummary.analysisStatus).toBe('blocked')
    expect(payload.fetchSummary.unverified).toEqual(['homepage'])
    expect(payload.fetchSummary.samplePageUrl).toBeNull()
    expect(payload.samplePage).toBeNull()
    expect(payload.samplePageMarkdown).toBeNull()
    expect(payload.robotsTxt.outcome).toBe('ok')
    // homepage, robots, probe, llms, index.md, sitemap
    expect(payload.fetchSummary.fetches).toBe(6)
  })

  it('answers 400 invalid_request only for a rejected URL and 500 checker_error for an internal failure', async () => {
    installFetch(healthySite())

    const bad = await worker.fetch(
      new Request('https://agentmarkup.dev/api/check?url=http%3A%2F%2Flocalhost%2F'),
      {}
    )
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({
      error: 'Enter a public http:// or https:// website URL.',
      code: 'invalid_request',
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeD1()
    db.prepare = () => {
      throw new Error('D1_ERROR: database is locked')
    }
    const broken = await worker.fetch(new Request(CHECK_URL), { CHECKS_DB: db })
    expect(broken.status).toBe(500)
    expect(broken.headers.get('content-type')).toContain('application/json')
    const body = (await broken.json()) as { error: string; code: string }
    expect(body.code).toBe('checker_error')
    expect(body.error).not.toContain('D1_ERROR')
    expect(errorSpy).toHaveBeenCalledWith('checker request failed', expect.any(Error))
  })

  it('runs the retention cleanup at most once per five minutes per isolate', async () => {
    installFetch(healthySite())
    // Make a cleanup due regardless of what earlier tests in this file did.
    await vi.advanceTimersByTimeAsync(FIVE_MINUTES_MS + 1)

    const first = fakeD1()
    await runCheck({ CHECKS_DB: first })
    expect(first.statements.filter(isRetentionDelete)).toHaveLength(3)

    const second = fakeD1()
    await runCheck({ CHECKS_DB: second })
    expect(second.statements.filter(isRetentionDelete)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
    const third = fakeD1()
    await runCheck({ CHECKS_DB: third })
    expect(third.statements.filter(isRetentionDelete)).toHaveLength(3)
  })
})
