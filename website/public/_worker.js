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

/** What an HTML client sends. The homepage and sample page keep it so content checks see what a browser sees. */
const DEFAULT_ACCEPT = 'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1';
/** The not-found probe only: markdown-first, so a compliant negotiator can answer an agent-readable 404 body. */
const PROBE_ACCEPT = 'text/markdown, application/json;q=0.9, text/html;q=0.8, */*;q=0.1';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const SAMPLE_PAGE_MAX_REDIRECTS = 3;
const SECONDARY_MAX_REDIRECTS = 2;
// Hard stop on outbound fetch() calls per check. The per-resource redirect caps
// (homepage 5, sample page 3, five secondaries at 2, probe 0) already bound a
// run to 6 + 4 + 5 x 3 + 1 = 26 calls, so this is a safety net, not the
// working limit. CHECKER_MAX_FETCHES in the env can lower it, never raise it.
const MAX_FETCHES_PER_CHECK = 30;
// At most this many in-flight requests on the target at once. Lower it to 3 if
// a pilot shows 5xx/429 clusters on cheap shared hosts.
const MAX_CONCURRENT_FETCHES = 4;
const CHECK_RESOURCE_KEYS = [
  'homepage',
  'homepageMarkdown',
  'llmsTxt',
  'robotsTxt',
  'sitemap',
  'notFoundProbe',
  'samplePage',
  'samplePageMarkdown',
];
// Response headers copied onto each checker resource. An allowlist, never the
// whole header map: set-cookie must not enter the payload or the D1 cache.
// `location` only ever appears on a 3xx that the probe reports as its final
// answer (it follows no redirects).
const DISCOVERY_HEADER_NAMES = [
  'link',
  'vary',
  'cf-mitigated',
  'content-signal',
  'x-robots-tag',
  'last-modified',
  'content-length',
  'www-authenticate',
  'location',
];
const DISCOVERY_HEADER_VALUE_MAX_CHARS = 512;
// Bot-challenge detection, identical to classifyResource in @agentmarkup/core:
// a `cf-mitigated` header containing "challenge", or one of these markers in
// the first 20 KB of a 401/403/429/503 body. The list is published; additions
// bump the score catalog's MINOR version.
const CHALLENGE_STATUSES = [401, 403, 429, 503];
const CHALLENGE_SCAN_CHARS = 20 * 1024;
const CHALLENGE_MARKERS = [
  '__cf_chl',
  'challenge-platform',
  'cf-browser-verification',
  'Just a moment...',
  'Attention Required!',
  'Enable JavaScript and cookies to continue',
  'Pardon Our Interruption',
  '_Incapsula_Resource',
  'captcha-delivery',
  'px-captcha',
];
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
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
// Retention DELETEs run at most once per CLEANUP_INTERVAL_MS per isolate
// instead of three statements on every request, cache hits included.
let lastCleanupAt = 0;

const TOTAL_TIMEOUT_MS = 25000;

/**
 * A rejected caller input: empty, not http(s), credentials, a blocked host, a
 * non-standard port, or an unreadable request body. The check handler maps
 * exactly this class to HTTP 400; any other exception is a checker bug and
 * surfaces as HTTP 500 with a server-side log line.
 */
class InvalidUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Versioned aliases. /api/v1/* is the stable contract an agent should
    // integrate against; the unversioned paths stay as permanent aliases so
    // existing callers keep working.
    const apiRoute = resolveApiRoute(url.pathname);

    if (apiRoute === 'check') {
      if (!['GET', 'POST'].includes(request.method)) {
        return jsonError('method_not_allowed', 'Method not allowed. Use GET or POST.', 405);
      }

      return handleCheckRequest(request, url, env, Date.now());
    }

    if (apiRoute === 'security-scan') {
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

    // The /api namespace is JSON-only. Without this, an unknown /api path falls
    // through to the static assets and answers the HTML 404 page, so an agent
    // probing the API surface is handed markup it cannot parse.
    if (/^\/api(\/|$)/i.test(url.pathname)) {
      return jsonError(
        'not_found',
        `No API endpoint at ${url.pathname}. See /openapi.json for the available operations.`,
        404,
        { documentation: `${url.origin}/openapi.json` }
      );
    }

    return serveAssetWithSecurityHeaders(request, env);
  },
};

async function handleCheckRequest(request, url, env, checkStartTime) {
  // One budget per request: outbound fetch() calls (hard stop at
  // MAX_FETCHES_PER_CHECK) and D1 statements, both reported in `fetchSummary`.
  const budget = { fetches: 0, maxFetches: getMaxFetches(env), d1: 0 };

  try {
    const { input, turnstileToken } = await readCheckRequest(request, url);
    const normalized = normalizePublicUrl(input);
    const checkedAt = new Date().toISOString();
    const protection = await applyCheckerProtection(
      env,
      request,
      normalized,
      checkedAt,
      turnstileToken,
      budget
    );
    if (protection.response) {
      return protection.response;
    }

    const cachedResponse = await readCachedResponse(
      env,
      normalized,
      protection.metadata,
      budget
    );
    if (cachedResponse) {
      return json(cachedResponse, 200, rateLimitHeaders(protection.metadata));
    }

    const evidence = await fetchCheckEvidence(normalized, checkStartTime, budget);
    const { targetUrl } = evidence;
    const fetchSummary = buildFetchSummary(evidence, checkStartTime, budget);

    const storage = await persistCheckedUrl(
      env,
      {
        input,
        normalized: targetUrl,
        origin: new URL(targetUrl).origin,
        checkedAt,
        homepage: evidence.homepage,
        llmsTxt: evidence.llmsTxt,
        robotsTxt: evidence.robotsTxt,
        sitemap: evidence.sitemap,
      },
      budget
    );
    fetchSummary.d1Statements = budget.d1;

    // Only a complete run without a challenged resource is cached (see
    // cacheCheckResponse), so any other run must not advertise a cache
    // lifetime it does not have.
    const cacheable =
      fetchSummary.analysisStatus === 'complete' && !hasChallengedResource(evidence);
    const cacheExpiresAt = new Date(
      Date.parse(checkedAt) + TARGET_CACHE_TTL_MS
    ).toISOString();
    const responseBody = {
      targetUrl,
      origin: new URL(targetUrl).origin,
      fetchedAt: checkedAt,
      normalizedFrom: input.trim() && input.trim() !== targetUrl ? input.trim() : null,
      homepage: evidence.homepage,
      homepageMarkdown: evidence.homepageMarkdown,
      llmsTxt: evidence.llmsTxt,
      robotsTxt: evidence.robotsTxt,
      sitemap: evidence.sitemap,
      sitemapUrl: evidence.sitemapUrl,
      sitemapSource: evidence.sitemapSource,
      notFoundProbe: evidence.notFoundProbe,
      samplePage: evidence.samplePage,
      samplePageMarkdown: evidence.samplePageMarkdown,
      fetchSummary,
      cache: {
        hit: false,
        cachedAt: cacheable ? checkedAt : null,
        expiresAt: cacheable ? cacheExpiresAt : null,
      },
      protection: protection.metadata,
      storage,
    };

    await cacheCheckResponse(
      env,
      normalized,
      targetUrl,
      responseBody,
      checkedAt,
      cacheExpiresAt,
      budget
    );
    // The cache statements (written, failed or skipped) count as well.
    fetchSummary.d1Statements = budget.d1;

    return json(responseBody, 200, rateLimitHeaders(protection.metadata));
  } catch (error) {
    // Only a rejected input is the caller's fault. Anything else is a bug in
    // the checker and must surface as a 500 with a server-side log line, not
    // hide behind "Enter a public URL".
    if (error instanceof InvalidUrlError) {
      return jsonError('invalid_request', error.message, 400);
    }

    console.error('checker request failed', error);
    return jsonError(
      'checker_error',
      'The checker hit an internal error. Try again in a moment.',
      500
    );
  }
}

/**
 * The fetch plan. Only the homepage is a hard prerequisite: it decides the
 * final origin, the markdown alternate link and the sample page. robots.txt
 * gates the sitemap URL and the sample page gates its markdown mirror; those
 * two are chained. Everything else runs as one wave through a semaphore of
 * MAX_CONCURRENT_FETCHES, robots submitted first so the chained sitemap starts
 * earliest, so the critical path is about three fetch slots instead of eight
 * sequential awaits. `fetchText` never rejects, so Promise.all is safe.
 */
