import { BROWSER_CONTROL, CRAWLER_AGENTS } from './agents.js';
import {
  analyzeCrawlerAccess,
  type AgentProbe,
} from './analyzers/crawler-access.js';
import {
  analyzeJsDependence,
  analyzeMachineReadable,
  analyzeMarkdown,
  analyzeMetadata,
  analyzeRobots,
  analyzeSitemap,
  isXmlSitemap,
} from './analyzers/site-checks.js';
import { countByLevel, worstLevel, type AuditFinding } from './findings.js';
import { safeFetch, type FetchResult } from './net.js';

export interface AuditOptions {
  timeoutMs?: number;
  /** Injected for tests; defaults to the real SSRF-safe fetch. */
  fetchImpl?: typeof safeFetch;
}

export interface AuditReport {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  findings: AuditFinding[];
  summary: {
    pass: number;
    warn: number;
    error: number;
    checks: number;
    passed: number;
    worst: 'pass' | 'warn' | 'error';
  };
}

/**
 * Common non-standard sitemap paths, probed only as a fallback when
 * `/sitemap.xml` is absent and robots.txt declares no sitemap. Kept to
 * text-XML names (no `.gz`, which we cannot decompress to inspect).
 */
const SITEMAP_FALLBACK_PATHS = [
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml',
  '/sitemap/sitemap.xml',
];

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

/**
 * The conventional markdown-mirror URL for a page (agentmarkup writes
 * `/index.md` for the homepage and `<path>.md` for sub-pages). Returns null
 * when the URL already points at a file, so we do not probe nonsense paths.
 */
function markdownMirrorUrl(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '') return `${url.origin}/index.md`;
    if (/\.[a-z0-9]+$/i.test(path)) return null;
    return `${url.origin}${path}.md`;
  } catch {
    return null;
  }
}

function notFetched(url: string): FetchResult {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: null,
    ok: false,
    headers: {},
    body: null,
    bodyBytes: 0,
    redirects: 0,
    blocked: false,
  };
}

/**
 * Audit a live URL. Fetches the page as a browser control and as each AI
 * crawler user-agent, plus robots.txt and llms.txt, then runs the analyzers.
 * `fetchedAt` is injected by the caller so the core stays deterministic/testable.
 */
export async function audit(
  targetUrl: string,
  options: AuditOptions & { fetchedAt: string }
): Promise<AuditReport> {
  const doFetch = options.fetchImpl ?? safeFetch;
  const timeoutMs = options.timeoutMs;
  const origin = originOf(targetUrl);

  const control: FetchResult = await doFetch(targetUrl, {
    userAgent: BROWSER_CONTROL.ua,
    timeoutMs,
    readBody: true,
  });

  const probes: AgentProbe[] = [];
  for (const agent of CRAWLER_AGENTS) {
    // Read the full body (same cap as the control) so the crawler-vs-browser
    // content differential is a fair comparison rather than a truncation artifact.
    const result = await doFetch(targetUrl, {
      userAgent: agent.ua,
      timeoutMs,
      readBody: true,
    });
    probes.push({ agent, result });
  }

  const robots = await doFetch(`${origin}/robots.txt`, {
    userAgent: BROWSER_CONTROL.ua,
    timeoutMs,
    readBody: true,
    maxBytes: 256 * 1024,
  });
  const llms = await doFetch(`${origin}/llms.txt`, {
    userAgent: BROWSER_CONTROL.ua,
    timeoutMs,
    readBody: true,
    maxBytes: 1024 * 1024,
  });

  const fetchSitemap = (path: string): Promise<FetchResult> =>
    doFetch(`${origin}${path}`, {
      userAgent: BROWSER_CONTROL.ua,
      timeoutMs,
      readBody: true,
      maxBytes: 1024 * 1024,
    });

  let sitemap = await fetchSitemap('/sitemap.xml');
  // Only probe common non-standard names when the default path is not a real
  // sitemap and robots.txt does not declare one — keeps the extra fetches rare.
  if (!isXmlSitemap(sitemap) && !/^\s*sitemap\s*:/im.test(robots.body ?? '')) {
    for (const path of SITEMAP_FALLBACK_PATHS) {
      const candidate = await fetchSitemap(path);
      if (isXmlSitemap(candidate)) {
        sitemap = candidate;
        break;
      }
    }
  }

  const mirrorUrl = markdownMirrorUrl(control.finalUrl || targetUrl);
  const mirror = mirrorUrl
    ? await doFetch(mirrorUrl, {
        userAgent: BROWSER_CONTROL.ua,
        timeoutMs,
        readBody: true,
        maxBytes: 1024 * 1024,
      })
    : notFetched(`${origin}/index.md`);

  const findings: AuditFinding[] = [
    ...analyzeCrawlerAccess(control, probes),
    ...analyzeJsDependence(control),
    ...analyzeRobots(robots),
    ...analyzeMachineReadable(control, llms),
    ...analyzeMarkdown(control, mirror),
    ...analyzeSitemap(sitemap, robots),
    ...analyzeMetadata(control),
  ];

  const counts = countByLevel(findings);
  const passed = counts.pass;
  const checks = findings.length;

  return {
    url: targetUrl,
    finalUrl: control.finalUrl,
    fetchedAt: options.fetchedAt,
    findings,
    summary: {
      ...counts,
      checks,
      passed,
      worst: worstLevel(findings),
    },
  };
}
