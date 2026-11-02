// markdown: markdown.code-fences, markdown.url-fallback, markdown.alternate-link,
// markdown.frontmatter. "Served markdown" = llms.txt (text resource) plus any mirror
// served as markdown; mirrors are the homepage /index.md (or the alternate-link
// target) and the sample page .md.
import { splitFrontmatter } from '../evidence.js';
import { collectLinkTags } from '../html-lite.js';
import {
  notApplicable,
  scored,
  unverified,
  type EvaluationContext,
  type EvaluatorEntry,
  type ResourceView,
} from './shared.js';
import type { EvidenceResourceKey } from '../types.js';

const FENCE_LINE_RE = /^ {0,3}(?:```|~~~)/gm;
const TITLE_KEY_RE = /title\s*:/g;
const WHITESPACE_RE = /\s/;
const LINE_TERMINATOR_RE = /[\n\r\u2028\u2029]/;

/**
 * `/^\s*title\s*:/m.test(frontmatter)` in linear time: a `title:` key counts when
 * the whitespace run in front of it reaches the start or holds a line terminator
 * (a multiline `^`). The regex rescanned the rest of a run of blank lines from
 * every line start.
 */
export function hasTitleKey(frontmatter: string): boolean {
  const key = new RegExp(TITLE_KEY_RE.source, TITLE_KEY_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = key.exec(frontmatter)) !== null) {
    let start = match.index;
    let lineStart = start === 0;
    while (!lineStart && start > 0 && WHITESPACE_RE.test(frontmatter[start - 1])) {
      start -= 1;
      lineStart = start === 0 || LINE_TERMINATOR_RE.test(frontmatter[start]);
    }
    if (lineStart) {
      return true;
    }
    key.lastIndex = match.index + 1;
  }
  return false;
}

interface ServedFile {
  key: EvidenceResourceKey;
  label: string;
  view: ResourceView;
}

function mirrors(context: EvaluationContext): ServedFile[] {
  return [
    { key: 'homepageMarkdown', label: 'homepage mirror', view: context.homepageMarkdown },
    { key: 'samplePageMarkdown', label: 'sample mirror', view: context.sampleMarkdown },
  ];
}

function mirrorState(file: ServedFile): string {
  const view = file.view;
  const url = view.finalUrl ?? view.resource?.requestedUrl ?? '';
  if (view.absent) {
    return `${file.label} not requested`;
  }
  if (view.unverified) {
    return `${file.label} ${url} ${view.describeState()}`;
  }
  if (view.isMarkdown) {
    return `${file.label} ${url} served as markdown (${view.mediaType})`;
  }
  if (view.ok) {
    return `${file.label} ${url} answered HTTP ${view.status} ${view.mediaType}${view.isText ? ' but does not start with a heading' : ' (not markdown)'}`;
  }
  return `${file.label} ${url} answered HTTP ${view.status}`;
}

/** Absolute form of `href` against `base`, fragment dropped; null when unresolvable. */
function resolveUrl(href: string, base: string): string | null {
  try {
    const resolved = new URL(href, base);
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

function countFences(body: string): number {
  return (body.match(FENCE_LINE_RE) ?? []).length;
}

export const markdownEvaluators: Record<string, EvaluatorEntry> = {
  'markdown.code-fences': {
    needsHomepage: false,
    run: (context) => {
      const served: ServedFile[] = [];
      if (context.llms.isText) {
        served.push({ key: 'llmsTxt', label: 'llms.txt', view: context.llms });
      }
      for (const file of mirrors(context)) {
        if (file.view.isText) {
          served.push(file);
        }
      }
      const keys = served.map((file) => file.key);
      if (served.length === 0) {
        return notApplicable('no-markdown-served', 'no served markdown (llms.txt, homepage mirror or sample mirror)', [
          'llmsTxt',
          'homepageMarkdown',
          'samplePageMarkdown',
        ]);
      }
      const counts = served.map((file) => ({ file, fences: countFences(file.view.body) }));
      if (counts.every((entry) => entry.fences === 0)) {
        return notApplicable('no-code-fences', `no fence lines in ${served.map((file) => file.label).join(', ')}`, keys);
      }
      const unbalanced = counts.filter((entry) => entry.fences % 2 !== 0);
      const summary = counts.map((entry) => `${entry.file.label} ${entry.fences} fence lines`).join(', ');
      return scored(unbalanced.length === 0 ? 1 : 0, `${summary}${unbalanced.length > 0 ? `; unbalanced: ${unbalanced.map((entry) => entry.file.label).join(', ')}` : '; all balanced'}`, keys);
    },
  },
  'markdown.url-fallback': {
    needsHomepage: false,
    run: (context) => {
      const files = mirrors(context);
      const keys = files.map((file) => file.key);
      const pending = files.find((file) => file.view.unverified);
      if (pending) {
        return unverified('mirror-unverified', files.map(mirrorState).join('; '), keys);
      }
      const expected = files.filter((file) => file.key === 'homepageMarkdown' || !context.sample.absent);
      const served = expected.filter((file) => file.view.isMarkdown);
      return scored(expected.length === 0 ? 0 : served.length / expected.length, files.map(mirrorState).join('; '), keys);
    },
  },
  'markdown.alternate-link': {
    needsHomepage: true,
    run: (context) => {
      const links = collectLinkTags(context.homepage.head).filter(
        (entry) => entry.rel.includes('alternate') && entry.type === 'text/markdown' && entry.href !== null
      );
      if (links.length === 0) {
        return scored(0, 'no link rel=alternate type=text/markdown in the homepage head', ['homepage']);
      }
      const target = context.homepageMarkdown;
      // The fetched mirror must be a declared target: discovery skips cross-origin
      // alternates and falls back to /index.md when none is usable.
      const fetched = target.resource ? resolveUrl(target.resource.requestedUrl, context.homepageUrl) : null;
      const link = links.find((entry) => fetched !== null && resolveUrl(entry.href ?? '', context.homepageUrl) === fetched) ?? links[0];
      const declared = resolveUrl(link.href ?? '', context.homepageUrl);
      if (!declared || declared !== fetched) {
        return scored(
          0,
          `link href=${link.href} declares ${declared ?? 'an unresolvable URL'}, but the fetched mirror is ${fetched ?? 'none'} (the declared target was not fetched)`,
          ['homepage', 'homepageMarkdown']
        );
      }
      if (target.unverified) {
        return unverified('mirror-unverified', `link href=${link.href}; target ${target.describeState()}`, [
          'homepage',
          'homepageMarkdown',
        ]);
      }
      const serves = target.isMarkdown;
      return scored(
        serves ? 1 : 0.5,
        `link href=${link.href}; target ${target.finalUrl ?? ''} ${serves ? `serves markdown (${target.mediaType})` : `does not serve markdown (HTTP ${target.status} ${target.mediaType})`}`,
        ['homepage', 'homepageMarkdown']
      );
    },
  },
  'markdown.frontmatter': {
    needsHomepage: false,
    run: (context) => {
      const served = mirrors(context).filter((file) => file.view.isMarkdown);
      const keys = served.map((file) => file.key);
      if (served.length === 0) {
        return notApplicable('no-markdown-served', 'no mirror served as markdown', ['homepageMarkdown', 'samplePageMarkdown']);
      }
      const withTitle = served.filter((file) => {
        const { frontmatter } = splitFrontmatter(file.view.body);
        return frontmatter !== null && hasTitleKey(frontmatter);
      });
      return scored(
        withTitle.length / served.length,
        `${withTitle.length}/${served.length} served mirrors carry a frontmatter block with title: (${served.map((file) => `${file.label} ${withTitle.includes(file) ? 'yes' : 'no'}`).join(', ')})`,
        keys
      );
    },
  },
};
