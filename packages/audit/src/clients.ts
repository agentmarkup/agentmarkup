/**
 * Agency -> client discovery, pure functions over HTML and link records. The
 * batch script (`scripts/batch-audit.mjs`) does the fetching; nothing here is on
 * the CLI or README surface until recall is proven on real agencies.
 */
import { DEFAULT_EXCLUSIONS, type ExclusionLists, type ExclusionReason } from './clients-exclusions.js';
import { registrableDomain } from './registrable-domain.js';

export interface LinkRecord {
  /** Absolute URL, hash removed. */
  href: string;
  /** Visible text, whitespace collapsed, tags and entities removed. */
  text: string;
  wrapsImage: boolean;
  targetBlank: boolean;
  rel: string;
}

export interface SourcedLink extends LinkRecord {
  /** The page the link was found on. */
  sourceUrl: string;
  /** True when the source page is a portfolio page. */
  portfolio: boolean;
}

export interface ClientCandidate {
  domain: string;
  score: number;
  signals: string[];
  sourcePages: string[];
}

export interface ExcludedDomain {
  domain: string;
  reason: ExclusionReason | 'agency-domain' | 'not-a-domain';
}

export interface CandidateRanking {
  candidates: ClientCandidate[];
  excluded: ExcludedDomain[];
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$)/i;

/** Tracking parameters removed, https forced, path reset to the site root. */
export function canonicalizeAgencyUrl(website: string): string {
  const trimmed = website.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  parsed.protocol = 'https:';
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
  }
  parsed.search = '';
  parsed.pathname = '/';
  return parsed.toString();
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function attribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const match = pattern.exec(tag);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '');
}

const SKIPPED_HREF = /^(#|mailto:|tel:|javascript:|data:)/i;
const ASSET_PATH = /\.(png|jpe?g|gif|webp|svg|ico|css|js|xml|txt|json|pdf|zip|mp3|mp4|woff2?)$/i;

/**
 * Every `<a href>` in document order with its text, resolved against `baseUrl`.
 * Skips the hrefs `findFirstInternalLink` skips (empty, `#`, mailto, tel,
 * javascript, data) and asset paths; keeps external links.
 */
export function extractLinks(html: string, baseUrl: string): LinkRecord[] {
  const links: LinkRecord[] = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const tag = match[1];
    const inner = match[2];
    const rawHref = attribute(tag, 'href');
    const href = rawHref?.trim() ?? '';
    if (!href || SKIPPED_HREF.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (ASSET_PATH.test(resolved.pathname)) continue;
    resolved.hash = '';
    const text = decodeEntities(inner.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    const target = attribute(tag, 'target');
    links.push({
      href: resolved.toString(),
      text,
      wrapsImage: /<img\b/i.test(inner),
      targetBlank: target?.toLowerCase() === '_blank',
      rel: attribute(tag, 'rel')?.trim() ?? '',
    });
  }
  return links;
}

const PORTFOLIO_PATH =
  /^(portfolio|our-work|work|projects?|case-stud(y|ies)|clients?|client-work|success-stories|results|showcase|recent-work|websites|gallery|web-design(-portfolio)?)$/i;
const PORTFOLIO_TEXT = /\b(portfolio|our work|case stud(y|ies)|clients|success stories|showcase|recent work)\b/i;

function firstPathSegment(url: URL): string {
  return url.pathname.split('/').filter((segment) => segment.length > 0)[0] ?? '';
}

function pathDepth(url: URL): number {
  return url.pathname.split('/').filter((segment) => segment.length > 0).length;
}

/**
 * Same-origin portfolio pages: a first path segment on the portfolio list or
 * anchor text that names one. Ranked path+text, then path, then text, then the
 * shallowest path; at most `limit` (default 2).
 */
export function findPortfolioPages(links: LinkRecord[], origin: string, limit = 2): string[] {
  const originUrl = new URL(origin).origin;
  const ranked = new Map<string, { rank: number; depth: number; order: number }>();
  links.forEach((link, order) => {
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      return;
    }
    if (url.origin !== originUrl) return;
    if (/^\/api\//i.test(url.pathname)) return;
    const byPath = PORTFOLIO_PATH.test(firstPathSegment(url));
    const byText = PORTFOLIO_TEXT.test(link.text);
    if (!byPath && !byText) return;
    url.search = '';
    url.hash = '';
    const key = url.toString();
    const rank = byPath && byText ? 3 : byPath ? 2 : 1;
    const existing = ranked.get(key);
    if (!existing || existing.rank < rank) {
      ranked.set(key, { rank, depth: pathDepth(url), order: existing?.order ?? order });
    }
  });
  return [...ranked.entries()]
    .sort((a, b) => b[1].rank - a[1].rank || a[1].depth - b[1].depth || a[1].order - b[1].order)
    .slice(0, limit)
    .map(([key]) => key);
}

/** Every `<loc>` of a sitemap or sitemap index body. */
export function sitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    locs.push(decodeEntities(match[1]));
  }
  return locs;
}

/** Sitemap URLs whose first path segment matches the portfolio list, same origin, at most `limit`. */
export function findPortfolioLocs(locs: string[], origin: string, limit = 2): string[] {
  const originUrl = new URL(origin).origin;
  const picked: Array<{ url: string; depth: number }> = [];
  for (const loc of locs) {
    let url: URL;
    try {
      url = new URL(loc);
    } catch {
      continue;
    }
    if (url.origin !== originUrl || !PORTFOLIO_PATH.test(firstPathSegment(url))) continue;
    url.search = '';
    url.hash = '';
    if (!picked.some((entry) => entry.url === url.toString())) {
      picked.push({ url: url.toString(), depth: pathDepth(url) });
    }
  }
  return picked
    .sort((a, b) => a.depth - b.depth)
    .slice(0, limit)
    .map((entry) => entry.url);
}

