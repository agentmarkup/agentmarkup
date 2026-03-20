#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:-agentmarkup}"

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "CLOUDFLARE_ACCOUNT_ID must be set." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
pnpm -C website build
pnpm exec wrangler pages deploy "website/dist" --project-name="$PROJECT_NAME"
