import type {
  AuditLevel,
  DnsResult,
  HttpProbeResult,
  RemoteResource,
  SecurityAuditItem,
  SecurityResourceStatus,
  SecurityScanAnalysis,
  SecurityScanResponse,
} from './types';

interface RuleDefinition {
  title: string;
  explainer: string;
}

const RULES = {
  https: {
    title: 'HTTPS',
    explainer:
      'HTTPS encrypts traffic between visitors and the site. A failed HTTPS request or a downgrade to HTTP leaves transport security actively broken.',
  },
  httpRedirect: {
    title: 'HTTP to HTTPS redirect',
    explainer:
      'Redirecting the first plain-HTTP request to the same site over HTTPS keeps visitors from remaining on an unencrypted connection. A failed probe is not treated as a finding.',
  },
  hsts: {
    title: 'HSTS',
    explainer:
      'Strict-Transport-Security tells browsers to use HTTPS for future visits. A max-age of at least 180 days provides a durable policy; includeSubDomains and preload are optional here.',
  },
  csp: {
    title: 'Content-Security-Policy',
    explainer:
      'An enforced Content-Security-Policy limits which resources a page may execute or load. Report-only policies observe violations but do not block them, and meta-delivered CSP is outside this response-header check.',
  },
  clickjacking: {
    title: 'Clickjacking protection',
    explainer:
      'CSP frame-ancestors or X-Frame-Options can stop other sites from embedding the page in a deceptive frame. When frame-ancestors is present, browsers use it instead of X-Frame-Options.',
  },
  nosniff: {
    title: 'X-Content-Type-Options',
    explainer:
      'X-Content-Type-Options: nosniff tells browsers not to reinterpret a response as a different content type.',
  },
  referrer: {
    title: 'Referrer-Policy',
    explainer:
      'Referrer-Policy controls how much source-page information is sent to linked sites. Modern browsers already default to strict-origin-when-cross-origin, so a missing header is usually low urgency.',
  },
  permissions: {
    title: 'Permissions-Policy',
    explainer:
      'Permissions-Policy limits access to browser capabilities such as camera, microphone, and geolocation. Missing it is a defense-in-depth warning, not proof that a capability is used.',
  },
  crossOrigin: {
    title: 'Cross-origin isolation',
    explainer:
      'COOP limits relationships with cross-origin windows, while CORP controls which origins may load a resource. Either a protective COOP value or a valid CORP policy supplies useful isolation; COEP is reported only as context.',
  },
  cookies: {
    title: 'Cookie flags',
    explainer:
      'Secure keeps cookies off plain HTTP, HttpOnly blocks script access, and SameSite limits cross-site sending. HttpOnly may be intentionally omitted from cookies that client-side code must read.',
  },
  versions: {
    title: 'Version disclosure',
    explainer:
      'Detailed server or framework versions give attackers unnecessary fingerprinting information. This check reports disclosure only and does not infer that any disclosed software is vulnerable.',
  },
  mixedContent: {
    title: 'Mixed content',
    explainer:
      'An HTTPS page that embeds active HTTP resources can lose its security guarantees or have content blocked. Passive HTTP media is less dangerous but still weakens a fully secure page.',
  },
  sri: {
    title: 'Subresource Integrity',
    explainer:
      'Subresource Integrity lets browsers verify cross-origin script bytes before executing them. It is useful for fixed third-party assets, but often impractical for auto-updating embeds such as Google Analytics.',
  },
  securityTxt: {
    title: 'security.txt',
    explainer:
      'security.txt gives researchers a clear vulnerability-reporting contact. A useful file has a Contact field and a parseable future Expires field; the well-known location is preferred.',
  },
  spf: {
    title: 'SPF',
    explainer:
      'SPF declares which mail systems may send for the queried host and helps limit sender spoofing. This scanner queries the hostname without public-suffix guessing, so deep subdomains may be not determined; it is low urgency if the domain sends no mail.',
  },
  dmarc: {
    title: 'DMARC',
    explainer:
      'DMARC tells receivers how to handle mail that fails authentication and helps stop From-address spoofing. This scanner queries the hostname without public-suffix guessing; p=none is a valid monitoring stage but does not request enforcement.',
  },
  dnssec: {
    title: 'DNSSEC',
    explainer:
      'DNSSEC signs DNS answers against in-transit forgery. This checks for a DS record at the queried host without resolving a registrable domain; many major domains remain unsigned, so absence is a low-urgency warning.',
  },
} as const satisfies Record<string, RuleDefinition>;