function matchesList(hostname: string, domain: string, list: ReadonlyArray<string>): boolean {
  const secondLevel = domain.split('.')[0] ?? '';
  for (const entry of list) {
    if (entry.includes('.')) {
      if (hostname === entry || hostname.endsWith(`.${entry}`) || hostname.startsWith(`${entry}.`) || hostname.includes(`.${entry}.`)) {
        return true;
      }
    } else if (secondLevel === entry) {
      return true;
    }
  }
  return false;
}

/**
 * The agency's own registrable domains: one, or several when the requested
 * homepage redirected to another registrable domain (pass both, so the final
 * site is never ranked as its own client).
 */
export type AgencyDomains = string | ReadonlyArray<string>;

function agencyDomainSet(agencyDomain: AgencyDomains): Set<string> {
  const list = typeof agencyDomain === 'string' ? [agencyDomain] : agencyDomain;
  return new Set(list.filter(Boolean).map((domain) => domain.toLowerCase()));
}

export function exclusionReasonFor(
  hostname: string,
  agencyDomain: AgencyDomains,
  lists: ExclusionLists = DEFAULT_EXCLUSIONS
): ExcludedDomain['reason'] | null {
  const host = hostname.toLowerCase();
  const domain = registrableDomain(host);
  if (!domain.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    return 'not-a-domain';
  }
  if (agencyDomainSet(agencyDomain).has(domain)) return 'agency-domain';
  if (matchesList(host, domain, lists.socialDirectory)) return 'social-directory';
  if (matchesList(host, domain, lists.cdnAsset)) return 'cdn-asset';
  if (matchesList(host, domain, lists.platformVendor)) return 'platform-vendor';
  return null;
}

const VISIT_TEXT = /\b(visit|view|launch|see|open)\b.*\b(site|website|live|project)\b/i;
/** Social share endpoints (reddit /submit, tumblr /share, twitter /intent, facebook /sharer): never a client. */
const SHARE_PATH = /\/(share|sharer|submit|intent|shareArticle|share-offsite)(\.php)?(\/|$)/i;

/**
 * External registrable domains scored by the signals a client link carries:
 * +3 on a portfolio page, +2 "visit site" text or the bare domain as text,
 * +2 wrapping an image, +1 target=_blank, +1 per additional distinct source
 * page (cap 2), -2 for a deep hostname that is not `www`. Hard exclusions
 * (agency subdomains, social and directory sites, CDNs, platforms and vendors)
 * are reported with their reason; social share endpoints are skipped outright.
 * Sorted by score, then domain.
 */
export function rankClientCandidates(
  links: SourcedLink[],
  agencyDomain: AgencyDomains,
  lists: ExclusionLists = DEFAULT_EXCLUSIONS
): CandidateRanking {
  const agency = [...agencyDomainSet(agencyDomain)];
  const excluded = new Map<string, ExcludedDomain['reason']>();
  const perDomain = new Map<
    string,
    { signals: Set<string>; sourcePages: Set<string>; deepHost: boolean }
  >();

  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (SHARE_PATH.test(url.pathname)) continue;
    const hostname = url.hostname.toLowerCase();
    const domain = registrableDomain(hostname);
    const reason = exclusionReasonFor(hostname, agency, lists);
    if (reason) {
      excluded.set(domain || hostname, reason);
      continue;
    }
    const entry = perDomain.get(domain) ?? {
      signals: new Set<string>(),
      sourcePages: new Set<string>(),
      deepHost: false,
    };
    if (link.portfolio) entry.signals.add('portfolio-page');
    const bare = hostname.replace(/^www\./, '');
    const text = link.text.trim().toLowerCase();
    if (VISIT_TEXT.test(text) || text === bare || text === domain || text === hostname) {
      entry.signals.add('visit-text');
    }
    if (link.wrapsImage) entry.signals.add('wraps-image');
    if (link.targetBlank) entry.signals.add('target-blank');
    if (hostname.split('.').length > 3 && !hostname.startsWith('www.')) entry.deepHost = true;
    entry.sourcePages.add(link.sourceUrl);
    perDomain.set(domain, entry);
  }

  const candidates: ClientCandidate[] = [];
  for (const [domain, entry] of perDomain) {
    let score = 0;
    const signals = [...entry.signals].sort();
    if (entry.signals.has('portfolio-page')) score += 3;
    if (entry.signals.has('visit-text')) score += 2;
    if (entry.signals.has('wraps-image')) score += 2;
    if (entry.signals.has('target-blank')) score += 1;
    const extraPages = Math.min(2, entry.sourcePages.size - 1);
    if (extraPages > 0) {
      score += extraPages;
      signals.push(`extra-source-pages:${extraPages}`);
    }
    if (entry.deepHost) {
      score -= 2;
      signals.push('deep-hostname');
    }
    candidates.push({ domain, score, signals, sourcePages: [...entry.sourcePages].sort() });
  }
  candidates.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  return {
    candidates,
    excluded: [...excluded.entries()]
      .map(([domain, reason]) => ({ domain, reason }))
      .sort((a, b) => a.domain.localeCompare(b.domain)),
  };
}
