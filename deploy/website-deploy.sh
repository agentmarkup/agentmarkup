#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:-agentmarkup}"

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "CLOUDFLARE_ACCOUNT_ID must be set." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> Installing workspace dependencies"
pnpm install --frozen-lockfile

echo "==> Building website"
pnpm -C website build

echo "==> Verifying Wrangler authentication"
if ! CI=true pnpm exec wrangler whoami >/dev/null 2>&1; then
  echo "Wrangler is not authenticated for a non-interactive deploy." >&2
  echo "Set CLOUDFLARE_API_TOKEN or log in first with 'pnpm exec wrangler login'." >&2
  exit 1
fi

echo "==> Deploying website/dist to Cloudflare Pages project '$PROJECT_NAME'"
CI=true pnpm exec wrangler pages deploy "website/dist" --project-name="$PROJECT_NAME"