async function fetchCheckEvidence(normalized, checkStartTime, budget) {
  const homepage = await fetchText(
    normalized,
    checkStartTime,
    checkerFetchOptions(budget, { maxRedirects: MAX_REDIRECTS })
  );
  const targetUrl = toSiteRootUrl(homepage.finalUrl || normalized);
  // Same-origin judgements use the final URL: a www redirect changes the origin.
  const homepageBase = homepage.finalUrl || targetUrl;
  const hasHtml = homepage.ok && Boolean(homepage.body);
  const homepageMarkdownUrl =
    (hasHtml ? findMarkdownAlternateUrl(homepage.body, homepageBase) : null) ??
    buildMarkdownUrl(targetUrl);
  const samplePageUrl = hasHtml
    ? findFirstInternalLink(homepage.body, homepageBase)
    : null;

  const limit = createLimiter(MAX_CONCURRENT_FETCHES);
  const secondary = checkerFetchOptions(budget, {
    maxRedirects: SECONDARY_MAX_REDIRECTS,
  });
  const run = (resourceUrl, options) =>
    limit(() => fetchText(resourceUrl, checkStartTime, options));

  const robotsPromise = run(new URL('/robots.txt', targetUrl).toString(), secondary);
  // One extra request to a path no real route should claim, so the report can
  // tell a real 404 from a soft-404 that makes every path look like it exists.
  // It follows no redirects: a missing path that 302s to the homepage is its
  // own distinct behaviour, reported as the 3xx it answered with its Location.
  const probePromise = run(
    new URL(SOFT_404_PROBE_PATH, targetUrl).toString(),
    checkerFetchOptions(budget, { maxRedirects: 0, accept: PROBE_ACCEPT })
  );
  const llmsPromise = run(new URL('/llms.txt', targetUrl).toString(), secondary);
  const homepageMarkdownPromise = run(homepageMarkdownUrl, secondary);
  const samplePromise = samplePageUrl
    ? run(
        samplePageUrl,
        checkerFetchOptions(budget, { maxRedirects: SAMPLE_PAGE_MAX_REDIRECTS })
      )
    : Promise.resolve(null);
  const sitemapPromise = robotsPromise.then((robotsTxt) => {
    const declared =
      robotsTxt.ok && robotsTxt.body ? findSitemapUrl(robotsTxt.body, targetUrl) : null;
    const sitemapUrl = declared ?? new URL('/sitemap.xml', targetUrl).toString();
    return run(sitemapUrl, secondary).then((sitemap) => ({
      sitemap,
      sitemapUrl,
      sitemapSource: declared ? 'robots' : 'default',
    }));
  });
  const sampleMarkdownPromise = samplePromise.then((samplePage) => {
    if (!samplePage) {
      return null;
    }
    const base = samplePage.finalUrl || samplePageUrl;
    const sampleMarkdownUrl =
      (samplePage.ok && samplePage.body
        ? findMarkdownAlternateUrl(samplePage.body, base)
        : null) ?? buildMarkdownUrl(base);
    return run(sampleMarkdownUrl, secondary);
  });

  const [
    robotsTxt,
    notFoundProbe,
    llmsTxt,
    homepageMarkdown,
    samplePage,
    sitemapResult,
    samplePageMarkdown,
  ] = await Promise.all([
    robotsPromise,
    probePromise,
    llmsPromise,
    homepageMarkdownPromise,
    samplePromise,
    sitemapPromise,
    sampleMarkdownPromise,
  ]);

  return {
    targetUrl,
    homepage,
    homepageMarkdown,
    llmsTxt,
    robotsTxt,
    sitemap: sitemapResult.sitemap,
    sitemapUrl: sitemapResult.sitemapUrl,
    sitemapSource: sitemapResult.sitemapSource,
    notFoundProbe,
    samplePage,
    samplePageMarkdown,
    samplePageUrl,
  };
}

/**
 * `complete` when every fetched resource finished, `partial` when at least one
 * is unverified (timed out, budget-stopped, transport error, 429/5xx), `blocked`
 * when the homepage itself is unverified or gave a final non-2xx other than
 * 401/403. `unverified` lists payload keys so a
 * client can name what to re-run; `elapsedMs` is the fetch wall-clock.
 */
// Same rule as the score engine, so fetchSummary.analysisStatus always equals
// score.analysisStatus. Outcome `unverified` counts. A challenged resource is a
// measured answer, except a not-found probe that answers 429/503 with challenge
// markers: core leaves nav.not-found unverified for it ('probe-challenged'). A
// 401/403 challenged probe scores nav.not-found as a measured fail and does not
// count. classifyResource itself stays unchanged for parity with core.
function isUnverifiedForSummary(key, resource) {
  if (resource.outcome === 'unverified') {
    return true;
  }
  return (
    key === 'notFoundProbe' &&
    resource.outcome === 'challenge' &&
    resource.status !== 401 &&
    resource.status !== 403
  );
}

// A challenge answer is often per-IP and transient, so a run in which any
// resource answered one is never cached, whatever its fetch-summary status.
function hasChallengedResource(record) {
  return CHECK_RESOURCE_KEYS.some((key) => record[key]?.outcome === 'challenge');
}

