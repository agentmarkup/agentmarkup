const CHECKER_USER_AGENT = 'agentmarkup-checker/0.3.2 (+https://agentmarkup.dev)';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_TURNSTILE_TOKEN_BYTES = 2048;
const TURNSTILE_TIMEOUT_MS = 8000;
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

const TOTAL_TIMEOUT_MS = 25000;
const KNOWN_HTML_ROUTES = new Set([
  '/',
  '/checker/',
  '/security-scan/',
  '/learn/',
  '/docs/llms-txt/',
  '/docs/json-ld/',
  '/docs/ai-crawlers/',
  '/docs/audit/',
  '/blog/',
  '/blog/why-llms-txt-matters/',
  '/blog/what-is-geo/',
  '/blog/json-ld-structured-data-guide/',
  '/blog/ai-crawlers-2026/',
  '/blog/ecommerce-llm-optimization/',
  '/blog/brand-awareness-ai/',
  '/blog/markdown-mirrors/',
  '/blog/website-checker/',
  '/blog/when-markdown-mirrors-help/',
  '/blog/nextjs-llms-txt-json-ld/',
  '/blog/nuxt-llms-txt-json-ld/',
  '/blog/agentmarkup-cli-any-static-site/',
  '/blog/audit-ai-crawler-access/',
  '/blog/ai-crawler-audit-500-companies/',
  '/authors/sebastian-cochinescu/',
  '/license/',
  '/terms/',
  '/privacy/',
]);

class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PublicError';
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === '/api/check' ||
      url.pathname === '/api/security-scan'
    ) {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed. Use POST.' }, 405, {
          allow: 'POST',
        });
      }
      if (isCrossSiteRequest(request, url)) {
        return json({ error: 'Cross-site requests are not allowed.' }, 403);
      }

      return url.pathname === '/api/check'
        ? handleCheckRequest(request, env, Date.now())
        : handleSecurityScanRequest(request, env, Date.now());
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found.' }, 404);
    }

    return serveAssetWithSecurityHeaders(request, env);
  },
};

function isCrossSiteRequest(request, requestUrl) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
    return true;
  }

  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin !== requestUrl.origin;
  } catch {
    return true;
  }
}

async function handleCheckRequest(request, env, checkStartTime) {
  try {
    const { input, turnstileToken } = await readCheckRequest(request);
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
      return json(
        {
          ...cachedResponse,
          normalizedFrom: getNormalizedFrom(input, cachedResponse.targetUrl),
        },
        200
      );
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

    const cacheBody = { ...responseBody };
    delete cacheBody.normalizedFrom;
    await cacheCheckResponse(
      env,
      normalized,
      targetUrl,
      cacheBody,
      checkedAt,
      cacheExpiresAt
    );

    return json(responseBody, 200);
  } catch (error) {
    return handleApiError(error, '/api/check');
  }
}

async function handleSecurityScanRequest(request, env, checkStartTime) {
  try {
    const { input, turnstileToken } = await readCheckRequest(request);
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
    return handleApiError(error, '/api/security-scan');
  }
}

function handleApiError(error, route) {
  if (error instanceof PublicError) {
    return json({ error: error.message }, error.status);
  }

  console.error(
    JSON.stringify({
      message: 'API request failed',
      route,
      error: error instanceof Error ? error.name : 'UnknownError',
    })
  );
  return json({ error: 'The service is temporarily unavailable.' }, 503);
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

async function readCheckRequest(request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const bodyText = await readBoundedRequestText(request);

  try {
    if (contentType.includes('application/json')) {
      const body = JSON.parse(bodyText);
      return validateCheckRequestFields(body?.url, body?.turnstileToken);
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = new URLSearchParams(bodyText);
      return validateCheckRequestFields(
        form.get('url') ?? '',
        form.get('turnstileToken') ?? ''
      );
    }

    throw new PublicError('Content-Type must be application/json.', 415);
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError('Enter a public http:// or https:// website URL.');
  }
}

function validateCheckRequestFields(input, turnstileToken) {
  const normalizedInput = typeof input === 'string' ? input : '';
  const normalizedToken = typeof turnstileToken === 'string' ? turnstileToken : '';

  if (
    new TextEncoder().encode(normalizedToken).byteLength >
    MAX_TURNSTILE_TOKEN_BYTES
  ) {
    throw new PublicError('Verification token is too long.');
  }

  return { input: normalizedInput, turnstileToken: normalizedToken };
}

async function readBoundedRequestText(request) {
  const contentLength = Number.parseInt(
    request.headers.get('content-length') ?? '',
    10
  );
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    throw new PublicError('Request body is too large.', 413);
  }

  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      throw new PublicError('Request body is too large.', 413);
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
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
    throw new PublicError('The service is temporarily unavailable.', 503);
  }

  await cleanupCheckerStorage(env, checkedAt);

  const ipHash = await hashClientIp(readClientIp(request));
  const recentState = await getRecentIpState(env, ipHash, checkedAt);
  const turnstileConfig = getTurnstileConfig(env, request);

  metadata.turnstileThreshold = turnstileConfig.threshold;

  if (recentState.count >= IP_RATE_LIMIT_MAX) {
    return {
      metadata: {
        ...metadata,
        remainingChecks: 0,
      },
      response: createRateLimitResponse(recentState),
    };
  }

  if (recentState.count >= turnstileConfig.threshold) {
    const verified = await verifyTurnstileToken(
      request,
      turnstileToken,
      turnstileConfig
    );

    if (!verified.ok) {
      return {
        metadata,
        response: json(
          {
            error:
              verified.error ??
              'Additional verification is required before running more checks from this IP.',
            turnstileRequired: true,
            turnstileSiteKey: turnstileConfig.siteKey,
            retryAfterSeconds: null,
          },
          403
        ),
      };
    }

    metadata.turnstileVerified = true;
  }

  const inserted = await logCheckerRequestEventIfBelowLimit(env, {
    ipHash,
    normalized,
    requestedAt: checkedAt,
    challengePassed: metadata.turnstileVerified,
  });
  if (!inserted) {
    const cappedState = await getRecentIpState(env, ipHash, checkedAt);
    return {
      metadata: { ...metadata, remainingChecks: 0 },
      response: createRateLimitResponse(cappedState),
    };
  }

  const currentState = await getRecentIpState(env, ipHash, checkedAt);

  return {
    metadata: {
      ...metadata,
      remainingChecks: Math.max(IP_RATE_LIMIT_MAX - currentState.count, 0),
    },
    response: null,
  };
}

