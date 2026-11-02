// URL helpers shared with the website checker worker (`website/public/_worker.js`
// keeps identical plain-JS copies; `website/test/worker-check-chain.test.ts`
// covers the same cases through the worker).
import { describe, expect, it } from 'vitest';
import {
  findFirstInternalLink,
  findMarkdownAlternateUrl,
  findSitemapUrl,
  forEachAnchorHref,
  forEachLinkTag,
  registrableDomainOf,
} from '../../src/score/discover.js';

describe('registrableDomainOf', () => {
  it('keeps the last two labels, or three under co/com/net/org/gov/edu/ac plus a two-letter TLD', () => {
    expect(registrableDomainOf('www.example.com')).toBe('example.com');
    expect(registrableDomainOf('example.com')).toBe('example.com');
    expect(registrableDomainOf('shop.www.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomainOf('www.example.com.au')).toBe('example.com.au');
    expect(registrableDomainOf('blog.example.ac.jp')).toBe('example.ac.jp');
    expect(registrableDomainOf('www.example.com.')).toBe('example.com');
    expect(registrableDomainOf('www.example.co')).toBe('example.co');
    expect(registrableDomainOf('93.184.216.34')).toBe('93.184.216.34');
    expect(registrableDomainOf('localhost')).toBe('localhost');
  });
});

describe('findSitemapUrl', () => {
  it('accepts an apex declaration on a www site and a www declaration on an apex site', () => {
    expect(findSitemapUrl('Sitemap: https://example.com/sitemap.xml\n', 'https://www.example.com/')).toBe(
      'https://example.com/sitemap.xml'
    );
    expect(findSitemapUrl('Sitemap: https://www.example.com/sitemap_index.xml\n', 'https://example.com/')).toBe(
      'https://www.example.com/sitemap_index.xml'
    );
    expect(findSitemapUrl('Sitemap: https://example.co.uk/sitemap.xml\n', 'https://www.example.co.uk/')).toBe(
      'https://example.co.uk/sitemap.xml'
    );
  });

  it('skips declarations on another registrable domain and takes the next acceptable one', () => {
    const robots = [
      'User-agent: *',
      'Sitemap: https://cdn.other.net/sitemap.xml',
      'Sitemap: https://other.co.uk/sitemap.xml',
      'Sitemap: ftp://example.com/sitemap.xml',
      'Sitemap: /relative-sitemap.xml#top',
      '',
    ].join('\n');
    expect(findSitemapUrl(robots, 'https://www.example.co.uk/')).toBe('https://www.example.co.uk/relative-sitemap.xml');
    expect(findSitemapUrl('Sitemap: https://cdn.other.net/sitemap.xml\n', 'https://www.example.com/')).toBeNull();
    expect(findSitemapUrl('Sitemap: https://example.co.uk/sitemap.xml\n', 'https://www.other.co.uk/')).toBeNull();
    expect(findSitemapUrl('Sitemap: http://93.184.216.35/sitemap.xml\n', 'http://93.184.216.34/')).toBeNull();
  });
});

describe('findMarkdownAlternateUrl', () => {
  it('skips a cross-origin markdown alternate and returns the next same-origin one', () => {
    const head = [
      '<link rel="alternate" type="text/markdown" href="https://cdn.other.net/index.md">',
      '<link rel="alternate" type="text/markdown" href="/home.md">',
    ].join('');
    expect(findMarkdownAlternateUrl(head, 'https://www.example.com/')).toBe('https://www.example.com/home.md');
    expect(
      findMarkdownAlternateUrl('<link rel="alternate" type="text/markdown" href="https://cdn.other.net/index.md">', 'https://www.example.com/')
    ).toBeNull();
  });
  it('reads rel, type and href with spaces around = and with unquoted values, like the worker', () => {
    const base = 'https://www.example.com/';
    expect(findMarkdownAlternateUrl('<link rel = "alternate" type = "text/markdown" href = "/spaced.md">', base)).toBe(
      'https://www.example.com/spaced.md'
    );
    expect(findMarkdownAlternateUrl('<link rel=alternate type=text/markdown href=/bare.md>', base)).toBe(
      'https://www.example.com/bare.md'
    );
    expect(findMarkdownAlternateUrl("<link rel='preload alternate' type=' Text/Markdown ' href='/mixed.md'>", base)).toBe(
      'https://www.example.com/mixed.md'
    );
    expect(findMarkdownAlternateUrl('<link data-rel="alternate" rel="stylesheet" type="text/markdown" href="/no.md">', base)).toBeNull();
  });
});

describe('linear link scans', () => {
  // The scans must capture exactly what the regexes they replaced captured.
  const PIECES = [
    '<link', '<LINK ', '<link\n', '<linked', '<a', '<A ', '<a\n', '<ab', '<abbr>', 'href=', 'HREF=', 'href ="',
    'href="', "href='", '"', "'", '>', '<', 'x', ' ', '\n', '/a/', '#top', 'rel="alternate"', 'type="text/markdown"',
    '<a href="/b/">', "<a href='/c/'>", '<link rel="alternate" type="text/markdown" href="/m.md">', 'İ',
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
  const random = seeded(20261102);
  const CASES = Array.from({ length: 6000 }, () => {
    let out = '';
    const count = Math.floor(random() * 28);
    for (let i = 0; i < count; i += 1) out += PIECES[Math.floor(random() * PIECES.length)];
    return out;
  });
  const collect = (scan: (html: string, visit: (value: string) => boolean) => void, html: string): string[] => {
    const out: string[] = [];
    scan(html, (value) => {
      out.push(value);
      return false;
    });
    return out;
  };

  it('forEachLinkTag yields exactly the /<link\\b[^>]*>/gi matches on 6,000 seeded inputs', () => {
    let matched = 0;
    for (const html of CASES) {
      const expected = html.match(/<link\b[^>]*>/gi) ?? [];
      matched += expected.length;
      expect(collect(forEachLinkTag, html), JSON.stringify(html)).toEqual(expected);
    }
    expect(matched).toBeGreaterThan(1000);
  });

  it('forEachAnchorHref yields exactly the /<a\\b[^>]*href=([\'"])([\\s\\S]*?)\\1/gi captures on 6,000 seeded inputs', () => {
    let matched = 0;
    for (const html of CASES) {
      const expected = [...html.matchAll(/<a\b[^>]*href=(['"])([\s\S]*?)\1/gi)].map((match) => match[2]);
      matched += expected.length;
      expect(collect(forEachAnchorHref, html), JSON.stringify(html)).toEqual(expected);
    }
    expect(matched).toBeGreaterThan(1000);
  });

  it('stops at the first accepted value', () => {
    const seen: string[] = [];
    forEachAnchorHref('<a href="/1/"><a href="/2/"><a href="/3/">', (href) => {
      seen.push(href);
      return href === '/2/';
    });
    expect(seen).toEqual(['/1/', '/2/']);
  });

  it('finish a 5 MB hostile homepage of "<link x" or "<a href=x" units in well under a second', () => {
    const size = 5 * 1024 * 1024 - 1024;
    for (const unit of ['<link x', '<a href=x', '<link rel="alternate" type="text/markdown" href="', '<a x']) {
      const html = `<html><head></head><body>${unit.repeat(Math.floor(size / unit.length))}`;
      const started = performance.now();
      findMarkdownAlternateUrl(html, 'https://www.example.com/');
      findFirstInternalLink(html, 'https://www.example.com/');
      expect(performance.now() - started, unit).toBeLessThan(1000);
    }
  });
});
