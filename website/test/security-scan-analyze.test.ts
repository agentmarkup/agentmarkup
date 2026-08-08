// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { analyzeSecurityScan } from '../src/security-scan/analyze';
import type {
  CookieMeta,
  DnsResult,
  HttpProbeResult,
  RemoteResource,
  SecurityScanResponse,
} from '../src/security-scan/types';

const fetchedAt = '2030-01-01T00:00:00.000Z';

function resource(overrides: Partial<RemoteResource> = {}): RemoteResource {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    ok: true,
    contentType: 'text/plain',
    body: null,
    ...overrides,
  };
}

function response(
  overrides: Partial<SecurityScanResponse> = {}
): SecurityScanResponse {
  return {
    targetUrl: 'https://example.com/',
    origin: 'https://example.com',
    fetchedAt,
    normalizedFrom: null,
    homepage: resource({
      headers: {},
      cookies: [],
    }),
    httpProbe: null,
    securityTxt: resource({
      requestedUrl: 'https://example.com/.well-known/security.txt',
      finalUrl: 'https://example.com/.well-known/security.txt',
      status: 0,
      ok: false,
      error: 'Unavailable',
    }),
    securityTxtFallback: null,
    crossOriginRedirect: false,
    dns: { spf: null, dmarc: null, dnssec: null },
    ...overrides,
  };
}

function withHeaders(
  headers: Record<string, string | null>,
  other: Partial<SecurityScanResponse> = {}
): SecurityScanResponse {
  return response({
    ...other,
    homepage: resource({ headers, cookies: [] }),
  });
}

function item(
  scan: SecurityScanResponse,
  title: string,
  level?: 'pass' | 'warning' | 'error'
) {
  const matches = analyzeSecurityScan(scan).items.filter(
    (candidate) => candidate.title === title && (!level || candidate.level === level)
  );
  expect(matches.length, `Expected ${title}${level ? ` (${level})` : ''}`).toBeGreaterThan(0);
  expect(matches[0].explainer.trim()).not.toBe('');
  return matches[0];
}

function expectNoItem(scan: SecurityScanResponse, title: string): void {
  expect(
    analyzeSecurityScan(scan).items.some((candidate) => candidate.title === title)
  ).toBe(false);
}

describe('analyzeSecurityScan transport checks', () => {
  it('passes HTTPS when the response completes securely', () => {
    item(response(), 'HTTPS', 'pass');
  });

  it('errors when HTTPS is unreachable and short-circuits response checks', () => {
    const scan = response({
      homepage: resource({ status: 0, ok: false, error: 'Connection failed' }),
    });

    item(scan, 'HTTPS', 'error');
    expectNoItem(scan, 'HSTS');
    expectNoItem(scan, 'Cookie flags');
    expectNoItem(scan, 'Mixed content');
  });

  it('errors when an HTTPS request downgrades to HTTP', () => {
    const scan = response({
      homepage: resource({ finalUrl: 'http://example.com/', headers: {}, cookies: [] }),
    });

    expect(item(scan, 'HTTPS', 'error').detail).toContain('downgraded');
    expectNoItem(scan, 'HSTS');
  });

  it('passes a same-site first-hop HTTP upgrade', () => {
    const probe: HttpProbeResult = {
      requestedUrl: 'http://example.com/',
      status: 301,
      location: 'https://www.example.com/',
    };
    item(response({ httpProbe: probe }), 'HTTP to HTTPS redirect', 'pass');
  });

  it('warns when plain HTTP serves without an HTTPS upgrade', () => {
    item(
      response({
        httpProbe: {
          requestedUrl: 'http://example.com/',
          status: 200,
          location: null,
        },
      }),
      'HTTP to HTTPS redirect',
      'warning'
    );
  });

  it.each([
    ['a skipped probe', null],
    [
      'a failed probe',
      {
        requestedUrl: 'http://example.com/',
        status: 0,
        location: null,
        error: 'Timeout',
      },
    ],
  ])('does not emit a redirect finding for %s', (_label, httpProbe) => {
    expectNoItem(
      response({ httpProbe: httpProbe as HttpProbeResult | null }),
      'HTTP to HTTPS redirect'
    );
  });

  it('marks auxiliary checks not determined after a cross-origin redirect', () => {
    const analysis = analyzeSecurityScan(
      response({
        crossOriginRedirect: true,
        homepage: resource({
          finalUrl: 'https://other.example/',
          headers: {},
          cookies: [],
        }),
        httpProbe: {
          requestedUrl: 'http://example.com/',
          status: 200,
          location: null,
        },
        dns: {
          spf: { status: 0, ad: false, answers: [] },
          dmarc: { status: 0, ad: false, answers: [] },
          dnssec: { status: 0, ad: false, answers: [] },
        },
      })
    );

    for (const title of ['HTTP to HTTPS redirect', 'security.txt', 'SPF', 'DMARC', 'DNSSEC']) {
      expect(analysis.items.some((candidate) => candidate.title === title)).toBe(false);
    }
    expect(analysis.resources.find((entry) => entry.key === 'http-probe')?.level).toBe('info');
    expect(analysis.resources.find((entry) => entry.key === 'dns-email')?.level).toBe('info');
  });
});

