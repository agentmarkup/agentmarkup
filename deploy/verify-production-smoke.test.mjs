import assert from 'node:assert/strict'
import test from 'node:test'

import { verifyProductionSmoke } from './verify-production-smoke.mjs'

function response(status, headers = {}) {
  return new Response('', { status, headers })
}

test('accepts the expected production routes and Worker methods', async () => {
  const responses = [
    response(200, { 'content-type': 'text/html; charset=utf-8' }),
    response(200, { 'content-type': 'text/plain; charset=utf-8' }),
    response(200, { 'content-type': 'application/xml' }),
    response(405, { allow: 'POST' }),
    response(405, { allow: 'POST' }),
    response(404),
  ]

  await assert.doesNotReject(() =>
    verifyProductionSmoke('https://agentmarkup.dev', async () => responses.shift()),
  )
})

test('rejects an unexpected live response', async () => {
  await assert.rejects(
    () => verifyProductionSmoke('https://agentmarkup.dev', async () => response(200)),
    /unexpected Content-Type/,
  )
})
