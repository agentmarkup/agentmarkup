const CHECKER_USER_AGENT = 'agentmarkup-checker/0.3.2 (+https://agentmarkup.dev)';
const CHECKS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS checker_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_input TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    origin TEXT NOT NULL,
    checked_at TEXT NOT NULL,
    homepage_status INTEGER NOT NULL,
    llms_status INTEGER NOT NULL,
    robots_status INTEGER NOT NULL,
    sitemap_status INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_checker_checks_checked_at
    ON checker_checks (checked_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_checker_checks_normalized_url
    ON checker_checks (normalized_url)`,
  `CREATE TABLE IF NOT EXISTS checker_request_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    challenge_passed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_checker_request_events_ip_requested_at
    ON checker_request_events (ip_hash, requested_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_checker_request_events_normalized_requested_at
    ON checker_request_events (normalized_url, requested_at DESC)`,
  `CREATE TABLE IF NOT EXISTS checker_cache (
    normalized_url TEXT PRIMARY KEY,
    response_json TEXT NOT NULL,
    cached_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_checker_cache_expires_at
    ON checker_cache (expires_at)`,
];

/** A path no real route should claim, used to observe not-found handling. */
const SOFT_404_PROBE_PATH = '/agentmarkup-probe-404-does-not-exist-9f3a2c';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT_MAX = 10;
const TARGET_CACHE_TTL_MS = 3 * 60 * 1000;
// D1 rejects a single bound string/blob above its per-value limit with
// SQLITE_TOOBIG. Skip caching responses whose serialized payload exceeds this
// conservative budget so a large target still returns a live (uncached) result.
const MAX_CACHE_VALUE_BYTES = 900 * 1024;
const CHECK_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SECURITY_SCAN_PREFIX = 'security-scan:';
const SECURITY_SCAN_MIN_FETCH_BUDGET_MS = 1500;
const DNS_LOOKUP_TIMEOUT_MS = 4000;
const MAX_DNS_RESPONSE_BYTES = 64 * 1024;
// DNS-over-HTTPS numeric RR type codes for the record types we query.
const DNS_RECORD_TYPE_NUMBERS = { TXT: 16, DS: 43 };
const SECURITY_HEADER_NAMES = [
  'strict-transport-security',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'cross-origin-embedder-policy',
  'server',
  'x-powered-by',
];
const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'sha256-Jt+ZWGsmr8mhtb9g3A71b0bSDV7csRp6tr51UeVq3ss=' 'sha256-MiBCOgMISGpfezwPQfq/58mseJfrfIQBTtTlwnMm/xE=' https://www.googletagmanager.com https://challenges.cloudflare.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net https://challenges.cloudflare.com; img-src 'self' data: https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'strict-transport-security': 'max-age=31536000',
  'cross-origin-opener-policy': 'same-origin',
};

let checksSchemaReadyPromise;
let checksSchemaUnavailable = false;

const TOTAL_TIMEOUT_MS = 25000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/check') {
      if (!['GET', 'POST'].includes(request.method)) {
        return jsonError('method_not_allowed', 'Method not allowed. Use GET or POST.', 405);
      }

      return handleCheckRequest(request, url, env, Date.now());
    }

    if (url.pathname === '/api/security-scan') {
      // POST-only: a scan mutates rate-limit state and runs on the caller's
      // behalf, so it must not be triggerable by a cross-site GET (e.g. an
      // <img> or link) that would bypass the on-page authorization gate.
      if (request.method !== 'POST') {
        return jsonError('method_not_allowed', 'Method not allowed. Use POST.', 405);
      }
      // Reject cross-site browser requests to prevent CSRF-style scans that
      // consume a visitor's shared rate-limit budget. Non-browser clients omit
      // Sec-Fetch-Site and are not a CSRF vector.
      const fetchSite = request.headers.get('sec-fetch-site');
      if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
        return jsonError('cross_site_forbidden', 'Cross-site requests are not allowed.', 403);
      }

      return handleSecurityScanRequest(request, url, env, Date.now());
    }

    return serveAssetWithSecurityHeaders(request, env);
  },
};

async function handleCheckRequest(request, url, env, checkStartTime) {
  try {
    const { input, turnstileToken } = await readCheckRequest(request, url);
    const normalized = normalizePublicUrl(input);
    const checkedAt = new Date().toISOString();
    const protection = await applyCheckerProtection(
      env,
      request,
      normalized,
      checkedAt,
      turnstileToken
    );
    if (protection.response) {
      return protection.response;
    }

    const cachedResponse = await readCachedResponse(
      env,
      normalized,
      protection.metadata
    );
    if (cachedResponse) {
      return json(cachedResponse, 200);
    }

    const homepage = await fetchText(normalized, checkStartTime);
    const targetUrl = toSiteRootUrl(homepage.finalUrl || normalized);
    const homepageMarkdownUrl =
      (homepage.ok && homepage.body
        ? findMarkdownAlternateUrl(homepage.body, targetUrl)
        : null) ?? buildMarkdownUrl(targetUrl);
    const homepageMarkdown = homepageMarkdownUrl
      ? await fetchText(homepageMarkdownUrl, checkStartTime)
      : null;
    const llmsTxt = await fetchText(new URL('/llms.txt', targetUrl).toString(), checkStartTime);
    const robotsTxt = await fetchText(new URL('/robots.txt', targetUrl).toString(), checkStartTime);

    let samplePage = null;
    let samplePageMarkdown = null;

    if (homepage.ok && homepage.body) {
      const samplePageUrl = findFirstInternalLink(
        homepage.body,
        homepage.finalUrl || targetUrl
      );
      if (samplePageUrl) {
        samplePage = await fetchText(samplePageUrl, checkStartTime);
        const sampleMarkdownUrl =
          (samplePage.ok && samplePage.body
            ? findMarkdownAlternateUrl(
                samplePage.body,
                samplePage.finalUrl || samplePageUrl
              )
            : null) ?? buildMarkdownUrl(samplePage.finalUrl || samplePageUrl);
        samplePageMarkdown = sampleMarkdownUrl
          ? await fetchText(sampleMarkdownUrl, checkStartTime)
          : null;
      }
    }

    let sitemapUrl = null;
    let sitemapSource = null;

    if (robotsTxt.ok && robotsTxt.body) {
      const discoveredSitemap = findSitemapUrl(robotsTxt.body, targetUrl);
      if (discoveredSitemap) {
        sitemapUrl = discoveredSitemap;
        sitemapSource = 'robots';
      }
    }

    if (!sitemapUrl) {
      sitemapUrl = new URL('/sitemap.xml', targetUrl).toString();
      sitemapSource = 'default';
    }

    // One extra request to a path no real route should claim, so the report can
    // tell a real 404 from a soft-404 that makes every path look like it exists.
    const notFoundProbe = await fetchText(
      new URL(SOFT_404_PROBE_PATH, targetUrl).toString(),
      checkStartTime
    );

    const sitemap = sitemapUrl ? await fetchText(sitemapUrl, checkStartTime) : null;
    const payload = {
      targetUrl,
      origin: new URL(targetUrl).origin,
      fetchedAt: checkedAt,
      normalizedFrom: input.trim() && input.trim() !== targetUrl ? input.trim() : null,
      homepage,
      homepageMarkdown,
      llmsTxt,
      robotsTxt,
      sitemap,
      sitemapUrl,
      sitemapSource,
      notFoundProbe,
      samplePage,
      samplePageMarkdown,
      cache: {
        hit: false,
        cachedAt: null,
        expiresAt: null,
      },
      protection: protection.metadata,
    };

    const storage = await persistCheckedUrl(env, {
      input,
      normalized: targetUrl,
      origin: new URL(targetUrl).origin,
      checkedAt,
      homepage,
      llmsTxt,
      robotsTxt,
      sitemap,
    });
    const cacheExpiresAt = new Date(
      Date.parse(checkedAt) + TARGET_CACHE_TTL_MS
    ).toISOString();
    const responseBody = {
      ...payload,
      cache: {
        hit: false,
        cachedAt: checkedAt,
        expiresAt: cacheExpiresAt,
      },
      storage,
    };

    await cacheCheckResponse(
      env,
      normalized,
      targetUrl,
      responseBody,
      checkedAt,
      cacheExpiresAt
    );

    return json(responseBody, 200);
  } catch (error) {
    return jsonError(
      'invalid_request',
      error instanceof Error
        ? error.message
        : 'Enter a public http:// or https:// website URL.',
      400
    );
  }
}

async function handleSecurityScanRequest(request, url, env, checkStartTime) {
  try {
    const { input, turnstileToken } = await readCheckRequest(request, url);
    const normalizedUrl = new URL(normalizePublicUrl(input));
    normalizedUrl.protocol = 'https:';
    const normalized = normalizedUrl.toString();
    const cacheKey = `${SECURITY_SCAN_PREFIX}${normalized}`;
    const checkedAt = new Date().toISOString();
    const protection = await applyCheckerProtection(
      env,
      request,
      cacheKey,
      checkedAt,
      turnstileToken
    );
    if (protection.response) {
      return protection.response;
    }

    const cachedResponse = await readCachedResponse(
      env,
      cacheKey,
      protection.metadata
    );
    if (cachedResponse) {
      return json(
        {
          ...cachedResponse,
          normalizedFrom: getNormalizedFrom(input, cachedResponse.targetUrl),
        },
        200
      );
    }

    const homepage = hasSecurityScanFetchBudget(checkStartTime)
      ? await fetchText(normalized, checkStartTime, {
          captureHeaders: true,
          timeoutMs: FETCH_TIMEOUT_MS,
        })
      : createSkippedResource(normalized, 'Scan time budget exhausted.', true);
    const targetUrl = toSiteRootUrl(homepage.finalUrl || normalized);
    const target = new URL(targetUrl);
    const submitted = new URL(normalized);
    const crossOriginRedirect = !hostnamesMatch(
      target.hostname,
      submitted.hostname
    );

    let httpProbe = null;
    let securityTxt;
    let securityTxtFallback = null;
    let dns = {
      spf: null,
      dmarc: null,
      dnssec: null,
    };

    const securityTxtUrl = buildHttpsUrl(
      target.hostname,
      '/.well-known/security.txt'
    );

    if (crossOriginRedirect) {
      securityTxt = createSkippedResource(
        securityTxtUrl,
        'Skipped after a cross-origin redirect.'
      );
    } else {
      httpProbe = hasSecurityScanFetchBudget(checkStartTime)
        ? await probeHttpDowngrade(target.hostname, checkStartTime)
        : createSkippedHttpProbe(target.hostname, 'Scan time budget exhausted.');

      securityTxt = hasSecurityScanFetchBudget(checkStartTime)
        ? await fetchText(securityTxtUrl, checkStartTime, {
            timeoutMs: 5000,
            sameHostAs: target.hostname,
          })
        : createSkippedResource(
            securityTxtUrl,
            'Scan time budget exhausted.'
          );

      if (shouldFetchLegacySecurityTxt(securityTxt)) {
        const fallbackUrl = buildHttpsUrl(target.hostname, '/security.txt');
        securityTxtFallback = hasSecurityScanFetchBudget(checkStartTime)
          ? await fetchText(fallbackUrl, checkStartTime, {
              timeoutMs: 5000,
              sameHostAs: target.hostname,
            })
          : createSkippedResource(
              fallbackUrl,
              'Scan time budget exhausted.'
            );
      }

      if (hasSecurityScanFetchBudget(checkStartTime)) {
        const baseHost = stripLeadingWww(target.hostname);
        const dnsDeadline = Math.min(
          Date.now() + DNS_LOOKUP_TIMEOUT_MS,
          checkStartTime + TOTAL_TIMEOUT_MS
        );
        const [spf, dmarc, dnssec] = await Promise.all([
          dnsLookup('TXT', baseHost, checkStartTime, dnsDeadline),
          dnsLookup('TXT', `_dmarc.${baseHost}`, checkStartTime, dnsDeadline),
          dnsLookup('DS', baseHost, checkStartTime, dnsDeadline),
        ]);
        dns = { spf, dmarc, dnssec };
      }
    }

    const cacheExpiresAt = new Date(
      Date.parse(checkedAt) + TARGET_CACHE_TTL_MS
    ).toISOString();
    const responseBody = {
      targetUrl,
      origin: target.origin,
      fetchedAt: checkedAt,
      normalizedFrom: getNormalizedFrom(input, targetUrl),
      homepage,
      httpProbe,
      securityTxt,
      securityTxtFallback,
      crossOriginRedirect,
      dns,
      cache: {
        hit: false,
        cachedAt: checkedAt,
        expiresAt: cacheExpiresAt,
      },
      protection: protection.metadata,
    };

    const cacheBody = { ...responseBody };
    delete cacheBody.normalizedFrom;
    await cacheCheckResponse(
      env,
      cacheKey,
      cacheKey,
      cacheBody,
      checkedAt,
      cacheExpiresAt
    );

    return json(responseBody, 200);
  } catch (error) {
    return jsonError(
      'invalid_request',
      error instanceof Error
        ? error.message
        : 'Enter a public http:// or https:// website URL.',
      400
    );
  }
}

function getNormalizedFrom(input, targetUrl) {
  const submitted = input.trim();
  return submitted && submitted !== targetUrl ? submitted : null;
}

function hasSecurityScanFetchBudget(checkStartTime) {
  return (
    TOTAL_TIMEOUT_MS - (Date.now() - checkStartTime) >=
    SECURITY_SCAN_MIN_FETCH_BUDGET_MS
  );
}

function createSkippedResource(targetUrl, error, captureHeaders = false) {
  return {
    requestedUrl: targetUrl,
    finalUrl: targetUrl,
    status: 0,
    ok: false,
    contentType: null,
    body: null,
    xRobotsTag: null,
    error,
    ...(captureHeaders
      ? {
          headers: createCapturedHeaders(null),
          cookies: null,
        }
      : {}),
  };
}

function createSkippedHttpProbe(hostname, error) {
  return {
    requestedUrl: buildHttpUrl(hostname, '/'),
    status: 0,
    location: null,
    error,
  };
}

function shouldFetchLegacySecurityTxt(resource) {
  return (
    Boolean(resource.error) ||
    !resource.ok ||
    resource.contentType?.toLowerCase().includes('text/html') === true
  );
}

async function readCheckRequest(request, url) {
  if (request.method === 'GET') {
    return {
      input: url.searchParams.get('url') ?? '',
      turnstileToken: url.searchParams.get('turnstileToken') ?? '',
    };
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      return {
        input: typeof body?.url === 'string' ? body.url : '',
        turnstileToken:
          typeof body?.turnstileToken === 'string' ? body.turnstileToken : '',
      };
    }

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await request.formData();
      return {
        input: String(form.get('url') ?? ''),
        turnstileToken: String(form.get('turnstileToken') ?? ''),
      };
    }
  } catch {
    throw new Error('Enter a public http:// or https:// website URL.');
  }

  throw new Error('Enter a public http:// or https:// website URL.');
}

async function applyCheckerProtection(
  env,
  request,
  normalized,
  checkedAt,
  turnstileToken
) {
  const metadata = {
    rateLimitWindowSeconds: Math.floor(IP_RATE_LIMIT_WINDOW_MS / 1000),
    maxChecksPerWindow: IP_RATE_LIMIT_MAX,
    remainingChecks: null,
    turnstileThreshold: null,
    turnstileVerified: false,
  };

  if (!env?.CHECKS_DB) {
    return {
      metadata,
      response: null,
    };
  }

  const schemaReady = await ensureChecksSchema(env);
  if (!schemaReady) {
    return {
      metadata,
      response: null,
    };
  }

  await cleanupCheckerStorage(env, checkedAt);

  const ipHash = await hashClientIp(readClientIp(request));
  const recentState = await getRecentIpState(env, ipHash, checkedAt);
  const turnstileConfig = getTurnstileConfig(env);

  metadata.turnstileThreshold = turnstileConfig.enabled
    ? turnstileConfig.threshold
    : null;

  if (recentState.count >= IP_RATE_LIMIT_MAX) {
    const retryAfterSeconds = getRetryAfterSeconds(
      recentState.oldestRequestedAt,
      IP_RATE_LIMIT_WINDOW_MS
    );

    return {
      metadata: {
        ...metadata,
        remainingChecks: 0,
      },
      response: jsonError(
        'rate_limited',
        'Too many checker or security scan requests came from this IP recently.',
        429,
        { retryAfterSeconds },
        { 'retry-after': String(retryAfterSeconds) }
      ),
    };
  }

  if (turnstileConfig.enabled && recentState.count >= turnstileConfig.threshold) {
    const verified = await verifyTurnstileToken(env, request, turnstileToken);

    if (!verified.ok) {
      return {
        metadata,
        response: jsonError(
          'verification_required',
          verified.error ??
            'Additional verification is required before running more checks from this IP.',
          403,
          {
            turnstileRequired: true,
            turnstileSiteKey: turnstileConfig.siteKey,
            retryAfterSeconds: null,
          }
        ),
      };
    }

    metadata.turnstileVerified = true;
  }

  await logCheckerRequestEvent(env, {
    ipHash,
    normalized,
    requestedAt: checkedAt,
    challengePassed: metadata.turnstileVerified,
  });

  return {
    metadata: {
      ...metadata,
      remainingChecks: Math.max(IP_RATE_LIMIT_MAX - (recentState.count + 1), 0),
    },
    response: null,
  };
}

function getTurnstileConfig(env) {
  const siteKey = String(env?.CHECKER_TURNSTILE_SITE_KEY ?? '').trim();
  const secretKey = String(env?.CHECKER_TURNSTILE_SECRET_KEY ?? '').trim();
  const threshold = clampInteger(
    Number.parseInt(String(env?.CHECKER_TURNSTILE_THRESHOLD ?? ''), 10),
    1,
    IP_RATE_LIMIT_MAX - 1,
    5
  );

  return {
    enabled: Boolean(siteKey && secretKey),
    siteKey,
    secretKey,
    threshold,
  };
}

async function verifyTurnstileToken(env, request, token) {
  const turnstileConfig = getTurnstileConfig(env);
  if (!turnstileConfig.enabled) {
    return {
      ok: true,
    };
  }

  if (!token?.trim()) {
    return {
      ok: false,
      error:
        'Additional verification is required before running more checks from this IP.',
    };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', turnstileConfig.secretKey);
    body.set('response', token.trim());

    const clientIp = readClientIp(request);
    if (clientIp) {
      body.set('remoteip', clientIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
    });
    const payload = await response.json();

    if (payload?.success === true) {
      return {
        ok: true,
      };
    }
  } catch {
    return {
      ok: false,
      error:
        'Verification could not be completed right now. Please try again in a moment.',
    };
  }

  return {
    ok: false,
    error: 'Verification failed. Please complete the challenge and try again.',
  };
}

async function getRecentIpState(env, ipHash, checkedAt) {
  const windowStart = new Date(
    Date.parse(checkedAt) - IP_RATE_LIMIT_WINDOW_MS
  ).toISOString();
  const row = await env.CHECKS_DB.prepare(
    `
      SELECT
        COUNT(*) AS request_count,
        MIN(requested_at) AS oldest_requested_at
      FROM checker_request_events
      WHERE ip_hash = ?
        AND requested_at >= ?
    `
  )
    .bind(ipHash, windowStart)
    .first();

  return {
    count: Number(row?.request_count ?? 0),
    oldestRequestedAt:
      typeof row?.oldest_requested_at === 'string'
        ? row.oldest_requested_at
        : null,
  };
}

async function logCheckerRequestEvent(env, payload) {
  await env.CHECKS_DB.prepare(
    `
      INSERT INTO checker_request_events (
        ip_hash,
        normalized_url,
        requested_at,
        challenge_passed
      )
      VALUES (?, ?, ?, ?)
    `
  )
    .bind(
      payload.ipHash,
      payload.normalized,
      payload.requestedAt,
      payload.challengePassed ? 1 : 0
    )
    .run();
}

async function cleanupCheckerStorage(env, checkedAt) {
  const requestCutoff = new Date(
    Date.parse(checkedAt) - REQUEST_EVENT_RETENTION_MS
  ).toISOString();
  const checksCutoff = new Date(
    Date.parse(checkedAt) - CHECK_HISTORY_RETENTION_MS
  ).toISOString();

  await env.CHECKS_DB.batch([
    env.CHECKS_DB.prepare(
      `DELETE FROM checker_request_events WHERE requested_at < ?`
    ).bind(requestCutoff),
    env.CHECKS_DB.prepare(`DELETE FROM checker_cache WHERE expires_at < ?`).bind(
      checkedAt
    ),
    env.CHECKS_DB.prepare(`DELETE FROM checker_checks WHERE checked_at < ?`).bind(
      checksCutoff
    ),
  ]);
}

async function readCachedResponse(env, normalized, protectionMetadata) {
  if (!env?.CHECKS_DB) {
    return null;
  }

  if (!(await ensureChecksSchema(env))) {
    return null;
  }

  const now = new Date().toISOString();
  const row = await env.CHECKS_DB.prepare(
    `
      SELECT response_json, cached_at, expires_at
      FROM checker_cache
      WHERE normalized_url = ?
        AND expires_at > ?
      LIMIT 1
    `
  )
    .bind(normalized, now)
    .first();

  if (!row?.response_json) {
    return null;
  }

  try {
    const cached = JSON.parse(row.response_json);
    return {
      ...cached,
      cache: {
        hit: true,
        cachedAt:
          typeof row.cached_at === 'string' ? row.cached_at : cached.cache?.cachedAt ?? null,
        expiresAt:
          typeof row.expires_at === 'string'
            ? row.expires_at
            : cached.cache?.expiresAt ?? null,
      },
      protection: protectionMetadata,
    };
  } catch {
    await env.CHECKS_DB.prepare(
      `DELETE FROM checker_cache WHERE normalized_url = ?`
    )
      .bind(normalized)
      .run();
    return null;
  }
}

async function cacheCheckResponse(
  env,
  normalized,
  targetUrl,
  payload,
  checkedAt,
  expiresAt
) {
  if (!env?.CHECKS_DB) {
    return;
  }

  if (!(await ensureChecksSchema(env))) {
    return;
  }

  const responseJson = JSON.stringify(payload);

  // Large targets (big homepages, sitemaps, llms-full.txt) can serialize past
  // D1's per-value size limit. Caching is best-effort: skip the write rather
  // than fail an otherwise-successful check with SQLITE_TOOBIG. Measure UTF-8
  // bytes (what D1 limits), not UTF-16 code units, so non-ASCII payloads are
  // judged correctly.
  if (new TextEncoder().encode(responseJson).byteLength > MAX_CACHE_VALUE_BYTES) {
    return;
  }

  const keys = targetUrl === normalized ? [normalized] : [normalized, targetUrl];

  try {
    await env.CHECKS_DB.batch(
      keys.map((cacheKey) =>
        env.CHECKS_DB.prepare(
          `
            INSERT OR REPLACE INTO checker_cache (
              normalized_url,
              response_json,
              cached_at,
              expires_at
            )
            VALUES (?, ?, ?, ?)
          `
        ).bind(cacheKey, responseJson, checkedAt, expiresAt)
      )
    );
  } catch (error) {
    console.error('checker cache write failed', error);
  }
}

async function persistCheckedUrl(env, payload) {
  if (!env?.CHECKS_DB) {
    return {
      persisted: false,
      reason: 'binding-not-configured',
    };
  }

  try {
    if (!(await ensureChecksSchema(env))) {
      return {
        persisted: false,
        reason: 'schema-unavailable',
      };
    }

    await env.CHECKS_DB.prepare(
      `
        INSERT INTO checker_checks (
          requested_input,
          normalized_url,
          origin,
          checked_at,
          homepage_status,
          llms_status,
          robots_status,
          sitemap_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        payload.input.trim(),
        payload.normalized,
        payload.origin,
        payload.checkedAt,
        payload.homepage.status,
        payload.llmsTxt.status,
        payload.robotsTxt.status,
        payload.sitemap?.status ?? null
      )
      .run();

    return {
      persisted: true,
      binding: 'CHECKS_DB',
    };
  } catch (error) {
    return {
      persisted: false,
      reason: error instanceof Error ? error.message : 'database-write-failed',
    };
  }
}

async function ensureChecksSchema(env) {
  if (!env?.CHECKS_DB || checksSchemaUnavailable) {
    return false;
  }

  if (!checksSchemaReadyPromise) {
    checksSchemaReadyPromise = env.CHECKS_DB.batch(
      CHECKS_SCHEMA_STATEMENTS.map((statement) =>
        env.CHECKS_DB.prepare(statement)
      )
    ).catch((error) => {
      checksSchemaUnavailable = true;
      checksSchemaReadyPromise = null;
      console.error('checker schema initialization failed', error);
      return null;
    });
  }

  return (await checksSchemaReadyPromise) !== null;
}

function normalizePublicUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Enter a public http:// or https:// website URL.');
  }

  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(candidate);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('unsupported-protocol');
    }

    if (parsed.username || parsed.password) {
      throw new Error('credentials-not-allowed');
    }

    if (isBlockedHostname(parsed.hostname)) {
      throw new Error('blocked-hostname');
    }

    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      throw new Error('unsupported-port');
    }

    if (!isValidScanHostname(parsed.hostname)) {
      throw new Error('invalid-hostname');
    }

    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = '/';

    return parsed.toString();
  } catch {
    throw new Error('Enter a public http:// or https:// website URL.');
  }
}

