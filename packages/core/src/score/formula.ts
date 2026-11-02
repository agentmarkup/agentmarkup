// Formula v1.0.0 for the agentmarkup score (Ora-Essentials-shaped).
//
// Rules (published verbatim on /score/):
// 1. Eligible set per tier = checks with status pass, partial or fail. na, unverified
//    and not-measured leave the denominator.
// 2. required.earned = 80 x sum(f) / |E_required|; recommended.earned = 20 x sum(f) / |E_recommended|.
// 3. bonus.points = min(5, 0.25 x sum(f over bonus checks with status pass or partial)).
// 4. raw = required + recommended + bonus (2 dp); score = min(100, round-half-up(raw)).
// 5. Grade bands below are agentmarkup's own (assumed, not evidenced in any Ora file).
// 6. analysisStatus: complete / partial (any unverified) / blocked (homepage unverified).
// 7. A tier with zero eligible checks contributes 0.
// 8. catalogVersion and formulaVersion ride in every report; cross-major comparisons are refused.
import { SCORE_CATALOG_VERSION, catalogIndexOf } from './catalog.js';
import type {
  AnalysisStatus,
  CheckResult,
  CheckTier,
  Grade,
  ReportComparison,
  ScoreRange,
  ScoreReport,
  ScoredCheck,
  SiteEvaluation,
  TierSummary,
} from './types.js';

export const POOLS = { required: 80, recommended: 20 } as const;
export const BONUS_PER_SIGNAL = 0.25;
export const BONUS_CAP = 5;
export const GRADE_BANDS: ReadonlyArray<readonly [min: number, grade: Grade]> = [
  [95, 'A+'],
  [86, 'A'],
  [70, 'B'],
  [48, 'C'],
  [28, 'D'],
  [0, 'F'],
];
export const GRADE_LABELS: Readonly<Record<Grade, string>> = {
  'A+': 'Agent-ready',
  A: 'Strong fundamentals, small gaps',
  B: 'Readable, with fixable gaps',
  C: 'Partly readable',
  D: 'Hard for agents',
  F: 'Agents cannot use this site',
};
export const SCORE_FORMULA_VERSION = '1.0.0';
export const TOP_FIXES_LIMIT = 5;

const TIER_ORDER: Readonly<Record<CheckTier, number>> = {
  required: 0,
  recommended: 1,
  bonus: 2,
};

