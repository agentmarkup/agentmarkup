// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type QueryRow = Record<string, unknown> | null

interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
  CHECKS_DB?: FakeD1
  CHECKER_TURNSTILE_SITE_KEY?: string
  CHECKER_TURNSTILE_SECRET_KEY?: string
  CHECKER_TURNSTILE_THRESHOLD?: string
  CHECKER_TURNSTILE_EXPECTED_HOSTNAME?: string
  CHECKER_TURNSTILE_EXPECTED_ACTION?: string
}

interface WorkerHandler {
  fetch(request: Request, env: WorkerEnv): Promise<Response>
}

class FakeStatement {
  values: unknown[] = []

  constructor(
    readonly db: FakeD1,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values
    return this
  }

  async first(): Promise<QueryRow> {
    if (this.sql.includes('COUNT(*) AS request_count')) {
      const count = this.db.counts.shift() ?? 0
      return {
        request_count: count,
        oldest_requested_at: count > 0 ? new Date().toISOString() : null,
      }
    }
    if (this.sql.includes('FROM checker_cache')) return this.db.cachedResponse
    return null
  }

  async run() {
    if (this.sql.includes('INSERT INTO checker_request_events')) {
      this.db.eventInsert = this
      return { meta: { changes: this.db.allowInsert ? 1 : 0 } }
    }
    if (this.sql.includes('INSERT INTO checker_checks')) {
      this.db.historyInsert = this
    }
    return { meta: { changes: 1 } }
  }
}

class FakeD1 {
  counts: number[]
  allowInsert = true
  cachedResponse: QueryRow = null
  eventInsert: FakeStatement | null = null
  historyInsert: FakeStatement | null = null
  batched: FakeStatement[][] = []

  constructor(counts = [0, 1]) {
    this.counts = [...counts]
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql)
  }

  async batch(statements: FakeStatement[]) {
    this.batched.push(statements)
    return statements.map(() => ({ success: true }))
  }
}

