import {
  extractJsonLdScriptContents,
  findBlockedCrawlers,
  hasLlmsTxtDiscoveryLink,
  validateJsonLdNode,
  validateLlmsTxt,
  type AiCrawlersConfig,
  type JsonLdBase,
  type ValidationResult,
} from '@agentmarkup/core';
import { CRAWLER_AGENTS } from '../agents.js';
import type { AuditFinding, AuditLevel } from '../findings.js';
import type { FetchResult } from '../net.js';

function levelFromSeverity(severity: ValidationResult['severity']): AuditLevel {
  return severity === 'error' ? 'error' : 'warn';
}

/** The crawler stance the audit checks against: these should be reachable. */
const EXPECTED_CRAWLERS: AiCrawlersConfig = Object.fromEntries(
  CRAWLER_AGENTS.map((agent) => [agent.ua.split('/')[0], 'allow' as const])
);

function stripTags(html: string): string {
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
  const has = !robots.error && (robots.status ?? 0) < 400 && Boolean(robots.body);

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
  const llmsOk = !llms.error && (llms.status ?? 0) < 400 && Boolean(llms.body);
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

  // JSON-LD
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
      const errors: string[] = [];
      for (const block of blocks) {
        try {
          const parsed = JSON.parse(block) as JsonLdBase | JsonLdBase[];
          const nodes = Array.isArray(parsed) ? parsed : [parsed];
          for (const node of nodes) {
            for (const r of validateJsonLdNode(node)) {
              if (r.severity === 'error') errors.push(r.message);
            }
          }
        } catch {
          errors.push('a JSON-LD script block is not valid JSON');
        }
      }
      findings.push(
        errors.length > 0
          ? {
              code: 'jsonld.invalid',
              level: 'error',
              title: 'JSON-LD has errors',
              detail: errors.join('; '),
            }
          : {
              code: 'jsonld.present',
              level: 'pass',
              title: 'JSON-LD structured data present',
              detail: `${blocks.length} JSON-LD block(s) found and structurally valid.`,
            }
      );
    }
  }

  return findings;
}

export { levelFromSeverity };