function createRateLimitResponse(recentState) {
  const retryAfterSeconds = getRetryAfterSeconds(
    recentState.oldestRequestedAt,
    IP_RATE_LIMIT_WINDOW_MS
  );
  return json(
    {
      error:
        'Too many checker or security scan requests came from this IP recently.',
      retryAfterSeconds,
    },
    429,
    { 'retry-after': String(retryAfterSeconds) }
  );
}

function getTurnstileConfig(env, request) {
  const siteKey = String(env?.CHECKER_TURNSTILE_SITE_KEY ?? '').trim();
  const secretKey = String(env?.CHECKER_TURNSTILE_SECRET_KEY ?? '').trim();
  const threshold = clampInteger(
    Number.parseInt(String(env?.CHECKER_TURNSTILE_THRESHOLD ?? ''), 10),
    1,
    IP_RATE_LIMIT_MAX - 1,
    5
  );
  const expectedHostname = String(
    env?.CHECKER_TURNSTILE_EXPECTED_HOSTNAME ?? new URL(request.url).hostname
  )
    .trim()
    .toLowerCase();
  const expectedAction = String(
    env?.CHECKER_TURNSTILE_EXPECTED_ACTION ?? ''
  ).trim();

  if (!siteKey || !secretKey || !expectedHostname || !expectedAction) {
    throw new PublicError('The service is temporarily unavailable.', 503);
  }

  return {
    siteKey,
    secretKey,
    threshold,
    expectedHostname,
    expectedAction,
  };
}

async function verifyTurnstileToken(request, token, turnstileConfig) {
  if (!token?.trim()) {
    return {
      ok: false,
      error:
        'Additional verification is required before running more checks from this IP.',
    };
  }

  const { signal, cancel } = createTimeoutSignal(TURNSTILE_TIMEOUT_MS);
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
      signal,
    });
    const payload = JSON.parse(
      await readBoundedText(response, MAX_DNS_RESPONSE_BYTES)
    );

    if (
      payload?.success === true &&
      String(payload.hostname ?? '').toLowerCase() ===
        turnstileConfig.expectedHostname &&
      payload.action === turnstileConfig.expectedAction
    ) {
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
  } finally {
    cancel();
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

async function logCheckerRequestEventIfBelowLimit(env, payload) {
  const windowStart = new Date(
    Date.parse(payload.requestedAt) - IP_RATE_LIMIT_WINDOW_MS
  ).toISOString();
  const result = await env.CHECKS_DB.prepare(
    `
      INSERT INTO checker_request_events (
        ip_hash,
        normalized_url,
        requested_at,
        challenge_passed
      )
      SELECT ?, ?, ?, ?
      WHERE (
        SELECT COUNT(*)
        FROM checker_request_events
        WHERE ip_hash = ?
          AND requested_at >= ?
      ) < ?
    `
  )
    .bind(
      payload.ipHash,
      payload.normalized,
      payload.requestedAt,
      payload.challengePassed ? 1 : 0,
      payload.ipHash,
      windowStart,
      IP_RATE_LIMIT_MAX
    )
    .run();

  return Number(result?.meta?.changes ?? 0) === 1;
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
    console.error(
      JSON.stringify({
        message: 'Checker cache write failed',
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    );
  }
}

async function persistCheckedUrl(env, payload) {
  try {
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
        payload.normalized,
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
    console.error(
      JSON.stringify({
        message: 'Checker history write failed',
        error: error instanceof Error ? error.name : 'UnknownError',
      })
    );
    return {
      persisted: false,
      reason: 'database-write-failed',
    };
  }
}

function normalizePublicUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PublicError('Enter a public http:// or https:// website URL.');
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
    throw new PublicError('Enter a public http:// or https:// website URL.');
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

function json(body, status, extraHeaders = {}) {
  return withSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...extraHeaders,
      },
    })
  );
}

async function serveAssetWithSecurityHeaders(request, env) {
  const asset = await env.ASSETS.fetch(request);
  const contentType = asset.headers.get('content-type')?.toLowerCase() ?? '';
  if (
    asset.status === 200 &&
    contentType.includes('text/html') &&
    !isKnownHtmlRoute(new URL(request.url).pathname)
  ) {
    const body =
      request.method === 'HEAD'
        ? null
        : '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | agentmarkup</title></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p><p><a href="/">Return to agentmarkup</a></p></main></body></html>';
    return withSecurityHeaders(
      new Response(body, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex',
        },
      })
    );
  }

  return withSecurityHeaders(asset);
}

function isKnownHtmlRoute(pathname) {
  if (pathname === '/index.html') return true;

  const route = pathname.endsWith('/index.html')
    ? `${pathname.slice(0, -'index.html'.length)}`
    : pathname.endsWith('/')
      ? pathname
      : `${pathname}/`;
  return KNOWN_HTML_ROUTES.has(route);
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