const baseEnv = (db?: FakeD1): WorkerEnv => ({
  ASSETS: {
    fetch: async () =>
      new Response('<!doctype html><title>Home</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  },
  CHECKS_DB: db,
  CHECKER_TURNSTILE_SITE_KEY: 'public-site-key',
  CHECKER_TURNSTILE_SECRET_KEY: 'secret-test-key',
  CHECKER_TURNSTILE_EXPECTED_ACTION: 'public-scan',
})

const post = (path: string, body: object, headers: HeadersInit = {}) =>
  new Request(`https://agentmarkup.dev${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

let worker: WorkerHandler

beforeAll(async () => {
  const moduleUrl = new URL('../public/_worker.js', import.meta.url).href
  const module = (await import(/* @vite-ignore */ moduleUrl)) as {
    default: WorkerHandler
  }
  worker = module.default
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Cloudflare Pages worker', () => {
  it('makes both scanners POST-only with an Allow header', async () => {
    for (const path of ['/api/check', '/api/security-scan']) {
      const response = await worker.fetch(
        new Request(`https://agentmarkup.dev${path}`),
        baseEnv(),
      )
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    }
  })

  it('rejects cross-site browser requests before reading a body', async () => {
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }, { 'sec-fetch-site': 'cross-site' }),
      baseEnv(),
    )
    expect(response.status).toBe(403)
  })

  it('rejects oversized bodies before D1 or outbound fetches', async () => {
    const outbound = vi.fn()
    vi.stubGlobal('fetch', outbound)
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }, { 'content-length': '20000' }),
      baseEnv(),
    )
    expect(response.status).toBe(413)
    expect(outbound).not.toHaveBeenCalled()
  })

  it('rejects unsupported request encodings and oversized verification tokens', async () => {
    const unsupported = await worker.fetch(
      new Request('https://agentmarkup.dev/api/check', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'https://example.com',
      }),
      baseEnv(new FakeD1()),
    )
    expect(unsupported.status).toBe(415)

    const oversizedToken = await worker.fetch(
      post('/api/check', {
        url: 'https://example.com',
        turnstileToken: 'x'.repeat(2049),
      }),
      baseEnv(new FakeD1()),
    )
    expect(oversizedToken.status).toBe(400)
  })

  it('enforces the body limit even without a Content-Length header', async () => {
    const request = new Request('https://agentmarkup.dev/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'x'.repeat(17_000) }),
    })
    request.headers.delete('content-length')
    const response = await worker.fetch(request, baseEnv())
    expect(response.status).toBe(413)
  })

  it('fails closed when the D1 protection binding is missing', async () => {
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }),
      baseEnv(),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'The service is temporarily unavailable.' })
  })

  it('fails closed without Turnstile configuration', async () => {
    const db = new FakeD1()
    const env = baseEnv(db)
    delete env.CHECKER_TURNSTILE_SECRET_KEY
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }),
      env,
    )
    expect(response.status).toBe(503)
  })

  it('fails closed without an expected Turnstile action', async () => {
    const db = new FakeD1()
    const env = baseEnv(db)
    delete env.CHECKER_TURNSTILE_EXPECTED_ACTION
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }),
      env,
    )
    expect(response.status).toBe(503)
  })

  it('does not expose D1 errors in public responses', async () => {
    const db = new FakeD1()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(db, 'batch').mockRejectedValue(new Error('private database detail'))
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }),
      baseEnv(db),
    )
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('{"error":"The service is temporarily unavailable."}')
  })

  it('keeps the hard rate-limit insert atomic and never persists raw input', async () => {
    const db = new FakeD1()
    const rawUrl = 'https://example.com/private/path?secret=do-not-store'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<!doctype html><html><body>Public page</body></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    )

    const response = await worker.fetch(
      post('/api/check', { url: rawUrl }),
      baseEnv(db),
    )

    expect(response.status).toBe(200)
    expect(db.eventInsert?.sql).toContain('SELECT COUNT(*)')
    expect(db.eventInsert?.values.at(-1)).toBe(10)
    expect(db.historyInsert?.values[0]).toBe('https://example.com/')
    expect(db.historyInsert?.values[1]).toBe('https://example.com/')
    expect(JSON.stringify(db.batched.flat().flatMap((statement) => statement.values))).not.toContain(
      'do-not-store',
    )
  })

  it('rejects a Turnstile result for the wrong hostname', async () => {
    const db = new FakeD1([5])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ success: true, hostname: 'attacker.example', action: 'scan' }),
      ),
    )
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com', turnstileToken: 'valid-shape' }),
      {
        ...baseEnv(db),
        CHECKER_TURNSTILE_EXPECTED_HOSTNAME: 'agentmarkup.dev',
        CHECKER_TURNSTILE_EXPECTED_ACTION: 'scan',
      },
    )
    expect(response.status).toBe(403)
  })

  it('rejects a Turnstile result for the wrong action', async () => {
    const db = new FakeD1([5])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ success: true, hostname: 'agentmarkup.dev', action: 'wrong-action' }),
      ),
    )
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com', turnstileToken: 'valid-shape' }),
      baseEnv(db),
    )
    expect(response.status).toBe(403)
  })

  it('returns 429 when the atomic insert observes a concurrent cap', async () => {
    const db = new FakeD1([0, 10])
    db.allowInsert = false
    const response = await worker.fetch(
      post('/api/check', { url: 'https://example.com' }),
      baseEnv(db),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toMatch(/^\d+$/)
  })

  it('turns Pages homepage fallbacks into real 404 responses', async () => {
    const unknown = await worker.fetch(
      new Request('https://agentmarkup.dev/not-a-real-page'),
      baseEnv(),
    )
    expect(unknown.status).toBe(404)
    expect(unknown.headers.get('x-robots-tag')).toBe('noindex')

    const known = await worker.fetch(
      new Request('https://agentmarkup.dev/privacy/'),
      baseEnv(),
    )
    expect(known.status).toBe(200)
  })

  it('keeps every published manifest route out of the soft-404 path', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../CONTENT_MANIFEST.json', import.meta.url), 'utf8'),
    ) as Array<{ route: string }>

    expect(manifest).toHaveLength(27)
    for (const { route } of manifest) {
      const response = await worker.fetch(
        new Request(`https://agentmarkup.dev${route}`),
        baseEnv(),
      )
      expect(response.status, route).toBe(200)
    }
  })

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await worker.fetch(
      new Request('https://agentmarkup.dev/api/not-real'),
      baseEnv(),
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
  })
})