// Accept only real IP literals or plausible public domains: at least two
// labels, each a valid DNS label (no leading/trailing hyphen, not all hyphens),
// with an alphabetic top-level domain. Rejects inputs like "https://--------".
function isValidScanHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (parseIpv4(lower)) {
    return true;
  }
  if (parseIpv6(lower.replace(/^\[|\]$/g, ''))) {
    return true;
  }

  const labels = lower.split('.');
  if (labels.length < 2) {
    return false;
  }
  const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!labels.every((label) => labelPattern.test(label))) {
    return false;
  }
  return /^[a-z]{2,}$/.test(labels[labels.length - 1]);
}

function toSiteRootUrl(value) {
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '/';
  return parsed.toString();
}

function readClientIp(request) {
  const forwarded = request.headers.get('cf-connecting-ip')?.trim();
  if (forwarded) {
    return forwarded;
  }

  // Fallback to unknown if cf-connecting-ip is absent. Do not use x-forwarded-for 
  // because it can be trivially spoofed to bypass IP rate limits.
  return 'unknown';
}

async function hashClientIp(ipAddress) {
  const bytes = new TextEncoder().encode(ipAddress || 'unknown');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
}

function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();

  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local')
  ) {
    return true;
  }

  // WHATWG URL canonicalizes decimal/hex/octal IPv4 (e.g. 2130706433, 0x7f000001)
  // to dotted-decimal before this runs, so a plain dotted-quad parse is enough here.
  const ipv4 = parseIpv4(lower);
  if (ipv4) {
    return isBlockedIpv4(ipv4);
  }

  const ipv6 = parseIpv6(lower.replace(/^\[|\]$/g, ''));
  if (ipv6) {
    return isBlockedIpv6(ipv6);
  }

  // Note: a public hostname that resolves to a private address (DNS rebinding)
  // cannot be detected from the name alone. On Cloudflare, Worker fetch will not
  // route to loopback/RFC1918/link-local targets, which mitigates that path.
  return false;
}

