/**
 * Agency -> client discovery with fetching, ported from `discoverClients` in
 * `scripts/batch-audit.mjs`: portfolio index pages (from the homepage links,
 * else the sitemap), portfolio item pages when the index pages leave fewer than
 * three candidates, then one liveness GET per top candidate. Every request goes
 * through the collector's `fetchResource` with one shared budget
 * (`DISCOVERY_DEFAULTS.maxFetches` fetch() calls, liveness and redirect hops
 * included) and one run deadline, so running out is a `needs_manual` reason,
 * never an error. The result is the batch's `discovery.json` payload. The
 * caller keeps the gates that skip discovery (unreadable homepage, JS shell).
 */
import type { RemoteResource } from '@agentmarkup/core/score';
import {
  COLLECT_DEFAULTS,
  SAMPLE_PAGE_MAX_REDIRECTS,
  SECONDARY_MAX_REDIRECTS,
  createHostGate,
  fetchResource,
  type CollectOptions,
  type FetchBudget,
  type ResourceFetchOptions,
} from './collect.js';
import {
  canonicalizeAgencyUrl,
  creditsAgency,
  exclusionReasonFor,
  extractLinks,
  findPortfolioItemPages,
  findPortfolioLocs,
  findPortfolioPages,
  rankClientCandidates,
  sitemapLocs,
  type ClientCandidate,
  type ExcludedDomain,
  type SourcedLink,
} from './clients.js';
import { registrableDomain } from './registrable-domain.js';

export const DISCOVERY_DEFAULTS = {
  /** fetch() calls per agency: sitemap child, portfolio and item pages, liveness GETs, redirect hops. */
  maxFetches: 12,
  /** Wall-clock budget for one agency's discovery, host-gate waits included. */
  deadlineMs: 40_000,
  maxPortfolioPages: 3,
  maxItemPages: 6,
  /** Item pages stop while this many fetches remain, so the liveness checks still run. */
  livenessReserve: 4,
  /** Top candidates checked for liveness. */
  livenessCap: 5,
  maxClients: 3,
  pageMaxBytes: 1024 * 1024,
  /** The liveness body is read for the credit-back check, so it gets the page cap. */
  livenessMaxBytes: 1024 * 1024,
  /** Added to a live candidate whose homepage names the agency's domain. */
  creditBoost: 2,
} as const;

const BUDGET_ERROR = 'Checker request budget exhausted.';
const DEADLINE_ERROR = 'Checker time budget exhausted.';

/**
 * `yes` for 2xx; `blocked` for 403 or 429 (the site blocks bots: still pickable,
 * ranked after every `yes`); `no` for anything else; `unchecked` when the fetch
 * budget or the deadline ran out first.
 */
export type ClientLiveness = 'yes' | 'blocked' | 'no' | 'unchecked';

/**
 * Why a discovery needs manual review: fewer than three picks, plus what cut it
 * short. `shared-client` (a pick another agency claimed first) and
 * `discovery-skipped` (unreadable or JavaScript-shell homepage) are set by the
 * batch script, which owns the claims and the skip gates.
 */
export type NeedsManualReason = 'too-few-picks' | 'fetch-budget' | 'deadline' | 'shared-client' | 'discovery-skipped';

export interface DiscoveryPageFetch {
  url: string;
  role: 'homepage' | 'sitemap-child' | 'portfolio' | 'portfolio-item';
  status: number | null;
  outcome?: string;
  error?: string;
}

export interface LivenessCheck {
  domain: string;
  url: string;
  status: number | null;
  finalUrl: string;
  error: string | null;
  alive: ClientLiveness;
  /** The live homepage names the agency's registrable domain (a booster, never a filter). */
  credit: boolean;
  /** `yes` or `blocked`, and the final host is not excluded. */
  accepted: boolean;
  reason: string | null;
}

export interface ClientPick {
  domain: string;
  url: string;
  /** Candidate score plus the credit-back boost. */
  score: number;
  signals: string[];
  sourcePages: string[];
  source: 'discovery';
  alive: 'yes' | 'blocked';
}

export interface ClientDiscovery {
  agency: string;
  /** Set when the homepage redirected to another registrable domain. */
  agencyFinalDomain?: string;
  pagesFetched: DiscoveryPageFetch[];
  candidates: ClientCandidate[];
  excluded: ExcludedDomain[];
  picked: ClientPick[];
  liveness: LivenessCheck[];
  /** fetch() calls discovery made; the homepage, fetched by the collector, is not one. */
  fetches: number;
  maxFetches: number;
  /** Picks dropped because another agency in the batch claimed them first (filled by the batch). */
  shared_with: Array<{ domain: string; shared_with: string }>;
  needs_manual: boolean;
  needs_manual_reasons: NeedsManualReason[];
  note: string | null;
}

