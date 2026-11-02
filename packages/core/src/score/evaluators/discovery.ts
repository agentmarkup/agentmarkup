// discovery: sitemap.valid, sitemap.lastmod, llms.agent-instruction, llms.exists,
// llms.formatting, llms.modular, llms.discovery-link, link.headers-discovery.
import { blockPattern, scanBlocks } from '../../html-scan.js';
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
const DAY_MS = 24 * 60 * 60 * 1000;
const LASTMOD_WINDOW_MS = 365 * DAY_MS;
/** A lastmod may lead the fetch time by at most this much (clock skew), never more. */
const LASTMOD_FUTURE_ALLOWANCE_MS = DAY_MS;

/**
 * Guidance phrases from the published rule ("a heading or sentence with explicit
 * guidance"): each counts on any line, heading or sentence alike.
 */
const GUIDANCE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bwhen to use\b/i,
  /\bbest fit (?:for|when)\b/i,
  /\binstructions for (?:ai )?agents\b/i,
];
/**
 * "use X when" (zero to three words for X) and "do not use X for/when" (one to three).
 * They count only as an instruction (see `isInstructionAt`), so "we use cookies when
 * you visit" in a privacy paragraph earns nothing.
 */
const INSTRUCTION_PATTERNS: ReadonlyArray<RegExp> = [
  /\buse(?:\s+[\w.-]+){0,3}\s+when\b/gi,
  /\bdo not use(?:\s+[\w.-]+){1,3}\s+(?:for|when)\b/gi,
];
/** What a list item, quote, heading or emphasis puts in front of an instruction. */
const INSTRUCTION_DECORATION_RE = /[\s>*_#+\-"'`([]/;
/** Sentence punctuation, a list number ("1." or "1)") or a modal right before it. */
const INSTRUCTION_LEAD_RE = /(?:[.!?:;)]|\b(?:should|can|may|must|please))$/i;
/** One imperative modifier an instruction may open with ("Only use this when ..."). */
const INSTRUCTION_MODIFIER_RE = /\b(?:only|always|never|also)$/i;

/** Where `index` lands after stepping back over decoration. */
function skipDecoration(line: string, index: number): number {
  let end = index;
  while (end > 0 && INSTRUCTION_DECORATION_RE.test(line[end - 1])) {
    end -= 1;
  }
  return end;
}

/**
 * True when the phrase at `index` is an instruction: at the start of the line, a
 * sentence or a list item (decoration skipped), or right after should, can, may,
 * must or please. One modifier (only, always, never, also) may stand in front of
 * it, so "Only use this when" counts while "We only use cookies when" does not.
 */
function isInstructionAt(line: string, index: number): boolean {
  let end = skipDecoration(line, index);
  // Seven characters hold the longest word plus the one before it, so `\b` is real.
  const modifier = INSTRUCTION_MODIFIER_RE.exec(line.slice(Math.max(0, end - 7), end));
  if (modifier) {
    end = skipDecoration(line, end - modifier[0].length);
  }
  return end === 0 || INSTRUCTION_LEAD_RE.test(line.slice(Math.max(0, end - 7), end));
}

/** The first instruction-position "use X when" or "do not use X for/when" on a line. */
function findInstruction(line: string): string | null {
  for (const pattern of INSTRUCTION_PATTERNS) {
    const search = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = search.exec(line)) !== null) {
      if (isInstructionAt(line, match.index)) {
        return match[0];
      }
      // A rejected match may hide an instruction inside it ("we use X Use when").
      search.lastIndex = match.index + 1;
    }
  }
  return null;
}
/**
 * Phrases that count only in a heading ("a heading containing 'use cases' or 'for
 * agents'"): in running prose they are common and say nothing about when to use the
 * site, so a sentence never earns credit with them.
 */
const HEADING_GUIDANCE_PATTERNS: ReadonlyArray<RegExp> = [/\buse cases\b/i, /\bfor agents\b/i];
const HEADING_LINE_RE = /^\s*#{1,6}\s+\S/;
/**
 * Markdown link targets and bare http(s) URLs in llms.txt. A target stops at `(`, so
 * every `](` bounds the previous attempt: with `(` allowed, a body of unclosed
 * `[a](` links rescanned the rest of the file from each one.
 */
