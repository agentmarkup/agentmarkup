// Shared types for the agentmarkup score engine (catalog + formula + evaluators).
//
// Everything here is DOM-free and transport-free: the engine consumes a recorded
// `SiteEvidence` (the shape the website checker worker and the audit collector
// produce) and never fetches anything itself.

export type CheckTier = 'required' | 'recommended' | 'bonus';

export type CheckBucket =
  | 'reachability'
  | 'content'
  | 'navigation'
  | 'controls'
  | 'identity'
  | 'discovery';

/**
 * `pass` (fraction 1), `partial` (0 < f < 1) and `fail` (0) are eligible and sit in
 * the denominator. `na`, `unverified` and `not-measured` leave the denominator.
 */
export type CheckStatus =
  | 'pass'
  | 'partial'
  | 'fail'
  | 'na'
  | 'unverified'
  | 'not-measured';

/**
 * `now` = implemented in this catalog version with zero extra fetches.
 * `catalog-2.0` = needs one named extra fetch, a catalog MAJOR decision.
 * `later` = listed for parity with the Ora catalog, always `not-measured`.
 */
export type CheckAvailability = 'now' | 'catalog-2.0' | 'later';

export type SurfaceId = 'api' | 'mcp' | 'commerce' | 'forms' | 'markdown';

/**
 * Outcome of one fetched resource, decided in one place (`classifyResource`):
 * - `absent`: the resource was never requested (no sample link, no markdown URL)
 * - `unverified`: status 0, error set, 2xx with a null body and no challenge
 *   header, skipped, or 429/5xx without challenge markers (transport noise, never
 *   a finding)
 * - `challenge`: any status carrying a published challenge header
 *   (`findChallengeHeader`), a 2xx included; or 401/403/405/429/503/511
 *   (`CHALLENGE_STATUSES`) carrying a body marker (`findChallengeMarker`)
 * - `not-found`: 404 or 410
 * - `http-error`: any other completed non-2xx (including 3xx on the probe)
 * - `ok`: 2xx with a body
 */
export type ResourceOutcome =
  | 'absent'
  | 'unverified'
  | 'challenge'
  | 'not-found'
  | 'http-error'
  | 'ok';

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export type AnalysisStatus = 'complete' | 'partial' | 'blocked';

export type SitePlatform = 'wordpress' | 'webflow' | 'squarespace' | 'wix';

export type EvidenceResourceKey =
  | 'homepage'
  | 'homepageMarkdown'
  | 'llmsTxt'
  | 'robotsTxt'
  | 'sitemap'
  | 'notFoundProbe'
  | 'samplePage'
  | 'samplePageMarkdown';

export interface RemoteResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  body: string | null;
  error?: string;
  xRobotsTag?: string | null;
  /** Wall-clock time of the fetch, set on success and on failure. */
  durationMs?: number;
  /** Redirect hops followed. */
  hops?: number;
  /** True when the fetch was never started (budget exhausted). */
  skipped?: boolean;
  /** Worker-side classification, identical to core's `classifyResource`. */
  outcome?: ResourceOutcome;
  /** Allowlisted response headers (lowercase names, values capped at 512 chars). */
  headers?: Record<string, string>;
  /** Byte length of the body before any drop or truncation. */
  bodyBytes?: number;
  /** True when a 404/410 body was dropped before serialization. */
  bodyDropped?: boolean;
}

export interface FetchSummary {
  analysisStatus: AnalysisStatus;
  /** Resource keys that did not complete. */
  unverified: string[];
  elapsedMs?: number;
  fetches?: number;
  hops?: number;
  d1Statements?: number;
  samplePageUrl?: string | null;
}

/**
 * The eight fetches the website checker already makes, as recorded by the worker
 * (`SiteCheckResponse` is a superset of this) or by the audit collector.
 */
export interface SiteEvidence {
  targetUrl: string;
  origin: string;
  fetchedAt: string;
  normalizedFrom?: string | null;
  homepage: RemoteResource;
  homepageMarkdown: RemoteResource | null;
  llmsTxt: RemoteResource;
  robotsTxt: RemoteResource;
  sitemap: RemoteResource | null;
  sitemapUrl: string | null;
  sitemapSource: 'robots' | 'default' | null;
  notFoundProbe?: RemoteResource | null;
  samplePage: RemoteResource | null;
  samplePageMarkdown: RemoteResource | null;
  fetchSummary?: FetchSummary;
}

export interface CheckClientSentence {
  pass: string;
  fail: string;
  /** For a partial result; without it the partial line names the check and quotes its evidence. */
  partial?: string;
  /** Sentences an evaluator selects with `CheckResult.sentenceVariant`, in place of fail and partial. */
  variants?: Readonly<Record<string, string>>;
}

/**
 * A secondary resource that answered a bot-challenge page (a challenge header on any
 * status, or a 401, 403, 405, 429, 503 or 511 with a body marker, as
 * reach.bot-detection reads them) and so decided a check: the fix is to
 * let agents through on that path, not to publish the resource.
 */
export interface CheckChallenge {
  resource: EvidenceResourceKey;
  url: string | null;
  status: number;
  /** The marker as quoted in the evidence, e.g. `cf-mitigated: challenge`. */
  marker: string;
}

