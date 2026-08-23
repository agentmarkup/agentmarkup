// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type Operation = {
  operationId?: string
  description?: string
  responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>
}

const websiteRoot = fileURLToPath(new URL('../', import.meta.url))
const spec = JSON.parse(
  readFileSync(`${websiteRoot}/public/openapi.json`, 'utf8')
) as {
  openapi: string
  paths: Record<string, Record<string, Operation>>
  components: { schemas: Record<string, unknown> }
}

const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({ path, method, op }))
)

describe('published OpenAPI document', () => {
  it('is OpenAPI 3.1 and describes both endpoints in versioned and aliased form', () => {
    expect(spec.openapi).toBe('3.1.0')
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/api/check',
      '/api/security-scan',
      '/api/v1/check',
      '/api/v1/security-scan',
    ])
  })

  it('gives every operation a unique operationId and a description', () => {
    const ids = operations.map(({ op }) => op.operationId)

    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(operations.every(({ op }) => (op.description ?? '').length > 0)).toBe(true)
  })

  it('types every 4xx and 5xx response with a directly visible error schema', () => {
    // Deliberately NOT resolved through `components.responses`: a consumer that
    // reads `responses[code].content` must see the schema without following an
    // indirection, or the error model reads as undocumented.
    const untyped: string[] = []

    for (const { path, method, op } of operations) {
      for (const [code, response] of Object.entries(op.responses)) {
        if (!/^[45]/.test(code)) continue
        const schema = response.content?.['application/json']?.schema
        if (schema?.$ref !== '#/components/schemas/ErrorResponse') {
          untyped.push(`${method.toUpperCase()} ${path} ${code}`)
        }
      }
    }

    expect(untyped).toEqual([])
  })

  it('documents the full failure surface on every operation', () => {
    for (const { op } of operations) {
      for (const code of ['400', '404', '405', '429', '500']) {
        expect(Object.keys(op.responses)).toContain(code)
      }
    }
  })

  it('exposes every error code the worker can actually emit', () => {
    const worker = readFileSync(`${websiteRoot}/public/_worker.js`, 'utf8')
    const emitted = new Set(
      Array.from(worker.matchAll(/jsonError\(\s*'([a-z_]+)'/g), (m) => m[1])
    )
    const schema = spec.components.schemas.ErrorResponse as {
      properties: { code: { enum: string[] } }
    }
    const documented = new Set(schema.properties.code.enum)

    for (const code of emitted) {
      expect(documented).toContain(code)
    }
  })
})
