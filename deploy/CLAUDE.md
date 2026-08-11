# Deploy

Manual deployment only. Git pushes do not publish the website.

## Website Deploy (`website-deploy.sh`)

Runs from the repository root:
1. Require a clean `main` branch that exactly matches `origin/main`
2. `pnpm install --frozen-lockfile`
3. `CI=true pnpm exec wrangler whoami`
4. Verify the production Pages bindings and full D1 column schema through the Cloudflare API
5. Run test, typecheck, lint, build, SEO verification, and the production dependency audit
6. `CI=true pnpm exec wrangler pages deploy website/dist --project-name=<agentmarkup>`
7. Smoke-test the production homepage, GEO discovery files, real 404, and both POST-only API routes

Usage: `./deploy/website-deploy.sh [cloudflare-project-name]`

Requirements:
- `CLOUDFLARE_ACCOUNT_ID` must be set in the shell
- `CLOUDFLARE_API_TOKEN` is required and needs Pages Read/Edit plus D1 Read permissions so the deploy preflight can verify configuration without exposing values; Cloudflare API calls time out after 15 seconds
- The deploy uses the workspace-pinned Wrangler version, serves the response headers defined in `website/public/_headers`, and uploads the Pages worker in `website/public/_worker.js` alongside the static assets
- `CHECKS_DB` is required. Create the Cloudflare D1 database, apply `deploy/cloudflare/checker-checks.sql`, and bind it to the Pages project before deploying; the scan APIs fail closed without the binding.
- For databases that predate normalized-only storage, export the database or record a D1 Time Travel bookmark, then apply `deploy/cloudflare/redact-legacy-checker-input.sql` separately. The privacy backfill is idempotent but irreversible.
- Configure `CHECKER_TURNSTILE_SITE_KEY` as a Pages variable and `CHECKER_TURNSTILE_SECRET_KEY` as a secret. Both are required. `CHECKER_TURNSTILE_THRESHOLD` may set the challenge threshold from 1 to 9 (default 5).
- `CHECKER_TURNSTILE_EXPECTED_HOSTNAME` may pin the hostname returned by Siteverify; it defaults to the request hostname. `CHECKER_TURNSTILE_EXPECTED_ACTION` is required and must be `public-scan`, matching both client widgets.
- `website-deploy.sh` runs Wrangler in non-interactive mode and verifies the required production bindings, encrypted Turnstile secret, expected action, and all three D1 tables before building or uploading
- `SITE_URL` may override the post-deploy smoke origin; it defaults to `https://agentmarkup.dev` and must use HTTPS

Preflight without exposing values:
- confirm that `CHECKS_DB`, both required Turnstile keys, and `CHECKER_TURNSTILE_EXPECTED_ACTION=public-scan` exist in the production Pages project;
- confirm the D1 schema has every table and Worker-required column from `checker-checks.sql`;
- the deploy script automatically verifies the homepage, `llms.txt`, sitemap, `405 Allow: POST` for both APIs, and a real `404` after upload;
- a successful scanner POST still requires a controlled production check because it performs outbound requests and writes normalized operational data to D1;
- never print or paste secret values into logs, issues, or documentation.
