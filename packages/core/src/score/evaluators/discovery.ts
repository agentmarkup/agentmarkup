// discovery: sitemap.valid, sitemap.lastmod, llms.agent-instruction, llms.exists,
// llms.formatting, llms.modular, llms.discovery-link, link.headers-discovery.
import { splitFrontmatter } from '../evidence.js';
import { collapseWhitespace, collectLinkTags } from '../html-lite.js';
import {
  formatCount,
  notApplicable,
  scored,
  unverified,
  type EvaluationContext,
  type EvaluatorEntry,
  type ResourceView,
} from './shared.js';

const LLMS_MIN_CHARS = 100;
const LLMS_MAX_CHARS = 30_000;
const BLOCKQUOTE_MIN_CHARS = 100;
const SITEMAP_HEAD_CHARS = 5_000;
const LASTMOD_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/** Guidance phrases that count on any line. */
const GUIDANCE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bwhen to use\b/i,
  /\buse (?:this|it|[\w.-]+) when\b/i,
  /\bdo not use [\w.-]+ (?:for|when)\b/i,
  /\bbest fit (?:for|when)\b/i,
];
/** Guidance phrases that count only in a heading line (they are common in ordinary prose). */
const HEADING_GUIDANCE_PATTERNS: ReadonlyArray<RegExp> = [/\buse cases\b/i, /\bfor agents\b/i];
const HEADING_LINE_RE = /^\s*#{1,6}\s+\S/;

function llmsState(llms: ResourceView): string {
  if (llms.unverified) {
    return `llms.txt ${llms.describeState()}`;
  }
  if (llms.outcome === 'not-found') {
    return `no llms.txt (HTTP ${llms.status})`;
  }
  if (llms.ok && !llms.isText) {
    return `llms.txt answered HTTP ${llms.status} ${llms.mediaType} with an HTML body (treated as absent)`;
  }
  if (!llms.ok) {
    return `llms.txt answered HTTP ${llms.status}`;
  }
  return 'llms.txt present';
}

function sitemapLabel(context: EvaluationContext): string {
  const source = context.evidence.sitemapSource === 'robots' ? 'declared in robots.txt' : 'default /sitemap.xml';
  return `${source} at ${context.sitemap.finalUrl ?? context.evidence.sitemapUrl ?? 'unknown URL'}`;
}

function sitemapKind(body: string): 'urlset' | 'sitemapindex' | null {
  const head = body.slice(0, SITEMAP_HEAD_CHARS);
  if (/<sitemapindex\b/i.test(head)) return 'sitemapindex';
  if (/<urlset\b/i.test(head)) return 'urlset';
  return null;
}