function parseIpv4(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) {
    return null;
  }
  const octets = match.slice(1).map(Number);
  return octets.some((octet) => octet > 255) ? null : octets;
}

function isBlockedIpv4(octets) {
  const [first, second] = octets;
  return (
    first === 0 || // 0.0.0.0/8 (includes 0.0.0.0)
    first === 10 || // 10.0.0.0/8
    first === 127 || // loopback 127.0.0.0/8
    (first === 100 && second >= 64 && second <= 127) || // CGNAT 100.64.0.0/10
    (first === 169 && second === 254) || // link-local 169.254.0.0/16
    (first === 172 && second >= 16 && second <= 31) || // 172.16.0.0/12
    (first === 192 && second === 168) // 192.168.0.0/16
  );
}

// Expands an IPv6 literal (including "::" compression and IPv4-mapped suffixes)
// into eight 16-bit groups, or null when the input is not a valid IPv6 address.
function parseIpv6(value) {
  if (!value.includes(':')) {
    return null;
  }

  let head = value;
  const embedded = [];
  const lastColon = value.lastIndexOf(':');
  const suffix = value.slice(lastColon + 1);
  if (suffix.includes('.')) {
    const v4 = parseIpv4(suffix);
    if (!v4) {
      return null;
    }
    embedded.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    head = value.slice(0, lastColon);
  }

  const halves = head.split('::');
  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (part) =>
    part === ''
      ? []
      : part.split(':').map((group) =>
          /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN
        );

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : null;

  let groups;
  if (right === null) {
    groups = [...left, ...embedded];
  } else {
    const known = left.length + right.length + embedded.length;
    const missing = 8 - known;
    if (missing < 1) {
      return null;
    }
    groups = [...left, ...Array(missing).fill(0), ...right, ...embedded];
  }

  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) {
    return null;
  }
  return groups;
}