describe('analyzeSecurityScan response header checks', () => {
  it.each([
    ['a missing header', {}, 'warning'],
    ['a malformed header', { 'strict-transport-security': 'includeSubDomains' }, 'warning'],
    ['a short max-age', { 'strict-transport-security': 'max-age=3600' }, 'warning'],
    [
      'a durable policy',
      { 'strict-transport-security': 'max-age=31536000; includeSubDomains; preload' },
      'pass',
    ],
  ] as const)('assesses HSTS for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'HSTS', level);
  });

  it('passes an enforced CSP', () => {
    item(
      withHeaders({ 'content-security-policy': "default-src 'self'" }),
      'Content-Security-Policy',
      'pass'
    );
  });

  it.each([
    [
      'report-only CSP',
      { 'content-security-policy-report-only': "default-src 'self'" },
    ],
    ['no CSP', {}],
  ])('warns for %s', (_label, headers) => {
    item(withHeaders(headers), 'Content-Security-Policy', 'warning');
  });

  it('warns for unsafe-inline without a nonce or hash', () => {
    const scan = withHeaders({
      'content-security-policy': "script-src 'self' 'unsafe-inline'",
    });

    expect(item(scan, 'Content-Security-Policy', 'warning').detail).toContain(
      'unsafe-inline'
    );
  });

  it('suppresses the unsafe-inline warning when a nonce is present', () => {
    const analysis = analyzeSecurityScan(
      withHeaders({
        'content-security-policy': "script-src 'unsafe-inline' 'nonce-fixed-test-value'",
      })
    );

    expect(
      analysis.items.some(
        (candidate) =>
          candidate.title === 'Content-Security-Policy' &&
          candidate.level === 'warning' &&
          candidate.detail.includes('unsafe-inline')
      )
    ).toBe(false);
  });

  it('always warns for unsafe-eval even when a hash is present', () => {
    const scan = withHeaders({
      'content-security-policy': "script-src 'unsafe-eval' 'sha256-fixedtesthash'",
    });

    expect(item(scan, 'Content-Security-Policy', 'warning').detail).toContain(
      'unsafe-eval'
    );
  });

  it('suppresses the unsafe-inline warning when a hash source is present', () => {
    const analysis = analyzeSecurityScan(
      withHeaders({
        'content-security-policy': "script-src 'unsafe-inline' 'sha256-fixedtesthash'",
      })
    );

    expect(
      analysis.items.some(
        (candidate) =>
          candidate.title === 'Content-Security-Policy' &&
          candidate.detail.includes('unsafe-inline')
      )
    ).toBe(false);
  });

  it('warns for unsafe-inline via the default-src fallback when there is no script-src', () => {
    const scan = withHeaders({
      'content-security-policy': "default-src 'self' 'unsafe-inline'",
    });

    expect(item(scan, 'Content-Security-Policy', 'warning').detail).toContain(
      'unsafe-inline'
    );
  });

  it.each([
    [
      'restrictive frame-ancestors',
      { 'content-security-policy': "frame-ancestors 'self' https://frames.example" },
      'pass',
    ],
    [
      'permissive frame-ancestors despite XFO',
      {
        'content-security-policy': 'frame-ancestors *',
        'x-frame-options': 'DENY',
      },
      'warning',
    ],
    [
      'permissive frame-ancestors without XFO',
      { 'content-security-policy': 'frame-ancestors *' },
      'warning',
    ],
    [
      'wildcard-all host frame-ancestors',
      { 'content-security-policy': 'frame-ancestors https://*' },
      'warning',
    ],
    ['XFO DENY only', { 'x-frame-options': 'DENY' }, 'pass'],
    ['obsolete XFO ALLOW-FROM', { 'x-frame-options': 'ALLOW-FROM https://frames.example' }, 'warning'],
    ['an unrecognized XFO value', { 'x-frame-options': 'ALLOWALL' }, 'warning'],
    ['neither mechanism', {}, 'warning'],
  ] as const)('assesses clickjacking for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'Clickjacking protection', level);
  });

  it.each([
    ['nosniff', { 'x-content-type-options': 'nosniff' }, 'pass'],
    ['missing nosniff', {}, 'warning'],
  ] as const)('assesses X-Content-Type-Options for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'X-Content-Type-Options', level);
  });

  it.each([
    ['a safe policy', { 'referrer-policy': 'strict-origin' }, 'pass'],
    ['unsafe-url', { 'referrer-policy': 'unsafe-url' }, 'warning'],
    ['a missing policy', {}, 'warning'],
  ] as const)('assesses Referrer-Policy for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'Referrer-Policy', level);
  });

  it('collapses a header sent twice into a single value', () => {
    const scan = withHeaders({
      'referrer-policy':
        'strict-origin-when-cross-origin, strict-origin-when-cross-origin',
    });
    const found = item(scan, 'Referrer-Policy', 'pass');
    expect(found.detail).toContain('strict-origin-when-cross-origin');
    expect(found.detail).not.toContain(
      'strict-origin-when-cross-origin, strict-origin-when-cross-origin'
    );
  });

  it('collapses a duplicate value with a trailing comma', () => {
    const scan = withHeaders({
      'referrer-policy': 'strict-origin, strict-origin,',
    });
    const found = item(scan, 'Referrer-Policy', 'pass');
    expect(found.detail).toContain('Referrer-Policy is set to strict-origin.');
  });

  it('treats a comma-only header value as absent', () => {
    item(withHeaders({ 'referrer-policy': ',' }), 'Referrer-Policy', 'warning');
  });

  it('preserves a legitimate multi-token permissions-policy list', () => {
    const scan = withHeaders({
      'permissions-policy': 'camera=(), microphone=()',
    });
    item(scan, 'Permissions-Policy', 'pass');
  });

  it.each([
    ['a present policy', { 'permissions-policy': 'camera=()' }, 'pass'],
    ['a missing policy', {}, 'warning'],
  ] as const)('assesses Permissions-Policy for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'Permissions-Policy', level);
  });

  it.each([
    [
      'protective COOP',
      { 'cross-origin-opener-policy': 'same-origin' },
      'pass',
    ],
    [
      'unsafe-none COOP',
      { 'cross-origin-opener-policy': 'unsafe-none' },
      'warning',
    ],
    [
      'CORP only',
      { 'cross-origin-resource-policy': 'same-site' },
      'pass',
    ],
    ['neither policy', {}, 'warning'],
  ] as const)('assesses cross-origin isolation for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'Cross-origin isolation', level);
  });
});