type CspDirectives = Map<string, string[]>;

interface SecurityTxtAssessment {
  item: SecurityAuditItem;
  resource: RemoteResource | null;
  legacy: boolean;
}

export function analyzeSecurityScan(
  response: SecurityScanResponse
): SecurityScanAnalysis {
  const items: SecurityAuditItem[] = [];
  const homepageComplete = isCompletedHttpsResponse(response.homepage);
  const htmlComplete =
    homepageComplete &&
    response.homepage.ok &&
    isHtml(response.homepage) &&
    response.homepage.body !== null;

  analyzeHttps(response.homepage, items);

  if (!response.crossOriginRedirect) {
    analyzeHttpRedirect(response.httpProbe, items);
  }

  if (homepageComplete) {
    const headers = response.homepage.headers ?? {};
    const csp = getHeader(headers, 'content-security-policy');

    analyzeHsts(headers, items);
    analyzeCsp(headers, items);
    analyzeClickjacking(headers, csp, items);
    analyzeNosniff(headers, items);
    analyzeReferrerPolicy(headers, items);
    analyzePermissionsPolicy(headers, items);
    analyzeCrossOriginIsolation(headers, items);
    analyzeCookies(response.homepage, items);
    analyzeVersionDisclosure(headers, items);
  }

  if (htmlComplete && response.homepage.body) {
    const document = new DOMParser().parseFromString(
      response.homepage.body,
      'text/html'
    );
    analyzeMixedContent(document, items);
    analyzeSubresourceIntegrity(document, response.homepage.finalUrl, items);
  }

  const securityTxtAssessment = response.crossOriginRedirect
    ? null
    : analyzeSecurityTxt(response, items);

  if (!response.crossOriginRedirect) {
    analyzeSpf(response.dns.spf, items);
    analyzeDmarc(response.dns.dmarc, items);
    analyzeDnssec(response.dns.dnssec, items);
  }

  return {
    normalizedUrl: response.targetUrl,
    normalizedFrom: response.normalizedFrom,
    items,
    resources: buildResourceStatuses(response, securityTxtAssessment, items),
    counts: countByLevel(items),
  };
}

function analyzeHttps(
  homepage: RemoteResource,
  items: SecurityAuditItem[]
): void {
  const finalProtocol = getProtocol(homepage.finalUrl);
  if (homepage.error || homepage.status <= 0 || finalProtocol !== 'https:') {
    const detail =
      finalProtocol === 'http:' && homepage.status > 0 && !homepage.error
        ? `The HTTPS request ended at ${homepage.finalUrl}, which downgraded the page to plain HTTP.`
        : `The HTTPS homepage could not be completed${homepage.error ? `: ${homepage.error}` : '.'}`;
    push(items, 'https', 'error', detail);
    return;
  }

  push(
    items,
    'https',
    'pass',
    `The homepage completed over HTTPS at ${homepage.finalUrl} with status ${homepage.status}.`
  );
}

function analyzeHttpRedirect(
  probe: HttpProbeResult | null,
  items: SecurityAuditItem[]
): void {
  if (!probe || probe.error || probe.status <= 0) {
    return;
  }

  if (redirectsToHttps(probe)) {
    push(
      items,
      'httpRedirect',
      'pass',
      `The first HTTP response returned status ${probe.status} and redirected to HTTPS on the same site.`
    );
    return;
  }

  push(
    items,
    'httpRedirect',
    'warning',
    `The first HTTP response returned status ${probe.status} without an HTTPS upgrade on the same site.`
  );
}

