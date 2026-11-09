// @vitest-environment happy-dom
// Report UI (spec 2026-11-09-report-ux-spec.md, section 12.4). Ports every assertion of the
// retired checker-score-panel.test.ts (ScorePanel, TopFixes and the /score/ page) onto the
// new report components, then adds the checks for the new behaviour: chips, the jump from a
// fix to its evidence, one product line, and the honesty rules H1-H13 as they show on screen.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCORE_CATALOG,
  SCORE_CATALOG_VERSION,
  TOP_FIXES_LIMIT,
  evaluateSiteChecks,
  getCheckDefinition,
  rankTopFixes,
  renderClientSummary,
  roundTo,
  scoreChecks,
  type ScoreReport,
  type SiteEvidence,
} from '@agentmarkup/core/score';

import { analyzeSiteCheck } from '../src/checker/analyze';
import { auditItemsForReport } from '../src/checker/check-copy';
import { renderDeveloperBrief } from '../src/checker/report-copy';
import { areaTotal, fixPlan, formatPoints, type FixPlan } from '../src/checker/report-model';
import { quotaNote, scanMeta } from '../src/checker/scan-meta';
import type { SiteCheckResponse } from '../src/checker/types';
import ScoreMethodology from '../src/pages/ScoreMethodology';
import { verdictExplanationForGrade } from '../src/ui/status-model';
import { FixList } from '../src/ui/report/FixList';
import { ReportActions } from '../src/ui/report/ReportActions';
import { ReportBody } from '../src/ui/report/ReportBody';
import { ScanProgress } from '../src/ui/report/ScanProgress';
import {
  DEFAULT_BODY,
  HOME,
  ORIGIN,
  PROBE_URL,
  homepage,
  notFound,
  siteCheck,
  status,
  text,
  timedOut,
} from './helpers/score-fixture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITE_NAME = 'www.example.com';
const HOST = 'example.com';
const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = resolve(WEBSITE_ROOT, '../packages/core/test/fixtures/score');
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
  blocked: siteCheck({ homepage: timedOut(HOME) }),
  sampleTimedOut: siteCheck({ sample: timedOut(`${ORIGIN}/services/`), sampleMd: null }),
  homepage404: siteCheck({ homepage: notFound(HOME) }),
  failing: siteCheck(FAILING_PARTS),
  // 91 (A) with a range of 82 to 91: the pessimistic end grades B (H13).
  failingProbe: siteCheck({ ...FAILING_PARTS, probe: timedOut(PROBE_URL) }),
  challenged: siteCheck({
    llms: status(`${ORIGIN}/llms.txt`, 403, {
      contentType: 'text/html; charset=UTF-8',
      body: CHALLENGE_BODY,
      headers: { 'cf-mitigated': 'challenge' },
    }),
  }),
};
type CaseName = keyof typeof RESULTS;

const reference = analyzeSiteCheck(RESULTS.reference).report;
const provisional = analyzeSiteCheck(RESULTS.provisional).report;
const blocked = analyzeSiteCheck(RESULTS.blocked).report;
const sampleTimedOut = analyzeSiteCheck(RESULTS.sampleTimedOut).report;
const homepage404 = analyzeSiteCheck(RESULTS.homepage404).report;
const failing = analyzeSiteCheck(RESULTS.failing).report;
const failingProbe = analyzeSiteCheck(RESULTS.failingProbe).report;

