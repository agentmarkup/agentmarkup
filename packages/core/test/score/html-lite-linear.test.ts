import { describe, expect, it } from 'vitest';

import { findBlockedCrawlers } from '../../src/generators/robots-txt.js';
import { elementInnerHtml, robotsBlockedAgents, tokenizeTags, type TagToken } from '../../src/score/html-lite.js';

// The linear rewrites must answer exactly what the code they replaced answered.

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compose(random: () => number, pieces: string[], max: number): string {
  let out = '';
  const count = Math.floor(random() * max);
  for (let i = 0; i < count; i += 1) {
    out += pieces[Math.floor(random() * pieces.length)];
  }
  return out;
}

/** The forward scan elementInnerHtml used before the stack pass. */
function forwardInnerHtml(html: string, tokens: TagToken[], index: number): string {
  const open = tokens[index];
  if (open.closing || open.selfClosing) {
    return '';
  }
  let depth = 0;
  for (let j = index + 1; j < tokens.length; j += 1) {
    const token = tokens[j];
    if (token.name !== open.name) {
      continue;
    }
    if (token.closing) {
      if (depth === 0) {
        return html.slice(open.end, token.start);
      }
      depth -= 1;
    } else if (!token.selfClosing) {
      depth += 1;
    }
  }
  return '';
}

describe('elementInnerHtml', () => {
  it('matches the forward same-name scan for every token on seeded markup', () => {
    const random = seeded(7);
    const pieces = ['<button>', '</button>', '<button/>', '<a href="x">', '</a>', '<div role="button">', '</div>', '<div>', 'x', ' ', '<br>', '</BUTTON>'];
    for (let run = 0; run < 2000; run += 1) {
      const html = compose(random, pieces, 24);
      const tokens = tokenizeTags(html);
      tokens.forEach((_, index) => {
        expect(elementInnerHtml(html, tokens, index), JSON.stringify(html)).toBe(forwardInnerHtml(html, tokens, index));
      });
    }
  });

  it('answers every element of 100,000 unclosed buttons in well under a second', () => {
    const html = '<button>a'.repeat(100_000);
    const tokens = tokenizeTags(html);
    const started = performance.now();
    tokens.forEach((_, index) => elementInnerHtml(html, tokens, index));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('robotsBlockedAgents marker removal', () => {
  const AGENTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot'];
  /** The `^\s*` form that also ate the blank lines before a marker line. */
  function previous(robotsTxt: string): string[] {
    const config = Object.fromEntries(AGENTS.map((agent) => [agent, 'allow' as const]));
    return findBlockedCrawlers(robotsTxt.replace(/^\s*# (?:BEGIN|END) agentmarkup [^\n]*$/gm, ''), config);
  }

  it('blocks the same agents as the previous form on seeded robots.txt bodies', () => {
    const random = seeded(11);
    const pieces = [
      'User-agent: GPTBot\n', 'User-agent: *\n', 'User-agent: ClaudeBot\n', 'Disallow: /\n', 'Allow: /\n',
      'Disallow: /x\n', '\n', '   \n', '\t\n', '\r\n', ' \n', '# BEGIN agentmarkup AI crawlers\n',
      '# END agentmarkup AI crawlers\n', '  # BEGIN agentmarkup AI crawlers\n', '# END agentmarkup AI crawlers\r\n',
      '# comment\n',
    ];
    for (let run = 0; run < 4000; run += 1) {
      const body = compose(random, pieces, 16);
      expect(robotsBlockedAgents(body, AGENTS), JSON.stringify(body)).toEqual(previous(body));
    }
  });

  it('reads a robots.txt of 300,000 blank lines in well under a second', () => {
    const started = performance.now();
    robotsBlockedAgents('\n'.repeat(300_000) + '# BEGIN agentmarkup AI crawlers\n', AGENTS);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
