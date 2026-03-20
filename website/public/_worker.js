const CHECKER_USER_AGENT = 'agentmarkup-checker/0.3.0 (+https://agentmarkup.dev)';
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

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT_MAX = 10;
const TARGET_CACHE_TTL_MS = 3 * 60 * 1000;
const CHECK_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let checksSchemaReadyPromise;
let checksSchemaUnavailable = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/check') {
      if (!['GET', 'POST'].includes(request.method)) {
        return json({ error: 'Method not allowed.' }, 405);
      }

      return handleCheckRequest(request, url, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleCheckRequest(request, url, env) {
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

    const homepage = await fetchText(normalized);
    const targetUrl = toSiteRootUrl(homepage.finalUrl || normalized);
    const homepageMarkdownUrl =
      (homepage.ok && homepage.body
        ? findMarkdownAlternateUrl(homepage.body, targetUrl)
        : null) ?? buildMarkdownUrl(targetUrl);
    const homepageMarkdown = homepageMarkdownUrl
      ? await fetchText(homepageMarkdownUrl)
      : null;
    const llmsTxt = await fetchText(new URL('/llms.txt', targetUrl).toString());
    const robotsTxt = await fetchText(new URL('/robots.txt', targetUrl).toString());

    let samplePage = null;
    let samplePageMarkdown = null;

    if (homepage.ok && homepage.body) {
      const samplePageUrl = findFirstInternalLink(
        homepage.body,
        homepage.finalUrl || targetUrl
      );
      if (samplePageUrl) {
        samplePage = await fetchText(samplePageUrl);
        const sampleMarkdownUrl =
          (samplePage.ok && samplePage.body
            ? findMarkdownAlternateUrl(
                samplePage.body,
                samplePage.finalUrl || samplePageUrl
              )
            : null) ?? buildMarkdownUrl(samplePage.finalUrl || samplePageUrl);
        samplePageMarkdown = sampleMarkdownUrl
          ? await fetchText(sampleMarkdownUrl)
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

    const sitemap = sitemapUrl ? await fetchText(sitemapUrl) : null;
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
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Enter a public http:// or https:// website URL.',
      },
      400
    );
  }
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
      response: json(
        {
          error:
            'Too many checker requests came from this IP recently. Please wait a few minutes and try again.',
          retryAfterSeconds,
        },
        429,
        {
          'retry-after': String(retryAfterSeconds),
        }
      ),
    };
  }

  if (turnstileConfig.enabled && recentState.count >= turnstileConfig.threshold) {
    const verified = await verifyTurnstileToken(env, request, turnstileToken);

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
  const keys = targetUrl === normalized ? [normalized] : [normalized, targetUrl];

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

    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = '/';

    return parsed.toString();
  } catch {
    throw new Error('Enter a public http:// or https:// website URL.');
  }
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

  const fallback = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  if (fallback) {
    return fallback;
  }

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
    lower.endsWith('.local') ||
    lower === '0.0.0.0' ||
    lower === '127.0.0.1' ||
    lower === '[::1]' ||
    lower === '::1'
  ) {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    const octets = lower.split('.').map(Number);
    const [first, second] = octets;

    return (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  const normalizedIpv6 = lower.replace(/^\[|\]$/g, '');
  if (normalizedIpv6.includes(':')) {
    return (
      normalizedIpv6 === '::1' ||
      normalizedIpv6.startsWith('fc') ||
      normalizedIpv6.startsWith('fd') ||
      normalizedIpv6.startsWith('fe80:')
    );
  }

  return false;
}

async function fetchText(targetUrl) {
  try {
    let currentUrl = targetUrl;

    for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount += 1) {
      const parsed = new URL(currentUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHostname(parsed.hostname)) {
        throw new Error('Request was blocked by checker safety rules.');
      }

      const { signal, cancel } = createTimeoutSignal(FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(currentUrl, {
          redirect: 'manual',
          signal,
          headers: {
            'user-agent': CHECKER_USER_AGENT,
            accept: 'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1',
          },
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            return {
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              status: response.status,
              ok: false,
              contentType: response.headers.get('content-type'),
              body: null,
              xRobotsTag: response.headers.get('x-robots-tag'),
              error: 'Redirect response had no Location header.',
            };
          }

          const nextUrl = new URL(location, currentUrl);
          if (
            !['http:', 'https:'].includes(nextUrl.protocol) ||
            isBlockedHostname(nextUrl.hostname)
          ) {
            throw new Error('Request was blocked by checker safety rules.');
          }

          currentUrl = nextUrl.toString();
          continue;
        }

        return {
          requestedUrl: targetUrl,
          finalUrl: currentUrl,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          body: await readBoundedText(response),
          xRobotsTag: response.headers.get('x-robots-tag'),
        };
      } finally {
        cancel();
      }
    }

    return {
      requestedUrl: targetUrl,
      finalUrl: currentUrl,
      status: 0,
      ok: false,
      contentType: null,
      body: null,
      xRobotsTag: null,
      error: 'Too many redirects.',
    };
  } catch (error) {
    return {
      requestedUrl: targetUrl,
      finalUrl: targetUrl,
      status: 0,
      ok: false,
      contentType: null,
      body: null,
      xRobotsTag: null,
      error: mapFetchError(error),
    };
  }
}

async function readBoundedText(response) {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
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
    if (totalBytes > MAX_RESPONSE_BYTES) {
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
