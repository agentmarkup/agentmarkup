export { audit } from './audit.js';
export type { AuditOptions, AuditReport } from './audit.js';
export { run } from './cli.js';
export type { RunContext } from './cli.js';
export { renderJson, renderScoreLines, renderText } from './report.js';
export {
  COLLECTOR_USER_AGENT,
  COLLECTOR_VERSION,
  COLLECT_DEFAULTS,
  DISCOVERY_HEADER_NAMES,
  HOMEPAGE_MAX_REDIRECTS,
  HTML_ACCEPT,
  InvalidTargetUrlError,
  SAMPLE_PAGE_MAX_REDIRECTS,
  SECONDARY_MAX_REDIRECTS,
  collectSiteEvidence,
  createHostGate,
  createLimiter,
  fetchResource,
  normalizeTargetUrl,
  refetchUnverified,
  stripEvidenceBodies,
  type CollectOptions,
  type CollectedEvidence,
  type FetchBudget,
  type FetchLike,
  type HostGate,
  type RefetchOptions,
  type ResourceFetchOptions,
} from './collect.js';
export {
  canonicalizeAgencyUrl,
  claimClientDomains,
  creditsAgency,
  exclusionReasonFor,
  extractLinks,
  findPortfolioItemPages,
  findPortfolioLocs,
  findPortfolioPages,
  genericSiblingWord,
  rankClientCandidates,
  sharedBrandRun,
  sitemapLocs,
  type AgencyDomains,
  type CandidateRanking,
  type ClientCandidate,
  type ClientClaims,
  type ExcludedDomain,
  type HeuristicExclusionReason,
  type LinkRecord,
  type LinkRegion,
  type RankOptions,
  type SourcedLink,
} from './clients.js';
export {
  DISCOVERY_DEFAULTS,
  discoverAgencyClients,
  type ClientDiscovery,
  type ClientLiveness,
  type ClientPick,
  type DiscoveryInput,
  type DiscoveryPageFetch,
  type LivenessCheck,
  type NeedsManualReason,
} from './discover-clients.js';
export {
  CDN_ASSET,
  DEFAULT_EXCLUSIONS,
  GENERIC_BRAND_WORDS,
  PLATFORM_VENDOR,
  SOCIAL_DIRECTORY,
  type ExclusionLists,
  type ExclusionReason,
} from './clients-exclusions.js';
export { SECOND_LEVEL_LABELS, registrableDomain } from './registrable-domain.js';
export {
  countByLevel,
  worstLevel,
  type AuditFinding,
  type AuditLevel,
} from './findings.js';
export {
  safeFetch,
  isBlockedHostname,
  isFetchableUrl,
  parseIpv4,
  parseIpv6,
  type FetchOptions,
  type FetchResult,
} from './net.js';
export {
  ALL_AGENTS,
  BROWSER_CONTROL,
  CRAWLER_AGENTS,
  type CrawlerAgent,
} from './agents.js';
export {
  analyzeCrawlerAccess,
  type AgentProbe,
} from './analyzers/crawler-access.js';
export {
  analyzeJsDependence,
  analyzeMachineReadable,
  analyzeMarkdown,
  analyzeMetadata,
  analyzeRobots,
  analyzeSitemap,
} from './analyzers/site-checks.js';
