// @vitest-environment node
import { describe, expect, it } from 'vitest'

// @ts-expect-error - the deployed Pages worker is plain JS with no type declarations
import worker from '../public/_worker.js'

const NOT_FOUND_HTML =
  '<!doctype html><html><head><title>Page not found - agentmarkup</title></head><body><h1>Page not found</h1></body></html>'

function makeEnv(status = 404, body = NOT_FOUND_HTML) {
  return {
    ASSETS: {
      fetch: async () =>
        new Response(status === 404 ? body : 'asset body', {
          status,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            vary: 'Accept-Encoding',
          },
        }),
    },
  }
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://agentmarkup.dev${path}`, init)
}

describe('worker not-found handling', () => {
  it('returns a real 404 for an unknown path instead of a 200 app shell', async () => {
    const response = await worker.fetch(request('/some-path-that-does-not-exist'), makeEnv())

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('Page not found')
  })

  it('adds Accept to Vary on the HTML 404 without dropping the existing value', async () => {
    const response = await worker.fetch(request('/nope'), makeEnv())

    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding')
  })

  it('serves a markdown 404 body when the client explicitly asks for markdown', async () => {
    const response = await worker.fetch(
      request('/nope', { headers: { accept: 'text/markdown' } }),
      makeEnv()
    )
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding')
    expect(body).toContain('# 404 Not Found')
    expect(body).toContain('https://agentmarkup.dev/llms.txt')
    expect(body).toContain('https://agentmarkup.dev/sitemap.xml')
    expect(body).toContain('https://agentmarkup.dev/robots.txt')
    expect(body).toContain('https://agentmarkup.dev/learn/')
    expect(body).toContain('This 404 page does not.')
  })

  it('answers with the text type the client actually accepted', async () => {
    const plainOnly = await worker.fetch(
      request('/nope', { headers: { accept: 'text/plain' } }),
      makeEnv()
    )

    expect(plainOnly.status).toBe(404)
    expect(plainOnly.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })

  it('never answers with a type the client marked unacceptable via q=0', async () => {
    const response = await worker.fetch(
      request('/nope', { headers: { accept: 'text/markdown;q=0, text/plain;q=1' } }),
      makeEnv()
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })

  it('falls back to HTML when every text type is marked unacceptable', async () => {
    const response = await worker.fetch(
      request('/nope', {
        headers: { accept: 'text/markdown;q=0, text/plain;q=0, text/html' },
      }),
      makeEnv()
    )

    expect(response.headers.get('content-type')).toContain('text/html')
  })

  it('builds the markdown 404 links from the requesting origin so previews stay correct', async () => {
    const response = await worker.fetch(
      new Request('https://preview.agentmarkup.pages.dev/nope', {
        headers: { accept: 'text/markdown' },
      }),
      makeEnv()
    )

    expect(await response.text()).toContain('https://preview.agentmarkup.pages.dev/llms.txt')
  })

  it('keeps the HTML 404 for wildcard and browser Accept headers', async () => {
    for (const accept of [
      '*/*',
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    ]) {
      const response = await worker.fetch(request('/nope', { headers: { accept } }), makeEnv())

      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('text/html')
    }
  })

  it('respects q-values when markdown and HTML are both accepted', async () => {
    const htmlPreferred = await worker.fetch(
      request('/nope', { headers: { accept: 'text/markdown;q=0.5, text/html;q=0.9' } }),
      makeEnv()
    )
    const markdownPreferred = await worker.fetch(
      request('/nope', { headers: { accept: 'text/markdown;q=0.9, text/html;q=0.5' } }),
      makeEnv()
    )

    expect(htmlPreferred.headers.get('content-type')).toContain('text/html')
    expect(markdownPreferred.headers.get('content-type')).toContain('text/markdown')
  })

  it('sends no body for a HEAD request that negotiated markdown', async () => {
    const response = await worker.fetch(
      request('/nope', { method: 'HEAD', headers: { accept: 'text/markdown' } }),
      makeEnv()
    )

    expect(response.status).toBe(404)
    expect(response.body).toBeNull()
  })

  it('applies the security headers to both 404 variants', async () => {
    const htmlResponse = await worker.fetch(request('/nope'), makeEnv())
    const markdownResponse = await worker.fetch(
      request('/nope', { headers: { accept: 'text/markdown' } }),
      makeEnv()
    )

    for (const response of [htmlResponse, markdownResponse]) {
      expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    }
  })

  it('leaves a found asset untouched apart from the security headers', async () => {
    const response = await worker.fetch(request('/'), makeEnv(200))

    expect(response.status).toBe(200)
    expect(response.headers.get('vary')).toBe('Accept-Encoding')
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    expect(await response.text()).toBe('asset body')
  })
})

describe('worker JSON error envelope', () => {
  it('returns a machine-readable code for an unsupported method on /api/check', async () => {
    const response = await worker.fetch(request('/api/check', { method: 'PUT' }), makeEnv())

    expect(response.status).toBe(405)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      error: 'Method not allowed. Use GET or POST.',
      code: 'method_not_allowed',
    })
  })

  it('returns a machine-readable code for a GET on /api/security-scan', async () => {
    const response = await worker.fetch(request('/api/security-scan'), makeEnv())

    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({
      error: 'Method not allowed. Use POST.',
      code: 'method_not_allowed',
    })
  })

  it('returns a machine-readable code for a cross-site scan request', async () => {
    const response = await worker.fetch(
      request('/api/security-scan', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
      makeEnv()
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Cross-site requests are not allowed.',
      code: 'cross_site_forbidden',
    })
  })

  it('returns a machine-readable code for a malformed check request', async () => {
    const response = await worker.fetch(request('/api/check'), makeEnv())
    const payload = (await response.json()) as { error: string; code: string }

    expect(response.status).toBe(400)
    expect(payload.code).toBe('invalid_request')
    expect(payload.error).toBeTruthy()
  })
})