describe('analyzeSecurityScan cookie and disclosure checks', () => {
  function withCookies(cookies: CookieMeta[] | null): SecurityScanResponse {
    return response({ homepage: resource({ headers: {}, cookies }) });
  }

  it('passes when no cookies were observed', () => {
    item(withCookies([]), 'Cookie flags', 'pass');
  });

  it('passes when every observed cookie has all three flags', () => {
    item(
      withCookies([
        { name: 'session', secure: true, httpOnly: true, sameSite: 'Lax' },
      ]),
      'Cookie flags',
      'pass'
    );
  });

  it('warns and names cookies with missing flags', () => {
    const finding = item(
      withCookies([
        { name: 'session', secure: false, httpOnly: false, sameSite: null },
      ]),
      'Cookie flags',
      'warning'
    );

    expect(finding.detail).toContain('session');
    expect(finding.detail).toContain('Secure');
    expect(finding.detail).toContain('HttpOnly');
    expect(finding.detail).toContain('SameSite');
  });

  it('calls out SameSite=None without Secure', () => {
    const finding = item(
      withCookies([
        { name: 'embed', secure: false, httpOnly: true, sameSite: 'None' },
      ]),
      'Cookie flags',
      'warning'
    );

    expect(finding.detail).toContain('SameSite=None without Secure');
  });

  it('does not determine cookie flags when metadata is unavailable', () => {
    expectNoItem(withCookies(null), 'Cookie flags');
  });

  it.each([
    ['a versioned server', { server: 'nginx/1.25.4' }, 'warning'],
    ['a bare server name', { server: 'cloudflare' }, 'pass'],
    ['X-Powered-By', { 'x-powered-by': 'Express' }, 'warning'],
  ] as const)('assesses version disclosure for %s', (_label, headers, level) => {
    item(withHeaders(headers), 'Version disclosure', level);
  });
});

