// URL derivation helpers shared by the website checker worker (which keeps its own
// plain-JS copies until the worker is bundled) and the audit collector. The regexes
// here are the worker's (`website/public/_worker.js`, findSitemapUrl,
// findMarkdownAlternateUrl, buildMarkdownUrl, findFirstInternalLink); the parity
// test keeps the two identical.

/** Resolves `candidate` against `baseUrl`, same origin and http(s) only. */
export function resolveSameOriginUrl(candidate: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(candidate, base);
    if (
      resolved.origin !== base.origin ||
      !['http:', 'https:'].includes(resolved.protocol)
    ) {
      return null;
    }
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

const SECOND_LEVEL_LABELS = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'];

/**
 * The registrable domain of a hostname: the last two labels, or the last three when
 * the second-to-last label is co/com/net/org/gov/edu/ac under a two-letter last label
 * (`www.example.co.uk` -> `example.co.uk`). IP literals and single labels return
 * themselves, so they only ever match exactly.
 */
export function registrableDomainOf(hostname: string): string {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  if (/^\d+(?:\.\d+){3}$/.test(lower) || lower.includes(':') || lower.startsWith('[')) {
    return lower;
  }
  const labels = lower.split('.').filter((label) => label.length > 0);
  if (labels.length <= 2) {
    return labels.join('.');
  }
  const last = labels[labels.length - 1];
  const secondToLast = labels[labels.length - 2];
  const keep = last.length === 2 && SECOND_LEVEL_LABELS.includes(secondToLast) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

/**
 * Resolves a robots.txt `Sitemap:` value: http(s) only, on the base hostname or on
 * a hostname with the same registrable domain (an apex declaration on a www site).
 */
export function resolveSitemapDeclaration(candidate: string, baseUrl: string): string | null {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(candidate, base);
    if (!['http:', 'https:'].includes(resolved.protocol)) {
      return null;
    }
    const host = resolved.hostname.toLowerCase();
    const baseHost = base.hostname.toLowerCase();
    if (host !== baseHost && registrableDomainOf(host) !== registrableDomainOf(baseHost)) {
      return null;
    }
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

// robots.txt directives are single lines (RFC 9309), so the declaration is read one
// line at a time; a multiline `^\s*` rescanned every following blank line from each
// line start (10 s on 80,000 blank lines). Lines end at CRLF, LF, CR, U+2028 or
// U+2029, the terminators the multiline `^` and `$` used.
const ROBOTS_LINE_BREAK_RE = /\r\n|[\n\r\u2028\u2029]/;
const SITEMAP_LINE_RE = /^\s*Sitemap:\s*(\S+)\s*$/i;

/** The first `Sitemap:` declaration in robots.txt on the same registrable domain, or null. */
export function findSitemapUrl(robotsTxt: string, baseUrl: string): string | null {
  for (const line of robotsTxt.split(ROBOTS_LINE_BREAK_RE)) {
    const match = SITEMAP_LINE_RE.exec(line);
    if (!match) {
      continue;
    }
    const candidate = resolveSitemapDeclaration(match[1], baseUrl);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

/**
 * One attribute value of a single tag: double-quoted, single-quoted or unquoted,
 * optional spaces around `=`. Identical to the worker's copy.
 */
export function linkTagAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(
    `[\\s"']${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    'i'
  );
  const match = tag.match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/**
 * Calls `visit` with every tag `/<link\b[^>]*>/gi` matches, in document order, until
 * it returns true. Linear: the regex rescans to the end of the document for every
 * `<link` that no `>` follows, while here the first such opener ends the scan, since
 * no later one can close either. Identical to the worker's copy.
 */
export function forEachLinkTag(html: string, visit: (tag: string) => boolean): void {
  const open = /<link\b/gi;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html)) !== null) {
    const end = html.indexOf('>', match.index + 5);
    if (end === -1) {
      return;
    }
    if (visit(html.slice(match.index, end + 1))) {
      return;
    }
    open.lastIndex = end + 1;
  }
}

/**
 * Calls `visit` with every value `/<a\b[^>]*href=(['"])([\s\S]*?)\1/gi` captures, in
 * document order, until it returns true. Linear: the regex backtracks from each
 * opener's first `>` to its rightmost `href=` plus a quote that closes later, so a
 * run of openers without a `>` rescanned the rest of the document each. Openers that
 * share that `>` share the answer, which is computed once. Identical to the worker's
 * copy.
 */
export function forEachAnchorHref(html: string, visit: (href: string) => boolean): void {
  const lower = html.replace(/[A-Z]+/g, (run) => run.toLowerCase());
  const lastQuote: Record<string, number> = { '"': html.lastIndexOf('"'), "'": html.lastIndexOf("'") };
  const open = /<a\b/gi;
  let segmentEnd = -1;
  let segmentHref = -1;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html)) !== null) {
    const start = match.index + 2;
    if (start > segmentEnd) {
      const gt = html.indexOf('>', start);
      segmentEnd = gt === -1 ? html.length : gt;
      segmentHref = -1;
      // Searched within this segment only: an unbounded lastIndexOf ran back over the
      // whole prefix for every closed anchor without an href.
      const segment = lower.slice(start, segmentEnd);
      let at = segment.length >= 6 ? segment.lastIndexOf('href=', segment.length - 6) : -1;
      while (at >= 0) {
        const quote = html[start + at + 5];
        if ((quote === '"' || quote === "'") && lastQuote[quote] >= start + at + 6) {
          segmentHref = start + at;
          break;
        }
        at = at > 0 ? segment.lastIndexOf('href=', at - 1) : -1;
      }
    }
    if (segmentHref < start) {
      continue;
    }
    const quote = html[segmentHref + 5];
    const close = html.indexOf(quote, segmentHref + 6);
    if (visit(html.slice(segmentHref + 6, close))) {
      return;
    }
    open.lastIndex = close + 1;
  }
}

/** The target of the first same-origin `<link rel=alternate type=text/markdown>`, or null. */
export function findMarkdownAlternateUrl(html: string, baseUrl: string): string | null {
  let found: string | null = null;
  forEachLinkTag(html, (tag) => {
    const rel = linkTagAttribute(tag, 'rel');
    const type = linkTagAttribute(tag, 'type');
    if (
      rel === null ||
      !rel.toLowerCase().split(/\s+/).includes('alternate') ||
      type === null ||
      type.trim().toLowerCase() !== 'text/markdown'
    ) {
      return false;
    }

    const href = linkTagAttribute(tag, 'href');
    if (href === null) {
      return false;
    }

    found = resolveSameOriginUrl(href, baseUrl);
    return found !== null;
  });

  return found;
}

/** `/` becomes `/index.md`; any other path drops a trailing slash or `.html` and gains `.md`. */
export function buildMarkdownUrl(pageUrl: string): string {
  const parsed = new URL(pageUrl);
  parsed.search = '';
  parsed.hash = '';

  if (parsed.pathname === '/' || parsed.pathname === '') {
    parsed.pathname = '/index.md';
    return parsed.toString();
  }

  const cleanPath = parsed.pathname.replace(/\/$/, '').replace(/\.html$/i, '');
  parsed.pathname = `${cleanPath}.md`;
  return parsed.toString();
}

/** The first same-origin, non-asset, non-API link in document order, or null. */
export function findFirstInternalLink(html: string, baseUrl: string): string | null {
  const base = new URL(baseUrl);
  let found: string | null = null;

  forEachAnchorHref(html, (value) => {
    const href = value.trim();
    if (
      !href ||
      href.startsWith('#') ||
      /^mailto:/i.test(href) ||
      /^tel:/i.test(href) ||
      /^javascript:/i.test(href) ||
      /^data:/i.test(href)
    ) {
      return false;
    }

    let candidate: URL;
    try {
      candidate = new URL(href, base);
    } catch {
      return false;
    }

    if (candidate.origin !== base.origin) {
      return false;
    }

    candidate.search = '';
    candidate.hash = '';

    if (
      candidate.pathname === '/' ||
      candidate.pathname === '' ||
      /^\/api\//i.test(candidate.pathname) ||
      /\.(png|jpe?g|gif|webp|svg|ico|css|js|xml|txt|json|pdf|zip|mp3|mp4|woff2?)$/i.test(
        candidate.pathname
      )
    ) {
      return false;
    }

    found = candidate.toString();
    return true;
  });

  return found;
}
