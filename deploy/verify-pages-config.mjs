import { pathToFileURL } from 'node:url'

const REQUIRED_SCHEMA = {
  checker_cache: ['normalized_url', 'response_json', 'cached_at', 'expires_at'],
  checker_checks: [
    'requested_input',
    'normalized_url',
    'origin',
    'checked_at',
    'homepage_status',
    'llms_status',
    'robots_status',
    'sitemap_status',
  ],
  checker_request_events: [
    'ip_hash',
    'normalized_url',
    'requested_at',
    'challenge_passed',
  ],
}

export function validatePagesProject(project) {
  const production = project?.deployment_configs?.production
  const variables = production?.env_vars ?? {}
  const database = production?.d1_databases?.CHECKS_DB
  const missing = []

  if (!database?.id) missing.push('CHECKS_DB')
  if (!variables.CHECKER_TURNSTILE_SITE_KEY?.value?.trim()) {
    missing.push('CHECKER_TURNSTILE_SITE_KEY')
  }
  if (variables.CHECKER_TURNSTILE_SECRET_KEY?.type !== 'secret_text') {
    missing.push('CHECKER_TURNSTILE_SECRET_KEY (encrypted secret)')
  }
  if (variables.CHECKER_TURNSTILE_EXPECTED_ACTION?.value !== 'public-scan') {
    missing.push('CHECKER_TURNSTILE_EXPECTED_ACTION=public-scan')
  }

  if (missing.length > 0) {
    throw new Error(`Missing production Pages configuration: ${missing.join(', ')}`)
  }

  return database.id
}

export function validateD1Schema(response) {
  const columns = new Set(
    (response?.result ?? []).flatMap((query) =>
      (query?.results ?? []).map((row) => `${row?.table_name}.${row?.column_name}`),
    ),
  )
  const missing = Object.entries(REQUIRED_SCHEMA).flatMap(([table, requiredColumns]) =>
    requiredColumns
      .filter((column) => !columns.has(`${table}.${column}`))
      .map((column) => `${table}.${column}`),
  )

  if (missing.length > 0) {
    throw new Error(`Missing D1 schema fields: ${missing.join(', ')}`)
  }
}

async function cloudflareRequest(path, token, init) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => null)

  if (!response.ok || body?.success !== true) {
    throw new Error(`Cloudflare preflight request failed (${response.status})`)
  }

  return body
}

async function main() {
  const projectName = process.argv[2] || 'agentmarkup'
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_API_TOKEN

  if (!accountId || !token) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for deploy preflight',
    )
  }

  const projectResponse = await cloudflareRequest(
    `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`,
    token,
  )
  const databaseId = validatePagesProject(projectResponse.result)
  const schemaResponse = await cloudflareRequest(
    `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        sql: [
          "SELECT 'checker_cache' AS table_name, name AS column_name FROM pragma_table_info('checker_cache')",
          "SELECT 'checker_checks', name FROM pragma_table_info('checker_checks')",
          "SELECT 'checker_request_events', name FROM pragma_table_info('checker_request_events')",
        ].join(' UNION ALL '),
      }),
    },
  )

  validateD1Schema(schemaResponse)
  console.log('Cloudflare Pages bindings, Turnstile variables, and D1 schema verified.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Cloudflare preflight failed')
    process.exitCode = 1
  })
}