function isBlockedIpv6(groups) {
  const [first] = groups;

  // Unspecified :: and loopback ::1
  if (groups.every((group) => group === 0)) {
    return true;
  }
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true;
  }

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses:
  // evaluate the embedded IPv4 against the same private-range rules.
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const compatible = groups.slice(0, 6).every((group) => group === 0);
  if (mapped || compatible) {
    return isBlockedIpv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  }

  return (
    (first & 0xfe00) === 0xfc00 || // unique-local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 // site-local (deprecated) fec0::/10
  );
}

async function fetchText(targetUrl, checkStartTime, options = {}) {
  const invocationDeadline = Date.now() + (options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const overallStartTime = checkStartTime || Date.now();
  const capturedCookies = new Map();
  let cookieCaptureSupported = options.captureHeaders ? null : false;

  try {
    let currentUrl = targetUrl;

    for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount += 1) {
      const remainingGlobalTime =
        TOTAL_TIMEOUT_MS - (Date.now() - overallStartTime);
      const remainingInvocationTime = invocationDeadline - Date.now();
      if (remainingGlobalTime <= 0 || remainingInvocationTime <= 0) {
        throw new Error('Overall checker timeout exceeded.');
      }

      const parsed = new URL(currentUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostname(parsed.hostname)) {
        throw new Error('Request was blocked by checker safety rules.');
      }
      
      if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
        throw new Error('Request was blocked by checker safety rules.');
      }

      const timeoutForThisFetch = Math.min(
        remainingInvocationTime,
        remainingGlobalTime
      );
      const { signal, cancel } = createTimeoutSignal(timeoutForThisFetch);
      try {
        const response = await fetch(currentUrl, {
          redirect: 'manual',
          signal,
          headers: {
            'user-agent': CHECKER_USER_AGENT,
            accept: 'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1',
          },
        });
        if (options.captureHeaders) {
          cookieCaptureSupported = captureResponseCookies(
            response,
            capturedCookies,
            cookieCaptureSupported
          );
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            return withCapturedResponseMetadata(
              {
                requestedUrl: targetUrl,
                finalUrl: currentUrl,
                status: response.status,
                ok: false,
                contentType: response.headers.get('content-type'),
                body: null,
                xRobotsTag: response.headers.get('x-robots-tag'),
                error: 'Redirect response had no Location header.',
              },
              response,
              options.captureHeaders,
              capturedCookies,
              cookieCaptureSupported
            );
          }

          const nextUrl = new URL(location, currentUrl);
          if (
            !['http:', 'https:'].includes(nextUrl.protocol) ||
            isBlockedHostname(nextUrl.hostname) ||
            (nextUrl.port && nextUrl.port !== '80' && nextUrl.port !== '443')
          ) {
            throw new Error('Request was blocked by checker safety rules.');
          }

          if (
            options.sameHostAs &&
            (!hostnamesMatch(nextUrl.hostname, options.sameHostAs) ||
              nextUrl.protocol !== 'https:')
          ) {
            await cancelResponseBody(response);
            return {
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              status: 0,
              ok: false,
              contentType: null,
              body: null,
              xRobotsTag: null,
              error: 'Redirected off the scanned site.',
            };
          }

          await cancelResponseBody(response);
          currentUrl = nextUrl.toString();
          continue;
        }

        // Capture response metadata BEFORE reading the body. A body-read
        // failure (size limit, timeout, decode) must not discard the status,
        // final URL, and captured headers, so header and transport checks can
        // still run on a large or slow homepage (partial results).
        let body = null;
        let bodyError;
        try {
          body = await readBoundedText(response);
        } catch (error) {
          bodyError = mapFetchError(error);
        }
        const result = {
          requestedUrl: targetUrl,
          finalUrl: currentUrl,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          body,
          xRobotsTag: response.headers.get('x-robots-tag'),
          ...(bodyError ? { error: bodyError } : {}),
        };
        return withCapturedResponseMetadata(
          result,
          response,
          options.captureHeaders,
          capturedCookies,
          cookieCaptureSupported
        );
      } finally {
        cancel();
      }
    }

    return withEmptyCapturedResponseMetadata(
      {
        requestedUrl: targetUrl,
        finalUrl: currentUrl,
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        xRobotsTag: null,
        error: 'Too many redirects.',
      },
      options.captureHeaders,
      capturedCookies,
      cookieCaptureSupported
    );
  } catch (error) {
    return withEmptyCapturedResponseMetadata(
      {
        requestedUrl: targetUrl,
        finalUrl: targetUrl,
        status: 0,
        ok: false,
        contentType: null,
        body: null,
        xRobotsTag: null,
        error: mapFetchError(error),
      },
      options.captureHeaders,
      capturedCookies,
      cookieCaptureSupported
    );
  }
}