export const discoveryEvaluators: Record<string, EvaluatorEntry> = {
  'sitemap.valid': {
    needsHomepage: false,
    run: (context) => {
      const sitemap = context.sitemap;
      if (sitemap.absent) {
        return scored(0, 'no sitemap URL was derived (no robots.txt declaration and no /sitemap.xml fetch)', ['sitemap']);
      }
      if (sitemap.unverified) {
        return unverified(
          'sitemap-unverified',
          `${sitemapLabel(context)} but could not be verified in time (${sitemap.describeState()})`,
          ['sitemap', 'robotsTxt']
        );
      }
      if (!sitemap.ok) {
        return scored(0, `${sitemapLabel(context)} answered HTTP ${sitemap.status}`, ['sitemap', 'robotsTxt']);
      }
      const kind = sitemapKind(sitemap.body);
      if (!kind) {
        return scored(
          0,
          `${sitemapLabel(context)} answered HTTP ${sitemap.status} ${sitemap.mediaType} without a urlset or sitemapindex element`,
          ['sitemap', 'robotsTxt']
        );
      }
      return scored(1, `${kind} ${sitemapLabel(context)} (HTTP ${sitemap.status} ${sitemap.mediaType})`, [
        'sitemap',
        'robotsTxt',
      ]);
    },
  },
  'sitemap.lastmod': {
    needsHomepage: false,
    run: (context) => {
      const sitemap = context.sitemap;
      if (sitemap.unverified) {
        return notApplicable('sitemap-unverified', `sitemap ${sitemap.describeState()}`, ['sitemap']);
      }
      if (!sitemap.ok) {
        return notApplicable('sitemap-absent', `no sitemap body (${sitemap.absent ? 'not requested' : `HTTP ${sitemap.status}`})`, [
          'sitemap',
        ]);
      }
      const kind = sitemapKind(sitemap.body);
      if (kind !== 'urlset') {
        return notApplicable(
          kind === 'sitemapindex' ? 'sitemap-index' : 'sitemap-not-xml',
          kind === 'sitemapindex' ? 'sitemap is an index (children are not fetched)' : 'sitemap body is not a urlset',
          ['sitemap']
        );
      }
      const entries = sitemap.body.match(/<url\b[\s\S]*?<\/url\s*>/gi) ?? [];
      let withLastmod = 0;
      let newest = Number.NEGATIVE_INFINITY;
      let newestRaw: string | null = null;
      for (const entry of entries) {
        const match = entry.match(/<lastmod\b[^>]*>\s*([^<\s]+)\s*<\/lastmod\s*>/i);
        if (!match) continue;
        const parsed = Date.parse(match[1]);
        if (Number.isNaN(parsed)) continue;
        withLastmod += 1;
        if (parsed > newest) {
          newest = parsed;
          newestRaw = match[1];
        }
      }
      if (entries.length === 0) {
        return scored(0, 'urlset with 0 url entries', ['sitemap']);
      }
      const coverage = withLastmod / entries.length;
      const fresh = newestRaw !== null && context.nowMs - newest <= LASTMOD_WINDOW_MS;
      const fraction = coverage >= 0.5 ? (fresh ? 1 : 0.5) : 0;
      return scored(
        fraction,
        `${withLastmod}/${entries.length} url entries carry a parseable lastmod; newest ${newestRaw ?? 'none'}; freshness judged against ${context.now}`,
        ['sitemap']
      );
    },
  },
  'llms.agent-instruction': {
    needsHomepage: false,
    run: (context) => {
      const llms = context.llms;
      if (llms.unverified) {
        return unverified('llms-unverified', llmsState(llms), ['llmsTxt']);
      }
      if (!llms.isText) {
        return scored(0, llmsState(llms), ['llmsTxt']);
      }
      const body = splitFrontmatter(llms.body).content;
      const text = collapseWhitespace(body);
      if (text.length < LLMS_MIN_CHARS) {
        return scored(0, `llms.txt has ${text.length} chars of text (under ${LLMS_MIN_CHARS})`, ['llmsTxt']);
      }
      const lines = body.split(/\r?\n/);
      for (const line of lines) {
        const patterns = HEADING_LINE_RE.test(line)
          ? [...GUIDANCE_PATTERNS, ...HEADING_GUIDANCE_PATTERNS]
          : GUIDANCE_PATTERNS;
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            return scored(1, `guidance "${match[0]}" on line: ${collapseWhitespace(line).slice(0, 100)}`, ['llmsTxt']);
          }
        }
      }
      const h1Index = lines.findIndex((line) => /^\s*#\s+\S/.test(line));
      let blockquote = '';
      for (const line of lines.slice(h1Index + 1)) {
        if (/^\s*>/.test(line)) {
          blockquote += ` ${line.replace(/^\s*>\s?/, '')}`;
        } else if (blockquote) {
          break;
        }
      }
      const summary = collapseWhitespace(blockquote);
      if (summary.length >= BLOCKQUOTE_MIN_CHARS) {
        return scored(0.5, `${summary.length}-char summary blockquote after the H1, no explicit when-to-use guidance`, [
          'llmsTxt',
        ]);
      }
      return scored(0, `llms.txt has ${formatCount(text.length)} chars but no when-to-use guidance and no summary blockquote of ${BLOCKQUOTE_MIN_CHARS}+ chars`, [
        'llmsTxt',
      ]);
    },
  },
  'llms.exists': {
    needsHomepage: false,
    run: (context) => {
      const llms = context.llms;
      if (llms.unverified) {
        return unverified('llms-unverified', llmsState(llms), ['llmsTxt']);
      }
      if (!llms.isText) {
        return scored(0, llmsState(llms), ['llmsTxt']);
      }
      const length = collapseWhitespace(llms.body).length;
      return scored(length >= LLMS_MIN_CHARS ? 1 : 0, `llms.txt at ${llms.finalUrl ?? ''}: ${formatCount(length)} chars after whitespace collapse`, [
        'llmsTxt',
      ]);
    },
  },
  'llms.formatting': {
    needsHomepage: false,
    run: (context) => {
      const llms = context.llms;
      if (llms.unverified) {
        return unverified('llms-unverified', llmsState(llms), ['llmsTxt']);
      }
      if (!llms.isText) {
        return notApplicable('no-llms', llmsState(llms), ['llmsTxt']);
      }
      const body = llms.body.replace(/^\uFEFF/, '');
      const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
      const h1 = /^#\s+\S/.test(firstLine.trim());
      const link = /\[[^\]]*\]\(https?:\/\//i.test(body);
      const size = body.length < LLMS_MAX_CHARS;
      const section = /^##\s+\S/m.test(body);
      const passed = [h1, link, size, section].filter(Boolean).length;
      const evidence = [
        h1 ? 'H1 on the first non-blank line' : 'first non-blank line is not an H1',
        link ? 'markdown link to http(s) present' : 'no markdown link to http(s)',
        `${formatCount(body.length)} chars (${size ? 'under' : 'not under'} ${formatCount(LLMS_MAX_CHARS)})`,
        section ? '## section present' : 'no ## section',
        `${passed}/4 sub-rules`,
      ].join('; ');
      return scored(passed / 4, evidence, ['llmsTxt']);
    },
  },
  'llms.modular': {
    needsHomepage: false,
    run: (context) => {
      const llms = context.llms;
      if (llms.unverified) {
        return unverified('llms-unverified', llmsState(llms), ['llmsTxt']);
      }
      if (!llms.isText) {
        return notApplicable('no-llms', llmsState(llms), ['llmsTxt']);
      }
      const match = llms.body.match(/[^\s()]*(?:llms-full\.txt|\/llms\.txt)/i);
      return scored(
        match ? 1 : 0,
        match ? `links ${match[0]}` : 'no link to llms-full.txt or another /llms.txt',
        ['llmsTxt']
      );
    },
  },
  'llms.discovery-link': {
    needsHomepage: true,
    run: (context) => {
      const link = collectLinkTags(context.homepage.head).find(
        (entry) =>
          entry.rel.includes('alternate') &&
          entry.type === 'text/plain' &&
          entry.href !== null &&
          /llms\.txt(?:$|[?#])/i.test(entry.href)
      );
      return scored(
        link ? 1 : 0,
        link ? `link rel=alternate type=text/plain href=${link.href}` : 'no link rel=alternate type=text/plain pointing at llms.txt',
        ['homepage']
      );
    },
  },
  'link.headers-discovery': {
    needsHomepage: false,
    run: (context) => {
      const homepage = context.homepage;
      if (!homepage.hasHeaders) {
        return notApplicable('headers-not-captured', 'homepage response headers were not captured', ['homepage']);
      }
      const link = homepage.header('link');
      if (!link) {
        return scored(0, 'no Link header on the homepage response', ['homepage']);
      }
      const sitemapRel = /rel\s*=\s*"?sitemap\b/i.test(link);
      const markdownType = /type\s*=\s*"?text\/markdown\b/i.test(link);
      return scored(
        sitemapRel || markdownType ? 1 : 0,
        `Link header: ${link.slice(0, 200)}${sitemapRel ? '; rel=sitemap' : ''}${markdownType ? '; type=text/markdown' : ''}${!sitemapRel && !markdownType ? '; no rel=sitemap or type=text/markdown' : ''}`,
        ['homepage']
      );
    },
  },
};