export interface DiscoveryInput {
  /** The agency's registrable domain (the batch key). */
  agencyDomain: string;
  /** The homepage's final URL, after redirects. */
  homepageUrl: string;
  homepageStatus: number | null;
  homepageHtml: string;
  /** The collected sitemap body, when it was read. */
  sitemapXml?: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const LIVENESS_ORDER: Record<'yes' | 'blocked', number> = { yes: 0, blocked: 1 };

/**
 * Discovers up to three client sites for one agency. `options` are the
 * collector's (`hostGate`, `minGapMs`, `fetchImpl`, `now`, `userAgent`,
 * `perFetchMs`); `maxFetches` and `deadlineMs` default to the discovery values.
 */
export async function discoverAgencyClients(
  input: DiscoveryInput,
  options: CollectOptions = {}
): Promise<ClientDiscovery> {
  const now = options.now ?? Date.now;
  const maxFetches = options.maxFetches ?? DISCOVERY_DEFAULTS.maxFetches;
  const budget: FetchBudget = { fetches: 0, maxFetches };
  const fetchOptions: ResourceFetchOptions = {
    ...options,
    now,
    maxFetches,
    deadlineMs: options.deadlineMs ?? DISCOVERY_DEFAULTS.deadlineMs,
    // One gate for every request of this run, so the per-host gap holds when the caller passes none.
    hostGate: options.hostGate ?? createHostGate(options.minGapMs ?? COLLECT_DEFAULTS.minGapMs, now),
    budget,
    runStartedAt: now(),
  };
  const stops = new Set<NeedsManualReason>();
  const noteStop = (resource: RemoteResource) => {
    if (resource.error === BUDGET_ERROR) stops.add('fetch-budget');
    if (resource.error === DEADLINE_ERROR) stops.add('deadline');
  };

  const discovery: ClientDiscovery = {
    agency: input.agencyDomain,
    pagesFetched: [],
    candidates: [],
    excluded: [],
    picked: [],
    liveness: [],
    fetches: 0,
    maxFetches,
    shared_with: [],
    needs_manual: true,
    needs_manual_reasons: [],
    note: null,
  };

  const base = input.homepageUrl;
  const origin = new URL(base).origin;
  // Links come from the final homepage, so an agency that redirected to another
  // registrable domain has that domain excluded too, or its own site ranks as a client.
  const finalDomain = registrableDomain(new URL(base).hostname);
  const agencyDomains = [...new Set([input.agencyDomain, finalDomain].filter(Boolean))];
  if (finalDomain && finalDomain !== input.agencyDomain) discovery.agencyFinalDomain = finalDomain;
  const homeLinks: SourcedLink[] = extractLinks(input.homepageHtml, base).map((link) => ({
    ...link,
    sourceUrl: base,
    portfolio: false,
  }));
  const links: SourcedLink[] = [...homeLinks];
  const portfolioLinks: SourcedLink[] = [];
  const followed = new Set<string>([base]);
  // Every page read successfully, with or without links: the site-wide denominator.
  const readPages = new Set<string>([base]);
  discovery.pagesFetched.push({ url: base, role: 'homepage', status: input.homepageStatus });

  const fetchPage = async (url: string, role: DiscoveryPageFetch['role'], maxRedirects: number) => {
    const page = await fetchResource(url, {
      ...fetchOptions,
      maxRedirects,
      maxResponseBytes: DISCOVERY_DEFAULTS.pageMaxBytes,
    });
    noteStop(page);
    discovery.pagesFetched.push({
      url,
      role,
      status: page.status > 0 ? page.status : null,
      ...(page.outcome ? { outcome: page.outcome } : {}),
      ...(page.error ? { error: page.error } : {}),
    });
    return page;
  };

  const readPortfolioPage = async (url: string, role: 'portfolio' | 'portfolio-item') => {
    const page = await fetchPage(url, role, SAMPLE_PAGE_MAX_REDIRECTS);
    const pageBase = page.finalUrl || url;
    followed.add(url);
    followed.add(pageBase);
    if (page.outcome !== 'ok') return;
    readPages.add(pageBase);
    if (!page.body) return;
    for (const link of extractLinks(page.body, pageBase)) {
      const sourced: SourcedLink = { ...link, sourceUrl: pageBase, portfolio: true };
      links.push(sourced);
      portfolioLinks.push(sourced);
    }
  };

  let portfolioUrls = findPortfolioPages(homeLinks, origin, DISCOVERY_DEFAULTS.maxPortfolioPages);
  if (portfolioUrls.length === 0 && input.sitemapXml) {
    let locs = sitemapLocs(input.sitemapXml);
    if (input.sitemapXml.toLowerCase().includes('<sitemapindex') && locs.length > 0) {
      const child = await fetchPage(locs[0], 'sitemap-child', SECONDARY_MAX_REDIRECTS);
      locs = child.outcome === 'ok' && child.body ? sitemapLocs(child.body) : [];
    }
    portfolioUrls = findPortfolioLocs(locs, origin, DISCOVERY_DEFAULTS.maxPortfolioPages);
  }
  for (const url of portfolioUrls) {
    await readPortfolioPage(url, 'portfolio');
  }

  let ranking = rankClientCandidates(links, agencyDomains, undefined, { fetchedPages: readPages });
  if (ranking.candidates.length < DISCOVERY_DEFAULTS.maxClients) {
    // Item pages linked from the index pages first, then from the homepage.
    const items = findPortfolioItemPages(
      [...portfolioLinks, ...homeLinks],
      origin,
      followed,
      DISCOVERY_DEFAULTS.maxItemPages
    );
    for (const url of items) {
      if (budget.maxFetches - budget.fetches <= DISCOVERY_DEFAULTS.livenessReserve) {
        stops.add('fetch-budget');
        break;
      }
      await readPortfolioPage(url, 'portfolio-item');
    }
    if (items.length > 0) ranking = rankClientCandidates(links, agencyDomains, undefined, { fetchedPages: readPages });
  }
  discovery.candidates = ranking.candidates;
  discovery.excluded = ranking.excluded;

  const checked: Array<{ candidate: ClientCandidate; check: LivenessCheck; order: number }> = [];
  for (const [order, candidate] of ranking.candidates.slice(0, DISCOVERY_DEFAULTS.livenessCap).entries()) {
    const url = `https://${candidate.domain}/`;
    const live = await fetchResource(url, {
      ...fetchOptions,
      maxRedirects: SAMPLE_PAGE_MAX_REDIRECTS,
      maxResponseBytes: DISCOVERY_DEFAULTS.livenessMaxBytes,
    });
    noteStop(live);
    const status = live.status > 0 ? live.status : null;
    const stopped = live.error === BUDGET_ERROR || live.error === DEADLINE_ERROR;
    const alive: ClientLiveness = stopped
      ? 'unchecked'
      : status !== null && status >= 200 && status < 300
        ? 'yes'
        : status === 403 || status === 429
          ? 'blocked'
          : 'no';
    const finalHost = hostOf(live.finalUrl);
    const excludedReason = finalHost ? exclusionReasonFor(finalHost, agencyDomains) : 'not-a-domain';
    const accepted = (alive === 'yes' || alive === 'blocked') && !excludedReason;
    const check: LivenessCheck = {
      domain: candidate.domain,
      url,
      status,
      finalUrl: live.finalUrl,
      error: live.error ?? null,
      alive,
      credit: alive === 'yes' && typeof live.body === 'string' && creditsAgency(live.body, agencyDomains),
      accepted,
      reason: accepted
        ? null
        : stopped
          ? live.error === DEADLINE_ERROR
            ? 'deadline'
            : 'fetch-budget'
          : (excludedReason ?? (live.error ? `fetch ${live.error}` : `status ${status}`)),
    };
    discovery.liveness.push(check);
    checked.push({ candidate, check, order });
  }

  const ranked = checked
    .filter((entry) => entry.check.accepted)
    .map((entry) => ({
      ...entry,
      alive: entry.check.alive as 'yes' | 'blocked',
      score: entry.candidate.score + (entry.check.credit ? DISCOVERY_DEFAULTS.creditBoost : 0),
    }))
    .sort((a, b) => LIVENESS_ORDER[a.alive] - LIVENESS_ORDER[b.alive] || b.score - a.score || a.order - b.order);
  for (const entry of ranked) {
    if (discovery.picked.length >= DISCOVERY_DEFAULTS.maxClients) break;
    const domain = registrableDomain(hostOf(entry.check.finalUrl)) || entry.candidate.domain;
    if (discovery.picked.some((pick) => pick.domain === domain)) continue;
    discovery.picked.push({
      domain,
      url: canonicalizeAgencyUrl(entry.check.finalUrl || entry.check.url),
      score: entry.score,
      signals: entry.check.credit ? [...entry.candidate.signals, 'credit-back'] : entry.candidate.signals,
      sourcePages: entry.candidate.sourcePages,
      source: 'discovery',
      alive: entry.alive,
    });
  }

  discovery.fetches = budget.fetches;
  discovery.needs_manual = discovery.picked.length < DISCOVERY_DEFAULTS.maxClients;
  discovery.needs_manual_reasons = discovery.needs_manual ? ['too-few-picks', ...[...stops].sort()] : [];
  return discovery;
}