function captureResponseCookies(response, capturedCookies, previousSupport) {
  if (typeof response.headers.getSetCookie !== 'function') {
    return false;
  }

  try {
    for (const setCookie of response.headers.getSetCookie()) {
      const cookie = parseCookieMetadata(setCookie);
      if (cookie) {
        // Merge conservatively across redirect hops: if the same cookie name
        // appears more than once, a missing flag on any occurrence must remain
        // reported, so a later secure cookie cannot mask an earlier insecure one.
        const existing = capturedCookies.get(cookie.name);
        capturedCookies.set(
          cookie.name,
          existing
            ? {
                name: cookie.name,
                secure: existing.secure && cookie.secure,
                httpOnly: existing.httpOnly && cookie.httpOnly,
                sameSite:
                  existing.sameSite && cookie.sameSite ? cookie.sameSite : null,
              }
            : cookie
        );
      }
    }
    return previousSupport === false ? false : true;
  } catch {
    return false;
  }
}

function parseCookieMetadata(setCookie) {
  const parts = setCookie.split(';');
  const nameValue = parts.shift()?.trim() ?? '';
  const separatorIndex = nameValue.indexOf('=');
  const name = separatorIndex > 0 ? nameValue.slice(0, separatorIndex).trim() : '';
  if (!name) {
    return null;
  }

  let secure = false;
  let httpOnly = false;
  let sameSite = null;

  for (const rawAttribute of parts) {
    const attribute = rawAttribute.trim();
    const [rawName, ...rawValue] = attribute.split('=');
    const attributeName = rawName.toLowerCase();
    if (attributeName === 'secure') {
      secure = true;
    } else if (attributeName === 'httponly') {
      httpOnly = true;
    } else if (attributeName === 'samesite') {
      sameSite = rawValue.join('=').trim() || null;
    }
  }

  return { name, secure, httpOnly, sameSite };
}

