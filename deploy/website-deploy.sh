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
# Compare each mirrored header for EXACT equality between the /* block of
# website/public/_headers and the SECURITY_HEADERS object the worker serves.
# A substring match would let drift through (e.g. DENY vs "DENY, SAMEORIGIN").
if ! node -e '
  const fs = require("fs");
  const headersTxt = fs.readFileSync("website/public/_headers", "utf8");
  const workerTxt = fs.readFileSync("website/public/_worker.js", "utf8");

  const rootHeaders = {};
  let inRoot = false;
  for (const line of headersTxt.split(/\r?\n/)) {
    if (line.trim() === "/*") { inRoot = true; continue; }
    if (inRoot && /^\S/.test(line)) break;
    const m = inRoot ? line.match(/^\s+([A-Za-z-]+):\s*(.*)$/) : null;
    if (m) rootHeaders[m[1].toLowerCase()] = m[2];
  }

  const objMatch = workerTxt.match(/const SECURITY_HEADERS = (\{[\s\S]*?\n\});/);
  if (!objMatch) { console.error("Could not find SECURITY_HEADERS in _worker.js."); process.exit(1); }
  let workerHeaders;
  try { workerHeaders = new Function("return (" + objMatch[1] + ")")(); }
  catch (e) { console.error("Could not parse SECURITY_HEADERS:", e.message); process.exit(1); }

  const mirrored = ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];
  let ok = true;
  for (const name of mirrored) {
    if (!(name in rootHeaders)) { console.error("Missing " + name + " in the /* block of website/public/_headers."); ok = false; continue; }
    if (rootHeaders[name] !== workerHeaders[name]) {
      console.error(name + " differs between _headers and the worker SECURITY_HEADERS constant.");
      console.error("  _headers: " + rootHeaders[name]);
      console.error("  _worker : " + String(workerHeaders[name]));
      ok = false;
    }
  }
  process.exit(ok ? 0 : 1);
'; then
  echo "Worker security header parity check failed." >&2
  exit 1
fi

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
