/**
 * Agency -> client discovery, pure functions over HTML and link records. The
 * fetching lives in `discover-clients.ts` (`discoverAgencyClients`); nothing
 * here is on the CLI or README surface until recall is proven on real agencies.
 */
import { tokenizeTags, type TagToken } from '@agentmarkup/core';
import {
  DEFAULT_EXCLUSIONS,
  GENERIC_BRAND_WORDS,
  type ExclusionLists,
  type ExclusionReason,
} from './clients-exclusions.js';
import { registrableDomain } from './registrable-domain.js';

/**
 * Where a link sits on its page: inside the page banner (`header`), a
 * navigation block (`nav`), the page footer (`footer`), or anywhere else (`main`).
 */
export type LinkRegion = 'header' | 'nav' | 'footer' | 'main';

export interface LinkRecord {
  /** Absolute URL, hash removed. */
  href: string;
  /** Visible text, whitespace collapsed, tags and entities removed. */
  text: string;
  wrapsImage: boolean;
  targetBlank: boolean;
  rel: string;
  /** The nearest enclosing banner, navigation or footer element; `main` otherwise. */
  region: LinkRegion;
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

/** Exclusions decided from where and how a domain is linked, not from what it is. */
export type HeuristicExclusionReason = 'homepage-only' | 'site-wide' | 'chrome-only';

export interface ExcludedDomain {
  domain: string;
  reason: ExclusionReason | 'agency-domain' | 'not-a-domain' | 'sibling-brand' | HeuristicExclusionReason;
  /** Heuristic exclusions keep the candidate's score, signals and source pages for review. */
  score?: number;
  signals?: string[];
  sourcePages?: string[];
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

const SKIPPED_HREF = /^(#|mailto:|tel:|javascript:|data:)/i;
const ASSET_PATH = /\.(png|jpe?g|gif|webp|svg|ico|css|js|xml|txt|json|pdf|zip|mp3|mp4|woff2?)$/i;
const MAX_LINK_TEXT_CHARS = 1000;
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
/** Tracked for regions: the landmarks plus the sectioning elements that scope header and footer. */
const REGION_ELEMENTS = new Set(['header', 'nav', 'footer', 'article', 'aside', 'main', 'section']);
const LANDMARK_ROLES = new Map<string, LinkRegion>([
  ['banner', 'header'],
  ['navigation', 'nav'],
  ['contentinfo', 'footer'],
]);
const SECTIONING_ROLES = new Set(['main', 'article', 'region', 'complementary']);

interface RegionFrame {
  name: string;
  /** The region of links inside this element. */
  region: LinkRegion;
  /** Inside article, aside, main, nav or section: a nested header or footer is not the page's. */
  sectioned: boolean;
  /** For a landmark `div`: the div nesting depth it opened at. */
  divDepth: number;
}

/**
 * The nearest enclosing banner, navigation or footer while walking tokens in
 * order. `<header>` and `<footer>` count only outside article, aside, main,
 * nav and section (the ARIA banner/contentinfo mapping), so an article header
 * on a portfolio item page stays `main`. A `div` counts through
 * `role="banner|navigation|contentinfo"` and closes at its matching `</div>`.
 * Every frame is pushed and popped once, so a walk is linear even when
 * thousands of elements never close.
 */
class RegionTracker {
  private readonly frames: RegionFrame[] = [];
  private readonly byName = new Map<string, number[]>();
  private readonly divFrames: number[] = [];
  private divDepth = 0;

  get region(): LinkRegion {
    return this.frames[this.frames.length - 1]?.region ?? 'main';
  }

  private get sectioned(): boolean {
    return this.frames[this.frames.length - 1]?.sectioned ?? false;
  }

  private push(name: string, own: LinkRegion | null, sectioning: boolean): void {
    const index = this.frames.length;
    this.frames.push({
      name,
      region: own ?? this.region,
      sectioned: this.sectioned || sectioning,
      divDepth: name === 'div' ? this.divDepth : 0,
    });
    const list = this.byName.get(name);
    if (list) list.push(index);
    else this.byName.set(name, [index]);
    if (name === 'div') this.divFrames.push(index);
  }

  /** Pops the frame at `index` and every unclosed frame above it. */
  private popTo(index: number): void {
    while (this.frames.length > index) {
      const frame = this.frames.pop() as RegionFrame;
      this.byName.get(frame.name)?.pop();
      if (frame.name === 'div') this.divFrames.pop();
    }
  }

  visit(token: TagToken): void {
    const { name } = token;
    if (name === 'div') {
      if (token.closing) {
        const top = this.divFrames[this.divFrames.length - 1];
        if (top !== undefined && this.frames[top].divDepth === this.divDepth) this.popTo(top);
        this.divDepth = Math.max(0, this.divDepth - 1);
        return;
      }
      // A self-closing `<div/>` still opens a div in HTML.
      this.divDepth += 1;
      const roles = (token.attrs.role ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const landmark = roles.map((role) => LANDMARK_ROLES.get(role)).find((region) => region !== undefined);
      if (landmark) this.push('div', landmark, landmark === 'nav');
      else if (roles.some((role) => SECTIONING_ROLES.has(role))) this.push('div', null, true);
      return;
    }
    if (!REGION_ELEMENTS.has(name)) return;
    if (token.closing) {
      const list = this.byName.get(name);
      const top = list?.[list.length - 1];
      if (top !== undefined) this.popTo(top);
      return;
    }
    if (name === 'nav') this.push(name, 'nav', true);
    else if (name === 'header' || name === 'footer') this.push(name, this.sectioned ? null : name, false);
    else this.push(name, null, true);
  }
}

/** `<!-- ... -->` spans removed (the tokenizer skips comments, so they reach the text gaps). */
function stripComments(value: string): string {
  if (!value.includes('<!--')) return value;
  let out = '';
  let last = 0;
  for (;;) {
    const open = value.indexOf('<!--', last);
    if (open === -1) break;
    out += value.slice(last, open);
    const close = value.indexOf('-->', open + 4);
    if (close === -1) return out;
    last = close + 3;
  }
  return out + value.slice(last);
}

interface OpenAnchor {
  token: TagToken;
  region: LinkRegion;
  text: string;
  wrapsImage: boolean;
  /** End of the last token inside the anchor: the next text gap starts here. */
  lastEnd: number;
  /** The last token opened a script or style, whose raw text is not link text. */
  skipGap: boolean;
}

function appendGap(anchor: OpenAnchor, html: string, until: number): void {
  if (anchor.skipGap || until <= anchor.lastEnd || anchor.text.length >= MAX_LINK_TEXT_CHARS) return;
  const room = MAX_LINK_TEXT_CHARS - anchor.text.length;
  anchor.text += ` ${stripComments(html.slice(anchor.lastEnd, Math.min(until, anchor.lastEnd + room)))}`;
}

function resolveLinkHref(href: string, baseUrl: string): string | null {
  let resolved: URL;
  try {
    resolved = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
  if (ASSET_PATH.test(resolved.pathname)) return null;
  resolved.hash = '';
  return resolved.toString();
}

/**
 * Every `<a href>` in document order with its text, resolved against `baseUrl`,
 * and the region it sits in. Skips the hrefs `findFirstInternalLink` skips
 * (empty, `#`, mailto, tel, javascript, data) and asset paths; keeps external
 * links. One pass over core's linear tag tokenizer (no whole-document regex):
 * comments and script/style contents are not scanned for links, and an `<a>`
 * ends at its `</a>`, at the next `<a>` (HTML does not nest anchors) or at the
 * end of the document. Link text is capped at 1000 characters.
 */
export function extractLinks(html: string, baseUrl: string): LinkRecord[] {
  const links: LinkRecord[] = [];
  const regions = new RegionTracker();
  const resolved = new Map<string, string | null>();
  let open: OpenAnchor | null = null;

  const finish = (anchor: OpenAnchor, endAt: number) => {
    appendGap(anchor, html, endAt);
    const href = anchor.token.attrs.href?.trim() ?? '';
    if (!href || SKIPPED_HREF.test(href)) return;
    let target = resolved.get(href);
    if (target === undefined) {
      target = resolveLinkHref(href, baseUrl);
      resolved.set(href, target);
    }
    if (target === null) return;
    links.push({
      href: target,
      text: decodeEntities(anchor.text).replace(/\s+/g, ' ').trim(),
      wrapsImage: anchor.wrapsImage,
      targetBlank: anchor.token.attrs.target?.toLowerCase() === '_blank',
      rel: anchor.token.attrs.rel?.trim() ?? '',
      region: anchor.region,
    });
  };

  for (const token of tokenizeTags(html)) {
    if (open) {
      if (token.name === 'a') {
        finish(open, token.start);
        open = null;
      } else {
        appendGap(open, html, token.start);
        if (!token.closing && token.name === 'img') open.wrapsImage = true;
        open.lastEnd = token.end;
        open.skipGap = !token.closing && RAW_TEXT_ELEMENTS.has(token.name);
      }
    }
    regions.visit(token);
    if (token.name === 'a' && !token.closing) {
      open = { token, region: regions.region, text: '', wrapsImage: false, lastEnd: token.end, skipGap: false };
    }
  }
  if (open) finish(open, html.length);
  return links;
}

/**
 * First path segments of a portfolio index. Broadened after the second batch
 * pilot (2026-11-02): any segment ending in `-portfolio`
 * (`houston-marketing-portfolio`, `website-design-portfolio`), `our-clients`
 * and `digital-clients`.
 */
const PORTFOLIO_PATH =
  /^(portfolio|[a-z0-9-]+-portfolio|our-work|work|projects?|case-stud(y|ies)|clients?|our-clients|digital-clients|client-work|success-stories|results|showcase|recent-work|websites|gallery|web-design)$/i;
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
 * shallowest path; at most `limit` (default 3).
 */
export function findPortfolioPages(links: LinkRecord[], origin: string, limit = 3): string[] {
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
export function findPortfolioLocs(locs: string[], origin: string, limit = 3): string[] {
  const originUrl = new URL(origin).origin;
  const picked: Array<{ url: string; depth: number }> = [];
  // A Set, not a scan of `picked` per URL: a sitemap can list tens of thousands.
  const seen = new Set<string>();
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
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ url: key, depth: pathDepth(url) });
  }
  return picked
    .sort((a, b) => a.depth - b.depth)
    .slice(0, limit)
    .map((entry) => entry.url);
}

/** Parents of portfolio item pages: the index segments of PORTFOLIO_PATH that hold one page per project. */
const ITEM_PARENT = /^(portfolio|[a-z0-9-]+-portfolio|our-work|projects?|case-stud(y|ies)|work)$/i;
const ITEM_SLUG_SKIP = /^(page|category|categories|tag|tags|feed|amp|author)$/i;

function pathKey(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Same-origin portfolio item pages, `/portfolio/<slug>/`, `/<anything>-portfolio/<slug>/`,
 * `/our-work/<slug>/`, `/project(s)/<slug>/`, `/case-stud(y|ies)/<slug>/` or
 * `/work/<slug>/`, in link order, skipping the
 * URLs in `skip` (pages already fetched; a trailing slash does not matter) and
 * listing slugs such as `page` or `category`; at most `limit` (default 6).
 */
export function findPortfolioItemPages(
  links: ReadonlyArray<LinkRecord>,
  origin: string,
  skip: Iterable<string> = [],
  limit = 6
): string[] {
  const originUrl = new URL(origin).origin;
  const seen = new Set<string>();
  for (const entry of skip) {
    try {
      seen.add(pathKey(new URL(entry)));
    } catch {
      // Not a URL: nothing to skip.
    }
  }
  const picked: string[] = [];
  for (const link of links) {
    if (picked.length >= limit) break;
    let url: URL;
    try {
      url = new URL(link.href);
    } catch {
      continue;
    }
    if (url.origin !== originUrl) continue;
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
    if (segments.length !== 2 || !ITEM_PARENT.test(segments[0]) || ITEM_SLUG_SKIP.test(segments[1])) continue;
    url.search = '';
    url.hash = '';
    const key = pathKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(url.toString());
  }
  return picked;
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

const SIBLING_RUN = 6;

function brandLetters(domain: string): string {
  return (registrableDomain(domain).split('.')[0] ?? '').replace(/[^a-z]/g, '');
}

const genericRuns = new Map<string, boolean>();

/**
 * Whether `run` lies entirely inside some concatenation of generic business
 * words: it starts inside (or at the start of) one word, runs through any whole
 * words, and ends inside one (`etings` = market[ing] + s[tudio]). Memoized; the
 * runs are six letters, so the walk is a few thousand comparisons at most.
 */
function coveredByGenericWords(run: string): boolean {
  const cached = genericRuns.get(run);
  if (cached !== undefined) return cached;
  const words: ReadonlyArray<string> = GENERIC_BRAND_WORDS;
  // reachable[p]: run[0, p) is the tail of a generic word followed by whole generic words.
  const reachable = new Array<boolean>(run.length + 1).fill(false);
  let covered = false;
  for (const word of words) {
    for (let start = 0; start < word.length && !covered; start += 1) {
      const tail = word.slice(start);
      if (tail.length >= run.length) covered = tail.startsWith(run);
      else if (run.startsWith(tail)) reachable[tail.length] = true;
    }
  }
  for (let at = 1; at < run.length && !covered; at += 1) {
    if (!reachable[at]) continue;
    const rest = run.slice(at);
    for (const word of words) {
      if (word.startsWith(rest)) {
        covered = true;
        break;
      }
      if (rest.startsWith(word)) reachable[at + word.length] = true;
    }
  }
  covered ||= reachable[run.length];
  genericRuns.set(run, covered);
  return covered;
}

/**
 * The first six-letter run the two registrable second-level labels share,
 * letters only and case-insensitive (`infinihosting` and `infinimarketing`
 * share `infini`), or null. A run covered entirely by generic business words,
 * one (`studio`) or several back to back (`etings` in marketing+studio, `webstu`
 * in web+studio), does not count: it names a trade, not a brand. Generic-only
 * names such as `thewebstudios` are caught by genericSiblingWord instead.
 */
export function sharedBrandRun(candidateDomain: string, agencyDomain: string): string | null {
  const candidate = brandLetters(candidateDomain);
  const agency = brandLetters(agencyDomain);
  for (let i = 0; i + SIBLING_RUN <= candidate.length; i += 1) {
    const run = candidate.slice(i, i + SIBLING_RUN);
    if (agency.includes(run) && !coveredByGenericWords(run)) return run;
  }
  return null;
}

/** Words removed before judging a generic-only name: the generic words plus the article. */
const GENERIC_NAME_WORDS: ReadonlyArray<string> = [...GENERIC_BRAND_WORDS, 'the'];
/** A name keeping at most this many letters once its generic words are removed is generic-only. */
const GENERIC_NAME_MAX_LEFT = 2;
/** Longer labels are not DNS labels; the rule skips them rather than walk hostile input. */
const MAX_LABEL_LETTERS = 63;

/**
 * Splits a label into generic words, `the` and leftover letters, keeping as few
 * leftover letters as possible (`dallaswebstudios` = 6 letters + web + studios).
 * Returns the leftover count and the generic words used, `the` left out.
 */
function genericWordCover(label: string): { left: number; words: string[] } {
  const size = label.length;
  const left = new Array<number>(size + 1).fill(Number.POSITIVE_INFINITY);
  const from = new Array<number>(size + 1).fill(-1);
  const via = new Array<string | null>(size + 1).fill(null);
  left[0] = 0;
  for (let at = 0; at < size; at += 1) {
    if (left[at] + 1 < left[at + 1]) {
      left[at + 1] = left[at] + 1;
      from[at + 1] = at;
      via[at + 1] = null;
    }
    for (const word of GENERIC_NAME_WORDS) {
      const end = at + word.length;
      if (end <= size && left[at] < left[end] && label.startsWith(word, at)) {
        left[end] = left[at];
        from[end] = at;
        via[end] = word;
      }
    }
  }
  const words: string[] = [];
  for (let at = size; at > 0; at = from[at]) {
    const word = via[at];
    if (word && word !== 'the') words.unshift(word);
  }
  return { left: left[size], words };
}

/** `studios` and `studio` are one trade word for the shared-word test. */
function wordStem(word: string): string {
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * The generic word a generic-only candidate name shares with the agency, or
 * null: once generic words and `the` are removed, the candidate's label keeps
 * fewer than three letters, and one of its generic words is also in the agency's
 * label (`thewebstudios` under `dallaswebstudios` shares `web`). That is a name
 * on the agency's own network, not a client; `acmewebstudio` keeps `acme` and is
 * not one.
 */
export function genericSiblingWord(candidateDomain: string, agencyDomain: string): string | null {
  const candidate = brandLetters(candidateDomain);
  const agency = brandLetters(agencyDomain);
  if (!candidate || !agency || candidate.length > MAX_LABEL_LETTERS || agency.length > MAX_LABEL_LETTERS) return null;
  const cover = genericWordCover(candidate);
  if (cover.left > GENERIC_NAME_MAX_LEFT) return null;
  const agencyStems = new Set(genericWordCover(agency).words.map(wordStem));
  return cover.words.find((word) => agencyStems.has(wordStem(word))) ?? null;
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
  for (const own of agencyDomainSet(agencyDomain)) {
    if (sharedBrandRun(domain, own) || genericSiblingWord(domain, own)) return 'sibling-brand';
  }
  return null;
}

const VISIT_TEXT = /\b(visit|view|launch|see|open)\b.*\b(site|website|live|project)\b/i;
/** Social share endpoints (reddit /submit, tumblr /share, twitter /intent, facebook /sharer): never a client. */
const SHARE_PATH = /\/(share|sharer|submit|intent|shareArticle|share-offsite)(\.php)?(\/|$)/i;
/** A domain on every fetched page is a footer or vendor link once this many pages were fetched. */
const SITE_WIDE_MIN_PAGES = 3;

function isChrome(region: LinkRegion | undefined): boolean {
  return region === 'header' || region === 'nav' || region === 'footer';
}

export interface RankOptions {
  /**
   * Every page read successfully, links or not (the site-wide denominator).
   * Defaults to the distinct source pages of `links`, which misses a page that
   * kept no anchors.
   */
  fetchedPages?: Iterable<string>;
}

/**
 * External registrable domains scored by the signals a client link carries:
 * +3 on a portfolio page, +2 "visit site" text or the bare domain as text,
 * +2 wrapping an image, +1 target=_blank, -2 for a deep hostname that is not
 * `www`. Hard exclusions (agency subdomains, social and directory sites, CDNs,
 * platforms and vendors, sibling brands of the agency) are reported with their
 * reason; social share endpoints are skipped outright. A scored domain is then
 * excluded, with its score kept for review, when it is linked from every
 * fetched page and at least three were fetched (`site-wide`; a domain whose
 * link wraps an image in the main region, a client logo wall, is exempt), when every link
 * sits in a header, nav or footer and none wraps an image (`chrome-only`), or
 * when no portfolio page links it (`homepage-only`): a pick needs the
 * portfolio-page signal. Candidates sorted by score, then domain.
 */
export function rankClientCandidates(
  links: SourcedLink[],
  agencyDomain: AgencyDomains,
  lists: ExclusionLists = DEFAULT_EXCLUSIONS,
  options: RankOptions = {}
): CandidateRanking {
  const agency = [...agencyDomainSet(agencyDomain)];
  const pages = new Set(links.map((link) => link.sourceUrl));
  for (const page of options.fetchedPages ?? []) pages.add(page);
  const pageCount = pages.size;
  const excluded = new Map<string, ExcludedDomain['reason']>();
  const reasonByHost = new Map<string, ExcludedDomain['reason'] | null>();
  const perDomain = new Map<
    string,
    { signals: Set<string>; sourcePages: Set<string>; deepHost: boolean; outsideChrome: boolean; mainImage: boolean }
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
    let reason = reasonByHost.get(hostname);
    if (reason === undefined) {
      reason = exclusionReasonFor(hostname, agency, lists);
      reasonByHost.set(hostname, reason);
    }
    if (reason) {
      excluded.set(domain || hostname, reason);
      continue;
    }
    const entry = perDomain.get(domain) ?? {
      signals: new Set<string>(),
      sourcePages: new Set<string>(),
      deepHost: false,
      outsideChrome: false,
      mainImage: false,
    };
    if (link.portfolio) entry.signals.add('portfolio-page');
    const bare = hostname.replace(/^www\./, '');
    const text = link.text.trim().toLowerCase();
    if (VISIT_TEXT.test(text) || text === bare || text === domain || text === hostname) {
      entry.signals.add('visit-text');
    }
    if (link.wrapsImage) entry.signals.add('wraps-image');
    if (link.targetBlank) entry.signals.add('target-blank');
    if (!isChrome(link.region)) {
      entry.outsideChrome = true;
      if (link.wrapsImage) entry.mainImage = true;
    }
    if (hostname.split('.').length > 3 && !hostname.startsWith('www.')) entry.deepHost = true;
    entry.sourcePages.add(link.sourceUrl);
    perDomain.set(domain, entry);
  }

  const candidates: ClientCandidate[] = [];
  const heuristic: ExcludedDomain[] = [];
  for (const [domain, entry] of perDomain) {
    let score = 0;
    const signals = [...entry.signals].sort();
    if (entry.signals.has('portfolio-page')) score += 3;
    if (entry.signals.has('visit-text')) score += 2;
    if (entry.signals.has('wraps-image')) score += 2;
    if (entry.signals.has('target-blank')) score += 1;
    if (entry.deepHost) {
      score -= 2;
      signals.push('deep-hostname');
    }
    const sourcePages = [...entry.sourcePages].sort();
    let reason: HeuristicExclusionReason | null = null;
    if (pageCount >= SITE_WIDE_MIN_PAGES && entry.sourcePages.size >= pageCount && !entry.mainImage) reason = 'site-wide';
    else if (!entry.outsideChrome && !entry.signals.has('wraps-image')) reason = 'chrome-only';
    else if (!entry.signals.has('portfolio-page')) reason = 'homepage-only';
    if (reason) heuristic.push({ domain, reason, score, signals, sourcePages });
    else candidates.push({ domain, score, signals, sourcePages });
  }
  candidates.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));

  return {
    candidates,
    excluded: [...[...excluded.entries()].map(([domain, reason]): ExcludedDomain => ({ domain, reason })), ...heuristic].sort(
      (a, b) => a.domain.localeCompare(b.domain) || a.reason.localeCompare(b.reason)
    ),
  };
}

export interface ClientClaims<T> {
  /** The picks this agency keeps: unclaimed, or claimed earlier by this same agency. */
  picks: T[];
  /** Picks dropped because another agency claimed the domain first. */
  shared: Array<{ domain: string; shared_with: string }>;
  /** `registry` plus this agency's kept picks; the input map is not modified. */
  registry: Map<string, string>;
}

/**
 * Batch dedupe across agencies, first claim wins: `registry` maps a client's
 * registrable domain to the agency that claimed it. Returns the picks no other
 * agency has claimed, a `shared_with` note for each dropped pick, and the
 * updated registry for the next agency.
 */
export function claimClientDomains<T extends { domain: string }>(
  picks: ReadonlyArray<T>,
  registry: ReadonlyMap<string, string>,
  agency: string
): ClientClaims<T> {
  const owner = agency.toLowerCase();
  const next = new Map(registry);
  const kept: T[] = [];
  const shared: ClientClaims<T>['shared'] = [];
  for (const pick of picks) {
    const domain = registrableDomain(pick.domain);
    const claimedBy = next.get(domain);
    if (claimedBy !== undefined && claimedBy !== owner) {
      shared.push({ domain, shared_with: claimedBy });
      continue;
    }
    next.set(domain, owner);
    kept.push(pick);
  }
  return { picks: kept, shared, registry: next };
}

/**
 * Whether a page credits the agency: its HTML names one of the agency's
 * registrable domains (as a link or as text), on a hostname boundary so that
 * `agency.com` does not match `myagency.com` or `agency.company.com`.
 */
export function creditsAgency(html: string, agencyDomain: AgencyDomains): boolean {
  const lower = html.toLowerCase();
  const boundary = (code: number) =>
    !((code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 45);
  for (const domain of agencyDomainSet(agencyDomain)) {
    let at = lower.indexOf(domain);
    while (at !== -1) {
      const before = at === 0 ? 32 : lower.charCodeAt(at - 1);
      const after = at + domain.length >= lower.length ? 32 : lower.charCodeAt(at + domain.length);
      const dotThenLabel = after === 46 && !boundary(lower.charCodeAt(at + domain.length + 1));
      if (boundary(before) && boundary(after) && !dotThenLabel) return true;
      at = lower.indexOf(domain, at + 1);
    }
  }
  return false;
}