function analyzeHsts(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const value = getHeader(headers, 'strict-transport-security');
  if (!value) {
    push(items, 'hsts', 'warning', 'The HTTPS response has no Strict-Transport-Security header.');
    return;
  }

  const match = /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(value);
  if (!match) {
    push(items, 'hsts', 'warning', `Strict-Transport-Security is present but has no valid max-age: ${value}.`);
    return;
  }

  const maxAge = Number(match[1]);
  const options = [
    /(?:^|;)\s*includesubdomains(?:;|$)/i.test(value)
      ? 'includeSubDomains is present'
      : 'includeSubDomains is not present',
    /(?:^|;)\s*preload(?:;|$)/i.test(value)
      ? 'preload is present'
      : 'preload is not present',
  ].join('; ');

  if (maxAge < 15_552_000) {
    push(
      items,
      'hsts',
      'warning',
      `HSTS max-age is ${maxAge} seconds, below the 180-day baseline. ${options}.`
    );
    return;
  }

  push(
    items,
    'hsts',
    'pass',
    `HSTS max-age is ${maxAge} seconds. ${options}.`
  );
}

function analyzeCsp(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const enforced = getHeader(headers, 'content-security-policy');
  const reportOnly = getHeader(headers, 'content-security-policy-report-only');

  if (!enforced) {
    push(
      items,
      'csp',
      'warning',
      reportOnly
        ? 'Only Content-Security-Policy-Report-Only is present, so violations are reported but not blocked.'
        : 'The response has no enforced Content-Security-Policy header.'
    );
    return;
  }

  push(items, 'csp', 'pass', 'The response includes an enforced Content-Security-Policy header.');

  const directives = parseCsp(enforced);
  const scriptSources = directives.get('script-src') ?? directives.get('default-src');
  if (!scriptSources) {
    return;
  }

  const lowerSources = scriptSources.map((source) => source.toLowerCase());
  const hasNonceOrHash = lowerSources.some((source) =>
    /^'(?:nonce-|sha(?:256|384|512)-)/.test(source)
  );

  if (lowerSources.includes("'unsafe-inline'") && !hasNonceOrHash) {
    push(
      items,
      'csp',
      'warning',
      "The effective script policy allows 'unsafe-inline' without a nonce or SHA-256, SHA-384, or SHA-512 source."
    );
  }

  if (lowerSources.includes("'unsafe-eval'")) {
    push(
      items,
      'csp',
      'warning',
      "The effective script policy allows 'unsafe-eval'; nonces and hashes do not neutralize this source expression."
    );
  }
}

function analyzeClickjacking(
  headers: Record<string, string | null>,
  csp: string | null,
  items: SecurityAuditItem[]
): void {
  const frameAncestors = csp ? parseCsp(csp).get('frame-ancestors') : undefined;
  if (frameAncestors) {
    if (isRestrictiveFrameAncestors(frameAncestors)) {
      push(
        items,
        'clickjacking',
        'pass',
        `CSP frame-ancestors restricts framing to ${frameAncestors.join(' ')}.`
      );
    } else {
      push(
        items,
        'clickjacking',
        'warning',
        `CSP frame-ancestors is permissive or invalid (${frameAncestors.join(' ')}), and it takes precedence over X-Frame-Options.`
      );
    }
    return;
  }

  const xFrameOptions = getHeader(headers, 'x-frame-options');
  if (/^\s*(?:deny|sameorigin)\s*$/i.test(xFrameOptions ?? '')) {
    push(items, 'clickjacking', 'pass', `X-Frame-Options is set to ${xFrameOptions?.trim()}.`);
    return;
  }

  if (/^\s*allow-from\b/i.test(xFrameOptions ?? '')) {
    push(items, 'clickjacking', 'warning', 'X-Frame-Options uses obsolete ALLOW-FROM syntax.');
    return;
  }

  push(
    items,
    'clickjacking',
    'warning',
    xFrameOptions
      ? `X-Frame-Options has an unrecognized value: ${xFrameOptions}.`
      : 'Neither CSP frame-ancestors nor a protective X-Frame-Options value is present.'
  );
}

function analyzeNosniff(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const value = getHeader(headers, 'x-content-type-options');
  push(
    items,
    'nosniff',
    value?.trim().toLowerCase() === 'nosniff' ? 'pass' : 'warning',
    value?.trim().toLowerCase() === 'nosniff'
      ? 'X-Content-Type-Options is set to nosniff.'
      : value
        ? `X-Content-Type-Options has an unexpected value: ${value}.`
        : 'The response has no X-Content-Type-Options: nosniff header.'
  );
}

