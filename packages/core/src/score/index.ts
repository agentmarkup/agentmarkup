// Public entry of the agentmarkup score engine (`@agentmarkup/core/score`, also
// re-exported from the main `@agentmarkup/core` entry). DOM-free, transport-free,
// browser-safe: no `node:` imports, no `Date.now()`.
export type {
  AnalysisStatus,
  BonusSummary,
  CheckAvailability,
  CheckBucket,
  CheckClientSentence,
  CheckDefinition,
  CheckPlatformFixes,
  CheckResult,
  CheckStatus,
  CheckTier,
  EvaluateOptions,
  EvidenceResourceKey,
  FetchSummary,
  Grade,
  NotApplicableCheck,
  RemoteResource,
  ReportComparison,
  ResourceOutcome,
  ScoreRange,
  ScoreReport,
  ScoredCheck,
  SiteEvaluation,
  SiteEvidence,
  SitePlatform,
  SurfaceDetection,
  SurfaceId,
  TierSummary,
} from './types.js';
export {
  AI_SEARCH_AGENTS,
  BASELINE_JSONLD_TYPES,
  CHALLENGE_MARKERS,
  IDENTITY_TYPES,
  INJECTION_PATTERNS,
  NON_ORGANIZATION_IDENTITY_TYPES,
  NOT_FOUND_PROBE_ACCEPT,
  NOT_FOUND_PROBE_PATH,
  SCORE_CATALOG,
  SCORE_CATALOG_VERSION,
  TRAINING_CRAWLERS,
  catalogChecksForTier,
  catalogIndexOf,
  getCheckDefinition,
  implementedChecks,
} from './catalog.js';
export {
  BONUS_CAP,
  BONUS_PER_SIGNAL,
  GRADE_BANDS,
  GRADE_LABELS,
  POOLS,
  SCORE_FORMULA_VERSION,
  TOP_FIXES_LIMIT,
  compareReports,
  estimatedGain,
  gradeFor,
  isEligible,
  majorVersion,
  rankTopFixes,
  reportsComparable,
  roundTo,
  scoreChecks,
  scoreRange,
} from './formula.js';
export type { GainContext } from './formula.js';
export { evaluateSiteChecks, detectPlatform, detectSurfaces } from './evaluate.js';
export {
  MAX_EVALUATED_BODY_CHARS,
  WORKER_ERROR_MESSAGES,
  classifyResource,
  findChallengeMarker,
  isHtmlBody,
  isMarkdownResource,
  isTextResource,
  readEvaluatedBody,
  splitFrontmatter,
} from './evidence.js';
export type { EvaluatedBody } from './evidence.js';
export {
  buildMarkdownUrl,
  findFirstInternalLink,
  findMarkdownAlternateUrl,
  findSitemapUrl,
  resolveSameOriginUrl,
} from './discover.js';
export {
  extractBodyText,
  looksLikeClientShell,
  normalizeBodyForComparison,
  parseContentSignal,
} from './html-lite.js';
export { renderClientSummary } from './client-summary.js';
export type { ClientSummaryOptions } from './client-summary.js';
