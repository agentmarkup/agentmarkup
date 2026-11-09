// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHALLENGE_SCAN_CHARS, POOLS, SCORE_CATALOG } from '@agentmarkup/core/score';

import { GROUP_COPY } from '../src/checker/report-copy';
import { GROUP_ORDER } from '../src/checker/report-model';
import ScoreMethodology from '../src/pages/ScoreMethodology';

function render(): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(createElement(ScoreMethodology));
  return container;
}

describe('ScoreMethodology catalog table', () => {
  it('has a Bucket column whose cell equals each catalog row bucket', () => {
    const container = render();
    for (const table of Array.from(container.querySelectorAll('table.score-catalog-table'))) {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
      expect(headers.slice(0, 2)).toEqual(['Check', 'Bucket']);
    }
    const buckets = Array.from(container.querySelectorAll('tr[id]')).map((row) => [
      row.id,
      row.querySelector('td.score-catalog-bucket')?.textContent,
    ]);
    expect(buckets).toEqual(SCORE_CATALOG.map((definition) => [definition.id, definition.bucket]));
  });

  it('has a Goal column after Bucket whose cell is the report question for the row bucket', () => {
    const container = render();
    for (const table of Array.from(container.querySelectorAll('table.score-catalog-table'))) {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent);
      expect(headers.slice(0, 3)).toEqual(['Check', 'Bucket', 'Goal']);
    }
    const goals = Array.from(container.querySelectorAll('tr[id]')).map((row) => [
      row.id,
      row.querySelector('td.score-catalog-bucket')?.nextElementSibling?.textContent,
    ]);
    expect(goals).toEqual(SCORE_CATALOG.map((definition) => [definition.id, GROUP_COPY[definition.bucket].question]));
  });

  it('explains how the report groups checks in #groups', () => {
    const container = render();
    const groups = container.querySelector('section#groups');
    expect(groups?.querySelector('h2')?.textContent).toBe('How the report groups checks');
    const text = groups?.textContent ?? '';
    for (const bucket of GROUP_ORDER) {
      expect(text, bucket).toContain(GROUP_COPY[bucket].question);
    }
    expect(text).toContain('never shows 100% while a check in it is short of full credit');
    expect(text).toContain('the six areas add up to required + recommended earned');
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it('renders the score ceiling and the challenge window from the shared constants', () => {
    const container = render();
    const text = container.textContent ?? '';
    const ceiling = POOLS.required + POOLS.recommended;
    expect(text).toContain(`score = min(${ceiling}, round-half-up(raw))`);
    expect(text).toContain(`deterministic 0-${ceiling} agent-readiness`);
    const sampling = container.querySelector('#sampling')?.textContent ?? '';
    expect(sampling).toContain(`the first ${CHALLENGE_SCAN_CHARS.toLocaleString('en-US')} characters of the body`);
    expect(sampling).not.toContain('20 KB');
  });
});