// Enabled via the file-level happy-dom environment pragma above; the analyzer
// intentionally uses the browser DOMParser for mixed-content and SRI checks.
describe('analyzeSecurityScan HTML content checks (needs a DOM environment)', () => {
  function html(body: string): SecurityScanResponse {
    return response({
      homepage: resource({
        headers: {},
        cookies: [],
        contentType: 'text/html; charset=utf-8',
        body,
      }),
    });
  }

  it.each([
    ['active HTTP content', '<script src="http://cdn.example/app.js"></script>', 'error'],
    ['active HTTP object', '<object data="http://cdn.example/plugin.swf"></object>', 'error'],
    ['passive HTTP content', '<img src="http://cdn.example/image.png">', 'warning'],
    ['no HTTP content', '<img src="/image.png">', 'pass'],
    [
      'relative and protocol-relative content',
      '<script src="/app.js"></script><img src="//cdn.example/image.png">',
      'pass',
    ],
  ] as const)('assesses mixed content for %s', (_label, body, level) => {
    item(html(body), 'Mixed content', level);
  });

  it('warns when a cross-origin script lacks integrity', () => {
    item(
      html('<script src="https://cdn.example/app.js"></script>'),
      'Subresource Integrity',
      'warning'
    );
  });

  it('passes when every cross-origin script has an integrity attribute', () => {
    item(
      html('<script src="https://cdn.example/app.js" integrity="sha384-fixedtest"></script>'),
      'Subresource Integrity',
      'pass'
    );
  });

  it('passes when there are no cross-origin scripts', () => {
    item(
      html('<script src="/app.js"></script>'),
      'Subresource Integrity',
      'pass'
    );
  });
});

describe('analyzeSecurityScan security.txt', () => {
  function securityTxt(
    primary: RemoteResource,
    fallback: RemoteResource | null = null
  ): SecurityScanResponse {
    return response({ securityTxt: primary, securityTxtFallback: fallback });
  }

  it('passes Contact with a future Expires value', () => {
    item(
      securityTxt(
        resource({
          body: 'Contact: mailto:security@example.com\nExpires: 2031-01-01T00:00:00Z',
        })
      ),
      'security.txt',
      'pass'
    );
  });

  it('passes a valid file found at the legacy fallback location', () => {
    const primary = resource({ status: 404, ok: false, body: 'Not found' });
    const fallback = resource({
      requestedUrl: 'https://example.com/security.txt',
      finalUrl: 'https://example.com/security.txt',
      body: 'Contact: mailto:security@example.com\nExpires: 2031-01-01T00:00:00Z',
    });

    expect(item(securityTxt(primary, fallback), 'security.txt', 'pass').detail).toContain(
      'legacy /security.txt location'
    );
  });

  it.each([
    [
      'an expired value',
      'Contact: mailto:security@example.com\nExpires: 2029-01-01T00:00:00Z',
      'expired',
    ],
    [
      'a malformed value',
      'Contact: mailto:security@example.com\nExpires: definitely-not-a-date',
      'parseable Expires',
    ],
  ])('warns for %s', (_label, body, detail) => {
    expect(item(securityTxt(resource({ body })), 'security.txt', 'warning').detail).toContain(
      detail
    );
  });

  it('warns when Contact is missing', () => {
    expect(
      item(
        securityTxt(resource({ body: 'Expires: 2031-01-01T00:00:00Z' })),
        'security.txt',
        'warning'
      ).detail
    ).toContain('Contact');
  });

  it('warns when security.txt is absent', () => {
    item(
      securityTxt(resource({ status: 404, ok: false, body: 'Not found' })),
      'security.txt',
      'warning'
    );
  });

  it('treats a successful HTML shell as an absent soft 404', () => {
    const finding = item(
      securityTxt(
        resource({
          contentType: 'text/html; charset=utf-8',
          body: '<!DOCTYPE html><title>App</title>',
        })
      ),
      'security.txt',
      'warning'
    );

    expect(finding.detail).toContain('No security.txt file was found');
  });

  it('does not determine security.txt when no fetch completed', () => {
    expectNoItem(response(), 'security.txt');
  });
});