function fixtureResult(host: string): SiteCheckResponse {
  const evidence = JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${host}.json`), 'utf8')) as SiteEvidence;
  return { ...evidence, normalizedFrom: null };
}

function fixtureHost(result: SiteCheckResponse): string {
  return new URL(result.targetUrl).hostname.replace(/^www\./, '');
}

// ---------------------------------------------------------------------------
// Mounting

const roots: Array<{ root: Root; container: HTMLElement }> = [];

async function mountRoot(element: ReactElement): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  return { root, container };
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  return (await mountRoot(element)).container;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }
  });
}

async function settle(ms = 60): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, ms));
  });
}

interface MountedReport {
  container: HTMLElement;
  onRescan: ReturnType<typeof vi.fn>;
  report: ScoreReport;
}

async function mountReport(
  result: SiteCheckResponse,
  options: { host?: string; siteName?: string; rescanning?: boolean } = {}
): Promise<MountedReport> {
  const analysis = analyzeSiteCheck(result);
  const onRescan = vi.fn();
  const container = await mount(
    createElement(ReportBody, {
      analysis,
      result,
      host: options.host ?? HOST,
      siteName: options.siteName ?? SITE_NAME,
      rescanning: options.rescanning ?? false,
      onRescan,
    })
  );
  return { container, onRescan, report: analysis.report };
}

function mountCase(name: CaseName, options: { rescanning?: boolean } = {}): Promise<MountedReport> {
  return mountReport(RESULTS[name], options);
}

function buttonsByText(container: ParentNode, label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter(
    (candidate) => candidate.textContent?.trim() === label
  );
}

function buttonByText(container: ParentNode, label: string): HTMLButtonElement {
  const button = buttonsByText(container, label)[0];
  if (!button) {
    throw new Error(`no button labelled ${label}`);
  }
  return button;
}

async function chooseView(container: HTMLElement, label: 'Goals' | 'Status' | 'Tier'): Promise<void> {
  const option = Array.from(container.querySelectorAll('fieldset.groupby label')).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  const input = option?.querySelector('input[type="radio"]') as HTMLInputElement | null;
  if (!input) {
    throw new Error(`no group-by option ${label}`);
  }
  await act(async () => {
    input.click();
  });
}

function textOf(container: ParentNode, selector: string): string {
  return container.querySelector(selector)?.textContent ?? '';
}

function stubClipboard(writeText: (value: string) => Promise<void>): ReturnType<typeof vi.fn> {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true });
  return spy;
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // The report must render without storage; nothing to clear then.
  }
});

afterEach(() => {
  while (roots.length > 0) {
    const entry = roots.pop();
    if (entry) {
      act(() => entry.root.unmount());
      entry.container.remove();
    }
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Ported from checker-score-panel.test.ts: ScorePanel

describe('score block, areas and disclosures (ported from ScorePanel)', () => {
  it('renders the score, grade, label, raw value, tier pools and the methodology link', async () => {
    const { container } = await mountCase('reference');
    const textContent = container.textContent ?? '';

    expect(reference.score).toBe(100);
    expect(textOf(container, '.report-score-number')).toBe('100');
    const srTexts = Array.from(container.querySelectorAll('.report-score .sr-only')).map((node) => node.textContent);
    expect(srTexts).toContain('Score 100 out of 100');
    expect(textOf(container, '.report-grade').trim()).toBe('A+');
    expect(textOf(container, '.report-band')).toBe(reference.label);
    expect(reference.raw).toBeGreaterThan(100);
    expect(textOf(container, '.score-arithmetic')).toContain(`Raw ${reference.raw?.toFixed(2)} before rounding, at the cap`);

    // The hero speaks in six client-worded areas; the tier pools live in the Tier view.
    expect(container.querySelectorAll('.report-hero-card .area-bar')).toHaveLength(6);
    await chooseView(container, 'Tier');
    const tiers = Array.from(container.querySelectorAll('.report-tier'));
    expect(tiers).toHaveLength(3);
    expect(tiers[0].querySelector('.report-tier-head')?.textContent).toContain('80 / 80');
    expect(tiers[2].textContent).toContain('never subtracts');

    expect(textOf(container, '.not-scored')).toContain("Doesn't apply to this site");
    expect(textOf(container, '.how-checked')).toContain(`Sample page: ${ORIGIN}/services/`);
    expect(textOf(container, '.how-checked')).toContain(`Catalog ${SCORE_CATALOG_VERSION}, formula ${reference.formulaVersion}`);
    const methodologyLinks = Array.from(container.querySelectorAll('a[href="/score/"]'));
    expect(methodologyLinks.length).toBeGreaterThan(0);
    for (const link of methodologyLinks) {
      expect(link.textContent).toBe('How the score is computed');
    }
    expect(container.querySelector('.score-badge')).toBeNull();
    expect(container.querySelector(".report-hero-card[data-tone='good']")).not.toBeNull();
    expect(textContent).not.toContain('Results for');
  });

  it('marks a provisional run with a badge, the score "with what answered", the unverified list and a Rescan', async () => {
    const { container, onRescan } = await mountCase('provisional');

    expect(provisional.analysisStatus).toBe('partial');
    expect(textOf(container, '.score-badge')).toBe('Provisional');
    expect(textOf(container, '.report-provisional-text')).toContain('with what answered');
    expect(textOf(container, '.report-provisional-text').startsWith(`${provisional.score} with what answered`)).toBe(true);
    const notScored = container.querySelector('details.not-scored') as HTMLDetailsElement | null;
    expect(notScored?.textContent).toContain('Not checked in time');
    expect(notScored?.open).toBe(true);
    // The old "This run was not cached" and "left the denominator" lines are retired (11.5).
    expect(container.textContent).not.toContain('cached');
    expect(container.textContent).not.toContain('denominator');

    const inline = container.querySelector('button.report-rescan-inline') as HTMLButtonElement | null;
    expect(inline?.textContent?.trim()).toBe('Rescan');
    await act(async () => {
      inline?.click();
    });
    expect(onRescan).toHaveBeenCalledTimes(1);
    // The partial run's Rescan is the inline one; the actions row has none (6.5).
    expect(buttonsByText(container.querySelector('.report-actions') ?? container, 'Rescan')).toHaveLength(0);
  });

  it('H2: shows the range as the headline when the two ends differ, with the engine score beside it', async () => {
    const { container } = await mountCase('failingProbe');
    const range = failingProbe.range;

    expect(failingProbe.analysisStatus).toBe('partial');
    expect(range && range.pessimistic < range.optimistic).toBe(true);
    const headline = textOf(container, '.report-score-range');
    expect(headline).toMatch(/^\d+ to \d+$/);
    expect(headline).toBe(`${range?.pessimistic} to ${range?.optimistic}`);
    expect(textOf(container, '.score-badge')).toBe('Provisional');
    expect(textOf(container, '.report-provisional-text').startsWith(`${failingProbe.score} with what answered.`)).toBe(true);
    // H13: tone from the pessimistic end (B, attention), not from the score's grade (A, good).
    expect(failingProbe.grade).toBe('A');
    expect(container.querySelector('.report-hero-card')?.getAttribute('data-tone')).toBe('attention');
    expect(textOf(container, '.report-sentence').startsWith(`Provisional: ${HOST} is readable by AI assistants with a few gaps`)).toBe(true);
  });

  it('C2: a sample page that timed out is provisional, names the resource and keeps the core summary', async () => {
    const { container } = await mountCase('sampleTimedOut');
    const sentence = textOf(container, '.report-provisional');

    expect(sampleTimedOut.unverifiedChecks).toEqual([]);
    expect(sampleTimedOut.unverifiedResources).toEqual(['samplePage']);
    expect(sampleTimedOut.analysisStatus).toBe('partial');
    expect(textOf(container, '.report-score-number')).toBe(String(sampleTimedOut.score));
    expect(container.querySelector('.report-score-range')).toBeNull();
    expect(textOf(container, '.score-badge')).toBe('Provisional');
    expect(sentence).toContain('Sample page could not be fetched in time, so the checks that read it were judged without it.');
    expect(sentence).not.toContain('0 checks');
    expect(textOf(container, '.not-scored')).toContain('Sample page (the checks that read it were judged without it)');

    const summary = renderClientSummary(sampleTimedOut, { siteName: SITE_NAME });
    expect(summary).toContain('This reading is provisional: the sample page could not be fetched in time, so the checks that read it were judged without it.');
    expect(summary).toContain('the sample page fetch (the checks that read it were judged without it)');
    expect(summary).not.toContain('0 checks could not be verified');
  });

  it('a provisional run with unverified checks counts them and lists no resource line', async () => {
    const { container } = await mountCase('provisional');
    expect(textOf(container, '.report-provisional-text')).toMatch(
      /^\d+ with what answered\. \d+ checks? could not be checked in time and (is|are) left out until a rescan\./
    );
    expect(container.textContent).not.toContain('judged without it');
  });

  it('H3/H4: shows no score for a timed-out run, says it is never counted against the site, and offers Rescan', async () => {
    const { container, onRescan } = await mountCase('blocked');

    expect(blocked.blockedKind).toBe('unverified');
    expect(textOf(container, '.report-blocked-title')).toBe('No score yet');
    expect(container.querySelector('.report-score-number')).toBeNull();
    expect(container.querySelector('.report-grade')).toBeNull();
    expect(container.querySelector('.area-bar')).toBeNull();
    expect(container.querySelector('.score-arithmetic')).toBeNull();
    expect(container.querySelector('.fix-section')).toBeNull();
    expect(container.querySelector('.report-tier')).toBeNull();
    expect(container.textContent).not.toContain('never subtracts');
    expect(container.textContent).not.toMatch(/\b0 of 0\b/);
    expect(textOf(container, '.report-hero-card')).not.toMatch(/\d+%/);
    expect(textOf(container, '.report-blocked-body')).toContain(`${HOST} did not answer our checker within 10 seconds`);
    expect(textOf(container, '.report-blocked-body')).toContain('never counted against a site');
    // H4: a timeout is neutral, never red (was action in ScorePanel; changed on purpose).
    expect(container.querySelector('.report-hero-card')?.getAttribute('data-tone')).toBe('neutral');

    const rescan = buttonByText(container.querySelector('.report-actions') ?? container, 'Rescan');
    expect(rescan.className).toContain('report-action-primary');
    await act(async () => {
      rescan.click();
    });
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('names the final homepage status, offers no Rescan and never mentions a timeout', async () => {
    const { container } = await mountCase('homepage404');
    const sentence = textOf(container, '.report-blocked-body');

    expect(homepage404.blockedKind).toBe('http-status');
    expect(textOf(container, '.report-blocked-title')).toBe('No score yet');
    expect(container.querySelector('.report-tier')).toBeNull();
    expect(container.querySelector('.area-bar')).toBeNull();
    expect(sentence).toContain('The homepage answered HTTP 404, so there is nothing to score yet.');
    expect(sentence).toContain('Make the site root serve a page');
    expect(sentence).not.toMatch(/in time|timed out|never counted against/i);
    const labels = Array.from(container.querySelectorAll('button')).map((button) => button.textContent?.trim());
    expect(labels).not.toContain('Rescan');
    expect(labels).not.toContain('Re-run the check');
    expect(container.querySelector('.report-hero-card')?.getAttribute('data-tone')).toBe('action');

    const summary = renderClientSummary(homepage404, { siteName: SITE_NAME });
    expect(summary).toBe(
      `${SITE_NAME}: the homepage answered HTTP 404, so there is nothing to score yet.\nMake the site root serve a page, then run the check again.`
    );
    expect(verdictExplanationForGrade(homepage404.grade, homepage404.analysisStatus, homepage404.blockedKind, homepage404.blockedReason)).not.toMatch(
      /in time|timed out|never counted against/i
    );
    expect(verdictExplanationForGrade(blocked.grade, blocked.analysisStatus, blocked.blockedKind, blocked.blockedReason)).toContain('in time');
  });

  it('copies a plain-text client summary to the clipboard and resets the label after 2.5 s', async () => {
    const writeText = stubClipboard(async () => {});
    const { container } = await mountCase('provisional');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      buttonByText(container, 'Copy client summary').click();
    });
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    const summary = writeText.mock.calls[0][0] as string;
    expect(summary).toBe(renderClientSummary(provisional, { siteName: SITE_NAME }));
    expect(summary).toContain(`${SITE_NAME}: agent-readiness score`);
    expect(summary).not.toContain('<');
    expect(summary).not.toContain('**');
    expect(summary).not.toMatch(/^#/m);
    expect(summary).toContain('provisional');
    expect(buttonByText(container, 'Copied')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(buttonsByText(container, 'Copied')).toHaveLength(0);
    expect(buttonByText(container, 'Copy client summary')).toBeTruthy();
  });

  it('falls back to a readable textarea when the clipboard refuses', async () => {
    stubClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    const { container } = await mountCase('failing');
    await act(async () => {
      buttonByText(container, 'Copy client summary').click();
    });
    await flush();

    const fallback = container.querySelector('textarea.report-summary-fallback') as HTMLTextAreaElement | null;
    expect(fallback?.value).toBe(renderClientSummary(failing, { siteName: SITE_NAME }));
    expect(container.textContent).toContain('Clipboard unavailable. Select the text below.');
  });

  it('drops the clipboard fallback and copy feedback when a new report replaces the old one', async () => {
    stubClipboard(async () => {
      throw new Error('NotAllowedError');
    });
    const props = (report: ScoreReport) => ({
      report,
      host: HOST,
      siteName: SITE_NAME,
      previous: null,
      onRescan: () => {},
      rescanning: false,
      rescan: 'secondary' as const,
    });
    const { root, container } = await mountRoot(createElement(ReportActions, props(failing)));
    await act(async () => {
      buttonByText(container, 'Copy client summary').click();
    });
    await flush();
    expect(container.querySelector('textarea.report-summary-fallback')).not.toBeNull();

    await act(async () => {
      root.render(createElement(ReportActions, props(reference)));
    });
    expect(container.querySelector('textarea.report-summary-fallback')).toBeNull();
    expect(container.textContent).not.toContain('Clipboard unavailable');
  });

  it('says nothing about a copy whose clipboard call settles after the report changed', async () => {
    let release: (() => void) | null = null;
    stubClipboard(() => new Promise<void>((resolve) => { release = resolve; }));
    const props = (report: ScoreReport) => ({
      report,
      host: HOST,
      siteName: SITE_NAME,
      previous: null,
      onRescan: () => {},
      rescanning: false,
      rescan: 'secondary' as const,
    });
    const { root, container } = await mountRoot(createElement(ReportActions, props(failing)));
    await act(async () => {
      buttonByText(container, 'Copy client summary').click();
    });
    await act(async () => {
      root.render(createElement(ReportActions, props(reference)));
    });
    await act(async () => {
      release?.();
    });
    await flush();
    expect(buttonsByText(container, 'Copied')).toHaveLength(0);
    expect(container.querySelector('.report-toast')?.textContent).toBe('');
  });

  it('copies the developer brief built from the report on screen', async () => {
    const writeText = stubClipboard(async () => {});
    const { container } = await mountCase('failing');
    await act(async () => {
      buttonByText(container, 'Copy developer brief').click();
    });
    await flush();
    expect(writeText).toHaveBeenCalledWith(renderDeveloperBrief(failing, { host: HOST, origin: window.location.origin }));
  });
});

// ---------------------------------------------------------------------------
// Ported from checker-score-panel.test.ts: TopFixes

describe('fix list (ported from TopFixes)', () => {
  it('lists at most five fixes ranked by estimated gain, keyed by check id, each with its rule link', async () => {
    const ranked = rankTopFixes(failing.checks, TOP_FIXES_LIMIT);
    expect(ranked.length).toBe(TOP_FIXES_LIMIT);
    expect(failing.checks.filter((check) => check.estGain !== null && check.estGain > 0).length).toBeGreaterThan(TOP_FIXES_LIMIT);

    const { container } = await mountCase('failing');
    const section = container.querySelector('.fix-section');
    expect(section).not.toBeNull();
    const ids = Array.from(section?.querySelectorAll('[data-check-id]') ?? []).map((node) => node.getAttribute('data-check-id'));
    expect(ids).toEqual(ranked.map((fix) => fix.id));
    expect(textOf(container, '#fix-title')).toBe('Fix these first');

    const rows = Array.from(container.querySelectorAll('li.fix-row'));
    expect(rows.length).toBeGreaterThan(0);
    const gains = rows.map((row) => Number(row.querySelector('.fix-gain')?.textContent?.match(/\+([\d.]+)/)?.[1]));
    for (let index = 1; index < gains.length; index += 1) {
      expect(gains[index - 1]).toBeGreaterThanOrEqual(gains[index]);
    }
    for (const row of rows) {
      const id = row.getAttribute('data-check-id') ?? '';
      const check = failing.checks.find((candidate) => candidate.id === id);
      expect(row.querySelector(`a[href="/score/#${id}"]`), id).not.toBeNull();
      expect(row.querySelector('a[href^="/score/#"]')?.textContent).toBe('How this check is scored');
      expect(row.querySelector('.fix-do')?.textContent?.startsWith('Do:'), id).toBe(true);
      // H1: the gain is the engine's estGain verbatim.
      expect(row.querySelector('.fix-gain')?.textContent, id).toContain(`+${check?.estGain} pts`);
    }
    for (const item of Array.from(container.querySelectorAll('.fix-then-item'))) {
      const id = item.getAttribute('data-check-id');
      expect(item.querySelector(`a[href="/score/#${id}"]`), `${id}`).not.toBeNull();
    }
  });

  it('keys rows by check id, so React keeps each row with its check when the order changes', async () => {
    const plan = fixPlan(failing);
    const { root, container } = await mountRoot(createElement(FixList, { report: failing, plan, onOpenCheck: () => {} }));
    const before = new Map(
      Array.from(container.querySelectorAll('li.fix-row')).map((node) => [node.getAttribute('data-check-id'), node])
    );
    expect(before.size).toBe(plan.primary.length);

    const reordered: FixPlan = { ...plan, primary: [...plan.primary].reverse() };
    await act(async () => {
      root.render(createElement(FixList, { report: failing, plan: reordered, onOpenCheck: () => {} }));
    });
    const after = Array.from(container.querySelectorAll('li.fix-row'));
    expect(after.map((node) => node.getAttribute('data-check-id'))).toEqual(reordered.primary.map((check) => check.id));
    for (const node of after) {
      // Keyed by index, React would reuse the first node for the new first row and rewrite its id.
      expect(before.get(node.getAttribute('data-check-id'))).toBe(node);
    }
  });

  it('tells a site whose llms.txt answers a bot challenge to let agents through, not to publish one', async () => {
    const challenged = analyzeSiteCheck(RESULTS.challenged).report;
    const { container } = await mountCase('challenged');
    const item = container.querySelector('.fix-section li[data-check-id="llms.exists"]');
    expect(item?.textContent).toContain('Your bot protection shows AI assistants a challenge page instead of /llms.txt (HTTP 403).');
    expect(item?.textContent).toContain('Let AI agents through the bot challenge on /llms.txt');
    expect(item?.textContent).not.toContain('Publish /llms.txt');
    const finding = auditItemsForReport(challenged).find((entry) => entry.checkId === 'llms.exists');
    expect(finding?.action).toContain('Let AI agents through the bot challenge on /llms.txt');
  });

  it('renders no fix list for a blocked run and "Already at 100" for a perfect score', async () => {
    const blockedView = await mountCase('blocked');
    expect(blockedView.container.querySelector('.fix-section')).toBeNull();

    const { container } = await mountCase('reference');
    expect(textOf(container, '#fix-title')).toBe('Already at 100');
    expect(container.querySelector('li.fix-row')).toBeNull();
  });

  it('collapses agentmarkup.dev at the cap to one optional-extras line, each extra keyed by id (5.7, H8)', async () => {
    const result = fixtureResult('agentmarkup.dev');
    const { container, report } = await mountReport(result, { host: fixtureHost(result) });
    const plan = fixPlan(report);
    expect(plan.optionalOnly).toBe(true);
    expect(textOf(container, '#fix-title')).toBe('Already at 100');
    expect(container.querySelector('li.fix-row')).toBeNull();
    // The exact sentence is pinned on optionalExtrasLine in checker-report-copy.test.ts; here the
    // DOM must name each extra with its own gain and never a summed figure.
    const line = container.querySelector('.fix-optional-line');
    expect(line?.textContent?.startsWith('4 optional extras above the cap:')).toBe(true);
    const items = Array.from(line?.querySelectorAll('.fix-then-item') ?? []);
    expect(items).toHaveLength(plan.all.length);
    for (const [index, item] of items.entries()) {
      const check = plan.all[index];
      expect(item.textContent).toContain(getCheckDefinition(check.id)?.name ?? check.id);
      expect(item.textContent).toContain(`+${check.estGain}`);
      expect(item.querySelector(`a[href="#check-${check.id}"]`)).not.toBeNull();
    }
    expect(line?.textContent).not.toMatch(/\+1(\.0+)?\b/);
    const ids = Array.from(container.querySelectorAll('.fix-section [data-check-id]')).map((node) => node.getAttribute('data-check-id'));
    expect(ids).toEqual(plan.all.map((check) => check.id));
  });

  it('mutes the rows at the cap and shows their gains above 100 (animafelix.com, 5.7)', async () => {
    const result = fixtureResult('animafelix.com');
    const { container, report } = await mountReport(result, { host: fixtureHost(result) });
    const plan = fixPlan(report);
    expect(textOf(container, '#fix-title')).toBe('Already at 100: still worth doing');
    const rows = Array.from(container.querySelectorAll('li.fix-row'));
    expect(rows).toHaveLength(3);
    for (const [index, row] of rows.entries()) {
      expect(row.hasAttribute('data-optional')).toBe(true);
      expect(row.querySelector('.fix-gain')?.textContent).toContain(`+${plan.primary[index].estGain} above 100`);
    }
    expect(container.querySelectorAll('.fix-then-item')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Ported from checker-score-panel.test.ts: ScoreMethodology

describe('ScoreMethodology (ported)', () => {
  function renderMarkup(element: ReactElement): HTMLDivElement {
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    return container;
  }

  it('renders every catalog row with its id as the anchor, in catalog order, and the new #groups section', () => {
    const container = renderMarkup(createElement(ScoreMethodology));
    const ids = Array.from(container.querySelectorAll('tr[id]')).map((row) => row.id);

    expect(ids).toEqual(SCORE_CATALOG.map((definition) => definition.id));
    expect(container.querySelector('h1')?.textContent).toBe('How the agent-readiness score is computed');
    // 11 sections before the report redesign; #groups makes 12 (changed on purpose, 7.14).
    expect(container.querySelectorAll('section[id]')).toHaveLength(12);
    expect(container.querySelector('#groups')).not.toBeNull();
    expect(container.querySelector('#statuses')).not.toBeNull();
    expect(container.querySelector('#formula')).not.toBeNull();
    expect(container.textContent).toContain(`v${SCORE_CATALOG_VERSION}`);
    expect(container.textContent).toContain(`${SCORE_CATALOG.length} rows`);
    expect(container.textContent).not.toContain('—');
    expect(container.textContent).not.toContain('–');
    // H7: /score/ keeps saying it is not Ora's score.
    expect(container.textContent).toContain("This is not Ora's score");
  });

  it('uses computed counts that match the catalog', () => {
    const container = renderMarkup(createElement(ScoreMethodology));
    const implemented = SCORE_CATALOG.filter((definition) => definition.availability === 'now').length;
    const facts = Array.from(container.querySelectorAll('.score-page-fact')).map((fact) => fact.textContent);

    expect(facts).toContain(`Checks scored now${implemented}`);
    expect(container.textContent).toContain(`${implemented} checks scored with zero extra fetches`);
  });
});

// ---------------------------------------------------------------------------
// New behaviour (12.4) and the honesty rules as they show on screen

describe('area bars (6.7, H1, H9, H10)', () => {
  it('words tagteamdesign.com exactly as the spec wireframe, with Controls red and flagged', async () => {
    const result = fixtureResult('tagteamdesign.com');
    const { container, report } = await mountReport(result, { host: fixtureHost(result) });
    const bars = Array.from(container.querySelectorAll('.area-bar'));
    expect(bars.map((bar) => bar.querySelector('.area-bar-label')?.textContent)).toEqual([
      'Access',
      'Content',
      'Controls',
      'Navigation',
      'Identity',
      'Discovery',
    ]);
    // The value may carry the print-only points pair after the percent (10.8).
    const percent = (bar: Element) => bar.querySelector('.area-bar-value')?.textContent?.match(/^(\d+%|Not scored)/)?.[1];
    expect(bars.map(percent)).toEqual(['100%', '100%', '56%', '100%', '90%', '75%']);
    expect(bars[2].getAttribute('data-tone')).toBe('action');
    expect(bars[2].querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Controls: 56 percent, 19.8 of 35.6 points');
    // Shape, not colour alone: attention and action bars carry a flag.
    expect(bars[2].querySelector('.area-bar-flag')).not.toBeNull();
    expect(bars[5].querySelector('.area-bar-flag')).not.toBeNull();
    expect(textOf(container, '.area-extras')).toBe(`Extras +${formatPoints(report.bonus.points)} of ${formatPoints(report.bonus.cap)}, never subtract`);
    expect(textOf(container, '.area-footnote')).toBe('Areas add up to 82.02 of 100 points, plus 1.38 in extras.');
    expect(areaTotal(report)).toBe(roundTo(report.required.earned + report.recommended.earned, 2));
    expect(textOf(container, '.report-sentence')).toBe(
      'tagteamdesign.com is readable by AI assistants with a few gaps: access, readable content and navigation are in place, but the biggest gain is in usable controls (Form control labelling, +8.9 points).'
    );
  });

  it('never paints an A+ report red: animafelix.com Controls reads 99% in good tone', async () => {
    const result = fixtureResult('animafelix.com');
    const { container, report } = await mountReport(result, { host: fixtureHost(result) });
    const bars = Array.from(container.querySelectorAll('.area-bar'));
    expect(bars[2].querySelector('.area-bar-value')?.textContent?.match(/^\d+%/)?.[0]).toBe('99%');
    expect(bars[2].getAttribute('data-tone')).toBe('good');
    expect(container.querySelector(".area-bar[data-tone='action']")).toBeNull();
    expect(container.textContent).not.toMatch(/Controls[^%]*100%/);
    expect(textOf(container, '.area-footnote')).toBe(
      `Areas add up to ${formatPoints(areaTotal(report))} of 100 points, plus ${formatPoints(report.bonus.points)} in extras, capped at 100.`
    );
  });
});

describe('every recorded fixture (H1, H6, H7, H8)', () => {
  const hosts = ['agentmarkup.dev', 'animafelix.com', 'cochinescu.com', 'sandiegowebstudios.com', 'seodesignchicago.com', 'tagteamdesign.com', 'visualwebz.com'];

  it.each(hosts)('%s shows the engine figures verbatim and no jargon', async (fixture) => {
    const result = fixtureResult(fixture);
    const report = scoreChecks(evaluateSiteChecks(result));
    const { container } = await mountReport(result, { host: fixtureHost(result), siteName: new URL(result.targetUrl).hostname });
    const textContent = container.textContent ?? '';

    expect(textOf(container, '.report-score-number')).toBe(String(report.score));
    expect(textOf(container, '.report-grade').trim()).toBe(report.grade);
    expect(textOf(container, '.report-band')).toBe(report.label);
    expect(container.querySelectorAll('.area-bar')).toHaveLength(6);

    // H6: versions on the page, rule links relative.
    expect(textOf(container, '.report-footer')).toContain(`Catalog ${report.catalogVersion}`);
    expect(textOf(container, '.report-footer')).toContain(`formula ${report.formulaVersion}`);
    for (const link of Array.from(container.querySelectorAll('a[href*="/score/#"]'))) {
      expect(link.getAttribute('href')?.startsWith('/score/#'), link.getAttribute('href') ?? '').toBe(true);
    }

    // H7 and the retired vocabulary (11.5).
    expect(textContent).not.toMatch(/\bOra\b/);
    expect(textContent).not.toMatch(/[–—]/);
    for (const retired of ['Looks good', 'Needs attention', 'Action required', 'Relevant docs', 'How agentmarkup helps', 'denominator', 'Results for']) {
      expect(textContent, retired).not.toContain(retired);
    }
    expect(container.querySelector('.checker-agentmarkup-help')).toBeNull();
    // One product line only (7.11).
    expect(container.querySelectorAll('.report-product-line')).toHaveLength(1);
    expect(textOf(container, '.report-product-line')).toContain(
      'agentmarkup generates llms.txt, JSON-LD, markdown mirrors and AI crawler rules at build time.'
    );

    // H8: no group shows a sum of its checks' estimated gains.
    for (const row of Array.from(container.querySelectorAll('details.group-row'))) {
      const bucket = row.id.replace(/^group-/, '');
      const gains = report.checks
        .filter((check) => getCheckDefinition(check.id)?.bucket === bucket && (check.estGain ?? 0) > 0)
        .map((check) => check.estGain ?? 0);
      if (gains.length < 2) {
        continue;
      }
      const total = roundTo(gains.reduce((sum, gain) => sum + gain, 0), 1);
      if (gains.some((gain) => roundTo(gain, 1) === total)) {
        continue;
      }
      // Ghost and overflow chips read "+3 not scored" / "+3", so only a points figure counts.
      expect(row.textContent, `${bucket} shows the gain sum +${total}`).not.toMatch(new RegExp(`\\+${total} (pts|points)`));
    }
  });
});

describe('groups, chips and statuses (7.4, 7.5, 7.10, H5)', () => {
  const DISPLAY = new Set(['fail-action', 'fail-attention', 'partial', 'pass', 'unverified', 'na', 'not-measured']);

  it('renders six goal rows with chips that carry data-status and a spoken status line', async () => {
    const { container } = await mountCase('failing');
    const rows = Array.from(container.querySelectorAll('details.group-row'));
    expect(rows.map((row) => row.id)).toEqual([
      'group-reachability',
      'group-content',
      'group-controls',
      'group-navigation',
      'group-identity',
      'group-discovery',
    ]);
    const chips = Array.from(container.querySelectorAll('.group-row .chip:not(.chip-ghost):not(.chip-more)'));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(DISPLAY.has(chip.getAttribute('data-status') ?? ''), chip.outerHTML).toBe(true);
    }
    for (const row of rows) {
      const summary = row.querySelector('summary');
      const spoken = Array.from(summary?.querySelectorAll('.sr-only') ?? []).map((node) => node.textContent ?? '');
      expect(spoken.some((line) => /(needs fixing|partly in place|in place|not checked in time)/i.test(line)), row.id).toBe(true);
    }
  });

  it('lists not-applicable and not-measured checks with human reasons, never as failures', async () => {
    const { container } = await mountCase('reference');
    const notScored = container.querySelector('details.not-scored');
    const na = reference.naChecks.length;
    const notMeasured = reference.notMeasured.length;
    expect(notScored?.querySelector('summary')?.textContent).toBe(
      `What was not scored, and why (${na} not applicable, ${notMeasured} not measured yet)`
    );
    for (const entry of reference.naChecks) {
      expect(notScored?.textContent, entry.id).toContain(getCheckDefinition(entry.id)?.name ?? entry.id);
      // No raw reason codes in parentheses.
      expect(notScored?.textContent, entry.reason).not.toContain(entry.reason);
    }
    for (const id of reference.notMeasured) {
      expect(notScored?.textContent, id).toContain(getCheckDefinition(id)?.name ?? id);
    }
    expect(notScored?.textContent).toContain(`Not measured in catalog ${SCORE_CATALOG_VERSION} (${notMeasured})`);
  });

  it('never shows a not-applicable or not-measured check in a failure state in any view', async () => {
    const { container, report } = await mountCase('failing');
    const statusOf = new Map(report.checks.map((check) => [check.id, check.status]));
    let lines = 0;
    for (const view of ['Goals', 'Status', 'Tier'] as const) {
      await chooseView(container, view);
      for (const node of Array.from(container.querySelectorAll('[data-check-id][data-status]'))) {
        lines += 1;
        const checkStatus = statusOf.get(node.getAttribute('data-check-id') ?? '');
        if (checkStatus === 'na' || checkStatus === 'not-measured') {
          expect(node.getAttribute('data-status')).toBe(checkStatus);
        }
      }
    }
    expect(lines).toBeGreaterThan(0);
  });

  it('dims and disables the report body while a rescan runs, and keeps the actions live', async () => {
    const { container } = await mountCase('failing', { rescanning: true });
    const stale = Array.from(container.querySelectorAll('.report-stale'));
    expect(stale.length).toBeGreaterThan(0);
    for (const node of stale) {
      expect(node.hasAttribute('inert')).toBe(true);
    }
    expect(container.querySelector('.report-actions')?.closest('.report-stale')).toBeNull();
  });
});

describe('deep links and print (7.7, 10.8)', () => {
  it('lands a #check- link to a check that does not apply on its group row', async () => {
    if (typeof Element.prototype.scrollIntoView !== 'function') {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, configurable: true, writable: true });
    }
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const naCheck = reference.checks.find((check) => check.status === 'na');
    if (!naCheck) throw new Error('the reference report has no N/A check');
    const bucket = getCheckDefinition(naCheck.id)?.bucket;
    window.location.hash = `#check-${naCheck.id}`;
    try {
      const { container } = await mountCase('reference');
      await settle();
      expect(container.querySelector(`[id="check-${naCheck.id}"]`)).toBeNull();
      const group = container.querySelector(`[id="group-${bucket}"]`) as HTMLDetailsElement | null;
      expect(group?.open).toBe(true);
      const summary = group?.querySelector('summary');
      expect(focus.mock.contexts).toContain(summary);
      expect(container.querySelector('input[type="radio"][value="goals"]')).toHaveProperty('checked', true);
    } finally {
      window.location.hash = '';
    }
  });

  it('prints the six goal groups even when the Status view is on screen, then restores it', async () => {
    const { container } = await mountCase('failing');
    await chooseView(container, 'Status');
    expect(container.querySelector('[id="group-reachability"]')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const groups = Array.from(container.querySelectorAll<HTMLDetailsElement>('details.group-row'));
    expect(groups).toHaveLength(6);
    expect(groups.every((group) => group.open)).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(container.querySelector('[id="group-reachability"]')).toBeNull();
    expect(container.querySelector('input[type="radio"][value="status"]')).toHaveProperty('checked', true);
  });
});