// `blocked` exactly when the score engine blocks the run: the homepage is
// unverified (a re-run may succeed), or its final answer is a non-2xx other
// than 401/403 (404, 410, 400, ...: nothing to score). A 401, a 403 or a
// challenge page is scored, so it does not block.
function isBlockedHomepage(homepage) {
  return (
    homepage.outcome === 'unverified' ||
    homepage.outcome === 'not-found' ||
    (homepage.outcome === 'http-error' && homepage.status !== 401 && homepage.status !== 403)
  );
}

function buildFetchSummary(evidence, checkStartTime, budget) {
  const unverified = [];
  let hops = 0;

  for (const key of CHECK_RESOURCE_KEYS) {
    const resource = evidence[key];
    if (!resource) {
      continue;
    }
    hops += resource.hops ?? 0;
    if (isUnverifiedForSummary(key, resource)) {
      unverified.push(key);
    }
  }

  const analysisStatus = isBlockedHomepage(evidence.homepage)
    ? 'blocked'
    : unverified.length > 0
      ? 'partial'
      : 'complete';

  return {
    analysisStatus,
    unverified,
    elapsedMs: Date.now() - checkStartTime,
    fetches: budget.fetches,
    hops,
    d1Statements: budget.d1,
    samplePageUrl: evidence.samplePageUrl,
  };
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

    return json(responseBody, 200, rateLimitHeaders(protection.metadata));
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
    throw new InvalidUrlError('Enter a public http:// or https:// website URL.');
  }

  throw new InvalidUrlError('Enter a public http:// or https:// website URL.');
}

