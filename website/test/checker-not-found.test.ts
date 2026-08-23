// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { auditNotFoundHandling } from '../src/checker/analyze'
import type { AuditItem, RemoteResource } from '../src/checker/types'

const HOMEPAGE_HTML =
  '<html><head><title>Home</title></head><body><main><h1>Home</h1><p>Real content.</p></main></body></html>'

function resource(overrides: Partial<RemoteResource> = {}): RemoteResource {
  return {
    requestedUrl: 'https://example.com/agentmarkup-probe-404-does-not-exist-9f3a2c',
    finalUrl: 'https://example.com/agentmarkup-probe-404-does-not-exist-9f3a2c',
    status: 404,
    ok: false,
    contentType: 'text/html',
    body: null,
    ...overrides,
  }
}

const homepage = resource({
  requestedUrl: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  ok: true,
  body: HOMEPAGE_HTML,
})

function run(probe: RemoteResource | null | undefined): AuditItem[] {
  const items: AuditItem[] = []
  auditNotFoundHandling(items, homepage, probe)
  return items
}

describe('checker soft-404 detection', () => {
  it('reports an error when a nonexistent path returns the homepage with 200', () => {
    const [item] = run(resource({ status: 200, ok: true, body: HOMEPAGE_HTML }))

    expect(item.level).toBe('error')
    expect(item.title).toContain('Soft-404')
  })

  it('ignores cosmetic differences like a changed nonce or hashed asset name', () => {
    const shellWithDifferentAssets = HOMEPAGE_HTML.replace(
      '</body>',
      '<script nonce="abc123" src="/assets/main-9f3a2c.js"></script></body>'
    )
    const [item] = run(resource({ status: 200, ok: true, body: shellWithDifferentAssets }))

    expect(item.level).toBe('error')
  })

  it('downgrades to a warning when the 200 body differs from the homepage', () => {
    const [item] = run(
      resource({
        status: 200,
        ok: true,
        body: '<html><body><main><h1>Not found</h1><p>Sorry.</p></main></body></html>',
      })
    )

    expect(item.level).toBe('warning')
    expect(item.title).toContain('not 404')
  })

  it('passes when the path returns a real 404 or 410', () => {
    for (const status of [404, 410]) {
      const [item] = run(resource({ status }))
      expect(item.level).toBe('pass')
    }
  })

  it('warns rather than erroring when the probe never completed', () => {
    const [timedOut] = run(resource({ status: 0, error: 'timeout' }))
    expect(timedOut.level).toBe('warning')
    expect(timedOut.title).toContain('Could not check')
  })

  it('flags a non-2xx, non-404 status as ambiguous rather than a soft-404', () => {
    const [item] = run(resource({ status: 302 }))

    expect(item.level).toBe('warning')
    expect(item.title).toContain('302')
  })

  it('reports nothing when the probe is absent, so older payloads stay valid', () => {
    expect(run(undefined)).toHaveLength(0)
    expect(run(null)).toHaveLength(0)
  })

  it('always carries an agentmarkup explainer, including on the pass state', () => {
    for (const probe of [resource({ status: 404 }), resource({ status: 200, ok: true, body: HOMEPAGE_HTML })]) {
      const [item] = run(probe)
      expect(item.agentmarkupHelp).toBeTruthy()
    }
  })
})
