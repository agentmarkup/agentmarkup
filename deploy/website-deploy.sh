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

echo "==> Verifying worker security header parity"
read_root_header() {
  awk -v header="$1" '
    NR == 1 && $0 == "/*" { in_root_block = 1; next }
    in_root_block && /^[^[:space:]]/ { exit }
    in_root_block {
      line = $0
      sub(/^[[:space:]]*/, "", line)
      if (index(line, header ":") == 1) {
        sub(/^[^:]*:[[:space:]]*/, "", line)
        print line
        exit
      }
    }
  ' website/public/_headers
}

for header_name in \
  Content-Security-Policy \
  X-Content-Type-Options \
  X-Frame-Options \
  Referrer-Policy \
  Permissions-Policy
do
  header_value="$(read_root_header "$header_name")"
  if [ -z "$header_value" ]; then
    echo "Missing $header_name in the /* block of website/public/_headers." >&2
    exit 1
  fi
  if ! grep -F -- "$header_value" website/public/_worker.js >/dev/null; then
    echo "$header_name differs between website/public/_headers and website/public/_worker.js." >&2
    exit 1
  fi
done

echo "==> Verifying security.txt freshness"
security_expires="$(awk '$1 == "Expires:" { sub(/^[^:]*:[[:space:]]*/, ""); print; exit }' website/public/.well-known/security.txt)"
if [ -z "$security_expires" ]; then
  echo "Missing Expires field in website/public/.well-known/security.txt." >&2
  exit 1
fi
if ! node -e '
  const expiresAt = Date.parse(process.argv[1]);
  const minimumExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  process.exit(Number.isFinite(expiresAt) && expiresAt >= minimumExpiry ? 0 : 1);
' "$security_expires"; then
  echo "website/public/.well-known/security.txt expires in less than 30 days or has an invalid Expires value." >&2
  exit 1
fi

echo "==> Deploying website/dist to Cloudflare Pages project '$PROJECT_NAME'"
CI=true pnpm exec wrangler pages deploy "website/dist" --project-name="$PROJECT_NAME"