async function applyCheckerProtection(
  env,
  request,
  normalized,
  checkedAt,
  turnstileToken,
  budget
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

  const schemaReady = await ensureChecksSchema(env, budget);
  if (!schemaReady) {
    return {
      metadata,
      response: null,
    };
  }

  await cleanupCheckerStorage(env, checkedAt, budget);

  const ipHash = await hashClientIp(readClientIp(request));
  const recentState = await getRecentIpState(env, ipHash, checkedAt, budget);
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
        {
          'retry-after': String(retryAfterSeconds),
          ...rateLimitHeaders({ ...metadata, remainingChecks: 0 }),
        }
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

  await logCheckerRequestEvent(
    env,
    {
      ipHash,
      normalized,
      requestedAt: checkedAt,
      challengePassed: metadata.turnstileVerified,
    },
    budget
  );

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

async function getRecentIpState(env, ipHash, checkedAt, budget) {
  const windowStart = new Date(
    Date.parse(checkedAt) - IP_RATE_LIMIT_WINDOW_MS
  ).toISOString();
  countD1(budget, 1);
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

async function logCheckerRequestEvent(env, payload, budget) {
  countD1(budget, 1);
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

async function cleanupCheckerStorage(env, checkedAt, budget) {
  const now = Date.now();
  if (lastCleanupAt && now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupAt = now;
  countD1(budget, 3);

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

async function readCachedResponse(env, normalized, protectionMetadata, budget) {
  if (!env?.CHECKS_DB) {
    return null;
  }

  if (!(await ensureChecksSchema(env, budget))) {
    return null;
  }

  const now = new Date().toISOString();
  countD1(budget, 1);
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
    countD1(budget, 1);
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
  expiresAt,
  budget
) {
  if (!env?.CHECKS_DB) {
    return;
  }

  // Only a complete run without a challenged resource is cached. A payload
  // whose fetchSummary says partial or blocked carries a timed-out resource,
  // and a challenge answer is often per-IP and transient; neither may be
  // pinned for every viewer of this target for the next three minutes.
  // Payloads without a fetchSummary (the security scan) are cached as before.
  if (
    payload.fetchSummary &&
    (payload.fetchSummary.analysisStatus !== 'complete' || hasChallengedResource(payload))
  ) {
    return;
  }

  if (!(await ensureChecksSchema(env, budget))) {
    return;
  }

  const keys = targetUrl === normalized ? [normalized] : [normalized, targetUrl];
  // The cached copy carries the statement count including its own cache writes,
  // the same number the live response reports once the write was attempted.
  if (payload.fetchSummary && budget) {
    payload.fetchSummary.d1Statements = budget.d1 + keys.length;
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

  countD1(budget, keys.length);

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

async function persistCheckedUrl(env, payload, budget) {
  if (!env?.CHECKS_DB) {
    return {
      persisted: false,
      reason: 'binding-not-configured',
    };
  }

  try {
    if (!(await ensureChecksSchema(env, budget))) {
      return {
        persisted: false,
        reason: 'schema-unavailable',
      };
    }

    countD1(budget, 1);
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

async function ensureChecksSchema(env, budget) {
  if (!env?.CHECKS_DB || checksSchemaUnavailable) {
    return false;
  }

  if (!checksSchemaReadyPromise) {
    countD1(budget, CHECKS_SCHEMA_STATEMENTS.length);
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
    throw new InvalidUrlError('Enter a public http:// or https:// website URL.');
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
    throw new InvalidUrlError('Enter a public http:// or https:// website URL.');
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
  const startedAt = Date.now();
  const invocationDeadline = startedAt + (options.timeoutMs ?? FETCH_TIMEOUT_MS);
  const overallStartTime = checkStartTime || startedAt;
  const capturedCookies = new Map();
  let cookieCaptureSupported = options.captureHeaders ? null : false;
  // Per-resource accounting: redirects followed and whether a request was ever
  // sent. A budget stop before the first request marks the resource `skipped`.
  const trace = { startedAt, hops: 0, started: false };
  const finish = (resource, response = null) =>
    finalizeFetchedResource(
      response
        ? withCapturedResponseMetadata(
            resource,
            response,
            options.captureHeaders,
            capturedCookies,
            cookieCaptureSupported
          )
        : withEmptyCapturedResponseMetadata(
            resource,
            options.captureHeaders,
            capturedCookies,
            cookieCaptureSupported
          ),
      response,
      options,
      trace
    );

  try {
    let currentUrl = targetUrl;

    const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      trace.hops = redirectCount;
      const remainingGlobalTime =
        TOTAL_TIMEOUT_MS - (Date.now() - overallStartTime);
      if (remainingGlobalTime <= 0) {
        throw new Error('Checker time budget exhausted.');
      }
      const remainingInvocationTime = invocationDeadline - Date.now();
      if (remainingInvocationTime <= 0) {
        throw new Error('Request timed out.');
      }

      const parsed = new URL(currentUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostname(parsed.hostname)) {
        throw new Error('Request was blocked by checker safety rules.');
      }
      
      if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
        throw new Error('Request was blocked by checker safety rules.');
      }

      // Counted only when a request is actually sent, so fetchSummary.fetches
      // equals the number of fetch() calls made.
      if (options.budget) {
        if (options.budget.fetches >= options.budget.maxFetches) {
          throw new Error('Checker request budget exhausted.');
        }
        options.budget.fetches += 1;
      }
      trace.started = true;

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
            accept: options.accept ?? DEFAULT_ACCEPT,
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
          // A resource that follows no redirects (the not-found probe) reports
          // the 3xx it received as its final, completed answer, with or without
          // a Location header (kept through the discovery headers when present),
          // rather than the "Too many redirects" or missing-Location failure a
          // followed chain gets.
          if (maxRedirects === 0) {
            await cancelResponseBody(response);
            return finish(
              {
                requestedUrl: targetUrl,
                finalUrl: currentUrl,
                status: response.status,
                ok: false,
                contentType: response.headers.get('content-type'),
                body: null,
                xRobotsTag: response.headers.get('x-robots-tag'),
              },
              response
            );
          }

          const location = response.headers.get('location');
          if (!location) {
            await cancelResponseBody(response);
            return finish(
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
              response
            );
          }

          let nextUrl;
          try {
            nextUrl = new URL(location, currentUrl);
          } catch (error) {
            await cancelResponseBody(response);
            throw error;
          }
          if (
            !['http:', 'https:'].includes(nextUrl.protocol) ||
            isBlockedHostname(nextUrl.hostname) ||
            (nextUrl.port && nextUrl.port !== '80' && nextUrl.port !== '443')
          ) {
            await cancelResponseBody(response);
            throw new Error('Request was blocked by checker safety rules.');
          }

          if (
            options.sameHostAs &&
            (!hostnamesMatch(nextUrl.hostname, options.sameHostAs) ||
              nextUrl.protocol !== 'https:')
          ) {
            await cancelResponseBody(response);
            return finish({
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              status: 0,
              ok: false,
              contentType: null,
              body: null,
              xRobotsTag: null,
              error: 'Redirected off the scanned site.',
            });
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
        let bodyBytes;
        let bodyError;
        try {
          const read = await readBoundedBody(response);
          body = read.text;
          bodyBytes = read.bytes;
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
          ...(bodyBytes === undefined ? {} : { bodyBytes }),
        };
        return finish(result, response);
      } finally {
        cancel();
      }
    }

    return finish({
      requestedUrl: targetUrl,
      finalUrl: currentUrl,
      status: 0,
      ok: false,
      contentType: null,
      body: null,
      xRobotsTag: null,
      error: 'Too many redirects.',
    });
  } catch (error) {
    // An abort that fired because the 25 s check budget ran out, not the
    // per-request 10 s, is the check's fault, not the target's: name it.
    const mapped = mapFetchError(error);
    const starved =
      mapped === 'Request timed out.' &&
      TOTAL_TIMEOUT_MS - (Date.now() - overallStartTime) <= 0;
    return finish({
      requestedUrl: targetUrl,
      finalUrl: targetUrl,
      status: 0,
      ok: false,
      contentType: null,
      body: null,
      xRobotsTag: null,
      error: starved ? 'Checker time budget exhausted.' : mapped,
    });
  }
}

/**
 * Adds the transport accounting every checker resource carries (`durationMs`,
 * `hops`, `skipped`), the allowlisted discovery headers, the 404/410 body drop
 * and the `outcome` classification. Shared by the success and failure paths so
 * a timed-out resource is shaped exactly like a completed one.
 */
function finalizeFetchedResource(resource, response, options, trace) {
  const result = {
    ...resource,
    durationMs: Date.now() - trace.startedAt,
    hops: trace.hops,
  };

  if (!trace.started) {
    result.skipped = true;
  }

  if (options.captureDiscoveryHeaders) {
    result.headers = response ? captureDiscoveryHeaders(response.headers) : {};
  }

  // No analyzer reads a 404/410 body (the soft-404 comparison runs on 2xx
  // only), and on a WordPress site each one is the full 404 template, so drop
  // it before serialization. `bodyBytes` keeps the length for the
  // agent-readable-404 rule, which needs only the content type and size.
  if (
    options.dropNotFoundBody &&
    (result.status === 404 || result.status === 410) &&
    typeof result.body === 'string'
  ) {
    result.body = null;
    result.bodyDropped = true;
  }

  result.outcome = classifyResource(result);
  return result;
}

function captureDiscoveryHeaders(headers) {
  const captured = {};
  for (const name of DISCOVERY_HEADER_NAMES) {
    const value = headers.get(name);
    if (value === null || value === '') {
      continue;
    }
    captured[name] =
      value.length > DISCOVERY_HEADER_VALUE_MAX_CHARS
        ? value.slice(0, DISCOVERY_HEADER_VALUE_MAX_CHARS)
        : value;
  }
  return captured;
}

function hasChallengeMarkers(resource) {
  const mitigated = resource.headers?.['cf-mitigated'];
  if (typeof mitigated === 'string' && mitigated.toLowerCase().includes('challenge')) {
    return true;
  }
  if (typeof resource.body !== 'string') {
    return false;
  }
  const head = resource.body.slice(0, CHALLENGE_SCAN_CHARS);
  return CHALLENGE_MARKERS.some((marker) => head.includes(marker));
}

/**
 * The single place that decides what a fetched resource is, identical to
 * classifyResource in @agentmarkup/core so the browser and the worker agree:
 * - `unverified`: skipped, status 0, an error, a 2xx without a body, or a
 *   429/5xx without challenge markers (transport noise, never a finding)
 * - `challenge`: 401/403/429/503 carrying a bot-challenge marker
 * - `not-found`: 404 or 410
 * - `http-error`: any other completed non-2xx (including a 3xx on the probe)
 * - `ok`: 2xx with a body
 * A null resource (no sample link) is `absent`, which is never serialized.
 */
function classifyResource(resource) {
  if (!resource) {
    return 'absent';
  }
  const status = resource.status;
  if (resource.skipped || status === 0 || resource.error) {
    return 'unverified';
  }
  if (status >= 200 && status < 300) {
    return resource.body === null ? 'unverified' : 'ok';
  }
  if (CHALLENGE_STATUSES.includes(status) && hasChallengeMarkers(resource)) {
    return 'challenge';
  }
  if (status === 429 || status >= 500) {
    return 'unverified';
  }
  if (status === 404 || status === 410) {
    return 'not-found';
  }
  return 'http-error';
}

/** Options every checker-chain fetch shares; the caller sets the redirect cap and the Accept header. */
function checkerFetchOptions(budget, overrides = {}) {
  return {
    budget,
    captureDiscoveryHeaders: true,
    dropNotFoundBody: true,
    ...overrides,
  };
}

/** A small FIFO semaphore: at most `maxConcurrent` tasks run at once. */
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) {
      return;
    }
    active += 1;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

/** CHECKER_MAX_FETCHES in the env can only lower the hard stop (tests use it). */
function getMaxFetches(env) {
  return clampInteger(
    Number.parseInt(String(env?.CHECKER_MAX_FETCHES ?? ''), 10),
    1,
    MAX_FETCHES_PER_CHECK,
    MAX_FETCHES_PER_CHECK
  );
}

function countD1(budget, statements) {
  if (budget) {
    budget.d1 += statements;
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
  return (await readBoundedBody(response, maxResponseBytes)).text;
}

/** Reads a body under the size cap and reports its byte length beside the text. */
async function readBoundedBody(response, maxResponseBytes = MAX_RESPONSE_BYTES) {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      throw new Error('Response exceeded the checker size limit.');
    }
  }

  if (!response.body) {
    return { text: '', bytes: 0 };
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
  return { text, bytes: totalBytes };
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
      error.message === 'Too many redirects.' ||
      error.message === 'Request timed out.' ||
      error.message === 'Checker time budget exhausted.' ||
      error.message === 'Checker request budget exhausted.'
    ) {
      return error.message;
    }
  }

  return 'Request failed.';
}

const SECOND_LEVEL_LABELS = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'];

// Same rule as registrableDomainOf in packages/core/src/score/discover.ts: the last
// two labels, or three under co/com/net/org/gov/edu/ac plus a two-letter last label.
function registrableDomainOf(hostname) {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  if (/^\d+(?:\.\d+){3}$/.test(lower) || lower.includes(':') || lower.startsWith('[')) {
    return lower;
  }
  const labels = lower.split('.').filter((label) => label.length > 0);
  if (labels.length <= 2) {
    return labels.join('.');
  }
  const last = labels[labels.length - 1];
  const secondToLast = labels[labels.length - 2];
  const keep = last.length === 2 && SECOND_LEVEL_LABELS.includes(secondToLast) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

// A robots.txt Sitemap: value on the base hostname or the same registrable domain.
// Every hop of the later fetch still passes the blocked-host and port rules.
function resolveSitemapDeclaration(candidate, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(candidate, base);
    if (!['http:', 'https:'].includes(resolved.protocol) || isBlockedHostname(resolved.hostname)) {
      return null;
    }
    const host = resolved.hostname.toLowerCase();
    const baseHost = base.hostname.toLowerCase();
    if (host !== baseHost && registrableDomainOf(host) !== registrableDomainOf(baseHost)) {
      return null;
    }
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

// robots.txt directives are single lines (RFC 9309), so the declaration is read one
// line at a time; a multiline `^\s*` rescanned every following blank line from each
// line start (10 s on 80,000 blank lines). Lines end at CRLF, LF, CR, U+2028 or
// U+2029, the terminators the multiline `^` and `$` used.
const ROBOTS_LINE_BREAK_RE = /\r\n|[\n\r\u2028\u2029]/;
const SITEMAP_LINE_RE = /^\s*Sitemap:\s*(\S+)\s*$/i;

function findSitemapUrl(robotsTxt, baseUrl) {
  for (const line of robotsTxt.split(ROBOTS_LINE_BREAK_RE)) {
    const match = SITEMAP_LINE_RE.exec(line);
    if (!match) {
      continue;
    }
    const candidate = resolveSitemapDeclaration(match[1], baseUrl);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

// Same as linkTagAttribute in packages/core/src/score/discover.ts: double-quoted,
// single-quoted or unquoted values, optional spaces around "=".
function linkTagAttribute(tag, name) {
  const pattern = new RegExp(
    `[\\s"']${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    'i'
  );
  const match = tag.match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

// Same as forEachLinkTag in packages/core/src/score/discover.ts: every tag
// /<link\b[^>]*>/gi matches, in order, until visit returns true, in linear time
// (the first <link that no ">" follows ends the scan, since no later one can close).
function forEachLinkTag(html, visit) {
  const open = /<link\b/gi;
  let match;
  while ((match = open.exec(html)) !== null) {
    const end = html.indexOf('>', match.index + 5);
    if (end === -1) {
      return;
    }
    if (visit(html.slice(match.index, end + 1))) {
      return;
    }
    open.lastIndex = end + 1;
  }
}

// Same as forEachAnchorHref in packages/core/src/score/discover.ts: every value
// /<a\b[^>]*href=(['"])([\s\S]*?)\1/gi captures, in order, until visit returns
// true, in linear time. Openers that share their first ">" share the rightmost
// href= with a quote that closes later, computed once.
function forEachAnchorHref(html, visit) {
  const lower = html.replace(/[A-Z]+/g, (run) => run.toLowerCase());
  const lastQuote = { '"': html.lastIndexOf('"'), "'": html.lastIndexOf("'") };
  const open = /<a\b/gi;
  let segmentEnd = -1;
  let segmentHref = -1;
  let match;
  while ((match = open.exec(html)) !== null) {
    const start = match.index + 2;
    if (start > segmentEnd) {
      const gt = html.indexOf('>', start);
      segmentEnd = gt === -1 ? html.length : gt;
      segmentHref = -1;
      // Searched within this segment only: an unbounded lastIndexOf ran back over the
      // whole prefix for every closed anchor without an href.
      const segment = lower.slice(start, segmentEnd);
      let at = segment.length >= 6 ? segment.lastIndexOf('href=', segment.length - 6) : -1;
      while (at >= 0) {
        const quote = html[start + at + 5];
        if ((quote === '"' || quote === "'") && lastQuote[quote] >= start + at + 6) {
          segmentHref = start + at;
          break;
        }
        at = at > 0 ? segment.lastIndexOf('href=', at - 1) : -1;
      }
    }
    if (segmentHref < start) {
      continue;
    }
    const quote = html[segmentHref + 5];
    const close = html.indexOf(quote, segmentHref + 6);
    if (visit(html.slice(segmentHref + 6, close))) {
      return;
    }
    open.lastIndex = close + 1;
  }
}

function findMarkdownAlternateUrl(html, baseUrl) {
  let found = null;
  forEachLinkTag(html, (tag) => {
    const rel = linkTagAttribute(tag, 'rel');
    const type = linkTagAttribute(tag, 'type');
    if (
      rel === null ||
      !rel.toLowerCase().split(/\s+/).includes('alternate') ||
      type === null ||
      type.trim().toLowerCase() !== 'text/markdown'
    ) {
      return false;
    }

    const href = linkTagAttribute(tag, 'href');
    if (href === null) {
      return false;
    }

    found = resolveSameOriginUrl(href, baseUrl);
    return found !== null;
  });

  return found;
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
  let found = null;

  forEachAnchorHref(html, (value) => {
    const href = value.trim();
    if (
      !href ||
      href.startsWith('#') ||
      /^mailto:/i.test(href) ||
      /^tel:/i.test(href) ||
      /^javascript:/i.test(href) ||
      /^data:/i.test(href)
    ) {
      return false;
    }

    let candidate;
    try {
      candidate = new URL(href, base);
    } catch {
      return false;
    }

    if (candidate.origin !== base.origin) {
      return false;
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
      return false;
    }

    found = candidate.toString();
    return true;
  });

  return found;
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
 * RFC 9457-adjacent rate-limit signalling, using the IETF RateLimit header
 * fields so an agent can self-throttle instead of discovering the limit by
 * being refused. `ratelimit-policy` states the quota and window; `ratelimit-*`
 * report the caller's current position.
 */
/**
 * Maps both the versioned and unversioned forms of an API path to a route name.
 * `/api/check` and `/api/v1/check` are the same endpoint; the versioned form is
 * what the OpenAPI document advertises.
 */
function resolveApiRoute(pathname) {
  const match = /^\/api(?:\/v1)?\/([a-z-]+)\/?$/i.exec(pathname);
  if (!match) {
    return null;
  }

  const route = match[1].toLowerCase();
  return route === 'check' || route === 'security-scan' ? route : null;
}

function rateLimitHeaders(metadata) {
  const limit = metadata?.maxChecksPerWindow ?? IP_RATE_LIMIT_MAX;
  const windowSeconds =
    metadata?.rateLimitWindowSeconds ?? Math.floor(IP_RATE_LIMIT_WINDOW_MS / 1000);
  const remaining =
    typeof metadata?.remainingChecks === 'number' ? metadata.remainingChecks : limit;

  return {
    'ratelimit-policy': `"public";q=${limit};w=${windowSeconds}`,
    'ratelimit-limit': String(limit),
    'ratelimit-remaining': String(Math.max(remaining, 0)),
    'ratelimit-reset': String(windowSeconds),
  };
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
      // The quota is a fixed policy, so it can be advertised on every API
      // response including errors and cache hits. Callers that know the
      // caller-specific position pass fuller values, which win via the spread.
      ...rateLimitHeaders(),
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
