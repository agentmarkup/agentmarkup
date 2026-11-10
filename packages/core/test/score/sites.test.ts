// The no-false-findings contract (spec section 9.2): every fixture's expected.json lists
// each non-pass with a human-readable `verified` note; a new non-pass, a vanished one, or a
// moved score fails the suite until someone confirms it against the body or fixes the rule.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCORE_CATALOG, SCORE_CATALOG_VERSION } from '../../src/score/catalog.js';
import { EVALUATORS, evaluateSiteChecks } from '../../src/score/evaluate.js';
import { classifyResource } from '../../src/score/evidence.js';
import { SCORE_FORMULA_VERSION, scoreChecks } from '../../src/score/formula.js';
import type {
  AnalysisStatus,
  BonusSummary,
  CheckStatus,
  EvidenceResourceKey,
  Grade,
  ScoreRange,
  SiteEvidence,
  SitePlatform,
  TierSummary,
} from '../../src/score/types.js';

interface ExpectedNonPass {
  status: Extract<CheckStatus, 'fail' | 'partial'>;
  fraction: number;
  verified: string;
}

interface ExpectedReport {
  site: string;
  source: string;
  fetchedAt: string;
  catalogVersion: string;
  formulaVersion: string;
  score: number | null;
  grade: Grade | null;
  raw: number | null;
  analysisStatus: AnalysisStatus;
  range: ScoreRange | null;
  samplePageUrl: string | null;
  platform: SitePlatform | null;
  required: TierSummary;
  recommended: TierSummary;
  bonus: BonusSummary;
  nonPass: Record<string, ExpectedNonPass>;
  unverified: string[];
  na: string[];
  notMeasured: string[];
  topFixes: string[];
}