/** Round half up at `dp` decimals; inputs are never negative here. */
export function roundTo(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function gradeFor(score: number): Grade {
  for (const [min, grade] of GRADE_BANDS) {
    if (score >= min) {
      return grade;
    }
  }
  return 'F';
}

export function isEligible(result: CheckResult): boolean {
  return (
    result.status === 'pass' ||
    result.status === 'partial' ||
    result.status === 'fail'
  );
}

function fractionOf(result: CheckResult): number {
  const fraction = result.fraction;
  if (fraction === null || !Number.isFinite(fraction)) {
    return 0;
  }
  return Math.min(1, Math.max(0, fraction));
}

interface TierStats {
  summary: TierSummary;
  /** Full-precision earned points, used for the raw total. */
  earnedExact: number;
  eligible: number;
}

function tierStats(results: CheckResult[], tier: 'required' | 'recommended'): TierStats {
  const eligible = results.filter((result) => result.tier === tier && isEligible(result));
  const pool = POOLS[tier];
  const sum = eligible.reduce((total, result) => total + fractionOf(result), 0);
  const earnedExact = eligible.length ? (pool * sum) / eligible.length : 0;
  return {
    summary: {
      earned: roundTo(earnedExact, 2),
      available: pool,
      passing: eligible.filter((result) => fractionOf(result) === 1).length,
      total: eligible.length,
    },
    earnedExact,
    eligible: eligible.length,
  };
}

interface BonusStats {
  pointsExact: number;
  points: number;
  signals: number;
}

function bonusStats(results: CheckResult[]): BonusStats {
  const bonus = results.filter((result) => result.tier === 'bonus' && isEligible(result));
  const sum = bonus.reduce((total, result) => total + fractionOf(result), 0);
  const pointsExact = Math.min(BONUS_CAP, BONUS_PER_SIGNAL * sum);
  return {
    pointsExact,
    points: roundTo(pointsExact, 2),
    signals: bonus.filter((result) => fractionOf(result) > 0).length,
  };
}

export interface GainContext {
  requiredEligible: number;
  recommendedEligible: number;
  bonusPoints: number;
}

/**
 * Ora's `essentialsGain` exactly: the gain on this score if the check reached
 * fraction 1 with the current denominator. Null when the check already passes or
 * does not sit in the denominator.
 */
export function estimatedGain(result: CheckResult, context: GainContext): number | null {
  if (!isEligible(result)) {
    return null;
  }
  const fraction = fractionOf(result);
  if (fraction >= 1) {
    return null;
  }
  if (result.tier === 'bonus') {
    const headroom = Math.max(0, BONUS_CAP - context.bonusPoints);
    return roundTo(Math.min((1 - fraction) * BONUS_PER_SIGNAL, headroom), 2);
  }
  const eligible =
    result.tier === 'required' ? context.requiredEligible : context.recommendedEligible;
  if (eligible === 0) {
    return null;
  }
  return roundTo(((1 - fraction) * POOLS[result.tier]) / eligible, 1);
}

/**
 * estGain descending, then tier (required, recommended, bonus), then catalog order
 * (input order for ids the catalog does not know).
 */
export function rankTopFixes(checks: ScoredCheck[], limit = TOP_FIXES_LIMIT): ScoredCheck[] {
  const indexed = checks.map((check, index) => ({ check, index }));
  return indexed
    .filter(({ check }) => check.estGain !== null && check.estGain > 0)
    .sort((a, b) => {
      const gainDelta = (b.check.estGain ?? 0) - (a.check.estGain ?? 0);
      if (gainDelta !== 0) {
        return gainDelta;
      }
      const tierDelta = TIER_ORDER[a.check.tier] - TIER_ORDER[b.check.tier];
      if (tierDelta !== 0) {
        return tierDelta;
      }
      const catalogDelta = catalogIndexOf(a.check.id) - catalogIndexOf(b.check.id);
      if (catalogDelta !== 0) {
        return catalogDelta;
      }
      return a.index - b.index;
    })
    .slice(0, limit)
    .map(({ check }) => check);
}

interface Totals {
  required: TierStats;
  recommended: TierStats;
  bonus: BonusStats;
  raw: number;
  score: number;
}

function totalsFor(results: CheckResult[]): Totals {
  const required = tierStats(results, 'required');
  const recommended = tierStats(results, 'recommended');
  const bonus = bonusStats(results);
  const raw = roundTo(required.earnedExact + recommended.earnedExact + bonus.pointsExact, 2);
  const score = Math.min(100, Math.round(raw));
  return { required, recommended, bonus, raw, score };
}

function withUnverifiedAt(results: CheckResult[], fraction: 0 | 1): CheckResult[] {
  return results.map((result) =>
    result.status === 'unverified'
      ? { ...result, status: fraction === 1 ? 'pass' : 'fail', fraction }
      : result
  );
}

export function scoreRange(results: CheckResult[]): ScoreRange {
  return {
    pessimistic: totalsFor(withUnverifiedAt(results, 0)).score,
    optimistic: totalsFor(withUnverifiedAt(results, 1)).score,
  };
}

/**
 * Scores a list of check results (or a full `SiteEvaluation`) into a `ScoreReport`.
 * The list form exists so the Ora reproduction test can feed foreign ids.
 */
export function scoreChecks(input: CheckResult[] | SiteEvaluation): ScoreReport {
  const evaluation: SiteEvaluation | null = Array.isArray(input) ? null : input;
  const results: CheckResult[] = Array.isArray(input) ? input : input.checks;
  const blocked = evaluation ? evaluation.blocked : false;
  const unverifiedChecks = results
    .filter((result) => result.status === 'unverified')
    .map((result) => result.id);
  const analysisStatus: AnalysisStatus = blocked
    ? 'blocked'
    : unverifiedChecks.length > 0
      ? 'partial'
      : 'complete';

  const totals = totalsFor(results);
  const context: GainContext = {
    requiredEligible: totals.required.eligible,
    recommendedEligible: totals.recommended.eligible,
    bonusPoints: totals.bonus.pointsExact,
  };
  const checks: ScoredCheck[] = results.map((result) => ({
    ...result,
    estGain: blocked ? null : estimatedGain(result, context),
  }));

  const score = blocked ? null : totals.score;
  const grade = score === null ? null : gradeFor(score);

  return {
    catalogVersion: SCORE_CATALOG_VERSION,
    formulaVersion: SCORE_FORMULA_VERSION,
    analysisStatus,
    score,
    grade,
    label: grade ? GRADE_LABELS[grade] : null,
    raw: blocked ? null : totals.raw,
    required: totals.required.summary,
    recommended: totals.recommended.summary,
    bonus: { points: totals.bonus.points, signals: totals.bonus.signals, cap: BONUS_CAP },
    checks,
    topFixes: blocked ? [] : rankTopFixes(checks),
    unverifiedChecks,
    naChecks: results
      .filter((result) => result.status === 'na')
      .map((result) => ({ id: result.id, reason: result.reason ?? 'not-applicable' })),
    notMeasured: results
      .filter((result) => result.status === 'not-measured')
      .map((result) => result.id),
    range: analysisStatus === 'partial' ? scoreRange(results) : null,
    targetUrl: evaluation?.targetUrl ?? null,
    samplePageUrl: evaluation?.samplePageUrl ?? null,
    fetchedAt: evaluation?.fetchedAt ?? null,
    platform: evaluation?.platform ?? null,
    surfaces: evaluation?.surfaces ?? null,
  };
}

export function majorVersion(version: string): string {
  return version.split('.')[0] ?? version;
}

/** Scores compare only within one catalog and formula major version. */
export function reportsComparable(
  previous: Pick<ScoreReport, 'catalogVersion' | 'formulaVersion'>,
  current: Pick<ScoreReport, 'catalogVersion' | 'formulaVersion'>
): { comparable: boolean; reason: string | null } {
  if (majorVersion(previous.catalogVersion) !== majorVersion(current.catalogVersion)) {
    return {
      comparable: false,
      reason: `catalog changed (${previous.catalogVersion} to ${current.catalogVersion}), re-baseline`,
    };
  }
  if (majorVersion(previous.formulaVersion) !== majorVersion(current.formulaVersion)) {
    return {
      comparable: false,
      reason: `formula changed (${previous.formulaVersion} to ${current.formulaVersion}), re-baseline`,
    };
  }
  return { comparable: true, reason: null };
}

/**
 * Diff of two reports: refused across major versions, and never on a blocked or
 * partial side (those readings are provisional and are not stored as history).
 */
export function compareReports(previous: ScoreReport, current: ScoreReport): ReportComparison {
  const versions = reportsComparable(previous, current);
  const empty: ReportComparison = {
    comparable: false,
    reason: versions.reason,
    scoreDelta: null,
    previousGrade: previous.grade,
    currentGrade: current.grade,
    changedChecks: [],
  };
  if (!versions.comparable) {
    return empty;
  }
  if (previous.analysisStatus !== 'complete' || current.analysisStatus !== 'complete') {
    return {
      ...empty,
      reason: 'only complete runs are compared; re-run the provisional side',
    };
  }
  const previousById = new Map(previous.checks.map((check) => [check.id, check]));
  const changedChecks: ReportComparison['changedChecks'] = [];
  for (const check of current.checks) {
    const before = previousById.get(check.id);
    if (!before) {
      continue;
    }
    if (before.status !== check.status || before.fraction !== check.fraction) {
      changedChecks.push({
        id: check.id,
        previousStatus: before.status,
        currentStatus: check.status,
        previousFraction: before.fraction,
        currentFraction: check.fraction,
      });
    }
  }
  return {
    comparable: true,
    reason: null,
    scoreDelta: (current.score ?? 0) - (previous.score ?? 0),
    previousGrade: previous.grade,
    currentGrade: current.grade,
    changedChecks,
  };
}