function analyzeReferrerPolicy(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const value = getHeader(headers, 'referrer-policy');
  if (!value) {
    push(items, 'referrer', 'warning', 'The response has no Referrer-Policy header; modern browser defaults reduce the urgency.');
  } else if (value.split(',').some((part) => part.trim().toLowerCase() === 'unsafe-url')) {
    push(items, 'referrer', 'warning', 'Referrer-Policy includes unsafe-url, which sends full referrer URLs across origins.');
  } else {
    push(items, 'referrer', 'pass', `Referrer-Policy is set to ${value}.`);
  }
}

function analyzePermissionsPolicy(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const value = getHeader(headers, 'permissions-policy');
  push(
    items,
    'permissions',
    value ? 'pass' : 'warning',
    value
      ? 'The response includes a Permissions-Policy header.'
      : 'The response has no Permissions-Policy header; this is a low-urgency defense-in-depth improvement.'
  );
}

function analyzeCrossOriginIsolation(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const coop = getHeader(headers, 'cross-origin-opener-policy')?.trim().toLowerCase();
  const corp = getHeader(headers, 'cross-origin-resource-policy')?.trim().toLowerCase();
  const coep = getHeader(headers, 'cross-origin-embedder-policy');
  const protectiveCoop = new Set([
    'same-origin',
    'same-origin-allow-popups',
    'noopener-allow-popups',
  ]).has(coop ?? '');
  const validCorp = new Set(['same-origin', 'same-site', 'cross-origin']).has(
    corp ?? ''
  );
  const context = coep ? ` COEP is also set to ${coep}.` : '';

  if (protectiveCoop || validCorp) {
    push(
      items,
      'crossOrigin',
      'pass',
      `${protectiveCoop ? `COOP is set to ${coop}` : `CORP is set to ${corp}`}.${context}`
    );
  } else {
    push(
      items,
      'crossOrigin',
      'warning',
      `No protective COOP or valid CORP value is present; this is a low-urgency defense-in-depth improvement.${context}`
    );
  }
}

function analyzeCookies(
  homepage: RemoteResource,
  items: SecurityAuditItem[]
): void {
  const cookies = homepage.cookies;
  if (cookies === null || cookies === undefined) {
    return;
  }

  if (cookies.length === 0) {
    push(items, 'cookies', 'pass', 'No cookies were observed on the homepage request or its redirect hops.');
    return;
  }

  const problems: string[] = [];
  for (const cookie of cookies) {
    const missing: string[] = [];
    if (!cookie.secure) missing.push('Secure');
    if (!cookie.httpOnly) missing.push('HttpOnly');
    if (!cookie.sameSite) missing.push('SameSite');

    if (cookie.sameSite?.toLowerCase() === 'none' && !cookie.secure) {
      missing.push('SameSite=None without Secure');
    }

    if (missing.length > 0) {
      problems.push(`${cookie.name} (${missing.join(', ')})`);
    }
  }

  if (problems.length === 0) {
    push(items, 'cookies', 'pass', `All observed cookies include Secure, HttpOnly, and SameSite: ${cookies.map((cookie) => cookie.name).join(', ')}.`);
  } else {
    push(items, 'cookies', 'warning', `Cookie flag issues were found for these cookie names only: ${problems.join('; ')}. HttpOnly can be intentionally omitted from non-session cookies read by client code.`);
  }
}

function analyzeVersionDisclosure(
  headers: Record<string, string | null>,
  items: SecurityAuditItem[]
): void {
  const server = getHeader(headers, 'server');
  const poweredBy = getHeader(headers, 'x-powered-by');
  const disclosures: string[] = [];

  if (server && /\/\d/.test(server)) {
    disclosures.push(`Server: ${server}`);
  }
  if (poweredBy) {
    disclosures.push(`X-Powered-By: ${poweredBy}`);
  }

  push(
    items,
    'versions',
    disclosures.length > 0 ? 'warning' : 'pass',
    disclosures.length > 0
      ? `The response discloses implementation details: ${disclosures.join('; ')}.`
      : 'No detailed server version or X-Powered-By disclosure was found.'
  );
}