function withCapturedResponseMetadata(
  resource,
  response,
  captureHeaders,
  capturedCookies,
  cookieCaptureSupported
) {
  if (!captureHeaders) {
    return resource;
  }

  return {
    ...resource,
    headers: createCapturedHeaders(response.headers),
    cookies:
      cookieCaptureSupported === true ? [...capturedCookies.values()] : null,
  };
}

function withEmptyCapturedResponseMetadata(
  resource,
  captureHeaders,
  capturedCookies,
  cookieCaptureSupported
) {
  if (!captureHeaders) {
    return resource;
  }

  return {
    ...resource,
    headers: createCapturedHeaders(null),
    cookies:
      cookieCaptureSupported === true ? [...capturedCookies.values()] : null,
  };
}

function createCapturedHeaders(headers) {
  return Object.fromEntries(
    SECURITY_HEADER_NAMES.map((headerName) => [
      headerName,
      headers?.get(headerName) ?? null,
    ])
  );
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The response body is best-effort cleanup after a manual redirect.
  }
}

async function probeHttpDowngrade(hostname, checkStartTime) {
  const requestedUrl = buildHttpUrl(hostname, '/');
  const remainingGlobalTime =
    TOTAL_TIMEOUT_MS - (Date.now() - checkStartTime);
  if (remainingGlobalTime <= 0) {
    return {
      requestedUrl,
      status: 0,
      location: null,
      error: 'Scan time budget exhausted.',
    };
  }

  // Re-validate the host immediately before the probe fetch, matching the
  // per-hop guard in fetchText. The hostname was validated during the earlier
  // HTTPS homepage fetch, but a separate request is a separate resolution, so
  // re-check to keep the SSRF guard consistent across both requests.
  if (isBlockedHostname(hostname)) {
    return {
      requestedUrl,
      status: 0,
      location: null,
      error: 'Request was blocked by checker safety rules.',
    };
  }

  const { signal, cancel } = createTimeoutSignal(
    Math.min(5000, remainingGlobalTime)
  );
  try {
    const response = await fetch(requestedUrl, {
      redirect: 'manual',
      signal,
      headers: {
        'user-agent': CHECKER_USER_AGENT,
        accept: 'text/html,*/*;q=0.1',
      },
    });
    const result = {
      requestedUrl,
      status: response.status,
      location: response.headers.get('location'),
    };
    await cancelResponseBody(response);
    return result;
  } catch (error) {
    return {
      requestedUrl,
      status: 0,
      location: null,
      error: mapFetchError(error),
    };
  } finally {
    cancel();
  }
}

