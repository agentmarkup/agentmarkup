import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreReport } from '@agentmarkup/core/score';
import { run } from '../src/cli.js';
import { renderScoreLines } from '../src/report.js';
import { createFetchStub, healthySite, settleWithFakeTimers } from './helpers/fetch-stub.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    ctx: {
      version: '9.9.9',
      now: () => '2026-11-02T12:00:00.000Z',
      stdout: (t: string) => out.push(t),
      stderr: (t: string) => err.push(t),
      collect: { minGapMs: 0 },
    },
  };
}

describe('--score on the audit CLI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches a ScoreReport to the JSON report while the crawler probes stay findings', async () => {
    const stub = createFetchStub(healthySite());
    vi.stubGlobal('fetch', stub.fetch);
    const c = capture();

    const code = await settleWithFakeTimers(run(['--score', '--json', 'https://example.com'], c.ctx));
    expect(code).toBe(0);
    const report = JSON.parse(c.out.join('')) as {
      findings: Array<{ code: string }>;
      score: ScoreReport;
      fetchedAt: string;
    };
    expect(report.fetchedAt).toBe('2026-11-02T12:00:00.000Z');
    expect(report.findings.some((f) => f.code.startsWith('crawler.'))).toBe(true);
    expect(report.score.catalogVersion).toBe('1.0.0');
    expect(report.score.formulaVersion).toBe('1.0.0');
    expect(report.score.analysisStatus).toBe('complete');
    expect(report.score.score).toBeGreaterThanOrEqual(0);
    expect(report.score.score).toBeLessThanOrEqual(100);
    expect(report.score.fetchedAt).toBe('2026-11-02T12:00:00.000Z');
    expect(report.score.samplePageUrl).toBe('https://example.com/about/');
    expect(report.score.checks.length).toBeGreaterThan(20);
    // The score evidence comes from the checker-shaped collector, never from
    // the spoofed crawler user-agents: every collector call carries the batch UA.
    const collectorCalls = stub.calls.filter((call) =>
      new Headers(call.init.headers).get('user-agent')?.startsWith('agentmarkup-checker/')
    );
    expect(collectorCalls).toHaveLength(8);
    for (const check of report.score.checks) {
      expect(check.evidence).not.toContain('<');
    }
  });

  it('prints a score block in the text report and omits it without --score', async () => {
    const stub = createFetchStub(healthySite());
    vi.stubGlobal('fetch', stub.fetch);

    const withScore = capture();
    await settleWithFakeTimers(run(['--score', 'example.com'], withScore.ctx));
    const text = withScore.out.join('');
    expect(text).toContain('Agent-readiness score');
    expect(text).toContain('catalog 1.0.0, formula 1.0.0');
    expect(text).toContain('https://agentmarkup.dev/score/');

    const without = capture();
    await settleWithFakeTimers(run(['--json', 'example.com'], without.ctx));
    expect(JSON.parse(without.out.join(''))).not.toHaveProperty('score');
    expect(without.out.join('')).not.toContain('Agent-readiness score');
  });

  it('describes a blocked run without a number and a partial run with its range', () => {
    const base: ScoreReport = {
      catalogVersion: '1.0.0',
      formulaVersion: '1.0.0',
      analysisStatus: 'blocked',
      score: null,
      grade: null,
      label: null,
      raw: null,
      required: { earned: 0, available: 80, passing: 0, total: 0 },
      recommended: { earned: 0, available: 20, passing: 0, total: 0 },
      bonus: { points: 0, signals: 0, cap: 5 },
      checks: [],
      topFixes: [],
      unverifiedChecks: [],
      naChecks: [],
      notMeasured: [],
      range: null,
      targetUrl: 'https://example.com/',
      samplePageUrl: null,
      fetchedAt: null,
      platform: null,
      surfaces: null,
    };
    expect(renderScoreLines(base).join('\n')).toContain('could not reach the site in time');

    const partial: ScoreReport = {
      ...base,
      analysisStatus: 'partial',
      score: 83,
      grade: 'B',
      label: 'Readable, with fixable gaps',
      raw: 83.12,
      unverifiedChecks: ['sitemap.valid'],
      range: { pessimistic: 81, optimistic: 83 },
    };
    const lines = renderScoreLines(partial).join('\n');
    expect(lines).toContain('83/100');
    expect(lines).toContain('between 81 and 83');
    expect(lines).toContain('sitemap.valid');
  });
});
