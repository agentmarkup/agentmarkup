import {
  extractJsonLdScriptContents,
  findBlockedCrawlers,
  hasLlmsTxtDiscoveryLink,
  validateLlmsTxt,
  type AiCrawlersConfig,
  type ValidationResult,
} from '@agentmarkup/core';
import { CRAWLER_AGENTS } from '../agents.js';
import type { AuditFinding, AuditLevel } from '../findings.js';
import type { FetchResult } from '../net.js';

function levelFromSeverity(severity: ValidationResult['severity']): AuditLevel {
  return severity === 'error' ? 'error' : 'warn';
}

const HTML_BODY_RE = /^\s*(?:<!doctype\s+html|<html[\s>])/i;

/**
 * Whether a fetched text resource (llms.txt, robots.txt) is a genuine text
 * response rather than an HTML soft-404 / catch-all page. Many large sites
 * return `200` plus their HTML homepage for unknown paths, which must count as
 * "missing" rather than a malformed text file (otherwise the audit reports a
 * broken llms.txt/robots.txt for a site that simply has none).
 */
export function isRealTextResource(res: FetchResult): boolean {
  if (res.error || (res.status ?? 0) >= 400 || !res.body) {
    return false;
  }
  const contentType = (res.headers['content-type'] ?? '').toLowerCase();
  if (contentType.includes('text/html')) {
    return false;
  }
  return !HTML_BODY_RE.test(res.body);
}

/** A JSON-LD `@graph` container wraps the real typed nodes in an array. */
function isGraphContainer(
  value: unknown
): value is Record<string, unknown> & { '@graph': unknown[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>)['@graph'])
  );
}

/** The crawler stance the audit checks against: these should be reachable. */
const EXPECTED_CRAWLERS: AiCrawlersConfig = Object.fromEntries(
  CRAWLER_AGENTS.map((agent) => [agent.ua.split('/')[0], 'allow' as const])
);

