// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error - the deployed Pages worker is plain JS with no type declarations
import worker from '../public/_worker.js'

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

interface Reply {
  status: number
  body?: string | null
  headers?: Record<string, string>
  /** Fake-timer delay before the reply resolves. */
  delayMs?: number
  /** Never resolve: only the request's abort signal ends the call. */
  never?: boolean
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
  const body = reply.body === undefined ? null : reply.body
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

const isCacheWrite = (sql: string) => sql.includes('INSERT OR REPLACE INTO checker_cache')
const isRetentionDelete = (sql: string) => sql.startsWith('DELETE FROM')

describe('worker check chain', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
    expect(payload.fetchSummary.unverified).toEqual(['llmsTxt', 'sitemap'])
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
