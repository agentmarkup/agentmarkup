import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BONUS_CAP,
  GRADE_BANDS,
  GRADE_LABELS,
  POOLS,
  SCORE_FORMULA_VERSION,
  compareReports,
  estimatedGain,
  gradeFor,
  rankTopFixes,
  reportsComparable,
  roundTo,
  scoreChecks,
  scoreRange,
  unverifiedResourcesWithoutChecks,
} from '../../src/score/formula.js';
import { SCORE_CATALOG_VERSION } from '../../src/score/catalog.js';
import type { CheckResult, CheckTier, EvidenceResourceKey, ScoreReport, ScoredCheck, SiteEvaluation } from '../../src/score/types.js';

const fixturePath = fileURLToPath(new URL('../fixtures/score/ora-agentmarkup.dev.json', import.meta.url));

interface OraEntry {
  tier: string;
  bonus: boolean;
  fraction: number | null;
  occurrences: number;
  essentialsGain: number | null;
}

interface OraFixture {
  contractVersion: string;
  scannedAt: string;
  essentials: {
    score: number;
    required: { earned: number; passing: number; total: number };
    recommended: { earned: number; passing: number; total: number };
    bonusPoints: number;
    bonusSignals: number;
    checks: Record<string, OraEntry>;
  };
}

function check(id: string, tier: CheckTier, fraction: number | null, status?: CheckResult['status']): CheckResult {
  const resolved: CheckResult['status'] =
    status ?? (fraction === null ? 'na' : fraction >= 1 ? 'pass' : fraction <= 0 ? 'fail' : 'partial');
  return { id, tier, status: resolved, fraction: resolved === 'na' || resolved === 'unverified' ? null : fraction, evidence: `${id} evidence` };
}

function oraChecks(fixture: OraFixture): CheckResult[] {
  return Object.entries(fixture.essentials.checks).map(([id, entry]) => {
    const tier: CheckTier = entry.bonus ? 'bonus' : entry.tier === 'required' ? 'required' : 'recommended';
    return check(id, tier, entry.fraction);
  });
}

describe('Ora Essentials reproduction (agentmarkup.dev, contractVersion 1.38.0, scanned 2026-10-10)', () => {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as OraFixture;
  const report = scoreChecks(oraChecks(fixture));

  it('cites the fixture provenance', () => {
    expect(fixture.contractVersion).toBe('1.38.0');
    expect(fixture.scannedAt.startsWith('2026-10-10')).toBe(true);
    expect(Object.keys(fixture.essentials.checks)).toHaveLength(82);
  });

  it('reproduces required 80.0, recommended 18.4, bonus 3.8 and score 100', () => {
    expect(report.required.earned).toBe(80);
    expect(report.required.passing).toBe(fixture.essentials.required.passing);
    expect(report.required.total).toBe(fixture.essentials.required.total);
    expect(roundTo(report.recommended.earned, 1)).toBe(18.4);
    expect(report.recommended.passing).toBe(fixture.essentials.recommended.passing);
    expect(report.recommended.total).toBe(fixture.essentials.recommended.total);
    expect(roundTo(report.bonus.points, 1)).toBe(3.8);
    expect(report.bonus.signals).toBe(fixture.essentials.bonusSignals);
    expect(report.score).toBe(100);
    // 80 + 1160/63 + 11.5/3 = 102.246..., reported to 2 dp.
    expect(report.raw).toBe(102.25);
    expect(report.analysisStatus).toBe('complete');
  });

  it('reproduces every non-null essentialsGain (38 values, tiers to 1 dp, bonus to 2 dp)', () => {
    const byId = new Map(report.checks.map((entry) => [entry.id, entry]));
    let compared = 0;
    for (const [id, entry] of Object.entries(fixture.essentials.checks)) {
      const ours = byId.get(id);
      expect(ours).toBeDefined();
      if (entry.essentialsGain === null) {
        expect(ours!.estGain).toBeNull();
        continue;
      }
      compared += 1;
      expect(ours!.estGain).toBe(entry.essentialsGain);
    }
    expect(compared).toBe(38);
    expect(byId.get('brand-search-accuracy')!.estGain).toBe(1);
    expect(byId.get('agentic-search-specific')!.estGain).toBe(0.6);
    expect(byId.get('json-ld-entity-linking')!.estGain).toBe(0.13);
    expect(byId.get('rest-sdk-packages')!.estGain).toBe(0.17);
  });
});

