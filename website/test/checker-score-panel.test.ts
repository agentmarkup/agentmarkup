// @vitest-environment happy-dom
import { act, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCORE_CATALOG, SCORE_CATALOG_VERSION, TOP_FIXES_LIMIT, rankTopFixes } from '@agentmarkup/core/score';


import { analyzeSiteCheck } from '../src/checker/analyze';
import ScoreMethodology from '../src/pages/ScoreMethodology';
import { ScorePanel } from '../src/ui/ScorePanel';
import { TopFixes } from '../src/ui/TopFixes';
import { DEFAULT_BODY, HOME, ORIGIN, PROBE_URL, homepage, notFound, siteCheck, status, text, timedOut } from './helpers/score-fixture';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SITE_NAME = 'www.example.com';
const reference = analyzeSiteCheck(siteCheck()).report;
const provisional = analyzeSiteCheck(siteCheck({ llms: timedOut(`${ORIGIN}/llms.txt`) })).report;
const blocked = analyzeSiteCheck(siteCheck({ homepage: timedOut(HOME) })).report;
const failing = analyzeSiteCheck(
  siteCheck({
    homepage: homepage(DEFAULT_BODY, { jsonLd: [], canonical: null, llmsLink: false, markdownLink: false }),
    llms: notFound(`${ORIGIN}/llms.txt`),
    sitemap: notFound(`${ORIGIN}/sitemap.xml`),
    probe: status(PROBE_URL, 302, { headers: { location: HOME } }),
    robots: text(`${ORIGIN}/robots.txt`, 'User-agent: PerplexityBot\nDisallow: /\n'),
    homeMd: null,
    sampleMd: null,
  })
).report;

function renderMarkup(element: ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  return container;
}

const roots: Array<{ root: Root; container: HTMLElement }> = [];

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  return container;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) {
      await Promise.resolve();
    }
  });
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`no button labelled ${label}`);
  }
  return button;
}

function findElement(node: ReactNode, type: string): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  if (node.type === type) {
    return node;
  }
  const props = node.props as { children?: ReactNode };
  return findElement(props.children ?? null, type);
}

afterEach(() => {
  while (roots.length > 0) {
    const entry = roots.pop();
    if (entry) {
      act(() => entry.root.unmount());
      entry.container.remove();
    }
  }
  vi.restoreAllMocks();
});

describe('ScorePanel', () => {
  it('renders the score, grade, label, raw value, three tier bars and the methodology link', () => {
    const container = renderMarkup(createElement(ScorePanel, { report: reference, siteName: SITE_NAME }));
    const textContent = container.textContent ?? '';

    expect(reference.score).toBe(100);
    expect(container.querySelector('.score-panel-number strong')?.textContent).toBe('100');
    expect(container.querySelector('#score-panel-title')?.textContent).toBe(`Grade A+: ${reference.label}`);
    expect(reference.raw).toBeGreaterThan(100);
    expect(textContent).toContain(`Raw ${reference.raw?.toFixed(2)} before rounding, at the cap`);
    expect(container.querySelectorAll('.score-tier')).toHaveLength(3);
    expect(container.querySelector('.score-tier-required dd')?.textContent).toBe('80 / 80');
    expect(container.querySelector('.score-tier-bonus')?.textContent).toContain('never subtracts');
    expect(textContent).toContain('Not applicable to this site');
    expect(textContent).toContain(`Sample page: ${ORIGIN}/services/`);
    expect(textContent).toContain(`Catalog ${SCORE_CATALOG_VERSION}, formula ${reference.formulaVersion}`);
    expect(container.querySelector('a[href="/score/"]')?.textContent).toBe('How the score is computed');
    expect(container.querySelector('.score-badge')).toBeNull();
    expect(container.querySelector('.score-panel')?.className).toContain('score-panel-good');
  });

  it('marks a provisional run with a range, the unverified list and a re-run button', async () => {
    const container = renderMarkup(createElement(ScorePanel, { report: provisional, siteName: SITE_NAME }));
    const textContent = container.textContent ?? '';

    expect(provisional.analysisStatus).toBe('partial');
    expect(container.querySelector('.score-badge')?.textContent).toBe('Provisional');
    expect(textContent).toMatch(/Between \d+ and \d+:/);
    expect(textContent).toContain('Could not be verified in time');
    expect(textContent).toContain('This run was not cached');

    const onRerun = vi.fn();
    const mounted = await mount(createElement(ScorePanel, { report: provisional, siteName: SITE_NAME, onRerun }));
    await act(async () => {
      buttonByText(mounted, 'Re-run the check').click();
    });
    expect(onRerun).toHaveBeenCalledTimes(1);
  });

  it('shows no score for a blocked run and offers a re-run', () => {
    const container = renderMarkup(createElement(ScorePanel, { report: blocked, siteName: SITE_NAME, onRerun: () => {} }));

    expect(container.querySelector('#score-panel-title')?.textContent).toBe('No score yet');
    expect(container.querySelector('.score-panel-number')).toBeNull();
    expect(container.textContent).toContain('Re-run the check');
    expect(container.querySelector('.score-panel')?.className).toContain('score-panel-action');
  });

  it('copies a plain-text client summary to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const mounted = await mount(createElement(ScorePanel, { report: provisional, siteName: SITE_NAME }));
    await act(async () => {
      buttonByText(mounted, 'Copy client summary').click();
    });
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    const summary = writeText.mock.calls[0][0] as string;
    expect(summary).toContain(`${SITE_NAME}: agent-readiness score`);
    expect(summary).not.toContain('<');
    expect(summary).not.toContain('**');
    expect(summary).not.toMatch(/^#/m);
    expect(summary).toContain('provisional');
    expect(buttonByText(mounted, 'Copied')).toBeTruthy();
  });
});