function analyzeMixedContent(
  document: Document,
  items: SecurityAuditItem[]
): void {
  const active = new Set<string>();
  const passive = new Set<string>();

  collectHttpAttribute(document, 'script[src]', 'src', active);
  collectHttpAttribute(document, 'iframe[src]', 'src', active);
  for (const link of Array.from(document.querySelectorAll('link[href]'))) {
    const rel = link.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? [];
    const href = link.getAttribute('href')?.trim() ?? '';
    if (rel.includes('stylesheet') && isExplicitHttp(href)) {
      active.add(href);
    }
  }

  for (const selector of ['img[src]', 'audio[src]', 'video[src]', 'source[src]']) {
    collectHttpAttribute(document, selector, 'src', passive);
  }
  collectHttpAttribute(document, 'video[poster]', 'poster', passive);
  for (const element of Array.from(document.querySelectorAll('[srcset]'))) {
    for (const candidate of (element.getAttribute('srcset') ?? '').split(',')) {
      const url = candidate.trim().split(/\s+/)[0] ?? '';
      if (isExplicitHttp(url)) passive.add(url);
    }
  }

  if (active.size > 0) {
    push(items, 'mixedContent', 'error', `The HTTPS page embeds ${active.size} active resource${active.size === 1 ? '' : 's'} over plain HTTP.`);
  } else if (passive.size > 0) {
    push(items, 'mixedContent', 'warning', `The HTTPS page embeds ${passive.size} passive media resource${passive.size === 1 ? '' : 's'} over plain HTTP.`);
  } else {
    push(items, 'mixedContent', 'pass', 'No explicit http:// active resources or media were found in the HTML response.');
  }
}

function analyzeSubresourceIntegrity(
  document: Document,
  finalUrl: string,
  items: SecurityAuditItem[]
): void {
  const baseUrl = tryUrl(finalUrl);
  if (!baseUrl) return;

  let crossOriginScripts = 0;
  let missingIntegrity = 0;
  for (const script of Array.from(document.querySelectorAll('script[src]'))) {
    const src = script.getAttribute('src')?.trim();
    if (!src) continue;
    const scriptUrl = tryUrl(src, baseUrl.href);
    if (!scriptUrl || scriptUrl.origin === baseUrl.origin) continue;
    crossOriginScripts += 1;
    if (!script.getAttribute('integrity')?.trim()) missingIntegrity += 1;
  }

  push(
    items,
    'sri',
    missingIntegrity > 0 ? 'warning' : 'pass',
    missingIntegrity > 0
      ? `${missingIntegrity} of ${crossOriginScripts} cross-origin script${crossOriginScripts === 1 ? '' : 's'} lack an integrity attribute.`
      : crossOriginScripts > 0
        ? `All ${crossOriginScripts} cross-origin script${crossOriginScripts === 1 ? '' : 's'} include an integrity attribute.`
        : 'No cross-origin scripts require a Subresource Integrity check.'
  );
}

function analyzeSecurityTxt(
  response: SecurityScanResponse,
  items: SecurityAuditItem[]
): SecurityTxtAssessment | null {
  const primaryUsable = isUsableSecurityTxtResource(response.securityTxt);
  const fallbackUsable = isUsableSecurityTxtResource(response.securityTxtFallback);
  const resource = primaryUsable
    ? response.securityTxt
    : fallbackUsable
      ? response.securityTxtFallback
      : null;
  const legacy = resource === response.securityTxtFallback && resource !== null;

  if (!resource || !resource.body) {
    const availableMalformed = [response.securityTxt, response.securityTxtFallback].find(
      (candidate) => candidate && candidate.ok && !isSecurityTxtSoft404(candidate)
    );
    if (availableMalformed?.body) {
      return assessSecurityTxtBody(
        availableMalformed,
        availableMalformed === response.securityTxtFallback,
        response.fetchedAt,
        items
      );
    }

    const completedAttempt = [
      response.securityTxt,
      response.securityTxtFallback,
    ].some((candidate) => candidate && !candidate.error && candidate.status > 0);
    if (!completedAttempt) return null;

    const item = makeItem(
      'securityTxt',
      'warning',
      'No security.txt file was found at the well-known or legacy location. This is a low-urgency disclosure-channel improvement.'
    );
    items.push(item);
    return { item, resource: null, legacy: false };
  }

  return assessSecurityTxtBody(resource, legacy, response.fetchedAt, items);
}

