// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHALLENGE_SCAN_CHARS, POOLS, SCORE_CATALOG } from '@agentmarkup/core/score';

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