describe('jump from a fix to its evidence (8)', () => {
  it('opens the group and the check, focuses its summary without scrolling the page, and links its rule', async () => {
    if (typeof Element.prototype.scrollIntoView !== 'function') {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, configurable: true, writable: true });
    }
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');

    const { container } = await mountCase('failing');
    const row = container.querySelector('li.fix-row');
    const id = row?.getAttribute('data-check-id') ?? '';
    const bucket = getCheckDefinition(id)?.bucket;
    const link = Array.from(row?.querySelectorAll('a') ?? []).find((anchor) => anchor.textContent === 'See the evidence');
    expect(link?.getAttribute('href')).toBe(`#check-${id}`);

    await act(async () => {
      link?.click();
    });
    await settle();

    const group = container.querySelector(`[id="group-${bucket}"]`) as HTMLDetailsElement | null;
    // Check ids contain dots, so match the id attribute instead of an id selector.
    const check = container.querySelector(`[id="check-${id}"]`) as HTMLDetailsElement | null;
    expect(group?.open).toBe(true);
    expect(check?.open).toBe(true);
    const summary = check?.querySelector('summary');
    const index = focus.mock.contexts.findIndex((context) => context === summary);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(focus.mock.calls[index][0]).toEqual({ preventScroll: true });
    for (const call of focus.mock.calls) {
      expect(call[0]).toEqual({ preventScroll: true });
    }
    expect(scrollIntoView).toHaveBeenCalled();

    // H6: the opened check links its catalog row, relative.
    const rule = check?.querySelector('a.check-rule-link');
    expect(rule?.getAttribute('href')).toBe(`/score/#${id}`);
    expect(rule?.textContent).toBe('How this check is scored');
  });
});

