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
- The deploy uses the workspace-pinned Wrangler version and serves the response headers defined in `website/public/_headers`
