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

/** The first same-origin `Sitemap:` declaration in robots.txt, or null. */
export function findSitemapUrl(robotsTxt: string, baseUrl: string): string | null {
  const sitemapPattern = /^\s*Sitemap:\s*(\S+)\s*$/gim;
  let match: RegExpExecArray | null;

  while ((match = sitemapPattern.exec(robotsTxt)) !== null) {
    const candidate = resolveSameOriginUrl(match[1], baseUrl);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

/** The target of the first `<link rel=alternate type=text/markdown>`, same origin, or null. */
export function findMarkdownAlternateUrl(html: string, baseUrl: string): string | null {
  const linkPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const tag = match[0];
    if (
      !/\brel=(['"])[^'"]*\balternate\b[^'"]*\1/i.test(tag) ||
      !/\btype=(['"])text\/markdown\1/i.test(tag)
    ) {
      continue;
    }

    const hrefMatch = tag.match(/\bhref=(['"])([\s\S]*?)\1/i);
    if (!hrefMatch) {
      continue;
    }

    return resolveSameOriginUrl(hrefMatch[2], baseUrl);
  }

  return null;
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
  const linkPattern = /<a\b[^>]*href=(['"])([\s\S]*?)\1/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[2].trim();
    if (
      !href ||
      href.startsWith('#') ||
      /^mailto:/i.test(href) ||
      /^tel:/i.test(href) ||
      /^javascript:/i.test(href) ||
      /^data:/i.test(href)
    ) {
      continue;
    }

    let candidate: URL;
    try {
      candidate = new URL(href, base);
    } catch {
      continue;
    }

    if (candidate.origin !== base.origin) {
      continue;
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
      continue;
    }

    return candidate.toString();
  }

  return null;
}