const MARKDOWN_LINK_TARGET_RE = /\]\(\s*<?([^()\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const BARE_URL_RE = /\bhttps?:\/\/[^\s<>()"'\]]+/gi;
/** `/<url\b[\s\S]*?<\/url\s*>/gi`, scanned in linear time. */
const SITEMAP_URL_BLOCKS = blockPattern(['url'], { openerEndsAtGt: false, closeAllowsSpace: true });
const LASTMOD_OPEN_RE = /<lastmod\b/gi;
const LASTMOD_VALUE_RE = /\s*([^<\s]+)\s*<\/lastmod\s*>/iy;
const HTTP_LINK_TARGET_RE = /\(https?:\/\//iy;

/**
 * What `/<lastmod\b[^>]*>\s*([^<\s]+)\s*<\/lastmod\s*>/i` captures in `entry`, in
 * linear time. Every opener before the same `>` shares that `>` and the same value
 * test, so one failed opener rules out the rest up to its `>` (the regex retried
 * each of them up to the end of a body of unclosed `<lastmod` tags).
 */
export function firstLastmod(entry: string): string | null {
  const open = new RegExp(LASTMOD_OPEN_RE.source, LASTMOD_OPEN_RE.flags);
  const value = new RegExp(LASTMOD_VALUE_RE.source, LASTMOD_VALUE_RE.flags);
  let from = 0;
  for (;;) {
    open.lastIndex = from;
    const start = open.exec(entry);
    if (!start) {
      return null;
    }
    const gt = entry.indexOf('>', start.index + start[0].length);
    if (gt === -1) {
      return null;
    }
    value.lastIndex = gt + 1;
    const match = value.exec(entry);
    if (match) {
      return match[1];
    }
    from = gt + 1;
  }
}

/**
 * `/\[[^\]]*\]\(https?:\/\//i.test(body)` in one pass: a `]` closes a link text
 * when a `[` came after the previous `]`. The regex rescanned the rest of a body of
 * repeated `[` from each one.
 */
export function hasHttpMarkdownLink(body: string): boolean {
  const target = new RegExp(HTTP_LINK_TARGET_RE.source, HTTP_LINK_TARGET_RE.flags);
  let open = false;
  for (let index = 0; index < body.length; index += 1) {
    const code = body.charCodeAt(index);
    if (code === 91) {
      open = true;
    } else if (code === 93) {
      if (open) {
        target.lastIndex = index + 1;
        if (target.test(body)) {
          return true;
        }
      }
      open = false;
    }
  }
  return false;
}

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
    return `llms.txt answered ${llms.challengeState() ?? `HTTP ${llms.status}`}`;
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

/**
 * The first actual link in llms.txt (a markdown link target or a bare http(s) URL)
 * to llms-full.txt or to another /llms.txt; a textual mention does not count, and
 * a link back to this llms.txt itself (with or without a fragment) is not "another".
 */
function findModularLink(body: string, selfUrl: string | null): string | null {
  const targets: string[] = [];
  for (const match of body.matchAll(MARKDOWN_LINK_TARGET_RE)) {
    targets.push(match[1]);
  }
  for (const match of body.matchAll(BARE_URL_RE)) {
    targets.push(match[0].replace(/[.,;:!?]+$/, ''));
  }
  let self: string | null = null;
  try {
    if (selfUrl) {
      const parsed = new URL(selfUrl);
      parsed.hash = '';
      self = parsed.toString();
    }
  } catch {
    self = null;
  }
  for (const target of targets) {
    let path = target;
    let absolute: string | null = null;
    try {
      const resolved = new URL(target, selfUrl ?? 'https://invalid.example/');
      path = resolved.pathname;
      resolved.hash = '';
      absolute = selfUrl ? resolved.toString() : null;
    } catch {
      path = target.split(/[?#]/)[0];
    }
    if (/llms-full\.txt$/i.test(path)) {
      return target;
    }
    if (/\/llms\.txt$/i.test(path) && (absolute === null || absolute !== self)) {
      return target;
    }
  }
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
        // robots.txt did not answer, so the /sitemap.xml fallback stood in for a
        // declaration nobody could read; its failure says nothing about the sitemap.
        if (context.robots.unverified && context.evidence.sitemapSource !== 'robots') {
          return unverified(
            'robots-unverified',
            `robots.txt could not be verified in time and /sitemap.xml answered HTTP ${sitemap.status}`,
            ['sitemap', 'robotsTxt']
          );
        }
        return scored(
          0,
          `${sitemapLabel(context)} answered ${sitemap.challengeState() ?? `HTTP ${sitemap.status}`}`,
          ['sitemap', 'robotsTxt'],
          { challenge: sitemap.challengeNote('sitemap') }
        );
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
      const body = sitemap.body;
      const entries = scanBlocks(body, SITEMAP_URL_BLOCKS).map((block) => body.slice(block.start, block.end));
      let withLastmod = 0;
      let newest = Number.NEGATIVE_INFINITY;
      let newestRaw: string | null = null;
      for (const entry of entries) {
        const lastmod = firstLastmod(entry);
        if (lastmod === null) continue;
        const parsed = Date.parse(lastmod);
        if (Number.isNaN(parsed)) continue;
        withLastmod += 1;
        if (parsed > newest) {
          newest = parsed;
          newestRaw = lastmod;
        }
      }
      if (entries.length === 0) {
        return scored(0, 'urlset with 0 url entries', ['sitemap']);
      }
      const coverage = withLastmod / entries.length;
      const future = newestRaw !== null && newest > context.nowMs + LASTMOD_FUTURE_ALLOWANCE_MS;
      const fresh = newestRaw !== null && !future && context.nowMs - newest <= LASTMOD_WINDOW_MS;
      const fraction = coverage >= 0.5 ? (fresh ? 1 : 0.5) : 0;
      return scored(
        fraction,
        `${withLastmod}/${entries.length} url entries carry a parseable lastmod; newest ${newestRaw ?? 'none'}${future ? ' lies in the future (more than 1 day after the fetch), not counted as fresh' : ''}; freshness judged against ${context.now}`,
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
        return scored(0, llmsState(llms), ['llmsTxt'], { challenge: llms.challengeNote('llmsTxt') });
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
        let guidance: string | null = null;
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            guidance = match[0];
            break;
          }
        }
        guidance ??= findInstruction(line);
        if (guidance) {
          return scored(1, `guidance "${guidance}" on line: ${collapseWhitespace(line).slice(0, 100)}`, ['llmsTxt']);
        }
      }
      // The summary blockquote must follow an actual H1; without one nothing is credited.
      const h1Index = lines.findIndex((line) => /^\s*#\s+\S/.test(line));
      let blockquote = '';
      if (h1Index !== -1) {
        for (const line of lines.slice(h1Index + 1)) {
          if (/^\s*>/.test(line)) {
            blockquote += ` ${line.replace(/^\s*>\s?/, '')}`;
          } else if (blockquote) {
            break;
          }
        }
      }
      const summary = collapseWhitespace(blockquote);
      if (summary.length >= BLOCKQUOTE_MIN_CHARS) {
        return scored(0.5, `${summary.length}-char summary blockquote after the H1, no explicit when-to-use guidance`, [
          'llmsTxt',
        ]);
      }
      return scored(
        0,
        `llms.txt has ${formatCount(text.length)} chars but no when-to-use guidance and no summary blockquote of ${BLOCKQUOTE_MIN_CHARS}+ chars${h1Index === -1 ? ' after an H1 (no H1)' : ''}`,
        ['llmsTxt']
      );
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
        return scored(0, llmsState(llms), ['llmsTxt'], { challenge: llms.challengeNote('llmsTxt') });
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
      const link = hasHttpMarkdownLink(body);
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
      const target = findModularLink(llms.body, llms.finalUrl);
      return scored(
        target ? 1 : 0,
        target ? `links ${target}` : 'no link (markdown link or bare URL) to llms-full.txt or another /llms.txt',
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
