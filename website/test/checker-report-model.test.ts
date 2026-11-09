// @vitest-environment happy-dom
// Report model (spec 2026-11-09-report-ux-spec.md, sections 7.2, 7.3, 7.8, 7.9, 8 and 6.4).
// The area figures are a published decomposition of the engine's own per-check weights;
// these tests pin that decomposition to the engine's tier totals on every recorded site
// fixture (packages/core/test/fixtures/score) and on the synthetic reports, so the UI can
// never show a number the engine did not produce (honesty rules H1, H3, H4, H9, H10, H13).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BONUS_CAP,
  BONUS_PER_SIGNAL,
  SCORE_CATALOG,
  TOP_FIXES_LIMIT,
  WORKER_ERROR_MESSAGES,
  catalogIndexOf,
  evaluateSiteChecks,
  getCheckDefinition,
  gradeFor,
  rankTopFixes,
  roundTo,
  scoreChecks,
  unverifiedResourcesWithoutChecks,
  type CheckBucket,
  type ScoreReport,
  type ScoredCheck,
  type SiteEvidence,
} from '@agentmarkup/core/score';

import { RESOURCE_LABELS } from '../src/checker/check-copy';
import { previousReport, rememberReport } from '../src/checker/report-history';
import {
  GROUP_ORDER,
  areaTotal,
  blockedCase,
  checkEarned,
  checkWorth,
  compareForList,
  displayStatus,
  fixPlan,
  formatPoints,
  gatedInfo,
  gradeTone,
  groupReport,
  groupTone,
  partialInfo,
  reportTone,
  type GroupSummary,
} from '../src/checker/report-model';
import type { SiteCheckResponse } from '../src/checker/types';
import {
  DEFAULT_BODY,
  HOME,
  ORIGIN,
  PROBE_URL,
  homepage,
  notFound,
  resource,
  siteCheck,
  status,
  text,
  timedOut,
} from './helpers/score-fixture';