describe('TopFixes', () => {
  it('lists at most five fixes ranked by estimated gain with check ids as keys', () => {
    const ranked = rankTopFixes(failing.checks, TOP_FIXES_LIMIT);
    expect(ranked.length).toBe(TOP_FIXES_LIMIT);
    expect(failing.checks.filter((check) => check.estGain !== null && check.estGain > 0).length).toBeGreaterThan(TOP_FIXES_LIMIT);

    const container = renderMarkup(createElement(TopFixes, { report: failing }));
    const items = Array.from(container.querySelectorAll('li.top-fixes-item'));
    expect(items).toHaveLength(TOP_FIXES_LIMIT);
    expect(items.map((item) => item.getAttribute('data-check-id'))).toEqual(ranked.map((fix) => fix.id));
    expect(container.querySelector('#top-fixes-title')?.textContent).toBe('Top fixes');

    const gains = items.map((item) => Number(item.querySelector('.top-fixes-gain strong')?.textContent?.replace('+', '')));
    for (let index = 1; index < gains.length; index += 1) {
      expect(gains[index - 1]).toBeGreaterThanOrEqual(gains[index]);
    }
    for (const item of items) {
      expect(item.querySelector('a')?.getAttribute('href')).toContain('/score/#');
      expect(item.textContent).toContain('What to do:');
    }

    const element = TopFixes({ report: failing });
    const list = element ? findElement(element, 'ol') : null;
    const keys = ((list?.props as { children?: ReactNode })?.children as ReactElement[]).map((child) => child.key);
    expect(keys).toEqual(ranked.map((fix) => fix.id));
  });

  it('renders nothing for a blocked run and "At the cap" for a perfect score', () => {
    expect(TopFixes({ report: blocked })).toBeNull();

    const container = renderMarkup(createElement(TopFixes, { report: reference }));
    expect(container.querySelector('#top-fixes-title')?.textContent).toBe('At the cap');
    expect(container.querySelector('li.top-fixes-item')).toBeNull();
  });
});

describe('ScoreMethodology', () => {
  it('renders every catalog row with its id as the anchor, in catalog order', () => {
    const container = renderMarkup(createElement(ScoreMethodology));
    const ids = Array.from(container.querySelectorAll('tr[id]')).map((row) => row.id);

    expect(ids).toEqual(SCORE_CATALOG.map((definition) => definition.id));
    expect(container.querySelector('h1')?.textContent).toBe('How the agent-readiness score is computed');
    expect(container.querySelectorAll('section[id]')).toHaveLength(11);
    expect(container.querySelector('#statuses')).not.toBeNull();
    expect(container.querySelector('#formula')).not.toBeNull();
    expect(container.textContent).toContain(`v${SCORE_CATALOG_VERSION}`);
    expect(container.textContent).toContain(`${SCORE_CATALOG.length} rows`);
    expect(container.textContent).not.toContain('\u2014');
  });

  it('uses computed counts that match the catalog', () => {
    const container = renderMarkup(createElement(ScoreMethodology));
    const implemented = SCORE_CATALOG.filter((definition) => definition.availability === 'now').length;
    const facts = Array.from(container.querySelectorAll('.score-page-fact')).map((fact) => fact.textContent);

    expect(facts).toContain(`Checks scored now${implemented}`);
    expect(container.textContent).toContain(`${implemented} checks scored with zero extra fetches`);
  });
});


