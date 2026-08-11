import assert from 'node:assert/strict'
import test from 'node:test'

import { validateD1Schema, validatePagesProject } from './verify-pages-config.mjs'

const validProject = {
  deployment_configs: {
    production: {
      d1_databases: { CHECKS_DB: { id: 'database-id' } },
      env_vars: {
        CHECKER_TURNSTILE_EXPECTED_ACTION: {
          type: 'plain_text',
          value: 'public-scan',
        },
        CHECKER_TURNSTILE_SECRET_KEY: { type: 'secret_text', value: '' },
        CHECKER_TURNSTILE_SITE_KEY: { type: 'plain_text', value: 'site-key' },
      },
    },
  },
}

test('accepts the required production bindings without exposing their values', () => {
  assert.equal(validatePagesProject(validProject), 'database-id')
})

test('rejects missing or unencrypted production protection', () => {
  assert.throws(
    () =>
      validatePagesProject({
        deployment_configs: {
          production: {
            d1_databases: {},
            env_vars: {
              CHECKER_TURNSTILE_SECRET_KEY: {
                type: 'plain_text',
                value: 'not-safe',
              },
            },
          },
        },
      }),
    /CHECKS_DB.*SITE_KEY.*encrypted secret.*EXPECTED_ACTION/,
  )
})

test('rejects an empty Turnstile site key', () => {
  assert.throws(
    () =>
      validatePagesProject({
        ...validProject,
        deployment_configs: {
          production: {
            ...validProject.deployment_configs.production,
            env_vars: {
              ...validProject.deployment_configs.production.env_vars,
              CHECKER_TURNSTILE_SITE_KEY: { type: 'plain_text', value: '' },
            },
          },
        },
      }),
    /CHECKER_TURNSTILE_SITE_KEY/,
  )
})

test('requires all Worker tables in the bound D1 database', () => {
  const completeSchema = {
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
  const rows = Object.entries(completeSchema).flatMap(([table_name, columns]) =>
    columns.map((column_name) => ({ table_name, column_name })),
  )

  assert.doesNotThrow(() =>
    validateD1Schema({
      result: [{ results: rows }],
    }),
  )
  assert.throws(
    () =>
      validateD1Schema({
        result: [
          {
            results: rows.filter(
              ({ table_name, column_name }) =>
                !(table_name === 'checker_request_events' && column_name === 'challenge_passed'),
            ),
          },
        ],
      }),
    /checker_request_events\.challenge_passed/,
  )
})