export interface CheckPlatformFixes {
  wordpress: string;
  webflow: string;
  squarespace: string;
}

export interface CheckDefinition {
  id: string;
  name: string;
  tier: CheckTier;
  bucket: CheckBucket;
  /** Plain-language applicability rule (when the check leaves the denominator). */
  applicability: string;
  /** What is read, named by resource. */
  evidence: string;
  /** The exact rule with thresholds, as published on /score/. */
  rule: string;
  availability: CheckAvailability;
  /** The Ora check id(s) this row mirrors, or null when agentmarkup-only. */
  oraCounterpart: string | null;
  /** Surface the check needs; absent surface makes the check `na`. */
  surface?: SurfaceId;
  /** Bonus rows that are shown as error-level findings but never subtract. */
  upsideOnly?: boolean;
  clientSentence: CheckClientSentence;
  action: string;
  fixes: CheckPlatformFixes;
  docUrl: string;
  agentmarkupHelp: string;
}

export interface CheckResult {
  id: string;
  tier: CheckTier;
  status: CheckStatus;
  /** 0..1 for pass/partial/fail, null otherwise. */
  fraction: number | null;
  /** Counts, ids, URLs, attribute and header values only. Never raw HTML. */
  evidence: string;
  /** Reason code for `na`, `unverified` and `not-measured`. */
  reason?: string;
  /** Resources the decision read; a transport failure there can never yield `fail`. */
  resources?: EvidenceResourceKey[];
  /** Set when a secondary resource answered a bot challenge and that answer decided the result. */
  challenge?: CheckChallenge;
  /** A key of the catalog's `clientSentence.variants` that describes this result better than fail or partial. */
  sentenceVariant?: string;
}

export interface ScoredCheck extends CheckResult {
  /** Estimated score gain if the check reached fraction 1; null when it already did. */
  estGain: number | null;
}

export interface TierSummary {
  earned: number;
  available: number;
  passing: number;
  total: number;
}

export interface BonusSummary {
  points: number;
  signals: number;
  cap: number;
}

export interface ScoreRange {
  pessimistic: number;
  optimistic: number;
}

export interface SurfaceDetection {
  api: boolean;
  mcp: boolean;
  commerce: boolean;
  forms: boolean;
  markdown: boolean;
}

export interface NotApplicableCheck {
  id: string;
  reason: string;
}

/**
 * Why a run is `blocked`: `unverified` = the homepage fetch did not complete (a
 * re-run may succeed); `http-status` = the homepage answered a final non-2xx status
 * such as 404 (a re-run changes nothing until the site root serves a page).
 */
export type BlockedKind = 'unverified' | 'http-status';

/** Output of `evaluateSiteChecks`, the input `scoreChecks` prefers. */
export interface SiteEvaluation {
  checks: CheckResult[];
  blocked: boolean;
  /** null when not blocked. */
  blockedKind: BlockedKind | null;
  /** Set when blocked, and on a challenged homepage ("Agents cannot reach this site"). */
  blockedReason: string | null;
  /**
   * Every recorded resource whose fetch did not complete (`classifyResource` says
   * `unverified`), in payload order. A resource that was never requested is not listed.
   */
  unverifiedResources: EvidenceResourceKey[];
  targetUrl: string;
  samplePageUrl: string | null;
  fetchedAt: string;
  platform: SitePlatform | null;
  surfaces: SurfaceDetection;
}

export interface ScoreReport {
  catalogVersion: string;
  formulaVersion: string;
  analysisStatus: AnalysisStatus;
  /** null unless `blocked`. */
  blockedKind: BlockedKind | null;
  /** null unless `blocked`, e.g. "homepage answered HTTP 404". */
  blockedReason: string | null;
  /** null when `blocked`. */
  score: number | null;
  grade: Grade | null;
  label: string | null;
  /** Unrounded total to 2 dp, shown beside the integer. */
  raw: number | null;
  required: TierSummary;
  recommended: TierSummary;
  bonus: BonusSummary;
  checks: ScoredCheck[];
  topFixes: ScoredCheck[];
  unverifiedChecks: string[];
  /**
   * Resources whose fetch did not complete. Any entry makes the run `partial` even
   * when no check became unverified (an unverified sample page leaves content checks
   * judged on the homepage alone). Empty when scored from a bare `CheckResult[]`.
   */
  unverifiedResources: EvidenceResourceKey[];
  naChecks: NotApplicableCheck[];
  notMeasured: string[];
  /** Present on `partial` reports only. */
  range: ScoreRange | null;
  targetUrl: string | null;
  samplePageUrl: string | null;
  fetchedAt: string | null;
  platform: SitePlatform | null;
  surfaces: SurfaceDetection | null;
}

export interface EvaluateOptions {
  /** ISO timestamp used for freshness rules; defaults to `evidence.fetchedAt`. */
  now?: string;
}

export interface ReportComparison {
  comparable: boolean;
  reason: string | null;
  scoreDelta: number | null;
  previousGrade: Grade | null;
  currentGrade: Grade | null;
  changedChecks: Array<{
    id: string;
    previousStatus: CheckStatus;
    currentStatus: CheckStatus;
    previousFraction: number | null;
    currentFraction: number | null;
  }>;
}
