import { describe, expect, it } from 'vitest';

import { extractJsonLdScriptContents } from '../src/html.js';
import {
  blockPattern,
  isLoneMountNode,
  replaceBlocks,
  replaceComments,
  replaceTags,
  scanBlocks,
  type BlockPattern,
} from '../src/html-scan.js';
import { tokenizeTags } from '../src/score/html-lite.js';

// The scanners must return exactly what the regexes they replaced returned. Each
// case below pairs a scanner pattern with the regex it stands for and compares them
// on seeded random markup built from the edge cases that matter: unclosed openers,
// mixed case, `\b` boundaries, `\s*>` closing tails and nested or crossed blocks.

const SHAPE_EXACT = { openerEndsAtGt: true, closeAllowsSpace: false } as const;
const SHAPE_SPACE = { openerEndsAtGt: true, closeAllowsSpace: true } as const;
const SHAPE_BARE = { openerEndsAtGt: false, closeAllowsSpace: false } as const;

interface Pair {
  label: string;
  pattern: BlockPattern;
  regex: RegExp;
}

const PAIRS: Pair[] = [
  {
    label: 'text ignored blocks',
    pattern: blockPattern(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'form'], SHAPE_EXACT),
    regex: /<(script|style|noscript|template|svg|canvas|iframe|form)\b[^>]*>[\s\S]*?<\/\1>/gi,
  },
  {
    label: 'control ignored blocks',
    pattern: blockPattern(['script', 'style', 'noscript', 'template', 'canvas', 'iframe'], SHAPE_EXACT),
    regex: /<(script|style|noscript|template|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,
  },
  {
    label: 'script contents',
    pattern: blockPattern(['script'], SHAPE_SPACE),
    regex: /<(script)\b[^>]*>([\s\S]*?)<\/script\s*>/gi,
  },
  {
    label: 'headings',
    pattern: blockPattern(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], SHAPE_SPACE),
    regex: /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
  },
  { label: 'comparison script', pattern: blockPattern(['script'], SHAPE_BARE), regex: /<(script)\b([\s\S]*?)<\/script>/gi },
  { label: 'comparison head', pattern: blockPattern(['head'], SHAPE_BARE), regex: /<(head)\b([\s\S]*?)<\/head>/gi },
];

const PIECES = [
  '<script>', '</script>', '</SCRIPT >', '</script\n>', '</script', '<script ', '<Script type="a">', '<scripts>',
  '<script-x>', '<script_x>', '<style>', '</style>', '<svg>', '</svg>', '<form>', '</form>', '<template>',
  '</template>', '<noscript>', '</noscript>', '<canvas>', '</canvas>', '<iframe>', '</iframe>', '<h1>', '</h1>',
  '</H1 >', '<h2 class=x>', '</h2>', '<h7>', '</h7>', '<head>', '</head>', '<body>', '</body>', '<!--', '-->',
  '<!-- x -->', '>', '<', 'a', ' ', '\n', ' ', 'İ', 'type="application/ld+json"',
  "type='application/ld+json'", '<script type="application/ld+json">', '{"@type":"Thing"}',
];

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

function randomMarkup(random: () => number): string {
  const count = Math.floor(random() * 30);
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += PIECES[Math.floor(random() * PIECES.length)];
  }
  return out;
}

const CASES = (() => {
  const random = seeded(20261102);
  return Array.from({ length: 4000 }, () => randomMarkup(random));
})();

function regexMatches(html: string, regex: RegExp): Array<{ name: string; start: number; end: number; content: string | null }> {
  const pattern = new RegExp(regex.source, regex.flags);
  const out: Array<{ name: string; start: number; end: number; content: string | null }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    out.push({ name: match[1].toLowerCase(), start: match.index, end: match.index + match[0].length, content: match[2] ?? null });
  }
  return out;
}