describe('worked examples from the spec (section 4)', () => {
  const required = (fractions: number[]) => fractions.map((f, i) => check(`req.${i}`, 'required', f));
  const recommended = (fractions: number[]) => fractions.map((f, i) => check(`rec.${i}`, 'recommended', f));
  const bonus = (fractions: number[]) => fractions.map((f, i) => check(`bon.${i}`, 'bonus', f));

  it('example 1: sandiegowebstudios.com scores 90 A from raw 90.32', () => {
    const report = scoreChecks([
      ...required([1, 1, 1, 1, 1, 0.667, 1, 1, 1]),
      ...recommended([1, 1, 0.75, 0, 1, 0, 1, 0, 1]),
      ...bonus([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    expect(report.required.earned).toBe(77.04);
    expect(report.recommended.earned).toBe(12.78);
    expect(report.bonus.points).toBe(0.5);
    expect(report.raw).toBe(90.32);
    expect(report.score).toBe(90);
    expect(report.grade).toBe('A');
    expect(report.label).toBe(GRADE_LABELS.A);
  });

  it('example 2: the same site after one care-plan month scores 100 A+ from raw 99.79', () => {
    const report = scoreChecks([
      ...required([1, 1, 1, 1, 1, 0.667, 1, 1, 1]),
      ...recommended([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      ...bonus([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]),
    ]);
    expect(report.required.earned).toBe(77.04);
    expect(report.recommended.earned).toBe(20);
    expect(report.bonus.points).toBe(2.75);
    expect(report.raw).toBe(99.79);
    expect(report.score).toBe(100);
    expect(report.grade).toBe('A+');
    expect(report.topFixes[0]!.id).toBe('req.5');
    expect(report.topFixes[0]!.estGain).toBe(3);
  });

  it('example 3: agentmarkup.dev scores 100 A+ from raw 103.0', () => {
    const report = scoreChecks([
      ...required(Array(9).fill(1)),
      ...recommended(Array(10).fill(1)),
      ...bonus([...Array(12).fill(1), 0, 0, 0]),
    ]);
    expect(report.raw).toBe(103);
    expect(report.score).toBe(100);
    expect(report.grade).toBe('A+');
    expect(report.bonus.signals).toBe(12);
  });

  it('example 1b: tagteamdesign.com with the sitemap unverified is 83 provisional (81 to 83), 83 B once verified', () => {
    // The spec's corrected worked example (section 4) with its stated inputs:
    // jsonld.type-breadth 0.5 (only LocalBusiness outside the baseline types). Since
    // nested @type values count, the tagteamdesign fixture also reads the Yoast
    // PropertyValueSpecification and scores type-breadth 1 (raw 83.24, range 81 to 84);
    // this case keeps the spec's inputs so the formula itself stays pinned.
    const checks: CheckResult[] = [
      ...required([1, 1, 1, 1, 1, 0.333, 1, 0.894, 0]),
      ...recommended([1, 1, 0.75, 0.75, 1, 1, 0.5, 1]),
      check('sitemap.valid', 'recommended', null, 'unverified'),
      ...bonus([1, 1, 1, 1, 1, 0.5]),
    ];
    const report = scoreChecks(checks);
    expect(report.required.earned).toBe(64.24);
    expect(report.recommended.earned).toBe(17.5);
    expect(report.bonus.points).toBe(1.38);
    expect(report.bonus.signals).toBe(6);
    expect(report.raw).toBe(83.12);
    expect(report.score).toBe(83);
    expect(report.grade).toBe('B');
    expect(report.analysisStatus).toBe('partial');
    expect(report.unverifiedChecks).toEqual(['sitemap.valid']);
    expect(report.range).toEqual({ pessimistic: 81, optimistic: 83 });
    const verified = scoreChecks(checks.map((entry) => (entry.id === 'sitemap.valid' ? check('sitemap.valid', 'recommended', 1) : entry)));
    expect(verified.recommended.earned).toBe(17.78);
    // 64.24 + 17.777... + 1.375 = 83.39 unrounded; the spec's 83.40 adds the rounded parts.
    expect(verified.raw).toBe(83.39);
    expect(verified.score).toBe(83);
    expect(verified.grade).toBe('B');
    expect(verified.analysisStatus).toBe('complete');
    expect(verified.range).toBeNull();
  });
});

describe('grade bands and rounding', () => {
  it('uses the published bands and labels', () => {
    expect(GRADE_BANDS).toEqual([[95, 'A+'], [86, 'A'], [70, 'B'], [48, 'C'], [28, 'D'], [0, 'F']]);
    expect(gradeFor(27)).toBe('F');
    expect(gradeFor(28)).toBe('D');
    expect(gradeFor(47)).toBe('D');
    expect(gradeFor(48)).toBe('C');
    expect(gradeFor(69)).toBe('C');
    expect(gradeFor(70)).toBe('B');
    expect(gradeFor(85)).toBe('B');
    expect(gradeFor(86)).toBe('A');
    expect(gradeFor(94)).toBe('A');
    expect(gradeFor(95)).toBe('A+');
    expect(gradeFor(100)).toBe('A+');
    expect(Object.keys(GRADE_LABELS)).toEqual(['A+', 'A', 'B', 'C', 'D', 'F']);
  });

  it('rounds half up and caps at 100', () => {
    expect(roundTo(1.25, 1)).toBe(1.3);
    expect(roundTo(0.125, 2)).toBe(0.13);
    const report = scoreChecks([check('a', 'required', 0.895), check('b', 'recommended', 0.9)]);
    expect(report.raw).toBe(89.6);
    expect(report.score).toBe(90);
    const low = scoreChecks([check('a', 'required', 0.89), check('b', 'recommended', 0.9)]);
    expect(low.raw).toBe(89.2);
    expect(low.score).toBe(89);
    const capped = scoreChecks([
      check('a', 'required', 1),
      check('b', 'recommended', 1),
      ...Array.from({ length: 25 }, (_, i) => check(`bonus.${i}`, 'bonus', 1)),
    ]);
    expect(capped.bonus.points).toBe(BONUS_CAP);
    expect(capped.raw).toBe(105);
    expect(capped.score).toBe(100);
  });

  it('exposes the pools and version', () => {
    expect(POOLS).toEqual({ required: 80, recommended: 20 });
    expect(SCORE_FORMULA_VERSION).toBe('1.0.0');
  });
});

describe('status rules', () => {
  it('leaves na, unverified and not-measured out of the denominator', () => {
    const report = scoreChecks([
      check('a', 'required', 1),
      check('b', 'required', null, 'na'),
      check('c', 'required', null, 'not-measured'),
      check('d', 'recommended', 0),
      check('e', 'recommended', null, 'unverified'),
    ]);
    expect(report.required).toEqual({ earned: 80, available: 80, passing: 1, total: 1 });
    expect(report.recommended).toEqual({ earned: 0, available: 20, passing: 0, total: 1 });
    expect(report.analysisStatus).toBe('partial');
    expect(report.naChecks).toEqual([{ id: 'b', reason: 'not-applicable' }]);
    expect(report.notMeasured).toEqual(['c']);
    expect(report.unverifiedChecks).toEqual(['e']);
  });

  it('computes the pessimistic and optimistic range over unverified checks', () => {
    const checks = [
      check('a', 'required', 1),
      check('b', 'required', null, 'unverified'),
      check('c', 'recommended', 1),
      check('d', 'bonus', null, 'unverified'),
    ];
    expect(scoreRange(checks)).toEqual({ pessimistic: 60, optimistic: 100 });
    const report = scoreChecks(checks);
    expect(report.score).toBe(100);
    expect(report.range).toEqual({ pessimistic: 60, optimistic: 100 });
  });

  it('reports a blocked evaluation with a null score', () => {
    const evaluation: SiteEvaluation = {
      checks: [check('a', 'required', null, 'unverified')],
      blocked: true,
      blockedKind: 'unverified',
      blockedReason: 'homepage could not be verified in time',
      targetUrl: 'https://example.com/',
      samplePageUrl: null,
      fetchedAt: '2026-11-02T00:00:00.000Z',
      platform: null,
      surfaces: { api: false, mcp: false, commerce: false, forms: false, markdown: false },
      unverifiedResources: [],
    };
    const report = scoreChecks(evaluation);
    expect(report.analysisStatus).toBe('blocked');
    expect(report.blockedKind).toBe('unverified');
    expect(report.blockedReason).toBe('homepage could not be verified in time');
    expect(report.score).toBeNull();
    expect(report.grade).toBeNull();
    expect(report.label).toBeNull();
    expect(report.raw).toBeNull();
    expect(report.topFixes).toEqual([]);
    expect(report.range).toBeNull();
    expect(report.targetUrl).toBe('https://example.com/');
    expect(report.catalogVersion).toBe(SCORE_CATALOG_VERSION);
    expect(report.formulaVersion).toBe(SCORE_FORMULA_VERSION);
  });

  it('carries the http-status block kind and reason; an unblocked report carries neither', () => {
    const evaluation: SiteEvaluation = {
      checks: [check('a', 'required', null, 'na'), check('b', 'recommended', null, 'na')],
      blocked: true,
      blockedKind: 'http-status',
      blockedReason: 'homepage answered HTTP 404',
      targetUrl: 'https://example.com/',
      samplePageUrl: null,
      fetchedAt: '2026-11-02T00:00:00.000Z',
      platform: null,
      surfaces: { api: false, mcp: false, commerce: false, forms: false, markdown: false },
      unverifiedResources: [],
    };
    const report = scoreChecks(evaluation);
    expect(report.analysisStatus).toBe('blocked');
    expect(report.blockedKind).toBe('http-status');
    expect(report.blockedReason).toBe('homepage answered HTTP 404');
    expect(report.score).toBeNull();
    expect(report.raw).toBeNull();
    expect(report.unverifiedChecks).toEqual([]);
    expect(report.range).toBeNull();

    const challenged = scoreChecks({ ...evaluation, checks: [check('a', 'required', 0)], blocked: false, blockedKind: null, blockedReason: 'Agents cannot reach this site: HTTP 403' });
    expect(challenged.analysisStatus).toBe('complete');
    expect(challenged.blockedKind).toBeNull();
    expect(challenged.blockedReason).toBeNull();
    const fromList = scoreChecks([check('a', 'required', 1)]);
    expect(fromList.blockedKind).toBeNull();
    expect(fromList.blockedReason).toBeNull();
  });

  it('a tier with zero eligible checks contributes 0', () => {
    const report = scoreChecks([check('a', 'required', 1)]);
    expect(report.recommended.earned).toBe(0);
    expect(report.recommended.total).toBe(0);
    expect(report.score).toBe(80);
  });
});

describe('estimated gain and ranking', () => {
  it('computes gains with the current denominator and the bonus headroom', () => {
    const context = { requiredEligible: 9, recommendedEligible: 10, bonusPoints: 4.9 };
    expect(estimatedGain(check('a', 'required', 0), context)).toBe(8.9);
    expect(estimatedGain(check('a', 'required', 0.667), context)).toBe(3);
    expect(estimatedGain(check('a', 'recommended', 0.5), context)).toBe(1);
    expect(estimatedGain(check('a', 'bonus', 0), context)).toBe(0.1);
    expect(estimatedGain(check('a', 'bonus', 0.5), { ...context, bonusPoints: 0 })).toBe(0.13);
    expect(estimatedGain(check('a', 'required', 1), context)).toBeNull();
    expect(estimatedGain(check('a', 'required', null, 'unverified'), context)).toBeNull();
    expect(estimatedGain(check('a', 'required', null, 'na'), context)).toBeNull();
  });

  it('ranks by gain, then tier, then catalog order, and keeps five', () => {
    const scored: ScoredCheck[] = [
      { ...check('llms.exists', 'bonus', 0), estGain: 0.25 },
      { ...check('trust.anchors', 'recommended', 0.5), estGain: 1 },
      { ...check('ax.form-labeling', 'required', 0.9), estGain: 1 },
      { ...check('meta.noindex', 'recommended', 0), estGain: 1 },
      { ...check('jsonld.identity', 'recommended', 0.5), estGain: 1 },
      { ...check('zzz.unknown', 'bonus', 0), estGain: 0.25 },
      { ...check('ax.document-structure', 'required', 1), estGain: null },
      { ...check('sitemap.lastmod', 'bonus', 0), estGain: 0.25 },
    ];
    expect(rankTopFixes(scored).map((entry) => entry.id)).toEqual([
      'ax.form-labeling',
      'meta.noindex',
      'jsonld.identity',
      'trust.anchors',
      'llms.exists',
    ]);
    expect(rankTopFixes(scored, 10).map((entry) => entry.id).slice(5)).toEqual(['sitemap.lastmod', 'zzz.unknown']);
  });
});

describe('version comparison', () => {
  const base = scoreChecks([check('a', 'required', 1), check('b', 'recommended', 0.5)]);

  it('refuses to compare across catalog or formula major versions', () => {
    const other: ScoreReport = { ...base, catalogVersion: '2.0.0' };
    expect(reportsComparable(base, other)).toEqual({
      comparable: false,
      reason: 'catalog changed (1.0.0 to 2.0.0), re-baseline',
    });
    expect(reportsComparable(base, { ...base, formulaVersion: '2.1.0' }).comparable).toBe(false);
    expect(reportsComparable(base, { ...base, catalogVersion: '1.4.2' }).comparable).toBe(true);
    expect(compareReports(base, other).comparable).toBe(false);
  });

  it('diffs complete reports and refuses provisional ones', () => {
    const later = scoreChecks([check('a', 'required', 1), check('b', 'recommended', 1)]);
    const diff = compareReports(base, later);
    expect(diff.comparable).toBe(true);
    expect(diff.scoreDelta).toBe(10);
    expect(diff.changedChecks).toEqual([
      { id: 'b', previousStatus: 'partial', currentStatus: 'pass', previousFraction: 0.5, currentFraction: 1 },
    ]);
    const partial = scoreChecks([check('a', 'required', 1), check('b', 'recommended', null, 'unverified')]);
    expect(compareReports(base, partial).comparable).toBe(false);
    expect(compareReports(base, partial).reason).toContain('only complete runs are compared');
  });
});

describe('unverifiedResourcesWithoutChecks (C2)', () => {
  it('lists an unverified resource only when no unverified check names it, and nothing for a blocked run', () => {
    const check = (status: CheckResult['status'], resources: EvidenceResourceKey[]): CheckResult => ({
      id: 'x',
      tier: 'required',
      status,
      fraction: status === 'pass' ? 1 : null,
      evidence: '',
      resources,
    });
    const checks = [check('pass', ['homepage', 'samplePage']), check('unverified', ['llmsTxt'])];
    expect(
      unverifiedResourcesWithoutChecks({ analysisStatus: 'partial', unverifiedResources: ['llmsTxt', 'samplePage'], checks })
    ).toEqual(['samplePage']);
    expect(unverifiedResourcesWithoutChecks({ analysisStatus: 'blocked', unverifiedResources: ['samplePage'], checks })).toEqual([]);
    expect(unverifiedResourcesWithoutChecks({ analysisStatus: 'complete', unverifiedResources: [], checks })).toEqual([]);
  });
});