// ---------------------------------------------------------------------------
// Inputs

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/core/test/fixtures/score');
const FIXTURE_HOSTS = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith('.json') && !file.endsWith('.expected.json') && !file.startsWith('ora-'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();

function fixtureResult(host: string): SiteCheckResponse {
  const evidence = JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${host}.json`), 'utf8')) as SiteEvidence;
  return { ...evidence, normalizedFrom: null };
}

function score(result: SiteCheckResponse): ScoreReport {
  return scoreChecks(evaluateSiteChecks(result));
}

const FIXTURES: Record<string, ScoreReport> = Object.fromEntries(
  FIXTURE_HOSTS.map((host) => [host, score(fixtureResult(host))])
);

const CHALLENGE_BODY = '<html><head><title>Just a moment...</title></head><body></body></html>';
const FAILING_PARTS = {
  homepage: homepage(DEFAULT_BODY, { jsonLd: [], canonical: null, llmsLink: false, markdownLink: false }),
  llms: notFound(`${ORIGIN}/llms.txt`),
  sitemap: notFound(`${ORIGIN}/sitemap.xml`),
  probe: status(PROBE_URL, 302, { headers: { location: HOME } }),
  robots: text(`${ORIGIN}/robots.txt`, 'User-agent: PerplexityBot\nDisallow: /\n'),
  homeMd: null,
  sampleMd: null,
};

const RESULTS = {
  reference: siteCheck(),
  provisional: siteCheck({ llms: timedOut(`${ORIGIN}/llms.txt`) }),
  sampleTimedOut: siteCheck({ sample: timedOut(`${ORIGIN}/services/`), sampleMd: null }),
  blocked: siteCheck({ homepage: timedOut(HOME) }),
  homepage404: siteCheck({ homepage: notFound(HOME) }),
  failing: siteCheck(FAILING_PARTS),
  // A partial run whose pessimistic end sits in a lower grade than the score (91 A, range 82 to 91).
  failingProbe: siteCheck({ ...FAILING_PARTS, probe: timedOut(PROBE_URL) }),
  // A 403 challenge homepage: scored, not blocked ("gated", spec 5.10).
  gated: siteCheck({
    homepage: status(HOME, 403, {
      contentType: 'text/html; charset=UTF-8',
      body: CHALLENGE_BODY,
      headers: { 'cf-mitigated': 'challenge' },
    }),
  }),
};

const SYNTHETIC: Record<keyof typeof RESULTS, ScoreReport> = Object.fromEntries(
  Object.entries(RESULTS).map(([name, result]) => [name, score(result)])
) as Record<keyof typeof RESULTS, ScoreReport>;

const SCORED_CASES: Array<[string, ScoreReport]> = [
  ...Object.entries(FIXTURES),
  ...(['reference', 'provisional', 'sampleTimedOut', 'failing', 'failingProbe', 'gated'] as const).map(
    (name): [string, ScoreReport] => [`synthetic ${name}`, SYNTHETIC[name]]
  ),
];

const ELIGIBLE = new Set(['pass', 'partial', 'fail']);

function bucketOfCheck(check: ScoredCheck): CheckBucket {
  const definition = getCheckDefinition(check.id);
  if (!definition) {
    throw new Error(`no catalog row for ${check.id}`);
  }
  return definition.bucket;
}

function expectedWorth(check: ScoredCheck, report: ScoreReport): number {
  if (!ELIGIBLE.has(check.status)) {
    return 0;
  }
  if (check.tier === 'required') {
    return report.required.available / report.required.total;
  }
  if (check.tier === 'recommended') {
    return report.recommended.available / report.recommended.total;
  }
  return BONUS_PER_SIGNAL;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function group(report: ScoreReport, bucket: CheckBucket): GroupSummary {
  const found = groupReport(report).find((candidate) => candidate.bucket === bucket);
  if (!found) {
    throw new Error(`no group ${bucket}`);
  }
  return found;
}

function blockedResult(error: string, overrides: Parameters<typeof resource>[1] = {}): SiteCheckResponse {
  return siteCheck({
    homepage: resource(HOME, { status: 0, ok: false, contentType: null, body: null, error, ...overrides }),
  });
}

// ---------------------------------------------------------------------------

describe('fixture panel', () => {
  it('iterates the recorded site fixtures, never an empty list', () => {
    expect(FIXTURE_HOSTS).toEqual(
      expect.arrayContaining([
        'agentmarkup.dev',
        'animafelix.com',
        'cochinescu.com',
        'sandiegowebstudios.com',
        'seodesignchicago.com',
        'tagteamdesign.com',
        'visualwebz.com',
      ])
    );
    for (const host of FIXTURE_HOSTS) {
      expect(FIXTURES[host].analysisStatus, host).not.toBe('blocked');
    }
  });

  it('keeps the six groups in the fixed catalog-bucket order (7.1)', () => {
    expect(GROUP_ORDER).toEqual(['reachability', 'content', 'controls', 'navigation', 'identity', 'discovery']);
    expect(new Set(SCORE_CATALOG.map((definition) => definition.bucket))).toEqual(new Set(GROUP_ORDER));
  });
});

describe.each(SCORED_CASES)('area decomposition (7.2, H1): %s', (_name, report) => {
  const groups = groupReport(report);

  it('has six groups in GROUP_ORDER and puts every check in exactly one group, by catalog bucket', () => {
    expect(groups.map((candidate) => candidate.bucket)).toEqual(GROUP_ORDER);
    expect(groups.map((candidate) => candidate.order)).toEqual([1, 2, 3, 4, 5, 6]);
    const ids = groups.flatMap((candidate) => candidate.checks.map((check) => check.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(report.checks.map((check) => check.id).sort());
    for (const candidate of groups) {
      for (const check of candidate.checks) {
        expect(bucketOfCheck(check), check.id).toBe(candidate.bucket);
      }
    }
  });

  it('prices every check by the published worth rule', () => {
    for (const check of report.checks) {
      const worth = expectedWorth(check, report);
      expect(checkWorth(check, report), check.id).toBeCloseTo(worth, 9);
      expect(checkEarned(check, report), check.id).toBeCloseTo(worth * clamp01(check.fraction ?? 0), 9);
    }
  });

  it('builds stake, earned and bonus from the scored checks, bonus kept out of the stake (H9)', () => {
    for (const candidate of groups) {
      const scored = candidate.checks.filter((check) => ELIGIBLE.has(check.status));
      const pooled = scored.filter((check) => check.tier !== 'bonus');
      const bonus = scored.filter((check) => check.tier === 'bonus');
      expect(candidate.stake, candidate.bucket).toBeCloseTo(sum(pooled.map((check) => expectedWorth(check, report))), 9);
      expect(candidate.earned, candidate.bucket).toBeCloseTo(
        sum(pooled.map((check) => expectedWorth(check, report) * clamp01(check.fraction ?? 0))),
        9
      );
      expect(candidate.bonus, candidate.bucket).toBeCloseTo(
        sum(bonus.map((check) => BONUS_PER_SIGNAL * clamp01(check.fraction ?? 0))),
        9
      );
    }
  });

  it('adds the six areas up to required + recommended earned, and with bonus to raw, within 0.01', () => {
    const areas = sum(groups.map((candidate) => candidate.earned));
    const bonus = sum(groups.map((candidate) => candidate.bonus));
    expect(Math.abs(areas - (report.required.earned + report.recommended.earned))).toBeLessThanOrEqual(0.01);
    expect(report.raw).not.toBeNull();
    expect(Math.abs(areas + bonus - (report.raw ?? Number.NaN))).toBeLessThanOrEqual(0.01);
    expect(areaTotal(report)).toBe(roundTo(report.required.earned + report.recommended.earned, 2));
  });

  it('sums the stakes to the eligible pools', () => {
    const pools =
      (report.required.total > 0 ? report.required.available : 0) +
      (report.recommended.total > 0 ? report.recommended.available : 0);
    expect(sum(groups.map((candidate) => candidate.stake))).toBeCloseTo(pools, 6);
  });

  it('never shows 100% while a scored required or recommended check is short of full credit (H9)', () => {
    for (const candidate of groups) {
      const short = candidate.checks.some(
        (check) => check.tier !== 'bonus' && (check.status === 'partial' || check.status === 'fail')
      );
      if (candidate.stake === 0) {
        expect(candidate.pct, candidate.bucket).toBeNull();
        continue;
      }
      const exact =
        Math.abs(candidate.earned - candidate.stake) < 1e-9
          ? 100
          : Math.min(99, Math.round((100 * candidate.earned) / candidate.stake));
      expect(candidate.pct, candidate.bucket).toBe(exact);
      if (short) {
        expect(candidate.pct, candidate.bucket).toBeLessThan(100);
      }
    }
  });

  it('colours an area red only when a required check in it fails (H10)', () => {
    for (const candidate of groups) {
      const requiredFail = candidate.checks.some((check) => check.tier === 'required' && check.status === 'fail');
      expect(candidate.hasRequiredFail, candidate.bucket).toBe(requiredFail);
      expect(candidate.tone, candidate.bucket).toBe(groupTone(candidate));
      if (candidate.tone === 'action') {
        expect(candidate.hasRequiredFail, candidate.bucket).toBe(true);
      }
      if (candidate.pct === null) {
        expect(candidate.tone, candidate.bucket).toBe('neutral');
      }
    }
  });

  it('derives inPlace, counts and the unverified flag from the checks', () => {
    for (const candidate of groups) {
      const pooled = candidate.checks.filter((check) => check.tier !== 'bonus');
      const gap = pooled.some(
        (check) => check.status === 'partial' || check.status === 'fail' || check.status === 'unverified'
      );
      expect(candidate.inPlace, candidate.bucket).toBe(candidate.stake > 0 && !gap);
      expect(candidate.hasUnverified, candidate.bucket).toBe(candidate.checks.some((check) => check.status === 'unverified'));
      for (const statusName of ['pass', 'partial', 'fail', 'na', 'unverified', 'not-measured'] as const) {
        expect(candidate.counts[statusName] ?? 0, `${candidate.bucket} ${statusName}`).toBe(
          candidate.checks.filter((check) => check.status === statusName).length
        );
      }
    }
  });

  it('keeps tone and band of the whole report on the engine grade (or the pessimistic end when partial)', () => {
    const expected =
      report.analysisStatus === 'partial' && report.range
        ? gradeTone(gradeFor(report.range.pessimistic))
        : gradeTone(report.grade ?? 'F');
    expect(reportTone(report, null)).toBe(expected);
  });
});

describe('verified area figures (7.2 table)', () => {
  const pcts = (host: string) => groupReport(FIXTURES[host]).map((candidate) => candidate.pct);
  const tones = (host: string) => groupReport(FIXTURES[host]).map((candidate) => candidate.tone);

  it('matches the prototype figures on the five pinned fixtures', () => {
    expect(pcts('animafelix.com')).toEqual([100, 100, 99, 100, 93, 75]);
    expect(pcts('agentmarkup.dev')).toEqual([100, 100, 100, 100, 100, 100]);
    expect(pcts('tagteamdesign.com')).toEqual([100, 100, 56, 100, 90, 75]);
    expect(pcts('visualwebz.com')).toEqual([100, 100, 83, 50, 82, 75]);
    expect(pcts('sandiegowebstudios.com')).toEqual([100, 100, 92, 100, 62, 50]);
  });

  it('matches the prototype tones; animafelix.com (A+) has no red area', () => {
    expect(tones('animafelix.com')).toEqual(['good', 'good', 'good', 'good', 'good', 'attention']);
    expect(tones('agentmarkup.dev')).toEqual(['good', 'good', 'good', 'good', 'good', 'good']);
    expect(tones('tagteamdesign.com')).toEqual(['good', 'good', 'action', 'good', 'good', 'attention']);
    expect(tones('visualwebz.com')).toEqual(['good', 'good', 'attention', 'action', 'attention', 'attention']);
    // 62% and 50% grade as C, but no required check fails there: attention, not red.
    expect(tones('sandiegowebstudios.com')).toEqual(['good', 'good', 'good', 'good', 'attention', 'attention']);
  });

  it('reads animafelix.com Controls (a required partial at 114/115) as 99%, never 100%', () => {
    const controls = group(FIXTURES['animafelix.com'], 'controls');
    expect(controls.checks.some((check) => check.tier === 'required' && check.status === 'partial')).toBe(true);
    expect(controls.pct).toBe(99);
    expect(controls.tone).toBe('good');
    expect(groupReport(FIXTURES['animafelix.com']).some((candidate) => candidate.tone === 'action')).toBe(false);
  });

  it('lets a missing bonus extra never lower an area: agentmarkup.dev Discovery stays 100% (H9)', () => {
    const discovery = group(FIXTURES['agentmarkup.dev'], 'discovery');
    expect(discovery.checks.some((check) => check.tier === 'bonus' && check.status === 'fail')).toBe(true);
    expect(discovery.pct).toBe(100);
  });
});

describe('bonus cap', () => {
  it('cannot bind in this catalog, so area bonus sums equal the engine bonus points', () => {
    const implementedBonus = SCORE_CATALOG.filter(
      (definition) => definition.availability === 'now' && definition.tier === 'bonus'
    ).length;
    expect(implementedBonus).toBeGreaterThan(0);
    // If a future catalog breaks this, the UI has to decide how a capped bonus is shown.
    expect(implementedBonus * BONUS_PER_SIGNAL).toBeLessThanOrEqual(BONUS_CAP);
    for (const [name, report] of SCORED_CASES) {
      const bonus = sum(groupReport(report).map((candidate) => candidate.bonus));
      expect(Math.abs(bonus - report.bonus.points), name).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('blocked runs (H3)', () => {
  it('produce no groups, no area total to show and no fixes', () => {
    for (const report of [SYNTHETIC.blocked, SYNTHETIC.homepage404]) {
      expect(report.analysisStatus).toBe('blocked');
      expect(groupReport(report)).toEqual([]);
      const plan = fixPlan(report);
      expect(plan.all).toEqual([]);
      expect(plan.primary).toEqual([]);
      expect(plan.then).toEqual([]);
      expect(plan.atCap).toBe(false);
    }
  });
});

describe('gatedInfo (5.10)', () => {
  const gated = SYNTHETIC.gated;

  it('detects a 403 challenge homepage from naChecks, because the engine leaves blockedReason null there', () => {
    expect(gated.analysisStatus).not.toBe('blocked');
    expect(gated.blockedReason).toBeNull();
    expect(gated.score).not.toBeNull();
    const info = gatedInfo(gated);
    const affected = gated.naChecks.filter((entry) => entry.reason === 'homepage-blocked').length;
    expect(affected).toBeGreaterThan(0);
    expect(info).not.toBeNull();
    expect(info?.affected).toBe(affected);
    expect(info?.status).toBe(403);
    expect(info?.marker).toBe(true);
    expect(info?.evidence).toBe(gated.checks.find((check) => check.id === 'reach.bot-detection')?.evidence);
  });

  it('is null on ordinary, partial and blocked runs and on every recorded fixture', () => {
    for (const report of [SYNTHETIC.reference, SYNTHETIC.provisional, SYNTHETIC.failing, SYNTHETIC.blocked, SYNTHETIC.homepage404]) {
      expect(gatedInfo(report)).toBeNull();
    }
    for (const host of FIXTURE_HOSTS) {
      expect(gatedInfo(FIXTURES[host]), host).toBeNull();
    }
  });

  it('marks an area whose eligible checks all needed the homepage, and scores it as not scored', () => {
    const controls = group(gated, 'controls');
    expect(controls.allHomepageBlocked).toBe(true);
    expect(controls.pct).toBeNull();
    expect(controls.tone).toBe('neutral');
    expect(group(gated, 'reachability').allHomepageBlocked).toBe(false);
  });
});

describe('blockedCase (5.9, H4)', () => {
  const EXPECTED: Record<string, { kind: string; detail: string | null; tone: string; rescan: boolean }> = {
    'Request timed out.': { kind: 'timeout', detail: null, tone: 'neutral', rescan: true },
    'Checker time budget exhausted.': { kind: 'timeout', detail: null, tone: 'neutral', rescan: true },
    'Checker request budget exhausted.': { kind: 'budget', detail: null, tone: 'neutral', rescan: true },
    'Request failed.': { kind: 'connection', detail: null, tone: 'neutral', rescan: true },
    'Too many redirects.': { kind: 'redirect-loop', detail: 'loop', tone: 'attention', rescan: true },
    'Redirect response had no Location header.': { kind: 'redirect-loop', detail: 'no-location', tone: 'attention', rescan: true },
    'Response exceeded the checker size limit.': { kind: 'size-limit', detail: null, tone: 'attention', rescan: false },
    'Request was blocked by checker safety rules.': { kind: 'safety-rule', detail: null, tone: 'neutral', rescan: false },
  };

  it('covers every worker error string core publishes, so a renamed string fails here', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...WORKER_ERROR_MESSAGES].sort());
  });

  it.each([...WORKER_ERROR_MESSAGES])('maps %s to the 5.9 row', (message) => {
    const result = blockedResult(message);
    const report = score(result);
    expect(report.analysisStatus).toBe('blocked');
    const found = blockedCase(report, result);
    expect(found).not.toBeNull();
    expect({ kind: found?.kind, detail: found?.detail, tone: found?.tone, rescan: found?.rescan }).toEqual(EXPECTED[message]);
    expect(found?.httpStatus).toBeNull();
    // A transport failure is never red (H4).
    expect(found?.tone).not.toBe('action');
  });

  it('maps a final homepage status to the only red blocked case, without a rescan', () => {
    const found = blockedCase(SYNTHETIC.homepage404, RESULTS.homepage404);
    expect(found).toEqual({
      kind: 'http-status',
      detail: null,
      tone: 'action',
      rescan: false,
      httpStatus: 404,
      lastHopHost: null,
    });
  });

  it('maps a skipped homepage to budget and an unknown string to timeout', () => {
    const skipped = siteCheck({
      homepage: resource(HOME, { status: 0, ok: false, contentType: null, body: null, skipped: true }),
    });
    const skippedReport = score(skipped);
    expect(skippedReport.analysisStatus).toBe('blocked');
    expect(blockedCase(skippedReport, skipped)?.kind).toBe('budget');

    const unknown = blockedResult('Something nobody has seen before.');
    const unknownCase = blockedCase(score(unknown), unknown);
    expect(unknownCase?.kind).toBe('timeout');
    expect(unknownCase?.tone).toBe('neutral');
    expect(unknownCase?.rescan).toBe(true);
  });

  it('falls back to the reason in blockedReason when the homepage carries no error string', () => {
    for (const [message, kind] of [
      ['Request timed out.', 'timeout'],
      ['Request failed.', 'connection'],
      ['Response exceeded the checker size limit.', 'size-limit'],
    ] as const) {
      const result = blockedResult(message);
      const report = score(result);
      expect(report.blockedReason).toContain(`(${message.replace(/\.$/, '')})`);
      const withoutError: SiteCheckResponse = { ...result, homepage: { ...result.homepage, error: undefined } };
      expect(blockedCase(report, withoutError)?.kind, message).toBe(kind);
    }
  });

  it('names the last redirect hop only when it left the requested host', () => {
    const away = blockedResult('Too many redirects.', { finalUrl: 'https://loop.example.net/step-6' });
    expect(blockedCase(score(away), away)?.lastHopHost).toBe('loop.example.net');
    const home = blockedResult('Too many redirects.');
    expect(blockedCase(score(home), home)?.lastHopHost).toBeNull();
  });

  it('never exposes a destination for the safety-rule case', () => {
    const result = blockedResult('Request was blocked by checker safety rules.', { finalUrl: 'http://10.0.0.7/' });
    const found = blockedCase(score(result), result);
    expect(found?.kind).toBe('safety-rule');
    expect(found?.lastHopHost).toBeNull();
    expect(found?.httpStatus).toBeNull();
    expect(JSON.stringify(found)).not.toContain('10.0.0.7');
  });

  it('is null for any run that was scored', () => {
    expect(blockedCase(SYNTHETIC.reference, RESULTS.reference)).toBeNull();
    expect(blockedCase(SYNTHETIC.gated, RESULTS.gated)).toBeNull();
    expect(blockedCase(SYNTHETIC.provisional, RESULTS.provisional)).toBeNull();
  });

  it('gives the blocked tone to the whole report (7.8)', () => {
    const timeout = blockedCase(SYNTHETIC.blocked, RESULTS.blocked);
    expect(reportTone(SYNTHETIC.blocked, timeout)).toBe('neutral');
    const http = blockedCase(SYNTHETIC.homepage404, RESULTS.homepage404);
    expect(reportTone(SYNTHETIC.homepage404, http)).toBe('action');
  });
});

describe('tones (7.3, 7.8)', () => {
  it('maps grades to tones', () => {
    expect(gradeTone('A+')).toBe('good');
    expect(gradeTone('A')).toBe('good');
    expect(gradeTone('B')).toBe('attention');
    expect(gradeTone('C')).toBe('action');
    expect(gradeTone('D')).toBe('action');
    expect(gradeTone('F')).toBe('action');
  });

  it('keeps an area out of red without a required fail and neutral when not scored', () => {
    expect(groupTone({ pct: null, hasRequiredFail: false })).toBe('neutral');
    expect(groupTone({ pct: null, hasRequiredFail: true })).toBe('neutral');
    expect(groupTone({ pct: 40, hasRequiredFail: false })).toBe('attention');
    expect(groupTone({ pct: 40, hasRequiredFail: true })).toBe('action');
    expect(groupTone({ pct: 75, hasRequiredFail: false })).toBe('attention');
    expect(groupTone({ pct: 99, hasRequiredFail: false })).toBe('good');
    expect(groupTone({ pct: 100, hasRequiredFail: false })).toBe('good');
  });

  it('H13: a partial run takes its tone from the pessimistic end, not the score', () => {
    const partial = SYNTHETIC.failingProbe;
    expect(partial.analysisStatus).toBe('partial');
    expect(partial.range).not.toBeNull();
    const pessimisticGrade = gradeFor(partial.range?.pessimistic ?? 0);
    // The fixture only proves H13 while the two ends disagree.
    expect(pessimisticGrade).not.toBe(partial.grade);
    expect(reportTone(partial, null)).toBe(gradeTone(pessimisticGrade));
    expect(reportTone(partial, null)).not.toBe(gradeTone(partial.grade ?? 'F'));
  });
});

describe('fixPlan (8)', () => {
  it('collapses agentmarkup.dev (four bonus extras at the cap) to optional extras only', () => {
    const report = FIXTURES['agentmarkup.dev'];
    const plan = fixPlan(report);
    expect(report.score).toBe(100);
    expect(plan.atCap).toBe(true);
    expect(plan.optionalOnly).toBe(true);
    expect(plan.primary).toEqual([]);
    expect(plan.then).toEqual([]);
    expect(plan.all.map((check) => check.id)).toEqual(rankTopFixes(report.checks, TOP_FIXES_LIMIT).map((check) => check.id));
    expect(plan.all.length).toBeGreaterThan(0);
    expect(plan.all.every((check) => check.tier === 'bonus')).toBe(true);
  });

  it('keeps animafelix.com at the cap with three primary rows and a Then line of two', () => {
    const report = FIXTURES['animafelix.com'];
    const plan = fixPlan(report);
    const ranked = rankTopFixes(report.checks, TOP_FIXES_LIMIT).map((check) => check.id);
    expect(plan.atCap).toBe(true);
    expect(plan.optionalOnly).toBe(false);
    expect(plan.primary.map((check) => check.id)).toEqual(ranked.slice(0, 3));
    expect(plan.then.map((check) => check.id)).toEqual(ranked.slice(3, 5));
  });

  it('ranks the failing synthetic exactly as rankTopFixes, five of them', () => {
    const plan = fixPlan(SYNTHETIC.failing);
    const ranked = rankTopFixes(SYNTHETIC.failing.checks, TOP_FIXES_LIMIT).map((check) => check.id);
    expect(ranked).toHaveLength(TOP_FIXES_LIMIT);
    expect(plan.atCap).toBe(false);
    expect(plan.optionalOnly).toBe(false);
    expect(plan.all.map((check) => check.id)).toEqual(ranked);
    expect([...plan.primary, ...plan.then].map((check) => check.id)).toEqual(ranked);
    expect(plan.primary).toHaveLength(3);
  });

  it('starts tagteamdesign.com with the form-labelling fix', () => {
    expect(fixPlan(FIXTURES['tagteamdesign.com']).primary[0]?.id).toBe('ax.form-labeling');
  });
});

describe('partialInfo (5.8)', () => {
  it('is null on complete and blocked runs', () => {
    expect(partialInfo(SYNTHETIC.reference)).toBeNull();
    expect(partialInfo(SYNTHETIC.blocked)).toBeNull();
    for (const host of FIXTURE_HOSTS) {
      expect(partialInfo(FIXTURES[host]), host).toBeNull();
    }
  });

  it('reports the range ends, their grades and the unverified count', () => {
    const report = SYNTHETIC.failingProbe;
    const info = partialInfo(report);
    expect(info).toEqual({
      low: report.range?.pessimistic,
      high: report.range?.optimistic,
      gradeLow: gradeFor(report.range?.pessimistic ?? 0),
      gradeHigh: gradeFor(report.range?.optimistic ?? 0),
      unverified: report.unverifiedChecks.length,
      resourceLabels: [],
    });
  });

  it('names a resource no check waited on (the sample page) by its label', () => {
    const report = SYNTHETIC.sampleTimedOut;
    expect(report.unverifiedChecks).toEqual([]);
    expect(unverifiedResourcesWithoutChecks(report)).toEqual(['samplePage']);
    expect(partialInfo(report)?.resourceLabels).toEqual([RESOURCE_LABELS.samplePage]);
    expect(partialInfo(report)?.unverified).toBe(0);
  });
});

describe('displayStatus and list order (7.5, H5)', () => {
  function scored(overrides: Partial<ScoredCheck>): ScoredCheck {
    return {
      id: 'robots.ai-search-access',
      tier: 'recommended',
      status: 'pass',
      fraction: 1,
      evidence: 'allowed: 4 of 4 user agents',
      estGain: null,
      ...overrides,
    };
  }

  it('maps every status to the 7.5 table', () => {
    expect(displayStatus(scored({ id: 'nav.not-found', tier: 'required', status: 'fail', fraction: 0, estGain: 8.9 }))).toBe('fail-action');
    expect(displayStatus(scored({ status: 'fail', fraction: 0, estGain: 2 }))).toBe('fail-attention');
    expect(displayStatus(scored({ id: 'llms.exists', tier: 'bonus', status: 'fail', fraction: 0, estGain: 0.25 }))).toBe('fail-attention');
    // An upside-only bonus fail never subtracts, but it is shown as needing a fix in red.
    expect(displayStatus(scored({ id: 'jsonld.syntax', tier: 'bonus', status: 'fail', fraction: 0, estGain: 0.25 }))).toBe('fail-action');
    expect(displayStatus(scored({ status: 'partial', fraction: 0.5, estGain: 1 }))).toBe('partial');
    expect(displayStatus(scored({ status: 'pass' }))).toBe('pass');
    expect(displayStatus(scored({ status: 'unverified', fraction: null }))).toBe('unverified');
    expect(displayStatus(scored({ status: 'na', fraction: null, reason: 'no-robots' }))).toBe('na');
    expect(displayStatus(scored({ status: 'not-measured', fraction: null }))).toBe('not-measured');
  });

  it('never shows a not-applicable or not-measured check in a failure state on any report', () => {
    for (const [name, report] of SCORED_CASES) {
      for (const check of report.checks) {
        if (check.status === 'na' || check.status === 'not-measured') {
          expect(displayStatus(check), `${name} ${check.id}`).toBe(check.status);
        }
      }
    }
  });

  it('orders lists by estimated gain, then catalog order', () => {
    const checks = SYNTHETIC.failing.checks.filter((check) => check.status === 'fail' || check.status === 'partial');
    const sorted = [...checks].sort(compareForList).map((check) => check.id);
    const expected = [...checks]
      .sort((a, b) => (b.estGain ?? 0) - (a.estGain ?? 0) || catalogIndexOf(a.id) - catalogIndexOf(b.id))
      .map((check) => check.id);
    expect(sorted).toEqual(expected);
  });
});

describe('formatPoints', () => {
  it('rounds to the requested decimals and drops trailing zeros', () => {
    expect(formatPoints(80)).toBe('80');
    expect(formatPoints(80, 1)).toBe('80');
    expect(formatPoints(1.38, 2)).toBe('1.38');
    expect(formatPoints(2.5, 2)).toBe('2.5');
    expect(formatPoints(80 / 9, 2)).toBe('8.89');
    expect(formatPoints(19.8178, 1)).toBe('19.8');
    expect(formatPoints(35.5555, 1)).toBe('35.6');
    expect(formatPoints(0.25, 2)).toBe('0.25');
  });
});

describe('report-history (6.4)', () => {
  const HOST = 'example.com';
  const reference = SYNTHETIC.reference;
  const later = score(siteCheck({ fetchedAt: '2026-11-05T09:30:00.000Z' }));

  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      // A storage that throws is one of the cases under test.
    }
  });

  it('is idempotent per fetchedAt (StrictMode runs the effect twice)', () => {
    rememberReport(HOST, reference);
    rememberReport(HOST, reference);
    expect(previousReport(HOST, reference.fetchedAt)).toBeNull();
    expect(previousReport(HOST, 'a-later-scan')?.fetchedAt).toBe(reference.fetchedAt);

    rememberReport(HOST, later);
    rememberReport(HOST, later);
    expect(previousReport(HOST, later.fetchedAt)?.fetchedAt).toBe(reference.fetchedAt);
    expect(previousReport(HOST, 'a-third-scan')?.fetchedAt).toBe(later.fetchedAt);
    expect(previousReport(HOST, later.fetchedAt)?.score).toBe(reference.score);
  });

  it('stores and compares complete reports only', () => {
    const partial = score(siteCheck({ llms: timedOut(`${ORIGIN}/llms.txt`), fetchedAt: '2026-11-06T09:30:00.000Z' }));
    expect(partial.analysisStatus).toBe('partial');
    rememberReport('partial.example', partial);
    expect(previousReport('partial.example', 'other')).toBeNull();

    rememberReport(HOST, reference);
    rememberReport(HOST, partial);
    rememberReport(HOST, SYNTHETIC.blocked);
    expect(previousReport(HOST, 'other')?.fetchedAt).toBe(reference.fetchedAt);
    expect(previousReport(HOST, 'other')?.analysisStatus).toBe('complete');
  });

  it('ignores a stored report whose shape the comparison cannot read', () => {
    const store = (latest: unknown) =>
      window.localStorage.setItem('am-checker-history-v1', JSON.stringify({ version: 1, entries: [{ host: HOST, latest, previous: null }] }));

    store({ ...reference, score: undefined });
    expect(previousReport(HOST, 'other')).toBeNull();

    store({ ...reference, checks: [null] });
    expect(previousReport(HOST, 'other')).toBeNull();

    store({ ...reference, checks: [{ id: 'robots.ai-search-access' }] });
    expect(previousReport(HOST, 'other')).toBeNull();

    store(reference);
    expect(previousReport(HOST, 'other')?.fetchedAt).toBe(reference.fetchedAt);
  });

  it('keeps at most ten hosts, dropping the least recently saved', () => {
    for (let index = 0; index < 11; index += 1) {
      rememberReport(`site-${index}.example`, reference);
    }
    expect(previousReport('site-0.example', 'other')).toBeNull();
    expect(previousReport('site-1.example', 'other')?.fetchedAt).toBe(reference.fetchedAt);
    expect(previousReport('site-10.example', 'other')?.fetchedAt).toBe(reference.fetchedAt);
  });

  function withLocalStorage(replacement: PropertyDescriptor, run: () => void): void {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...replacement });
    try {
      run();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    }
  }

  it('survives a localStorage whose methods throw on every call', () => {
    const fail = () => {
      throw new Error('SecurityError');
    };
    const throwing = { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 };
    withLocalStorage({ value: throwing }, () => {
      expect(() => rememberReport(HOST, reference)).not.toThrow();
      expect(() => previousReport(HOST, 'other')).not.toThrow();
      expect(previousReport(HOST, 'other')).toBeNull();
    });
  });

  it('survives a localStorage accessor that throws (blocked site data)', () => {
    withLocalStorage(
      {
        get() {
          throw new Error('SecurityError');
        },
      },
      () => {
        expect(() => rememberReport(HOST, reference)).not.toThrow();
        expect(() => previousReport(HOST, 'other')).not.toThrow();
        expect(previousReport(HOST, 'other')).toBeNull();
      }
    );
  });

  it('ignores a corrupted history entry', () => {
    window.localStorage.setItem('am-checker-history-v1', '{not json');
    expect(previousReport(HOST, 'other')).toBeNull();
    expect(() => rememberReport(HOST, reference)).not.toThrow();
    expect(previousReport(HOST, 'other')?.fetchedAt).toBe(reference.fetchedAt);
  });
});
