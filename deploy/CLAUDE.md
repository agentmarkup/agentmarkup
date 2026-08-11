# Deploy

Manual deployment only. Git pushes do not publish the website.

## Website Deploy (`website-deploy.sh`)

Runs from the repository root:
1. `pnpm install --frozen-lockfile`
2. `pnpm -C website build`
3. `CI=true pnpm exec wrangler whoami`
4. `CI=true pnpm exec wrangler pages deploy website/dist --project-name=<agentmarkup>`

Usage: `./deploy/website-deploy.sh [cloudflare-project-name]`

Requirements:
- `CLOUDFLARE_ACCOUNT_ID` must be set in the shell
- Prefer `CLOUDFLARE_API_TOKEN` for deploys; otherwise Wrangler must already be authenticated on the machine that runs the deploy
- The deploy uses the workspace-pinned Wrangler version, serves the response headers defined in `website/public/_headers`, and uploads the Pages worker in `website/public/_worker.js` alongside the static assets
- `CHECKS_DB` is required. Create the Cloudflare D1 database, apply `deploy/cloudflare/checker-checks.sql`, and bind it to the Pages project before deploying; the schema also normalizes any legacy `requested_input` rows, and the scan APIs fail closed without the binding.
- Configure `CHECKER_TURNSTILE_SITE_KEY` as a Pages variable and `CHECKER_TURNSTILE_SECRET_KEY` as a secret. Both are required. `CHECKER_TURNSTILE_THRESHOLD` may set the challenge threshold from 1 to 9 (default 5).
- `CHECKER_TURNSTILE_EXPECTED_HOSTNAME` may pin the hostname returned by Siteverify; it defaults to the request hostname. `CHECKER_TURNSTILE_EXPECTED_ACTION` is required and must be `public-scan`, matching both client widgets.
- `website-deploy.sh` now runs Wrangler in non-interactive mode so missing auth fails fast instead of appearing to hang after the build output

Preflight without exposing values:
- confirm that `CHECKS_DB`, both required Turnstile keys, and `CHECKER_TURNSTILE_EXPECTED_ACTION=public-scan` exist in the production Pages project;
- confirm the D1 schema has all three tables from `checker-checks.sql`;
- after deploy, verify a same-origin POST to each API, `405 Allow: POST` for GET, and a `404` for an unknown page;
- never print or paste secret values into logs, issues, or documentation.
