// The checker report's data model (spec 2026-11-09, sections 7.2 to 7.9 and 8).
//
// Pure and side-effect free. Every figure here is either a report field or a
// published decomposition of the engine's own per-check weights (section 7.2):
// a check's worth is its tier pool divided by the eligible checks in that tier,
// so the six areas add up to `required.earned + recommended.earned` and, with
// the bonus, to `report.raw`. Nothing here computes, rounds or invents a score.
import {
  BONUS_PER_SIGNAL,
  TOP_FIXES_LIMIT,
  WORKER_ERROR_MESSAGES,
  catalogIndexOf,
  getCheckDefinition,
  gradeFor,
  rankTopFixes,
  roundTo,
  unverifiedResourcesWithoutChecks,
  type CheckBucket,
  type CheckStatus,
  type CheckTier,
  type Grade,
  type ScoreReport,
  type ScoredCheck,
} from '@agentmarkup/core/score';

import { RESOURCE_LABELS, levelForCheck } from './check-copy';
import type { AuditItem, SiteCheckResponse } from './types';

/** Colour family of a report element; red (`action`) is reserved for required fails (H10). */
export type Tone = 'good' | 'attention' | 'action' | 'neutral';

/** Display order of the six areas (catalog buckets, 1:1). */
export const GROUP_ORDER: CheckBucket[] = [
  'reachability',
  'content',
  'controls',
  'navigation',
  'identity',
  'discovery',
];

const CHECK_STATUSES: readonly CheckStatus[] = [
  'pass',
  'partial',
  'fail',
  'na',
  'unverified',
  'not-measured',
];

export interface GroupSummary {
  bucket: CheckBucket;
  /** 1-based position in `GROUP_ORDER`. */
  order: number;
  /** Every check in the bucket, catalog order. */
  checks: ScoredCheck[];
  /** Sum of `checkWorth` over eligible required and recommended checks. */
  stake: number;
  /** Sum of `checkEarned` over eligible required and recommended checks. */
  earned: number;
  /** Sum of `checkEarned` over eligible bonus checks (shown separately, never lowers an area). */
  bonus: number;
  /** null when the area has no eligible required/recommended check; never 100 while a check is short. */
  pct: number | null;
  tone: Tone;
  hasRequiredFail: boolean;
  /** stake > 0 and no required/recommended check is partial, fail or unverified. */
  inPlace: boolean;
  counts: Record<CheckStatus, number>;
  /**
   * The area is not scored because the homepage answered a bot wall: no required or
   * recommended check is eligible or unverified, and at least one is `na` with reason
   * `homepage-blocked`.
   */
  allHomepageBlocked: boolean;
  /** A required or recommended check in the bucket could not be checked on this run. */
  hasUnverified: boolean;
}

function isEligibleStatus(status: CheckStatus): boolean {
  return status === 'pass' || status === 'partial' || status === 'fail';
}

