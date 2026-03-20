# Deploy

Manual deployment only. Git pushes do not publish the website.

## Website Deploy (`website-deploy.sh`)

Runs from the repository root:
1. `pnpm install --frozen-lockfile`
2. `pnpm -C website build`
3. `pnpm exec wrangler pages deploy website/dist --project-name=<agentmarkup>`

Usage: `./deploy/website-deploy.sh [cloudflare-project-name]`

Requirements:
- `CLOUDFLARE_ACCOUNT_ID` must be set in the shell
- Wrangler must already be authenticated on the machine that runs the deploy
- The deploy uses the workspace-pinned Wrangler version, serves the response headers defined in `website/public/_headers`, and uploads the Pages worker in `website/public/_worker.js` alongside the static assets
- If you want checked URLs saved, create a Cloudflare D1 database, bind it to the Pages project as `CHECKS_DB`, and apply the schema in `deploy/cloudflare/checker-checks.sql`
