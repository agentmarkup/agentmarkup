import { pathToFileURL } from 'node:url'

const CHECKS = [
  { path: '/', status: 200, contentType: 'text/html' },
  { path: '/llms.txt', status: 200, contentType: 'text/plain' },
  { path: '/sitemap.xml', status: 200, contentType: 'application/xml' },
  { path: '/api/check', status: 405, allow: 'POST' },
  { path: '/api/security-scan', status: 405, allow: 'POST' },
  { path: '/.well-known/agentmarkup-deploy-smoke-404', status: 404 },
]

async function fetchWithRetry(fetchImpl, url, attempts = 5) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: '*/*' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      if (response.status < 500 || attempt === attempts) return response
      lastError = new Error(`temporary HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  throw lastError instanceof Error ? lastError : new Error('Production smoke request failed')
}

export async function verifyProductionSmoke(baseUrl, fetchImpl = fetch) {
  const origin = new URL(baseUrl)
  if (origin.protocol !== 'https:') {
    throw new Error('Production smoke URL must use HTTPS')
  }

  for (const check of CHECKS) {
    const response = await fetchWithRetry(fetchImpl, new URL(check.path, origin))
    if (response.status !== check.status) {
      throw new Error(`${check.path} returned HTTP ${response.status}; expected ${check.status}`)
    }
    if (check.contentType && !response.headers.get('content-type')?.includes(check.contentType)) {
      throw new Error(`${check.path} returned an unexpected Content-Type`)
    }
    if (check.allow && response.headers.get('allow') !== check.allow) {
      throw new Error(`${check.path} did not advertise Allow: ${check.allow}`)
    }
  }
}

async function main() {
  const baseUrl = process.argv[2] || 'https://agentmarkup.dev'
  await verifyProductionSmoke(baseUrl)
  console.log(`Production smoke verified for ${new URL(baseUrl).origin}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Production smoke failed')
    process.exitCode = 1
  })
}
