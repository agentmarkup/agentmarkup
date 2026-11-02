// @vitest-environment node
// The checker adapter runs the score engine over a `/api/check` payload and maps
// every result onto the findings the page renders. No DOM: this file runs in Node.
import { describe, expect, it } from 'vitest';
import type { ScoredCheck } from '@agentmarkup/core/score';

import { analyzeSiteCheck } from '../src/checker/analyze';
import { levelForCheck } from '../src/checker/check-copy';
import type { SiteAnalysis } from '../src/checker/types';
import {
  DEFAULT_BODY,
  HOME,
  ORG_GRAPH,
  ORIGIN,
  PROBE_URL,
  homepage,
  notFound,
  page,
  siteCheck,
  status,
  text,
  timedOut,
} from './helpers/score-fixture';

function itemById(analysis: SiteAnalysis, id: string) {
  const item = analysis.items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`no finding with id ${id}; got ${analysis.items.map((candidate) => candidate.id).join(', ')}`);
  }
  return item;
}

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

const BLOCKED_ROBOTS = text(
  `${ORIGIN}/robots.txt`,
  ['User-agent: PerplexityBot', 'Disallow: /', `Sitemap: ${ORIGIN}/sitemap.xml`, ''].join('\n')
);

describe('analyzeSiteCheck', () => {
  it('scores the reference site 100 with every finding passing', () => {
    const analysis = analyzeSiteCheck(siteCheck());

    expect(analysis.normalizedUrl).toBe(HOME);
    expect(analysis.report.score).toBe(100);
    expect(analysis.report.analysisStatus).toBe('complete');
    expect(analysis.items.length).toBeGreaterThan(0);
    expect(analysis.counts).toEqual({ error: 0, warning: 0, pass: analysis.items.length });
    expect(Array.isArray(analysis.jsonLdTypes)).toBe(true);
  });

  it('maps a required fail to an error and recommended or partial results to warnings', () => {
    const analysis = analyzeSiteCheck(
      siteCheck({
        probe: status(PROBE_URL, 200, { body: '<html><body><h1>Oops</h1></body></html>' }),
        robots: BLOCKED_ROBOTS,
        homepage: homepage(DEFAULT_BODY, { jsonLd: [] }),
      })
    );

    expect(itemById(analysis, 'nav.not-found').level).toBe('error');
    expect(itemById(analysis, 'jsonld.identity').level).toBe('warning');
    const robots = analysis.report.checks.find((check) => check.id === 'robots.ai-search-access');
    expect(['partial', 'fail']).toContain(robots?.status);
    expect(itemById(analysis, 'robots.ai-search-access').level).toBe('warning');
    expect(itemById(analysis, 'reach.bot-detection').level).toBe('pass');
    expect(analysis.counts.error).toBeGreaterThan(0);
  });

  it('shows a failing bonus signal as a warning and a failing upside-only bonus as an error', () => {
    const bonusFail = analyzeSiteCheck(siteCheck({ probe: notFound(PROBE_URL, 'text/html; charset=utf-8') }));
    expect(itemById(bonusFail, 'nav.not-found').level).toBe('pass');
    expect(itemById(bonusFail, 'nav.not-found-markdown').level).toBe('warning');

    const syntaxFail = analyzeSiteCheck(
      siteCheck({ homepage: homepage(DEFAULT_BODY, { jsonLd: [ORG_GRAPH, '{"@type": "Organization", broken'] }) })
    );
    expect(itemById(syntaxFail, 'jsonld.syntax').level).toBe('error');
    expect(syntaxFail.report.grade).toBe('A+');
  });

  it('groups unverified checks per resource into one warning and keeps the robots.txt declaration', () => {
    const analysis = analyzeSiteCheck(
      siteCheck({ llms: timedOut(`${ORIGIN}/llms.txt`), sitemap: timedOut(`${ORIGIN}/sitemap.xml`) })
    );

    expect(analysis.report.analysisStatus).toBe('partial');
    expect(analysis.report.range).not.toBeNull();
    expect(analysis.report.unverifiedChecks.length).toBeGreaterThan(0);

    const llms = itemById(analysis, 'unverified-llmsTxt');
    expect(llms.level).toBe('warning');
    expect(llms.title).toBe('llms.txt could not be verified in time');
    expect(llms.detail).toContain('Request timed out');

    const sitemap = itemById(analysis, 'unverified-sitemap');
    expect(sitemap.title).toBe('Sitemap could not be verified in time');
    expect(sitemap.detail).toContain('declared in robots.txt');

    for (const id of analysis.report.unverifiedChecks) {
      expect(analysis.items.some((item) => item.id === id)).toBe(false);
    }
    expect(analysis.items.filter((item) => item.id.startsWith('unverified-')).length).toBeGreaterThanOrEqual(2);
  });

  it('lists not-applicable and not-measured checks in the report, never as findings', () => {
    const analysis = analyzeSiteCheck(siteCheck());

    expect(analysis.report.naChecks.length).toBeGreaterThan(0);
    expect(analysis.report.notMeasured.length).toBeGreaterThan(0);
    const ids = new Set(analysis.items.map((item) => item.id));
    for (const entry of analysis.report.naChecks) {
      expect(ids.has(entry.id)).toBe(false);
    }
    for (const id of analysis.report.notMeasured) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('returns no score for a blocked run and a single grouped homepage warning', () => {
    const analysis = analyzeSiteCheck(siteCheck({ homepage: timedOut(HOME) }));

    expect(analysis.report.analysisStatus).toBe('blocked');
    expect(analysis.report.score).toBeNull();
    expect(analysis.report.grade).toBeNull();
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0].id).toBe('unverified-homepage');
    expect(analysis.items[0].level).toBe('warning');
    expect(analysis.items[0].title).toBe('Homepage could not be verified in time');
    expect(analysis.counts).toEqual({ error: 0, warning: 1, pass: 0 });
  });

  it('never leaks raw HTML into titles, details or actions', () => {
    const fixtures = [
      siteCheck(),
      siteCheck({ probe: status(PROBE_URL, 200, { body: page() }) }),
      siteCheck({ homepage: timedOut(HOME) }),
      siteCheck({ homepage: homepage(DEFAULT_BODY, { jsonLd: ['<script>alert(1)</script>'] }) }),
      siteCheck({ homepage: homepage('<body><div id="app"></div><script src="/app.js"></script></body></html>') }),
    ];

    for (const fixture of fixtures) {
      const analysis = analyzeSiteCheck(fixture);
      for (const item of analysis.items) {
        expect(item.title).not.toContain('<');
        expect(item.detail).not.toContain('<');
        expect(item.action).not.toContain('<');
      }
    }
  });

  it('gives every finding a unique id and orders findings by level, then estimated gain', () => {
    const analysis = analyzeSiteCheck(
      siteCheck({
        probe: status(PROBE_URL, 302, { headers: { location: HOME } }),
        robots: BLOCKED_ROBOTS,
        llms: timedOut(`${ORIGIN}/llms.txt`),
        homepage: homepage(DEFAULT_BODY, { jsonLd: [], canonical: null }),
      })
    );

    const ids = analysis.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const weight = { error: 0, warning: 1, pass: 2 } as const;
    const gains = new Map(analysis.report.checks.map((check) => [check.id, check.estGain ?? -1]));
    for (let index = 1; index < analysis.items.length; index += 1) {
      const previous = analysis.items[index - 1];
      const current = analysis.items[index];
      expect(weight[previous.level]).toBeLessThanOrEqual(weight[current.level]);
      if (previous.level === current.level && previous.checkId && current.checkId) {
        expect(gains.get(previous.checkId) ?? -1).toBeGreaterThanOrEqual(gains.get(current.checkId) ?? -1);
      }
    }
  });

  it('exposes the missing-path probe in the resource panel only when the worker ran it', () => {
    const withProbe = analyzeSiteCheck(siteCheck());
    const probe = withProbe.resources.find((resource) => resource.key === 'notFoundProbe');
    expect(probe?.label).toBe('Missing-path probe');
    expect(probe?.level).toBe('pass');
    expect(probe?.status).toBe('HTTP 404');
    expect(probe?.agentmarkupHelp).toBeTruthy();

    const withoutProbe = analyzeSiteCheck(siteCheck({ probe: null }));
    expect(withoutProbe.resources.some((resource) => resource.key === 'notFoundProbe')).toBe(false);
    expect(withoutProbe.resources.map((resource) => resource.key)).toEqual([
      'homepage',
      'homepageMarkdown',
      'llmsTxt',
      'robotsTxt',
      'sitemap',
      'samplePage',
      'samplePageMarkdown',
    ]);
  });

  it('describes an unverified resource without counting it against the site', () => {
    const analysis = analyzeSiteCheck(siteCheck({ robots: timedOut(`${ORIGIN}/robots.txt`) }));
    const robots = analysis.resources.find((resource) => resource.key === 'robotsTxt');

    expect(robots?.level).toBe('warning');
    expect(robots?.status).toBe('Request failed');
    expect(robots?.detail).toMatch(/robots\.txt could not be verified in time \(Request timed out\)/i);
    expect(robots?.detail).toContain('never counted against the site');
  });
});

describe('levelForCheck', () => {
  it('maps every status to the level rule from the spec', () => {
    expect(levelForCheck(scored({ status: 'pass' }))).toBe('pass');
    expect(levelForCheck(scored({ status: 'partial', fraction: 0.5, estGain: 1 }))).toBe('warning');
    expect(levelForCheck(scored({ status: 'fail', fraction: 0, estGain: 2 }))).toBe('warning');
    expect(levelForCheck(scored({ id: 'nav.not-found', tier: 'required', status: 'fail', fraction: 0, estGain: 8.9 }))).toBe('error');
    expect(levelForCheck(scored({ id: 'llms.exists', tier: 'bonus', status: 'fail', fraction: 0, estGain: 0.25 }))).toBe('warning');
    expect(levelForCheck(scored({ id: 'jsonld.syntax', tier: 'bonus', status: 'fail', fraction: 0, estGain: 0.25 }))).toBe('error');
    expect(levelForCheck(scored({ status: 'unverified', fraction: null }))).toBe('warning');
    expect(levelForCheck(scored({ status: 'na', fraction: null }))).toBeNull();
    expect(levelForCheck(scored({ status: 'not-measured', fraction: null }))).toBeNull();
  });
});