function assessSecurityTxtBody(
  resource: RemoteResource,
  legacy: boolean,
  fetchedAt: string,
  items: SecurityAuditItem[]
): SecurityTxtAssessment {
  const fields = parseSecurityTxt(resource.body ?? '');
  const contact = fields.get('contact')?.find((value) => value.length > 0);
  const expiresValue = fields.get('expires')?.[0];
  const expiresAt = expiresValue ? Date.parse(expiresValue) : Number.NaN;
  let item: SecurityAuditItem;

  if (!contact) {
    item = makeItem('securityTxt', 'warning', 'security.txt is missing a non-empty Contact field.');
  } else if (!expiresValue || Number.isNaN(expiresAt)) {
    item = makeItem('securityTxt', 'warning', 'security.txt has no parseable Expires field.');
  } else if (expiresAt <= Date.parse(fetchedAt)) {
    item = makeItem('securityTxt', 'warning', `security.txt expired at ${expiresValue}.`);
  } else {
    item = makeItem(
      'securityTxt',
      'pass',
      `security.txt has Contact and a future Expires value${legacy ? ' and was found at the legacy /security.txt location' : ''}.`
    );
  }

  items.push(item);
  return { item, resource, legacy };
}

function analyzeSpf(result: DnsResult | null, items: SecurityAuditItem[]): void {
  if (!isDeterminedTxtLookup(result)) return;
  const records = result.status === 0
    ? result.answers.map(normalizeTxtAnswer).filter((answer) => /^v=spf1(?:\s|$)/i.test(answer))
    : [];

  if (records.length === 0) {
    push(items, 'spf', 'warning', 'No SPF record was found for the queried host. This is low urgency if the domain sends no mail.');
  } else if (records.length > 1) {
    push(items, 'spf', 'warning', `${records.length} SPF records were found. Multiple SPF records violate SPF rules and break evaluation.`);
  } else if (/\+all\s*$/i.test(records[0])) {
    push(items, 'spf', 'warning', 'The SPF record ends in +all, which permits every sender.');
  } else if (/(?:-|~|\?)all\s*$/i.test(records[0])) {
    push(items, 'spf', 'pass', 'Exactly one SPF record was found with a bounded all mechanism.');
  } else {
    push(items, 'spf', 'warning', 'The SPF record does not end in -all, ~all, or ?all.');
  }
}

function analyzeDmarc(result: DnsResult | null, items: SecurityAuditItem[]): void {
  if (!isDeterminedTxtLookup(result)) return;
  const records = result.status === 0
    ? result.answers.map(normalizeTxtAnswer).filter((answer) => /^v=dmarc1(?:\s*;|\s|$)/i.test(answer))
    : [];

  if (records.length === 0) {
    push(items, 'dmarc', 'warning', 'No DMARC record was found for the queried host.');
    return;
  }
  if (records.length > 1) {
    push(items, 'dmarc', 'warning', `${records.length} DMARC records were found; multiple records make the policy malformed.`);
    return;
  }

  const policy = /(?:^|;)\s*p\s*=\s*([^;\s]+)/i.exec(records[0])?.[1]?.toLowerCase();
  if (policy === 'quarantine' || policy === 'reject') {
    push(items, 'dmarc', 'pass', `DMARC requests the ${policy} enforcement policy.`);
  } else if (policy === 'none') {
    push(items, 'dmarc', 'warning', 'DMARC uses p=none, a valid monitoring stage that does not request enforcement.');
  } else {
    push(items, 'dmarc', 'warning', 'The DMARC record is missing a valid p= policy.');
  }
}

function analyzeDnssec(result: DnsResult | null, items: SecurityAuditItem[]): void {
  if (!result || result.status !== 0) return;
  if (result.answers.length > 0) {
    push(items, 'dnssec', 'pass', 'At least one DS record was returned for the queried host, indicating a signed delegation.');
  } else {
    push(items, 'dnssec', 'warning', 'No DS record was returned for the queried host. Many major domains are unsigned, so this is low urgency.');
  }
}