export function stripTags(html: string): string {
  return html
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EMPTY_ROOT_RE =
  /<(?:div|main)\b[^>]*\bid=(['"])(?:root|app|__next|__nuxt|svelte)\1[^>]*>\s*<\/(?:div|main)>/i;

/** Flags pages whose raw HTML has no meaningful content — invisible to crawlers that do not run JS. */
export function analyzeJsDependence(control: FetchResult): AuditFinding[] {
  if (control.error || !control.body || (control.status ?? 0) >= 400) {
    return [];
  }
  const text = stripTags(control.body);
  const emptyRoot = EMPTY_ROOT_RE.test(control.body);

  if (text.length < 200 && emptyRoot) {
    return [
      {
        code: 'js.empty-shell',
        level: 'error',
        title: 'Page content requires JavaScript',
        detail:
          'The raw HTML has an empty root container and almost no text. Most AI crawlers do not run JavaScript, so they see an empty page. Server-render or prerender the content.',
        evidence: `raw text length=${text.length}; empty root container detected`,
        fix: 'Prerender or SSR the page, or add markdown mirrors (agentmarkup markdownPages) so agents get real content.',
      },
    ];
  }
  if (text.length < 200) {
    return [
      {
        code: 'js.thin-html',
        level: 'warn',
        title: 'Raw HTML is very thin',
        detail:
          'The raw (un-executed) HTML contains little text. If the real content is injected by JavaScript, crawlers that do not run JS will miss it.',
        evidence: `raw text length=${text.length}`,
        fix: 'Confirm meaningful content is present without JavaScript; consider markdown mirrors.',
      },
    ];
  }
  return [
    {
      code: 'js.server-rendered',
      level: 'pass',
      title: 'Content is present without JavaScript',
      detail:
        'The raw HTML already contains meaningful text, so crawlers that do not execute JavaScript can read the page.',
      evidence: `raw text length=${text.length}`,
    },
  ];
}

/** robots.txt intent: are the crawlers we expect to allow actually blocked? */
export function analyzeRobots(robots: FetchResult): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const has = isRealTextResource(robots);

  if (!has) {
    findings.push({
      code: 'robots.missing',
      level: 'warn',
      title: 'No robots.txt found',
      detail:
        'No reachable robots.txt. Crawlers assume full access, but you also cannot express AI-specific or Content-Signal preferences.',
      fix: 'Generate robots.txt with agentmarkup (aiCrawlers + contentSignalHeaders).',
    });
    return findings;
  }

  const body = robots.body ?? '';
  const blocked = findBlockedCrawlers(body, EXPECTED_CRAWLERS);
  if (blocked.length > 0) {
    findings.push({
      code: 'robots.blocks-crawlers',
      level: 'error',
      title: 'robots.txt blocks AI crawlers you likely want',
      detail: `A wildcard disallow shadows these crawlers: ${blocked.join(
        ', '
      )}. Blocking search/retrieval crawlers drops you from AI answers.`,
      evidence: blocked.join(', '),
      fix: 'Split rules by intent: block training crawlers if you must, but keep search/retrieval crawlers allowed.',
    });
  } else {
    findings.push({
      code: 'robots.crawlers-allowed',
      level: 'pass',
      title: 'robots.txt does not block the expected AI crawlers',
      detail:
        'None of the checked AI crawlers are shadowed by a wildcard disallow.',
    });
  }

  if (/^\s*content-signal\s*:/im.test(body)) {
    findings.push({
      code: 'robots.content-signal',
      level: 'pass',
      title: 'Content-Signal policy present in robots.txt',
      detail:
        'The canonical Content-Signal directive is in robots.txt, where the Content Signals Policy and Lighthouse look for it.',
    });
  } else {
    findings.push({
      code: 'robots.no-content-signal',
      level: 'warn',
      title: 'No Content-Signal policy in robots.txt',
      detail:
        'Content-Signal in robots.txt is the canonical place to state training/search/ai-input preferences. It may still be set as an HTTP header, which fewer tools read.',
      fix: 'Enable agentmarkup contentSignalHeaders so Content-Signal is written into robots.txt.',
    });
  }

  return findings;
}

/** Machine-readability surface on the homepage HTML plus a fetched llms.txt. */
export function analyzeMachineReadable(
  control: FetchResult,
  llms: FetchResult
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const html = control.body ?? '';

  // llms.txt
  const llmsOk = isRealTextResource(llms);
  if (llmsOk) {
    const results = validateLlmsTxt(llms.body ?? '');
    const errors = results.filter((r) => r.severity === 'error');
    findings.push(
      errors.length > 0
        ? {
            code: 'llms.invalid',
            level: 'error',
            title: 'llms.txt has errors',
            detail: errors.map((r) => r.message).join('; '),
          }
        : {
            code: 'llms.present',
            level: 'pass',
            title: 'llms.txt is present and well-formed',
            detail:
              'A parseable llms.txt was found. Note: most AI crawlers do not yet fetch llms.txt, but AI coding tools and some assistants do.',
          }
    );
  } else {
    findings.push({
      code: 'llms.missing',
      level: 'warn',
      title: 'No llms.txt found',
      detail:
        'No reachable /llms.txt. This is optional — it helps AI coding tools and some assistants, but major crawlers do not require it.',
      fix: 'Generate llms.txt with agentmarkup if you want a curated agent manifest.',
    });
  }

  if (html && !hasLlmsTxtDiscoveryLink(html) && llmsOk) {
    findings.push({
      code: 'llms.no-discovery-link',
      level: 'warn',
      title: 'llms.txt is not linked from the homepage',
      detail:
        'An llms.txt exists but the homepage has no <link rel="alternate" type="text/plain" href="/llms.txt">, so agents cannot discover it from the page.',
      fix: 'agentmarkup injects this discovery link automatically.',
    });
  }

  // JSON-LD. When auditing a third-party live site the honest, provable signal
  // is "is there parseable, typed structured data" — not whether it satisfies
  // our build-time completeness rules (which would falsely flag valid schema.org
  // that omits an optional field). So only unparseable JSON or a block with no
  // @type at all is an error; @graph containers are unwrapped before checking.
  if (html) {
    const blocks = extractJsonLdScriptContents(html);
    if (blocks.length === 0) {
      findings.push({
        code: 'jsonld.missing',
        level: 'warn',
        title: 'No JSON-LD structured data',
        detail:
          'The page has no JSON-LD. Structured data helps AI systems and search understand the page entity.',
        fix: 'Add JSON-LD with agentmarkup schema presets (webSite, organization, article, …).',
      });
    } else {
      let parseError = false;
      let anyTyped = false;
      for (const block of blocks) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(block);
        } catch {
          parseError = true;
          continue;
        }
        const roots = Array.isArray(parsed) ? parsed : [parsed];
        for (const root of roots) {
          const nodes = isGraphContainer(root) ? root['@graph'] : [root];
          for (const node of nodes) {
            if (node && typeof node === 'object' && '@type' in node) {
              anyTyped = true;
            }
          }
        }
      }

      if (parseError) {
        findings.push({
          code: 'jsonld.invalid',
          level: 'error',
          title: 'JSON-LD has errors',
          detail: 'a JSON-LD script block is not valid JSON',
        });
      } else if (!anyTyped) {
        findings.push({
          code: 'jsonld.invalid',
          level: 'error',
          title: 'JSON-LD has errors',
          detail: 'a JSON-LD block has no @type, so it is not usable structured data',
        });
      } else {
        findings.push({
          code: 'jsonld.present',
          level: 'pass',
          title: 'JSON-LD structured data present',
          detail: `${blocks.length} JSON-LD block(s) found and parseable.`,
        });
      }
    }
  }

  return findings;
}