describe('scan honesty (H11, H12)', () => {
  it('H11: the scanning card never ticks off individual fetches', async () => {
    const container = await mount(
      createElement(ScanProgress, {
        host: HOST,
        startedAt: performance.now(),
        slowPromptDismissed: false,
        onKeepWaiting: () => {},
        onCancel: () => {},
      })
    );
    await settle(400);
    const files = Array.from(container.querySelectorAll('ul.scan-files li'));
    expect(files).toHaveLength(6);
    expect(container.querySelector('ul.scan-files [data-state="done"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('li.scan-step')).map((step) => step.getAttribute('data-state'))).toEqual([
      'done',
      'working',
      'waiting',
    ]);
  });

  it('6.2: the quota note pluralizes both the scans and the minutes', () => {
    const at = (remainingChecks: number, rateLimitWindowSeconds: number) =>
      quotaNote({ ...siteCheck(), protection: { remainingChecks, rateLimitWindowSeconds } } as SiteCheckResponse);
    expect(at(1, 600)).toBe('1 more free scan from your network in the next 10 minutes.');
    expect(at(2, 60)).toBe('2 more free scans from your network in the next 1 minute.');
    expect(at(4, 600)).toBeNull();
  });

  it('5.3: the scanning card content is in the DOM before the 300 ms reveal, hidden by CSS, so nothing shifts', async () => {
    const container = await mount(
      createElement(ScanProgress, {
        host: HOST,
        startedAt: performance.now(),
        slowPromptDismissed: false,
        onKeepWaiting: () => {},
        onCancel: () => {},
      })
    );
    const card = container.querySelector('section.scan-progress');
    expect(card?.getAttribute('data-visible')).toBe('false');
    expect(card?.querySelector('h2')?.textContent).toBe(`Checking ${HOST}`);
    expect(card?.querySelectorAll('ul.scan-files li')).toHaveLength(6);
    const css = readFileSync(resolve(WEBSITE_ROOT, 'src/ui/report/scan.css'), 'utf8');
    expect(css).toMatch(/\.scan-progress\[data-visible='false'\]\s*>\s*\*\s*\{\s*visibility:\s*hidden;?\s*\}/);
    await settle(400);
    expect(card?.getAttribute('data-visible')).toBe('true');
  });

  it('H12: a cached answer is labelled as saved, with the time a fresh scan becomes possible', () => {
    const fresh = siteCheck();
    const freshSegments = scanMeta(fresh, reference);
    expect(freshSegments[0]?.startsWith('Scanned ')).toBe(true);
    expect(freshSegments.join(' · ')).not.toContain('Saved scan');

    const saved: SiteCheckResponse = {
      ...fresh,
      cache: { hit: true, cachedAt: '2026-11-02T12:44:00.000Z', expiresAt: '2026-11-02T12:47:00.000Z' },
    };
    const line = scanMeta(saved, reference).join(' · ');
    expect(line).toMatch(/Saved scan from .+ · a fresh scan is possible after .+/);
    expect(line).not.toMatch(/^Scanned /);
    expect(line).toContain('homepage and /services/ sampled');
  });

  it('H12: Copy link says that opening it runs a fresh check', async () => {
    const writeText = stubClipboard(async () => {});
    const { container } = await mountCase('reference');
    await act(async () => {
      buttonByText(container, 'Copy link').click();
    });
    await flush();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/checker/?url=${encodeURIComponent(HOST)}`);
    expect(textOf(container, '.report-toast')).toBe(`Link copied. Opening it runs a fresh check of ${HOST}.`);
  });
});

describe('report styles (10.1)', () => {
  it('keeps the report in Manrope: no editorial serif in report.css or scan.css', () => {
    for (const file of ['src/ui/report/report.css', 'src/ui/report/scan.css']) {
      // Comments may name the rule ("the serif display face never appears"); declarations may not.
      const css = readFileSync(resolve(WEBSITE_ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, file).not.toContain('font-editorial');
      expect(css, file).not.toMatch(/(?<!sans-)serif/);
    }
  });
});