async function dnsLookup(
  type,
  name,
  checkStartTime,
  dnsDeadline = Date.now() + DNS_LOOKUP_TIMEOUT_MS
) {
  const remainingGlobalTime =
    TOTAL_TIMEOUT_MS - (Date.now() - checkStartTime);
  const remainingDnsTime = dnsDeadline - Date.now();
  if (remainingGlobalTime <= 0 || remainingDnsTime <= 0) {
    return null;
  }

  const resolverUrl = new URL('https://cloudflare-dns.com/dns-query');
  resolverUrl.searchParams.set('type', type);
  resolverUrl.searchParams.set('name', name);
  const { signal, cancel } = createTimeoutSignal(
    Math.min(remainingGlobalTime, remainingDnsTime)
  );

  try {
    const response = await fetch(resolverUrl.toString(), {
      redirect: 'manual',
      signal,
      headers: {
        accept: 'application/dns-json',
        'user-agent': CHECKER_USER_AGENT,
      },
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      return null;
    }

    const body = await readBoundedText(response, MAX_DNS_RESPONSE_BYTES);
    const payload = JSON.parse(body);
    if (!Number.isInteger(payload?.Status)) {
      return null;
    }

    // Return only answers whose RR type matches the query, so a DS query cannot
    // report a CNAME/RRSIG as a signed delegation and a TXT query stays TXT-only.
    const expectedType = DNS_RECORD_TYPE_NUMBERS[type];
    return {
      status: payload.Status,
      ad: payload.AD === true,
      answers: Array.isArray(payload.Answer)
        ? payload.Answer.flatMap((answer) =>
            typeof answer?.data === 'string' &&
            (expectedType === undefined || answer.type === expectedType)
              ? [answer.data]
              : []
          )
        : [],
    };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

function hostnamesMatch(left, right) {
  return stripLeadingWww(left) === stripLeadingWww(right);
}

function stripLeadingWww(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function buildHttpsUrl(hostname, pathname) {
  return buildUrl('https:', hostname, pathname);
}

function buildHttpUrl(hostname, pathname) {
  return buildUrl('http:', hostname, pathname);
}

function buildUrl(protocol, hostname, pathname) {
  const target = new URL(`${protocol}//example.invalid/`);
  target.hostname = hostname;
  target.pathname = pathname;
  return target.toString();
}

async function readBoundedText(response, maxResponseBytes = MAX_RESPONSE_BYTES) {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new Error('Response exceeded the checker size limit.');
    }
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxResponseBytes) {
      await reader.cancel();
      throw new Error('Response exceeded the checker size limit.');
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timeoutId);
    },
  };
}

function mapFetchError(error) {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message === 'timeout') {
      return 'Request timed out.';
    }

    if (
      error.message === 'Response exceeded the checker size limit.' ||
      error.message === 'Request was blocked by checker safety rules.' ||
      error.message === 'Too many redirects.'
    ) {
      return error.message;
    }
  }

  return 'Request failed.';
}

