import { describe, expect, it } from 'vitest';

import { findBlockedCrawlers } from '../../src/generators/robots-txt.js';
import { firstLastmod, hasHttpMarkdownLink } from '../../src/score/evaluators/discovery.js';
import { hasTitleKey } from '../../src/score/evaluators/markdown.js';
import {
  collectFields,
  controlBodyHtml,
  decodeEntities,
  elementInnerHtml,
  findHtmlLang,
  innerHasImageAlt,
  innerHasSvgTitle,
  robotsBlockedAgents,
  tokenizeTags,
  type TagToken,
} from '../../src/score/html-lite.js';

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

  it('removes the same marker lines as the per-line form with lone CR, U+2028 and U+2029 breaks', () => {
    // The per-line form also stopped indentation at LF only, so its multiline ^ restarted
    // after every CR. Excluding all four terminators can only leave whitespace in front
    // of a removed marker on the same LF line, which the parser trims to a blank line.
    const perLine = (robotsTxt: string) =>
      findBlockedCrawlers(
        robotsTxt.replace(/^[^\S\n]*# (?:BEGIN|END) agentmarkup [^\n]*$/gm, ''),
        Object.fromEntries(AGENTS.map((agent) => [agent, 'allow' as const]))
      );
    const random = seeded(29);
    const pieces = [
      'User-agent: GPTBot\n', 'User-agent: *\n', 'User-agent: ClaudeBot\r', 'Disallow: /\n', 'Allow: /\r', '\n',
      '\r', '\r\n', ' ', '\t', '\u2028', '\u2029', '# BEGIN agentmarkup AI crawlers', '# END agentmarkup AI crawlers',
      '# BEGIN agentmarkup AI crawlers\n', '# END agentmarkup AI crawlers\r\n', ' \r# END agentmarkup AI crawlers\n',
      '# comment\r',
    ];
    let blocking = 0;
    for (let run = 0; run < 4000; run += 1) {
      const body = compose(random, pieces, 18);
      const expected = perLine(body);
      if (expected.length > 0) blocking += 1;
      expect(robotsBlockedAgents(body, AGENTS), JSON.stringify(body)).toEqual(expected);
    }
    expect(blocking).toBeGreaterThan(100);
  });

  it('reads 5 MB of lone CR, U+2028 or U+2029 line breaks in well under a second', () => {
    for (const separator of ['\r', '\u2028', '\u2029']) {
      const body = 'User-agent: *\n' + separator.repeat(5 * 1024 * 1024) + '# BEGIN agentmarkup AI crawlers\n';
      const started = performance.now();
      robotsBlockedAgents(body, AGENTS);
      expect(performance.now() - started, JSON.stringify(separator)).toBeLessThan(1000);
    }
  });

  it('reads a robots.txt of 300,000 blank lines in well under a second', () => {
    const started = performance.now();
    robotsBlockedAgents('\n'.repeat(300_000) + '# BEGIN agentmarkup AI crawlers\n', AGENTS);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

// Round-4 review: each linear scan against the regex or loop it replaced.
describe('round-4 linear scans answer what the regexes answered', () => {
  function agree<T>(seed: number, pieces: string[], max: number, runs: number, next: (input: string) => T, previous: (input: string) => T, hit: (value: T) => boolean): void {
    const random = seeded(seed);
    let hits = 0;
    for (let run = 0; run < runs; run += 1) {
      const input = compose(random, pieces, max);
      const expected = previous(input);
      if (hit(expected)) hits += 1;
      expect(next(input), JSON.stringify(input)).toEqual(expected);
    }
    // Both answers occur, so the comparison is not vacuous.
    expect(hits).toBeGreaterThan(runs / 200);
    expect(hits).toBeLessThan(runs - runs / 200);
  }

  it('firstLastmod captures what /<lastmod\\b[^>]*>\\s*([^<\\s]+)\\s*<\\/lastmod\\s*>/i captured', () => {
    const pieces = ['<lastmod>', '<lastmod a="1">', '<lastmod', '<LASTMOD>', '<lastmods>', '</lastmod>', '</lastmod >', '</LastMod\n>', '</lastmod', '2026-10-01', '2026', ' ', '\n', '<b>', '>', 'x', '<'];
    agree(41, pieces, 10, 6000, firstLastmod, (entry) => entry.match(/<lastmod\b[^>]*>\s*([^<\s]+)\s*<\/lastmod\s*>/i)?.[1] ?? null, (value) => value !== null);
  });

  it('hasHttpMarkdownLink answers /\\[[^\\]]*\\]\\(https?:\\/\\//i', () => {
    const pieces = ['[', ']', '(', ')', 'https://', 'http://', 'HTTPS://', 'http:/', 'a', '](', ' ', '\n'];
    agree(43, pieces, 12, 6000, hasHttpMarkdownLink, (body) => /\[[^\]]*\]\(https?:\/\//i.test(body), Boolean);
  });

  it('hasTitleKey answers /^\\s*title\\s*:/m, line terminators and unicode spaces included', () => {
    const pieces = ['title', ':', ' ', '\t', '\n', '\r', '\u2028', '\u2029', '\u00a0', 'x', 'Title', 'subtitle', 'title:'];
    agree(47, pieces, 8, 6000, hasTitleKey, (frontmatter) => /^\s*title\s*:/m.test(frontmatter), Boolean);
  });

  it('innerHasImageAlt answers the global img-alt regex loop', () => {
    const previous = (inner: string): boolean => {
      const pattern = /<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(inner)) !== null) {
        if (decodeEntities(match[1] ?? match[2] ?? match[3] ?? '').trim()) return true;
      }
      return false;
    };
    const pieces = ['<img', '<img ', '<IMG ', ' alt="x"', " alt='y'", ' alt=z', ' alt=""', ' alt=" "', ' alt = "w"', ' alt=&nbsp;', ' data-alt="q"', 'alt', '=', '"', "'", '>', ' ', 'x', '<imgs '];
    agree(53, pieces, 10, 6000, innerHasImageAlt, previous, Boolean);
  });

  it('innerHasSvgTitle answers the svg-title regex', () => {
    const previous = (inner: string) => /<svg\b[^>]*>[\s\S]*?<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title\s*>/i.test(inner);
    const pieces = ['<svg>', '<svg>', '<svg ', '<SVG viewBox="0">', '<svgs>', '>', '<title>', '<title>', '<title ', '<titles>', '</title>', '</title>', '</title >', '</TITLE>', '</title', 'x', 'x', ' ', '\n', '<', '<b>'];
    agree(59, pieces, 12, 6000, innerHasSvgTitle, previous, Boolean);
  });

  it('findHtmlLang reads the tag /<html\\b[^>]*>/i matched', () => {
    const previous = (html: string): string | null => {
      const match = html.match(/<html\b[^>]*>/i);
      const lang = match ? tokenizeTags(match[0])[0]?.attrs.lang : undefined;
      return typeof lang === 'string' && lang.trim() ? lang.trim() : null;
    };
    const pieces = ['<html', '<HTML', '<htmlx', ' lang="en"', " lang='fr'", ' lang=de', ' lang=""', '>', 'x', ' ', '<', '"'];
    agree(61, pieces, 8, 6000, findHtmlLang, previous, (value) => value !== null);
  });

  it('collectFields labels the same fields as the per-field range test, nested and unclosed labels included', () => {
    const previous = (html: string): number => {
      const source = controlBodyHtml(html);
      const tokens = tokenizeTags(source);
      const ranges: Array<[number, number]> = [];
      tokens.forEach((token, index) => {
        if (token.closing || token.name !== 'label') return;
        const inner = elementInnerHtml(source, tokens, index);
        if (inner) ranges.push([token.end, token.end + inner.length]);
      });
      let wrapped = 0;
      for (const token of tokens) {
        if (token.closing || !['input', 'select', 'textarea'].includes(token.name)) continue;
        if (ranges.some(([from, to]) => token.start >= from && token.start < to)) wrapped += 1;
      }
      return wrapped;
    };
    // Fields carry no other label source, so labelled counts exactly the wrapped ones.
    const pieces = ['<label>', '</label>', '<label/>', 'x', '<input>', '<select>', '</select>', '<textarea>', '</textarea>', '<span>', '</span>', ' '];
    agree(67, pieces, 14, 4000, (html) => collectFields(html).labelled, previous, (value) => value > 0);
  });
});