function hasMarkdownAlternate(html: string): boolean {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  return links.some(
    (link) =>
      /\brel=["']?[^"'>]*\balternate\b/i.test(link) &&
      /\btype=["']?text\/markdown\b/i.test(link)
  );
}

/**
 * Markdown mirrors / alternates are optional but valuable: they give agents a
 * clean, low-noise version of the page (agentmarkup can generate them, and some
 * CDNs serve runtime markdown). Present is a pass; absent emits no finding
 * because a content-rich HTML page does not need one.
 */
export function analyzeMarkdown(
  control: FetchResult,
  mirror: FetchResult
): AuditFinding[] {
  const html = control.body ?? '';
  const viaLink = html.length > 0 && hasMarkdownAlternate(html);
  const mirrorType = (mirror.headers['content-type'] ?? '').toLowerCase();
  const viaMirror =
    isRealTextResource(mirror) &&
    (mirrorType.includes('markdown') || /^\s*#/.test(mirror.body ?? ''));

  if (!viaLink && !viaMirror) {
    return [];
  }
  return [
    {
      code: 'markdown.present',
      level: 'pass',
      title: 'A markdown alternate is available for agents',
      detail: viaMirror
        ? 'A markdown mirror of the page is fetchable, giving agents a clean, low-noise version of the content.'
        : 'The page advertises a text/markdown alternate link for agents.',
    },
  ];
}

/**
 * sitemap.xml discovery. A sitemap counts as present if `/sitemap.xml` is a
 * real XML sitemap, OR robots.txt declares one with a `Sitemap:` directive —
 * many large sites host their sitemap at a non-standard path and only announce
 * it through robots.txt, so checking `/sitemap.xml` alone false-negatives.
 */
export function isXmlSitemap(sitemap: FetchResult): boolean {
  const body = sitemap.body ?? '';
  const contentType = (sitemap.headers['content-type'] ?? '').toLowerCase();
  const reachable =
    !sitemap.error && (sitemap.status ?? 0) < 400 && body.length > 0;
  const looksXml =
    /<(?:urlset|sitemapindex)\b/i.test(body) || /^\s*<\?xml/i.test(body);
  const isHtml = contentType.includes('text/html') || HTML_BODY_RE.test(body);
  return reachable && looksXml && !isHtml;
}

export function analyzeSitemap(
  sitemap: FetchResult,
  robots: FetchResult
): AuditFinding[] {
  const declaredInRobots = /^\s*sitemap\s*:/im.test(robots.body ?? '');

  if (isXmlSitemap(sitemap) || declaredInRobots) {
    return [
      {
        code: 'sitemap.present',
        level: 'pass',
        title: 'Sitemap found',
        detail: declaredInRobots
          ? 'A sitemap is declared in robots.txt, which helps crawlers and AI systems discover all of your pages.'
          : 'A sitemap.xml is reachable, which helps crawlers and AI systems discover all of your pages.',
      },
    ];
  }
  return [
    {
      code: 'sitemap.missing',
      level: 'warn',
      title: 'No sitemap.xml found',
      detail:
        'No reachable sitemap.xml. A sitemap helps crawlers and AI systems discover pages they would not reach by following links.',
      fix: 'Generate a sitemap.xml and reference it from robots.txt.',
    },
  ];
}

/** Core head metadata (title / description / canonical) crawlers use to attribute a page. */
export function analyzeMetadata(control: FetchResult): AuditFinding[] {
  if (control.error || (control.status ?? 0) >= 400 || !control.body) {
    return [];
  }
  const html = control.body;
  const missing: string[] = [];

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!titleMatch || titleMatch[1].trim().length === 0) {
    missing.push('title');
  }

  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const hasDescription = metas.some(
    (tag) =>
      /\bname=["']?description["']?/i.test(tag) &&
      /\bcontent=["'][^"']*\S[^"']*["']/i.test(tag)
  );
  if (!hasDescription) missing.push('description');

  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const hasCanonical = links.some((link) =>
    /\brel=["']?canonical\b/i.test(link)
  );
  if (!hasCanonical) missing.push('canonical');

  if (missing.length === 0) {
    return [
      {
        code: 'meta.complete',
        level: 'pass',
        title: 'Core page metadata present',
        detail:
          'The page has a title, a meta description, and a canonical link, which help AI systems and search attribute the page.',
      },
    ];
  }
  return [
    {
      code: 'meta.incomplete',
      level: 'warn',
      title: 'Core page metadata is incomplete',
      detail: `Missing: ${missing.join(
        ', '
      )}. Title, meta description, and canonical link help AI systems and search understand and correctly attribute the page.`,
      evidence: `missing: ${missing.join(', ')}`,
      fix: 'Add the missing head tags; agentmarkup keeps these consistent on generated pages.',
    },
  ];
}

export { levelFromSeverity };