function findSitemapUrl(robotsTxt, baseUrl) {
  const sitemapPattern = /^\s*Sitemap:\s*(\S+)\s*$/gim;
  let match;

  while ((match = sitemapPattern.exec(robotsTxt)) !== null) {
    const candidate = resolveSameOriginUrl(match[1], baseUrl);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function findMarkdownAlternateUrl(html, baseUrl) {
  const linkPattern = /<link\b[^>]*>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const tag = match[0];
    if (
      !/\brel=(['"])[^'"]*\balternate\b[^'"]*\1/i.test(tag) ||
      !/\btype=(['"])text\/markdown\1/i.test(tag)
    ) {
      continue;
    }

    const hrefMatch = tag.match(/\bhref=(['"])([\s\S]*?)\1/i);
    if (!hrefMatch) {
      continue;
    }

    return resolveSameOriginUrl(hrefMatch[2], baseUrl);
  }

  return null;
}

function buildMarkdownUrl(pageUrl) {
  const parsed = new URL(pageUrl);
  parsed.search = '';
  parsed.hash = '';

  if (parsed.pathname === '/' || parsed.pathname === '') {
    parsed.pathname = '/index.md';
    return parsed.toString();
  }

  const cleanPath = parsed.pathname.replace(/\/$/, '').replace(/\.html$/i, '');
  parsed.pathname = `${cleanPath}.md`;
  return parsed.toString();
}

function findFirstInternalLink(html, baseUrl) {
  const base = new URL(baseUrl);
  const linkPattern = /<a\b[^>]*href=(['"])([\s\S]*?)\1/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[2].trim();
    if (
      !href ||
      href.startsWith('#') ||
      /^mailto:/i.test(href) ||
      /^tel:/i.test(href) ||
      /^javascript:/i.test(href) ||
      /^data:/i.test(href)
    ) {
      continue;
    }

    let candidate;
    try {
      candidate = new URL(href, base);
    } catch {
      continue;
    }

    if (candidate.origin !== base.origin) {
      continue;
    }

    candidate.search = '';
    candidate.hash = '';

    if (
      candidate.pathname === '/' ||
      candidate.pathname === '' ||
      /^\/api\//i.test(candidate.pathname) ||
      /\.(png|jpe?g|gif|webp|svg|ico|css|js|xml|txt|json|pdf|zip|mp3|mp4|woff2?)$/i.test(
        candidate.pathname
      )
    ) {
      continue;
    }

    return candidate.toString();
  }

  return null;
}

function resolveSameOriginUrl(candidate, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(candidate, base);
    if (
      resolved.origin !== base.origin ||
      !['http:', 'https:'].includes(resolved.protocol) ||
      isBlockedHostname(resolved.hostname)
    ) {
      return null;
    }

    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

function getRetryAfterSeconds(oldestRequestedAt, windowMs) {
  if (!oldestRequestedAt) {
    return Math.ceil(windowMs / 1000);
  }

  const elapsed = Date.now() - Date.parse(oldestRequestedAt);
  const remaining = Math.max(windowMs - elapsed, 1000);
  return Math.ceil(remaining / 1000);
}

function clampInteger(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

/**
 * Structured error envelope for the JSON API. `code` is a stable machine-readable
 * slug an agent can branch on; `error` stays the human-readable message the UI
 * already renders, so adding this is additive for existing clients.
 */
function jsonError(code, message, status, extra = {}, extraHeaders = {}) {
  return json({ error: message, code, ...extra }, status, extraHeaders);
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

async function serveAssetWithSecurityHeaders(request, env) {
  // acceptmarkdown.com content negotiation: every HTML page here already has a
  // generated `.md` mirror, so a client that explicitly asks for markdown gets
  // the mirror at the same URL. `Vary: Accept` goes on BOTH variants, otherwise
  // a shared cache can hand the HTML to an agent that asked for markdown.
  const negotiatedType = negotiateTextType(request.headers.get('accept'));
  const mirrorPath = markdownMirrorPath(new URL(request.url).pathname);

  if (negotiatedType && mirrorPath && ['GET', 'HEAD'].includes(request.method)) {
    const mirrorUrl = new URL(request.url);
    mirrorUrl.pathname = mirrorPath;
    const mirror = await env.ASSETS.fetch(new Request(mirrorUrl, request));

    if (mirror.status === 200) {
      const headers = new Headers(mirror.headers);
      headers.set('content-type', `${negotiatedType}; charset=utf-8`);
      headers.set('vary', mergeVaryAccept(headers.get('vary')));
      // Keep the HTML route as the indexed URL even though this response is markdown.
      headers.set('link', `<${new URL(request.url).origin}${new URL(request.url).pathname}>; rel="canonical"`);

      return withSecurityHeaders(
        new Response(request.method === 'HEAD' ? null : mirror.body, {
          status: 200,
          headers,
        })
      );
    }
  }

  const asset = await env.ASSETS.fetch(request);

  // Pages only returns 404 here because the build emits a real `404.html`.
  // Without that file the assets binding falls back to `index.html` with a 200,
  // which is a soft-404: an agent probing paths concludes every path exists.
  if (asset.status === 404) {
    return buildNotFoundResponse(request, asset);
  }

  const headers = new Headers(asset.headers);
  if (mirrorPath) {
    headers.set('vary', mergeVaryAccept(headers.get('vary')));
  }

  return withSecurityHeaders(
    new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    })
  );
}

/**
 * Maps an HTML route to its generated markdown mirror, mirroring
 * `markdownHrefForPagePath` in @agentmarkup/core. Returns null for anything
 * that is not an extensionless HTML route, so assets and API paths are
 * never negotiated.
 */
function markdownMirrorPath(pathname) {
  if (/^\/api\//i.test(pathname)) {
    return null;
  }

  if (pathname === '' || pathname === '/') {
    return '/index.md';
  }

  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const lastSegment = trimmed.split('/').pop() ?? '';

  if (lastSegment.includes('.')) {
    return null;
  }

  return `${trimmed}.md`;
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Serves the not-found response, negotiated on Accept: a short markdown body
 * for clients that explicitly rank markdown or plain text above HTML, and the
 * prerendered 404 page for everyone else. Both carry `Vary: Accept` so a shared
 * cache cannot hand one variant to a client that asked for the other.
 */
function buildNotFoundResponse(request, asset) {
  const negotiatedType = negotiateTextType(request.headers.get('accept'));

  if (negotiatedType) {
    const body =
      request.method === 'HEAD'
        ? null
        : buildNotFoundMarkdown(new URL(request.url).origin);

    return withSecurityHeaders(
      new Response(body, {
        status: 404,
        headers: {
          // Echo the type the client actually asked for: a client that accepts
          // text/plain but not text/markdown must not be handed text/markdown.
          'content-type': `${negotiatedType}; charset=utf-8`,
          'cache-control': 'no-store',
          vary: 'Accept, Accept-Encoding',
        },
      })
    );
  }

  const headers = new Headers(asset.headers);
  headers.set('vary', mergeVaryAccept(headers.get('vary')));

  return withSecurityHeaders(
    new Response(asset.body, {
      status: 404,
      statusText: asset.statusText,
      headers,
    })
  );
}

function buildNotFoundMarkdown(origin) {
  return [
    '# 404 Not Found',
    '',
    `This path does not exist on ${origin}.`,
    '',
    'This is a real HTTP 404. Paths that do not exist here never answer 200, so',
    'a missing resource can be told apart from an existing one.',
    '',
    '## Machine-readable entry points',
    '',
    `- Site manifest, including when to use this site: ${origin}/llms.txt`,
    `- Same manifest with page content inlined: ${origin}/llms-full.txt`,
    `- Every indexable URL: ${origin}/sitemap.xml`,
    `- Crawler rules, including AI crawler directives: ${origin}/robots.txt`,
    `- Documentation index: ${origin}/learn/`,
    '',
    'Every indexable content page has a markdown mirror at the same path with a',
    `\`.md\` extension, for example ${origin}/learn.md. This 404 page does not.`,
    '',
  ].join('\n');
}

/**
 * Returns the plain-text media type to answer with when the Accept header
 * explicitly ranks one above HTML, or null to serve the HTML page.
 *
 * Wildcards are ignored on purpose: a bare catch-all Accept (curl and most
 * non-browser clients send one) should still get the HTML page, so only a
 * client that actually asked for a text type gets one. `q=0` means "not
 * acceptable" per RFC 9110, so those entries are dropped rather than ranked,
 * and the winning type is echoed back verbatim so a client that accepts
 * text/plain but not text/markdown is never handed text/markdown. A tie goes
 * to HTML, which is what a browser's `text/html,...` header expresses.
 */
function negotiateTextType(accept) {
  if (!accept) {
    return null;
  }

  const textTypes = new Set(['text/markdown', 'text/x-markdown', 'text/plain']);
  const htmlTypes = new Set(['text/html', 'application/xhtml+xml']);
  let bestTextType = null;
  let bestTextQuality = 0;
  let htmlQuality = 0;

  for (const rawEntry of accept.split(',')) {
    const [rawType, ...parameters] = rawEntry.split(';');
    const type = rawType.trim().toLowerCase();
    if (!textTypes.has(type) && !htmlTypes.has(type)) {
      continue;
    }

    let quality = 1;
    for (const parameter of parameters) {
      const [name, value] = parameter.split('=');
      if (name?.trim().toLowerCase() === 'q') {
        const parsed = Number.parseFloat(value ?? '');
        quality = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
      }
    }

    if (quality <= 0) {
      continue;
    }

    if (textTypes.has(type)) {
      if (quality > bestTextQuality) {
        bestTextQuality = quality;
        bestTextType = type;
      }
    } else {
      htmlQuality = Math.max(htmlQuality, quality);
    }
  }

  return bestTextType && bestTextQuality > htmlQuality ? bestTextType : null;
}

/** Adds `Accept` to an existing Vary header without duplicating it. */
function mergeVaryAccept(existing) {
  const values = (existing ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.some((value) => value === '*')) {
    return '*';
  }

  if (!values.some((value) => value.toLowerCase() === 'accept')) {
    values.unshift('Accept');
  }

  return values.join(', ');
}