function buildResourceStatuses(
  response: SecurityScanResponse,
  securityTxt: SecurityTxtAssessment | null,
  items: SecurityAuditItem[]
): SecurityResourceStatus[] {
  const homepageComplete = isCompletedHttpsResponse(response.homepage);
  const homepageDetail = response.crossOriginRedirect
    ? `${stripWww(hostnameOf(response.targetUrl))} redirected to ${hostnameOf(response.homepage.finalUrl)}. Only the landed page's response headers were analyzed.`
    : homepageComplete
      ? `Completed with status ${response.homepage.status} at ${response.homepage.finalUrl}.`
      : response.homepage.error ?? 'The HTTPS request did not complete securely.';

  const httpProbe = response.httpProbe;
  const httpDetermined =
    !response.crossOriginRedirect &&
    httpProbe !== null &&
    !httpProbe.error &&
    httpProbe.status > 0;
  const httpPass = httpDetermined && redirectsToHttps(httpProbe);

  const dnsResults = [response.dns.spf, response.dns.dmarc, response.dns.dnssec];
  const dnsDetermined = !response.crossOriginRedirect && dnsResults.some(isUsableDnsLookup);
  const dnsItems = ['SPF', 'DMARC', 'DNSSEC'].map((title) =>
    [...items].reverse().find((item) => item.title === title)
  );
  const dnsHasWarning = dnsItems.some((item) => item?.level === 'warning');

  return [
    {
      key: 'homepage',
      level: homepageComplete ? 'pass' : 'error',
      label: 'HTTPS homepage',
      url: response.homepage.finalUrl || response.homepage.requestedUrl,
      status: homepageComplete ? 'Fetched' : 'Failed',
      detail: homepageDetail,
      ok: homepageComplete,
      explainer: RULES.https.explainer,
    },
    {
      key: 'http-probe',
      level: httpDetermined ? (httpPass ? 'pass' : 'warning') : 'info',
      label: 'HTTP upgrade probe',
      url: httpProbe?.requestedUrl ?? null,
      status: httpDetermined ? (httpPass ? 'Upgrades' : 'No upgrade') : 'Not determined',
      detail: response.crossOriginRedirect
        ? 'Skipped because the homepage landed on a different hostname.'
        : httpDetermined
          ? `The first response returned status ${httpProbe.status}${httpProbe.location ? ` with Location: ${httpProbe.location}` : ''}.`
          : httpProbe?.error ?? 'The first-hop HTTP probe was unavailable or skipped.',
      ok: httpPass,
      explainer: RULES.httpRedirect.explainer,
    },
    {
      key: 'security-txt',
      level: securityTxt ? securityTxt.item.level : 'info',
      label: 'security.txt',
      url: securityTxt?.resource?.finalUrl ?? response.securityTxt.requestedUrl ?? null,
      status: securityTxt
        ? securityTxt.item.level === 'pass'
          ? 'Valid'
          : 'Needs attention'
        : 'Not determined',
      detail: response.crossOriginRedirect
        ? 'Skipped because the homepage landed on a different hostname.'
        : securityTxt?.item.detail ?? 'The security.txt fetch did not produce a determined result.',
      ok: securityTxt?.item.level === 'pass',
      explainer: RULES.securityTxt.explainer,
    },
    {
      key: 'dns-email',
      level: dnsDetermined ? (dnsHasWarning ? 'warning' : 'pass') : 'info',
      label: 'DNS and email authentication',
      url: null,
      status: dnsDetermined ? (dnsHasWarning ? 'Needs attention' : 'Checked') : 'Not determined',
      detail: response.crossOriginRedirect
        ? 'Skipped because the homepage landed on a different hostname.'
        : dnsDetermined
          ? 'Passive DNS lookups were assessed for SPF, DMARC, and DNSSEC where the resolver returned a determined response.'
          : 'The DNS lookups failed, were skipped, or did not identify a delegation point.',
      ok: dnsDetermined && !dnsHasWarning,
      explainer: 'SPF and DMARC limit mail spoofing, while DNSSEC signs DNS answers. These checks query the scanned hostname without public-suffix guessing.',
    },
  ];
}

function push(
  items: SecurityAuditItem[],
  rule: keyof typeof RULES,
  level: AuditLevel,
  detail: string
): void {
  items.push(makeItem(rule, level, detail));
}