function clamp01(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** The catalog bucket of a check id, or null for an id the catalog does not know. */
export function bucketOf(id: string): CheckBucket | null {
  return getCheckDefinition(id)?.bucket ?? null;
}

/**
 * Points a check is worth on this report: its tier pool split over the eligible
 * checks of that tier (80 / eligible required, 20 / eligible recommended), or the
 * fixed bonus per signal. Zero for a check outside the denominator.
 */
export function checkWorth(check: ScoredCheck, report: ScoreReport): number {
  if (!isEligibleStatus(check.status)) {
    return 0;
  }
  if (check.tier === 'required') {
    return report.required.total > 0 ? report.required.available / report.required.total : 0;
  }
  if (check.tier === 'recommended') {
    return report.recommended.total > 0 ? report.recommended.available / report.recommended.total : 0;
  }
  return BONUS_PER_SIGNAL;
}

/** Points a check earned on this report: worth times its credit fraction. */
export function checkEarned(check: ScoredCheck, report: ScoreReport): number {
  return checkWorth(check, report) * clamp01(check.fraction);
}

export function gradeTone(grade: Grade): Tone {
  if (grade === 'A+' || grade === 'A') {
    return 'good';
  }
  return grade === 'B' ? 'attention' : 'action';
}

/** Area tone: the grade band of its percent, but never red without a required fail (H10). */
export function groupTone(group: Pick<GroupSummary, 'pct' | 'hasRequiredFail'>): Tone {
  if (group.pct === null) {
    return 'neutral';
  }
  const tone = gradeTone(gradeFor(group.pct));
  return tone === 'action' && !group.hasRequiredFail ? 'attention' : tone;
}

function emptyCounts(): Record<CheckStatus, number> {
  const counts = {} as Record<CheckStatus, number>;
  for (const status of CHECK_STATUSES) {
    counts[status] = 0;
  }
  return counts;
}

function summarizeGroup(bucket: CheckBucket, checks: ScoredCheck[], report: ScoreReport): GroupSummary {
  let stake = 0;
  let earned = 0;
  let bonus = 0;
  let hasRequiredFail = false;
  let hasUnverified = false;
  let shortOrUnverified = false;
  const counts = emptyCounts();

  for (const check of checks) {
    counts[check.status] += 1;
    const scored = check.tier !== 'bonus';
    if (check.tier === 'required' && check.status === 'fail') {
      hasRequiredFail = true;
    }
    if (scored && check.status === 'unverified') {
      hasUnverified = true;
    }
    if (scored && (check.status === 'partial' || check.status === 'fail' || check.status === 'unverified')) {
      shortOrUnverified = true;
    }
    if (!isEligibleStatus(check.status)) {
      continue;
    }
    if (scored) {
      stake += checkWorth(check, report);
      earned += checkEarned(check, report);
    } else {
      bonus += checkEarned(check, report);
    }
  }

  const pct =
    stake === 0
      ? null
      : Math.abs(earned - stake) < 1e-9
        ? 100
        : Math.min(99, Math.round((100 * earned) / stake));

  // Not scored because of the bot wall: no required/recommended check is eligible or
  // waiting, and at least one of them left the denominator as `homepage-blocked`
  // (surface `na` rows such as no-commerce-surface may sit beside them).
  const scoredTier = checks.filter((check) => check.tier !== 'bonus');
  const allHomepageBlocked =
    scoredTier.some((check) => check.status === 'na' && check.reason === 'homepage-blocked') &&
    scoredTier.every((check) => !isEligibleStatus(check.status) && check.status !== 'unverified');

  return {
    bucket,
    order: GROUP_ORDER.indexOf(bucket) + 1,
    checks,
    stake,
    earned,
    bonus,
    pct,
    tone: groupTone({ pct, hasRequiredFail }),
    hasRequiredFail,
    inPlace: stake > 0 && !shortOrUnverified,
    counts,
    allHomepageBlocked,
    hasUnverified,
  };
}

/** The six areas in display order; `[]` for a blocked run (no figures, H3). */
export function groupReport(report: ScoreReport): GroupSummary[] {
  if (report.analysisStatus === 'blocked') {
    return [];
  }
  const byBucket = new Map<CheckBucket, ScoredCheck[]>(GROUP_ORDER.map((bucket) => [bucket, []]));
  for (const check of report.checks) {
    const bucket = bucketOf(check.id);
    if (bucket) {
      byBucket.get(bucket)?.push(check);
    }
  }
  return GROUP_ORDER.map((bucket) => summarizeGroup(bucket, byBucket.get(bucket) ?? [], report));
}

/** What the six areas add up to: the engine's required + recommended earned, to 2 dp. */
export function areaTotal(report: ScoreReport): number {
  return roundTo(report.required.earned + report.recommended.earned, 2);
}

/** A points figure at `dp` decimals with trailing zeros dropped: 82.02, 35.6, 80, 0.25. */
export function formatPoints(value: number, dp: 1 | 2 = 2): string {
  const rounded = value < 0 ? -roundTo(-value, dp) : roundTo(value, dp);
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

// ---------------------------------------------------------------------------
// Check display status and list ordering

export type CheckDisplayStatus =
  | 'fail-action'
  | 'fail-attention'
  | 'partial'
  | 'pass'
  | 'unverified'
  | 'na'
  | 'not-measured';

/**
 * A bonus check that is short (amber fail or partial). Bonus never enters an area
 * percentage (H9), so its chip and line use a neutral "extra" look instead of the
 * attention amber; otherwise a 100% area would sit next to amber chips.
 */
export function isUncountedExtra(check: ScoredCheck): boolean {
  if (check.tier !== 'bonus') return false;
  const status = displayStatus(check);
  return status === 'fail-attention' || status === 'partial';
}

/** The status a check line and chip show, from `levelForCheck` (required or upside-only fail = action). */
export function displayStatus(check: ScoredCheck): CheckDisplayStatus {
  switch (check.status) {
    case 'fail':
      return levelForCheck(check) === 'error' ? 'fail-action' : 'fail-attention';
    case 'partial':
      return 'partial';
    case 'pass':
      return 'pass';
    case 'unverified':
      return 'unverified';
    case 'na':
      return 'na';
    default:
      return 'not-measured';
  }
}

/** Estimated gain descending (no gain last), then catalog order, then id. */
export function compareForList(a: ScoredCheck, b: ScoredCheck): number {
  const gainDelta = (b.estGain ?? -1) - (a.estGain ?? -1);
  if (gainDelta !== 0) {
    return gainDelta;
  }
  const catalogDelta = catalogIndexOf(a.id) - catalogIndexOf(b.id);
  if (catalogDelta !== 0) {
    return catalogDelta;
  }
  return a.id.localeCompare(b.id);
}

const STATUS_RANK: Readonly<Record<CheckStatus, number>> = {
  fail: 0,
  partial: 1,
  unverified: 2,
  pass: 3,
  na: 4,
  'not-measured': 5,
};

function compareByStatusThenList(a: ScoredCheck, b: ScoredCheck): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || compareForList(a, b);
}

// ---------------------------------------------------------------------------
// Group-by views: Status and Tier (section 7.6)

export type StatusRowKey = 'fail' | 'partial' | 'unverified' | 'pass' | 'na' | 'not-measured';

export interface StatusRow {
  key: StatusRowKey;
  /** Checks in the row, `compareForList` order. */
  checks: ScoredCheck[];
  /**
   * `unverified` row only: the `unverified-<resource>` items for resources no
   * check waited on (rendered as title + detail). Empty elsewhere.
   */
  resourceItems: AuditItem[];
  /** Row figure: the number of checks (resource items are not counted). */
  count: number;
}

const STATUS_ROW_ORDER: readonly StatusRowKey[] = ['fail', 'partial', 'unverified', 'pass', 'na', 'not-measured'];

/** Rows of the Status view; empty rows are omitted, `[]` for a blocked run. */
export function statusRows(report: ScoreReport, items: AuditItem[]): StatusRow[] {
  if (report.analysisStatus === 'blocked') {
    return [];
  }
  const resourceOnly = new Set(unverifiedResourcesWithoutChecks(report).map((key) => `unverified-${key}`));
  const resourceItems = items.filter((item) => item.id.startsWith('unverified-') && resourceOnly.has(item.id));
  const rows: StatusRow[] = [];
  for (const key of STATUS_ROW_ORDER) {
    const checks = report.checks.filter((check) => check.status === key).sort(compareForList);
    const rowItems = key === 'unverified' ? resourceItems : [];
    if (checks.length === 0 && rowItems.length === 0) {
      continue;
    }
    rows.push({ key, checks, resourceItems: rowItems, count: checks.length });
  }
  return rows;
}

export interface TierRow {
  tier: CheckTier;
  /** Engine figure verbatim: tier earned, or bonus points. */
  earned: number;
  /** Engine figure verbatim: pool (80 / 20), or the bonus cap. */
  available: number;
  /** Required/recommended: eligible checks at full credit (engine); null for bonus. */
  passing: number | null;
  /** Required/recommended: eligible checks (engine); null for bonus. */
  total: number | null;
  /** Bonus: signals with any credit (engine); null for required/recommended. */
  signals: number | null;
  /** The tier's checks that have a status to show (pass, partial, fail, unverified): fail, partial, unverified, pass, each `compareForList`. */
  checks: ScoredCheck[];
}

/** Rows of the Tier view (required, recommended, bonus); `[]` for a blocked run. */
export function tierRows(report: ScoreReport): TierRow[] {
  if (report.analysisStatus === 'blocked') {
    return [];
  }
  const checksFor = (tier: CheckTier) =>
    report.checks
      .filter((check) => check.tier === tier && (isEligibleStatus(check.status) || check.status === 'unverified'))
      .sort(compareByStatusThenList);
  return [
    {
      tier: 'required',
      earned: report.required.earned,
      available: report.required.available,
      passing: report.required.passing,
      total: report.required.total,
      signals: null,
      checks: checksFor('required'),
    },
    {
      tier: 'recommended',
      earned: report.recommended.earned,
      available: report.recommended.available,
      passing: report.recommended.passing,
      total: report.recommended.total,
      signals: null,
      checks: checksFor('recommended'),
    },
    {
      tier: 'bonus',
      earned: report.bonus.points,
      available: report.bonus.cap,
      passing: null,
      total: null,
      signals: report.bonus.signals,
      checks: checksFor('bonus'),
    },
  ];
}

// ---------------------------------------------------------------------------
// Blocked and gated runs (section 7.9, table in 5.9)

export type BlockedKind =
  | 'timeout'
  | 'budget'
  | 'connection'
  | 'redirect-loop'
  | 'size-limit'
  | 'safety-rule'
  | 'http-status'
  // The homepage answered (a 429 or 5xx without challenge markers, or a 2xx
  // without a readable body), so the engine could not verify it; not a timeout.
  | 'server-status';

export interface BlockedCase {
  kind: BlockedKind;
  detail: 'loop' | 'no-location' | null;
  tone: Tone;
  rescan: boolean;
  httpStatus: number | null;
  lastHopHost: string | null;
}

type WorkerErrorMessage = (typeof WORKER_ERROR_MESSAGES)[number];

/**
 * Keyed by core's read-only `WORKER_ERROR_MESSAGES`: a renamed or added worker
 * string fails the type check instead of silently falling through.
 */
const WORKER_ERROR_KIND: Readonly<
  Record<WorkerErrorMessage, { kind: BlockedKind; detail: BlockedCase['detail'] }>
> = {
  'Request timed out.': { kind: 'timeout', detail: null },
  'Request failed.': { kind: 'connection', detail: null },
  'Response exceeded the checker size limit.': { kind: 'size-limit', detail: null },
  'Request was blocked by checker safety rules.': { kind: 'safety-rule', detail: null },
  'Too many redirects.': { kind: 'redirect-loop', detail: 'loop' },
  'Redirect response had no Location header.': { kind: 'redirect-loop', detail: 'no-location' },
  'Checker time budget exhausted.': { kind: 'timeout', detail: null },
  'Checker request budget exhausted.': { kind: 'budget', detail: null },
};

const BLOCKED_TONE: Readonly<Record<BlockedKind, Tone>> = {
  timeout: 'neutral',
  budget: 'neutral',
  connection: 'neutral',
  'redirect-loop': 'attention',
  'size-limit': 'attention',
  'safety-rule': 'neutral',
  'http-status': 'action',
  'server-status': 'neutral',
};

const BLOCKED_RESCAN: Readonly<Record<BlockedKind, boolean>> = {
  timeout: true,
  budget: true,
  connection: true,
  'redirect-loop': true,
  'size-limit': false,
  'safety-rule': false,
  'http-status': false,
  'server-status': true,
};

function isWorkerErrorMessage(value: string): value is WorkerErrorMessage {
  return (WORKER_ERROR_MESSAGES as readonly string[]).includes(value);
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function withoutWww(host: string): string {
  return host.replace(/^www\./, '');
}

/** A blocked case with the row's tone and Rescan flag. */
export function blocked(kind: BlockedKind, extra: Partial<BlockedCase> = {}): BlockedCase {
  return {
    kind,
    detail: null,
    tone: BLOCKED_TONE[kind],
    rescan: BLOCKED_RESCAN[kind],
    httpStatus: null,
    lastHopHost: null,
    ...extra,
  };
}

/** The status in the engine's blocked reason (`homepage answered HTTP 511 ...`), or null. */
export function blockedReasonStatus(report: Pick<ScoreReport, 'blockedReason'>): number | null {
  const status = report.blockedReason?.match(/HTTP (\d{3})/)?.[1];
  return status ? Number(status) : null;
}

/**
 * The status an unverified homepage answered with, when it did answer: no worker
 * error and a status above 0 (a 429 or 5xx without challenge markers, or a 2xx
 * without a readable body). Read from the recorded homepage, else from the
 * engine's reason. Null for a fetch that never completed.
 */
function answeredStatus(report: ScoreReport, homepage: SiteCheckResponse['homepage'] | null | undefined): number | null {
  if (homepage?.error) {
    return null;
  }
  if (homepage && typeof homepage.status === 'number' && Number.isFinite(homepage.status)) {
    return homepage.status > 0 ? homepage.status : null;
  }
  return blockedReasonStatus(report);
}

/** Which blocked row of section 5.9 applies; null unless the run is blocked. */
export function blockedCase(report: ScoreReport, result: SiteCheckResponse): BlockedCase | null {
  if (report.analysisStatus !== 'blocked') {
    return null;
  }
  if (report.blockedKind === 'http-status') {
    return blocked('http-status', { httpStatus: blockedReasonStatus(report) });
  }
  const homepage = result.homepage;
  if (homepage?.skipped) {
    return blocked('budget');
  }
  const answered = answeredStatus(report, homepage);
  if (answered !== null) {
    return blocked('server-status', { httpStatus: answered });
  }
  // The worker's error string; without one, the reason the engine recorded
  // ("homepage could not be verified in time (Request timed out)").
  const fromReason = report.blockedReason?.match(/\(([^)]+)\)$/)?.[1];
  const error = homepage?.error ?? (fromReason ? `${fromReason}.` : null);
  if (!error || !isWorkerErrorMessage(error)) {
    return blocked('timeout');
  }
  const { kind, detail } = WORKER_ERROR_KIND[error];
  if (kind === 'redirect-loop' && detail === 'loop') {
    const lastHop = hostnameOf(homepage?.finalUrl);
    const requested = hostnameOf(homepage?.requestedUrl) ?? hostnameOf(result.targetUrl);
    const lastHopHost =
      lastHop && requested && withoutWww(lastHop) !== withoutWww(requested) ? lastHop : null;
    return blocked(kind, { detail, lastHopHost });
  }
  // safety-rule never exposes a destination: the worker reports the requested URL as finalUrl.
  return blocked(kind, { detail });
}

export interface GatedInfo {
  /** HTTP status of the homepage answer, read from the `reach.bot-detection` evidence. */
  status: number | null;
  /** The answer carried a bot-challenge marker. */
  marker: boolean;
  /** The `reach.bot-detection` evidence verbatim (`HTTP 403, challenge marker "cf-mitigated: challenge"`). */
  evidence: string;
  /** Checks left out because they need the homepage (`na` with reason `homepage-blocked`). */
  affected: number;
}

/**
 * A scored run whose homepage answered a bot wall (401/403 or a challenge page).
 * Detected from `naChecks`, never from `blockedReason`, which the engine sets
 * only on blocked runs.
 */
export function gatedInfo(report: ScoreReport): GatedInfo | null {
  if (report.analysisStatus === 'blocked') {
    return null;
  }
  const affected = report.naChecks.filter((check) => check.reason === 'homepage-blocked').length;
  if (affected === 0) {
    return null;
  }
  const evidence = report.checks.find((check) => check.id === 'reach.bot-detection')?.evidence ?? '';
  const status = evidence.match(/HTTP (\d{3})/)?.[1];
  return {
    status: status ? Number(status) : null,
    marker: /challenge marker "/.test(evidence),
    evidence,
    affected,
  };
}

/** Report tone: the blocked case's, else the grade band (pessimistic end for a partial run, H13). */
export function reportTone(report: ScoreReport, blockedRun: BlockedCase | null): Tone {
  if (blockedRun) {
    return blockedRun.tone;
  }
  if (report.analysisStatus === 'partial' && report.range) {
    return gradeTone(gradeFor(report.range.pessimistic));
  }
  return report.grade ? gradeTone(report.grade) : 'neutral';
}

// ---------------------------------------------------------------------------
// Partial runs (section 5.8)

export interface PartialInfo {
  low: number;
  high: number;
  gradeLow: Grade;
  gradeHigh: Grade;
  /** Checks that could not be checked on this run. */
  unverified: number;
  /** Labels of resources that did not answer although no check waited on them. */
  resourceLabels: string[];
}

/** Range and counts for a partial run; null for complete and blocked runs. */
export function partialInfo(report: ScoreReport): PartialInfo | null {
  if (report.analysisStatus !== 'partial') {
    return null;
  }
  const low = report.range?.pessimistic ?? report.score;
  const high = report.range?.optimistic ?? report.score;
  if (low === null || high === null) {
    return null;
  }
  return {
    low,
    high,
    gradeLow: gradeFor(low),
    gradeHigh: gradeFor(high),
    unverified: report.unverifiedChecks.length,
    resourceLabels: unverifiedResourcesWithoutChecks(report).map((key) => RESOURCE_LABELS[key]),
  };
}

// ---------------------------------------------------------------------------
// Top fixes (section 8)

export interface FixPlan {
  /** `rankTopFixes(report.checks, TOP_FIXES_LIMIT)`, the engine's order. */
  all: ScoredCheck[];
  /** Ranks 1-3. */
  primary: ScoredCheck[];
  /** Ranks 4-5 (the "Then" line). */
  then: ScoredCheck[];
  atCap: boolean;
  /** At the cap and every ranked fix is a bonus signal: the list collapses to one line. */
  optionalOnly: boolean;
}

export function fixPlan(report: ScoreReport): FixPlan {
  const all = rankTopFixes(report.checks, TOP_FIXES_LIMIT);
  const atCap = report.score !== null && report.score >= 100;
  const optionalOnly = atCap && all.length > 0 && all.every((check) => check.tier === 'bonus');
  return {
    all,
    primary: optionalOnly ? [] : all.slice(0, 3),
    then: optionalOnly ? [] : all.slice(3),
    atCap,
    optionalOnly,
  };
}