const dir = fileURLToPath(new URL('../fixtures/score/', import.meta.url));
const files = readdirSync(dir);
const hosts = files
  .filter((file) => file.endsWith('.json') && !file.endsWith('.expected.json') && !file.startsWith('ora-'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();

function load(host: string): { evidence: SiteEvidence; expected: ExpectedReport } {
  return {
    evidence: JSON.parse(readFileSync(`${dir}${host}.json`, 'utf8')) as SiteEvidence,
    expected: JSON.parse(readFileSync(`${dir}${host}.expected.json`, 'utf8')) as ExpectedReport,
  };
}

/** Deterministic key reorder (LCG shuffle) so object key order cannot influence a result. */
function shuffleKeys<T extends object>(value: T, seed: number): T {
  const keys = Object.keys(value);
  let state = seed;
  for (let i = keys.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = (value as Record<string, unknown>)[key];
  }
  return out as T;
}

describe('score fixtures', () => {
  it('has the seven-site panel plus the emag.ro bot wall and an expected contract for every fixture', () => {
    expect(hosts).toEqual([
      'agentmarkup.dev',
      'animafelix.com',
      'cochinescu.com',
      'emag.ro',
      'sandiegowebstudios.com',
      'seodesignchicago.com',
      'tagteamdesign.com',
      'visualwebz.com',
    ]);
    for (const host of hosts) {
      expect(files, `${host}.expected.json`).toContain(`${host}.expected.json`);
    }
    expect(files).toContain('README.md');
  });
});

// The 2026-11-02 tagteamdesign.com capture timed out on its robots-declared sitemap index;
// the 2026-11-09 re-record fetched it. Replaying that exact transport failure on the real
// capture keeps site-level coverage that a timeout yields an unverified check and a partial
// run with a range, never a fail, and that it moves nothing but sitemap.valid.
describe('tagteamdesign.com with the 2026-11-02 sitemap timeout replayed', () => {
  const { evidence } = load('tagteamdesign.com');
  const sitemapUrl = evidence.sitemap?.requestedUrl ?? '';
  const replay: SiteEvidence = {
    ...evidence,
    sitemap: {
      requestedUrl: sitemapUrl,
      finalUrl: sitemapUrl,
      status: 0,
      ok: false,
      contentType: null,
      body: null,
      xRobotsTag: null,
      error: 'Request timed out.',
    },
  };
  const complete = scoreChecks(evaluateSiteChecks(evidence));
  const partial = scoreChecks(evaluateSiteChecks(replay));

  it('reproduces the 2026-11-02 partial contract and changes only sitemap.valid', () => {
    expect(sitemapUrl).toBe('https://www.tagteamdesign.com/sitemap_index.xml');
    expect(evidence.sitemapSource).toBe('robots');
    expect(classifyResource(replay.sitemap)).toBe('unverified');
    expect(partial.analysisStatus).toBe('partial');
    expect(partial.unverifiedChecks).toEqual(['sitemap.valid']);
    expect(partial.score).toBe(83);
    expect(partial.raw).toBe(83.12);
    expect(partial.range).toEqual({ pessimistic: 81, optimistic: 83 });
    expect(partial.recommended).toEqual({ earned: 17.5, available: 20, passing: 5, total: 8 });
    const sitemapValid = partial.checks.find((check) => check.id === 'sitemap.valid');
    expect(sitemapValid?.status).toBe('unverified');
    expect(sitemapValid?.evidence).toContain('declared in robots.txt');
    expect(partial.checks.find((check) => check.id === 'sitemap.lastmod')?.status).toBe('na');
    const moved = partial.checks
      .filter((check, index) => check.status !== complete.checks[index].status)
      .map((check) => `${check.id}:${complete.checks.find((other) => other.id === check.id)?.status}->${check.status}`);
    expect(moved).toEqual(['sitemap.valid:pass->unverified']);
    for (const check of partial.checks) {
      if (check.status === 'fail') {
        expect(check.resources ?? [], `${check.id} fails on the unverified sitemap`).not.toContain('sitemap');
      }
    }
  });
});

// emag.ro, 2026-11-09: every resource but robots.txt answered HTTP 511 with an AWS WAF
// captcha page. Catalog 1.0.0 read that as transport noise and blocked the run ("did not
// answer within 10 seconds" on the website); 1.1.0 reads it as the bot wall it is.
describe('emag.ro: an AWS WAF captcha served with HTTP 511', () => {
  const { evidence } = load('emag.ro');
  const evaluation = evaluateSiteChecks(evidence);
  const report = scoreChecks(evaluation);

  it('is gated, not blocked: bot-detection fails quoting the 511 and the awswaf.com marker', () => {
    expect(evidence.homepage.status).toBe(511);
    expect(evidence.fetchSummary?.analysisStatus).toBe('blocked');
    for (const key of ['homepage', 'homepageMarkdown', 'llmsTxt', 'sitemap', 'notFoundProbe'] as const) {
      expect(classifyResource(evidence[key]), key).toBe('challenge');
    }
    expect(classifyResource(evidence.robotsTxt)).toBe('ok');
    expect(evaluation.blocked).toBe(false);
    expect(evaluation.blockedKind).toBeNull();
    expect(evaluation.blockedReason).toBe('Agents cannot reach this site: HTTP 511 challenge page (awswaf.com)');
    expect(report.checks.find((check) => check.id === 'reach.bot-detection')).toMatchObject({
      status: 'fail',
      fraction: 0,
      evidence: 'HTTP 511, challenge marker "awswaf.com"',
    });
    for (const [id, entry] of Object.entries(EVALUATORS)) {
      if (entry.needsHomepage) {
        const check = report.checks.find((candidate) => candidate.id === id);
        expect(check?.status, id).toBe('na');
        expect(check?.reason, id).toBe('homepage-blocked');
      }
    }
    expect(report.score).not.toBeNull();
    expect(report.blockedKind).toBeNull();
  });
});

describe.each(hosts)('%s', (host) => {
  const { evidence, expected } = load(host);
  const evaluation = evaluateSiteChecks(evidence);
  const report = scoreChecks(evaluation);

  it('matches the expected score, grade, status, range and top fixes', () => {
    expect(expected.site).toBe(host);
    expect(expected.source.length).toBeGreaterThan(20);
    expect(expected.catalogVersion).toBe(SCORE_CATALOG_VERSION);
    expect(expected.formulaVersion).toBe(SCORE_FORMULA_VERSION);
    expect(report.catalogVersion).toBe(expected.catalogVersion);
    expect(report.formulaVersion).toBe(expected.formulaVersion);
    expect(report.score).toBe(expected.score);
    expect(report.grade).toBe(expected.grade);
    expect(report.raw).toBe(expected.raw);
    expect(report.analysisStatus).toBe(expected.analysisStatus);
    expect(report.range).toEqual(expected.range);
    expect(report.samplePageUrl).toBe(expected.samplePageUrl);
    expect(report.platform).toBe(expected.platform);
    expect(report.required).toEqual(expected.required);
    expect(report.recommended).toEqual(expected.recommended);
    expect(report.bonus).toEqual(expected.bonus);
    expect(report.topFixes.slice(0, 3).map((check) => check.id)).toEqual(expected.topFixes);
    expect(report.fetchedAt).toBe(expected.fetchedAt);
  });

  it('lists every non-pass with a verified note, and every unverified, na and not-measured check', () => {
    expect(report.checks.map((check) => check.id)).toEqual(SCORE_CATALOG.map((definition) => definition.id));
    const nonPassIds: string[] = [];
    const unverifiedIds: string[] = [];
    const naIds: string[] = [];
    const notMeasuredIds: string[] = [];
    for (const check of report.checks) {
      switch (check.status) {
        case 'pass':
          expect(expected.nonPass[check.id], `${check.id} now passes but is listed as a non-pass: re-confirm the contract`).toBeUndefined();
          break;
        case 'fail':
        case 'partial': {
          nonPassIds.push(check.id);
          const entry = expected.nonPass[check.id];
          expect(entry, `new finding ${check.id} (${check.status} ${check.fraction}): ${check.evidence}; confirm it on the live site or fix the rule`).toBeDefined();
          expect(entry.status, check.id).toBe(check.status);
          expect(entry.fraction, check.id).toBe(check.fraction);
          expect(entry.verified.trim().length, `${check.id} needs a verified note`).toBeGreaterThan(20);
          break;
        }
        case 'unverified':
          unverifiedIds.push(check.id);
          break;
        case 'na':
          naIds.push(check.id);
          break;
        case 'not-measured':
          notMeasuredIds.push(check.id);
          break;
      }
    }
    expect(Object.keys(expected.nonPass).sort()).toEqual(nonPassIds.sort());
    expect(unverifiedIds).toEqual(expected.unverified);
    expect(naIds).toEqual(expected.na);
    expect(notMeasuredIds).toEqual(expected.notMeasured);
    expect(report.unverifiedChecks).toEqual(expected.unverified);
  });

  it('carries evidence without raw HTML, non-empty on every fail and partial', () => {
    for (const check of report.checks) {
      expect(check.evidence, check.id).not.toContain('<');
      expect(check.evidence, check.id).not.toContain('>');
      if (check.status === 'fail' || check.status === 'partial') {
        expect(check.evidence.trim().length, check.id).toBeGreaterThan(0);
        expect(check.fraction, check.id).not.toBeNull();
      }
      if (check.status === 'na' || check.status === 'unverified' || check.status === 'not-measured') {
        expect(check.fraction, check.id).toBeNull();
        expect(check.reason, check.id).toBeTruthy();
      }
    }
  });

  it('never turns a transport failure into a fail', () => {
    const unverifiedResources = new Set<EvidenceResourceKey>();
    const keys: EvidenceResourceKey[] = [
      'homepage',
      'homepageMarkdown',
      'llmsTxt',
      'robotsTxt',
      'sitemap',
      'notFoundProbe',
      'samplePage',
      'samplePageMarkdown',
    ];
    for (const key of keys) {
      if (classifyResource(evidence[key]) === 'unverified') {
        unverifiedResources.add(key);
      }
    }
    for (const check of report.checks) {
      if (check.status !== 'fail') {
        continue;
      }
      for (const key of check.resources ?? []) {
        expect(unverifiedResources.has(key), `${check.id} fails on unverified ${key}`).toBe(false);
      }
    }
    expect(unverifiedResources.size).toBe(0);
    // Every recorded fetch completed. The one unverified check a fixture may carry is
    // nav.not-found on a challenged probe (emag.ro): a bot wall, never a transport failure.
    const unverifiedChecks = report.checks.filter((check) => check.status === 'unverified');
    for (const check of unverifiedChecks) {
      expect(check.reason, check.id).toBe('probe-challenged');
    }
    expect(report.unverifiedResources).toEqual([]);
    expect(report.analysisStatus).toBe(unverifiedChecks.length === 0 ? 'complete' : 'partial');
    expect(report.range === null).toBe(unverifiedChecks.length === 0);
  });

  it('is deterministic across runs, key order and an injected now', () => {
    const again = scoreChecks(evaluateSiteChecks(evidence));
    expect(again).toEqual(report);
    const shuffled = shuffleKeys(evidence, 7);
    expect(Object.keys(shuffled)).not.toEqual(Object.keys(evidence));
    expect(scoreChecks(evaluateSiteChecks(shuffled))).toEqual(report);
    const deepShuffled = shuffleKeys(
      { ...evidence, homepage: shuffleKeys(evidence.homepage, 11), robotsTxt: shuffleKeys(evidence.robotsTxt, 13) },
      17
    );
    expect(scoreChecks(evaluateSiteChecks(deepShuffled))).toEqual(report);
    expect(scoreChecks(evaluateSiteChecks(evidence, { now: evidence.fetchedAt }))).toEqual(report);
  });
});