function makeItem(
  rule: keyof typeof RULES,
  level: AuditLevel,
  detail: string
): SecurityAuditItem {
  return {
    level,
    title: RULES[rule].title,
    detail,
    explainer: RULES[rule].explainer,
  };
}

function countByLevel(
  items: SecurityAuditItem[]
): Record<AuditLevel, number> {
  return items.reduce<Record<AuditLevel, number>>(
    (counts, item) => {
      counts[item.level] += 1;
      return counts;
    },
    { pass: 0, warning: 0, error: 0 }
  );
}

function isCompletedHttpsResponse(resource: RemoteResource): boolean {
  return !resource.error && resource.status > 0 && getProtocol(resource.finalUrl) === 'https:';
}

function getHeader(
  headers: Record<string, string | null>,
  name: string
): string | null {
  const exact = headers[name];
  if (exact !== undefined) return exact?.trim() || null;
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key]?.trim() || null : null;
}

function parseCsp(value: string): CspDirectives {
  const directives: CspDirectives = new Map();
  for (const rawDirective of value.split(';')) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
    const name = parts.shift()?.toLowerCase();
    if (name && !directives.has(name)) directives.set(name, parts);
  }
  return directives;
}

function isRestrictiveFrameAncestors(sources: string[]): boolean {
  if (sources.length === 0) return false;
  const lower = sources.map((source) => source.toLowerCase());
  if (lower.includes('*') || lower.some((source) => /^[a-z][a-z0-9+.-]*:$/.test(source))) {
    return false;
  }
  return lower.every(
    (source) =>
      source === "'none'" ||
      source === "'self'" ||
      /^https?:\/\//.test(source) ||
      /^(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/.*)?$/i.test(source)
  );
}

function redirectsToHttps(probe: HttpProbeResult): boolean {
  if (probe.status < 300 || probe.status >= 400 || !probe.location) return false;
  const requested = tryUrl(probe.requestedUrl);
  const redirected = tryUrl(probe.location, probe.requestedUrl);
  return Boolean(
    requested &&
      redirected &&
      redirected.protocol === 'https:' &&
      sameHost(requested.hostname, redirected.hostname)
  );
}

function sameHost(left: string, right: string): boolean {
  return stripWww(left) === stripWww(right);
}

function stripWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function getProtocol(value: string): string | null {
  return tryUrl(value)?.protocol ?? null;
}

function hostnameOf(value: string): string {
  return tryUrl(value)?.hostname ?? value;
}

function tryUrl(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
}

function isHtml(resource: RemoteResource): boolean {
  return resource.contentType?.toLowerCase().includes('text/html') ?? false;
}

function collectHttpAttribute(
  document: Document,
  selector: string,
  attribute: string,
  output: Set<string>
): void {
  for (const element of Array.from(document.querySelectorAll(selector))) {
    const value = element.getAttribute(attribute)?.trim() ?? '';
    if (isExplicitHttp(value)) output.add(value);
  }
}

function isExplicitHttp(value: string): boolean {
  return /^http:\/\//i.test(value);
}

function isSecurityTxtSoft404(resource: RemoteResource): boolean {
  const body = resource.body?.trimStart().toLowerCase() ?? '';
  return (
    isHtml(resource) || body.startsWith('<!doctype') || body.startsWith('<html')
  );
}

function isUsableSecurityTxtResource(
  resource: RemoteResource | null
): resource is RemoteResource {
  return Boolean(
    resource &&
      !resource.error &&
      resource.ok &&
      resource.status >= 200 &&
      resource.status < 300 &&
      resource.body !== null &&
      !isSecurityTxtSoft404(resource)
  );
}

function parseSecurityTxt(body: string): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1].toLowerCase();
    fields.set(key, [...(fields.get(key) ?? []), match[2].trim()]);
  }
  return fields;
}

function isDeterminedTxtLookup(result: DnsResult | null): result is DnsResult {
  return Boolean(result && (result.status === 0 || result.status === 3));
}

function isUsableDnsLookup(result: DnsResult | null): boolean {
  return Boolean(result && (result.status === 0 || result.status === 3));
}

function normalizeTxtAnswer(answer: string): string {
  const chunks: string[] = [];
  const quoted = /"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = quoted.exec(answer)) !== null) {
    chunks.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return (chunks.length > 0 ? chunks.join('') : answer).trim();
}