describe('analyzeSecurityScan DNS and email authentication', () => {
  function withDns(
    key: 'spf' | 'dmarc' | 'dnssec',
    value: DnsResult | null
  ): SecurityScanResponse {
    return response({
      dns: {
        spf: null,
        dmarc: null,
        dnssec: null,
        [key]: value,
      },
    });
  }

  it.each([
    ['a bounded single record', ['"v=spf1 include:_spf.example " "-all"'], 'pass'],
    ['a permissive +all record', ['"v=spf1 +all"'], 'warning'],
    ['an unbounded record', ['"v=spf1 include:_spf.example"'], 'warning'],
    ['multiple SPF records', ['"v=spf1 -all"', '"v=spf1 ~all"'], 'warning'],
    ['no SPF record', ['"google-site-verification=fixed"'], 'warning'],
  ] as const)('assesses SPF for %s', (_label, answers, level) => {
    item(
      withDns('spf', { status: 0, ad: false, answers: [...answers] }),
      'SPF',
      level
    );
  });

  it('does not determine SPF when the DoH lookup is unavailable', () => {
    expectNoItem(withDns('spf', null), 'SPF');
  });

  it('treats SPF NXDOMAIN as a determined absent record', () => {
    item(
      withDns('spf', { status: 3, ad: false, answers: [] }),
      'SPF',
      'warning'
    );
  });

  it('does not determine SPF on a resolver failure', () => {
    expectNoItem(
      withDns('spf', { status: 2, ad: false, answers: [] }),
      'SPF'
    );
  });

  it.each([
    ['an enforced policy', ['"v=DMARC1; p=reject"'], 'pass'],
    ['a monitoring policy', ['"v=DMARC1; p=none"'], 'warning'],
    ['no record', [], 'warning'],
    ['a malformed policy', ['"v=DMARC1; rua=mailto:dmarc@example.com"'], 'warning'],
    [
      'multiple policies',
      ['"v=DMARC1; p=reject"', '"v=DMARC1; p=quarantine"'],
      'warning',
    ],
  ] as const)('assesses DMARC for %s', (_label, answers, level) => {
    item(
      withDns('dmarc', { status: 0, ad: false, answers: [...answers] }),
      'DMARC',
      level
    );
  });

  it('does not determine DMARC on a resolver failure', () => {
    expectNoItem(
      withDns('dmarc', { status: 2, ad: false, answers: [] }),
      'DMARC'
    );
  });

  it('treats DMARC NXDOMAIN as a determined absent record', () => {
    item(
      withDns('dmarc', { status: 3, ad: false, answers: [] }),
      'DMARC',
      'warning'
    );
  });

  it.each([
    ['a DS answer', ['2371 13 2 0123456789ABCDEF'], 'pass'],
    ['NOERROR without DS', [], 'warning'],
  ] as const)('assesses DNSSEC for %s', (_label, answers, level) => {
    item(
      withDns('dnssec', { status: 0, ad: false, answers: [...answers] }),
      'DNSSEC',
      level
    );
  });

  it('does not determine DNSSEC for a non-NOERROR response', () => {
    expectNoItem(
      withDns('dnssec', { status: 3, ad: false, answers: [] }),
      'DNSSEC'
    );
  });
});