describe('html-scan matches the regexes it replaced', () => {
  for (const pair of PAIRS) {
    it(`${pair.label}: same matches, positions and contents on ${CASES.length} seeded inputs`, () => {
      for (const html of CASES) {
        const expected = regexMatches(html, pair.regex);
        const actual = scanBlocks(html, pair.pattern).map((match) => ({
          name: match.name,
          start: match.start,
          end: match.end,
          content: expected.length > 0 && expected[0].content === null ? null : match.content,
        }));
        expect(actual, JSON.stringify(html)).toEqual(expected);
        expect(replaceBlocks(html, pair.pattern, ' '), JSON.stringify(html)).toBe(html.replace(pair.regex, ' '));
      }
    });
  }

  it('limit 1 equals the non-global body regex', () => {
    const pattern = blockPattern(['body'], SHAPE_EXACT);
    for (const html of CASES) {
      const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
      const [scanned] = scanBlocks(html, pattern, 1);
      expect(scanned?.content ?? null, JSON.stringify(html)).toBe(match ? match[1] : null);
    }
  });

  it('JSON-LD script contents equal the documented regex', () => {
    for (const html of CASES) {
      const expected: string[] = [];
      const pattern = /<script\b[^>]*type=(['"])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        const content = match[2].trim();
        if (content) {
          expected.push(content);
        }
      }
      expect(extractJsonLdScriptContents(html), JSON.stringify(html)).toEqual(expected);
    }
  });

  it('tag stripping equals /<[^>]+>/g and /<[^>]*>/g', () => {
    for (const html of [...CASES, '<>', '<<>>', 'a<>b<c>', '<', '>', '<a<b>c>']) {
      expect(replaceTags(html, ' '), JSON.stringify(html)).toBe(html.replace(/<[^>]+>/g, ' '));
      expect(replaceTags(html, ' ', true), JSON.stringify(html)).toBe(html.replace(/<[^>]*>/g, ' '));
    }
  });

  it('comment removal equals /<!--[\\s\\S]*?-->/g', () => {
    for (const html of CASES) {
      expect(replaceComments(html, ' '), JSON.stringify(html)).toBe(html.replace(/<!--[\s\S]*?-->/g, ' '));
    }
  });
});

describe('html-scan stays linear on hostile markup', () => {
  // A regex form of these took minutes on 1 MB: every unclosed opener rescanned the rest.
  const size = 1_000_000;
  const hostile: Array<[string, string]> = [
    ['unclosed script openers', '<script>a'],
    ['script openers without a closing >', '<script a'],
    ['unclosed JSON-LD scripts', '<script type="application/ld+json">{}'],
    ['unclosed comments', '<!--a'],
    ['unclosed headings', '<h1>a'],
    ['unclosed body openers', '<body>a'],
    ['a lone < with no > after it', '<a'],
  ];
  for (const [label, unit] of hostile) {
    it(`${label}: every scanner finishes in well under a second`, () => {
      const html = unit.repeat(Math.floor(size / unit.length));
      const started = performance.now();
      for (const pair of PAIRS) {
        scanBlocks(html, pair.pattern);
      }
      scanBlocks(html, blockPattern(['body'], SHAPE_EXACT), 1);
      extractJsonLdScriptContents(html);
      replaceComments(html, ' ');
      replaceTags(html, ' ');
      replaceTags(html, ' ', true);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  }
});

describe('tokenizeTags raw-text skipping', () => {
  it('keeps indices aligned after a dotted capital I (toLowerCase would add a code unit)', () => {
    const html = '<script>İİ</SCRIPT><p id="after">';
    const tokens = tokenizeTags(html);
    expect(tokens.map((token) => `${token.closing ? '/' : ''}${token.name}`)).toEqual(['script', '/script', 'p']);
    expect(tokens[2].attrs.id).toBe('after');
  });
});

describe('isLoneMountNode', () => {
  const SHELL_RE = /^<(div|main|section)\b[^>]*(id|class)="[^"]*(root|app|__next|svelte|mount)[^"]*"[^>]*>\s*<\/\1>$/;

  it('answers the client-shell regex on seeded openers', () => {
    const random = seeded(71);
    const pick = (items: string[]) => items[Math.floor(random() * items.length)];
    const openers = ['<div', '<main', '<section', '<divx', '<DIV', '</div', '<span'];
    const middle = [' ', ' ', 'id="', 'id="root', 'class="', 'data-id="', 'root', 'root"', 'app', '__next', 'mount', 'x', '"', '"', '>', "'", '<'];
    const closers = ['></div>', '> </div>', '></main>', '></section>', '"></div>', '</div>', '>  </div>', '><div></div>', ''];
    let shells = 0;
    for (let run = 0; run < 20000; run += 1) {
      let value = pick(openers);
      const count = Math.floor(random() * 9);
      for (let i = 0; i < count; i += 1) value += pick(middle);
      value += pick(closers);
      const expected = SHELL_RE.test(value);
      if (expected) shells += 1;
      expect(isLoneMountNode(value), JSON.stringify(value)).toBe(expected);
    }
    expect(shells).toBeGreaterThan(50);
  });

  it('reads an id value of 250,000 keywords that never closes in well under a second', () => {
    const value = `<div class="${'root'.repeat(250_000)}></div>`;
    const started = performance.now();
    expect(isLoneMountNode(value)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('recognises the usual mount nodes', () => {
    expect(isLoneMountNode('<div id="root"></div>')).toBe(true);
    expect(isLoneMountNode('<div id="__next" class="x"> </div>')).toBe(true);
    expect(isLoneMountNode('<main class="app-shell"></main>')).toBe(true);
    expect(isLoneMountNode('<div id="root"><p>hi</p></div>')).toBe(false);
    expect(isLoneMountNode('<div id="root"></main>')).toBe(false);
  });
});

