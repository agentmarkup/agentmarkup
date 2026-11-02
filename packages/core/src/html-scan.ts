// Linear-time scanners for the block regexes the HTML helpers used to run.
//
// A lazy block regex such as `/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi` rescans the
// rest of the document for every opener that has no closing tag, so a body of
// thousands of unclosed `<script>` tags cost minutes of CPU. `scanBlocks` returns
// exactly the matches such a regex returns, left to right and non-overlapping, in
// linear time: the search for the next `>` and for the next closing tag is
// remembered, and every caller only asks from a position at or after the previous
// one. Shared by `html.ts`, `validation/html.ts` and `score/html-lite.ts`; browser-safe.

/** ASCII-only lowercase: same length as the input, unlike `toLowerCase()` (U+0130 becomes two code units). */
export function asciiLower(value: string): string {
  return value.replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

/** Word characters of a regex `\b` without the `u` flag: `[A-Za-z0-9_]`. */
function isWordChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95
  );
}

/** Wraps a forward search so that a repeat from inside the last searched span costs nothing. */
function rememberedSearch(find: (from: number) => number): (from: number) => number {
  let lastFrom = -1;
  let lastAt = -1;
  return (from) => {
    if (lastFrom !== -1 && from >= lastFrom && (lastAt === -1 || from <= lastAt)) {
      return lastAt;
    }
    lastFrom = from;
    lastAt = find(from);
    return lastAt;
  };
}

export interface BlockPattern {
  /** Lowercase element names; an opener is `<name` followed by a non-word character. */
  names: ReadonlySet<string>;
  /** First character codes and lengths of `names`, to skip other tags without slicing. */
  firstCodes: ReadonlySet<number>;
  lengths: ReadonlySet<number>;
  /** `<name\b[^>]*>` when true (the content starts after the first `>`); bare `<name\b` when false. */
  openerEndsAtGt: boolean;
  /** `</name\s*>` when true; exactly `</name>` when false. */
  closeAllowsSpace: boolean;
  /**
   * Only with `openerEndsAtGt`: the opener must contain a match of this global,
   * case-insensitive regex between the name and its `>`, as `<name\b[^>]*X[^>]*>`
   * requires. The regex must not be able to match a `>`.
   */
  openerMust?: RegExp;
}

export function blockPattern(
  names: ReadonlyArray<string>,
  shape: { openerEndsAtGt: boolean; closeAllowsSpace: boolean; openerMust?: RegExp }
): BlockPattern {
  return {
    names: new Set(names),
    firstCodes: new Set(names.map((name) => name.charCodeAt(0))),
    lengths: new Set(names.map((name) => name.length)),
    ...shape,
  };
}

export interface BlockMatch {
  /** Lowercase element name. */
  name: string;
  start: number;
  end: number;
  /** The lazy `[\s\S]*?` span between the opener and the closing tag. */
  content: string;
}

/**
 * The matches of the case-insensitive block regex `pattern` describes, in document
 * order, stopping after `limit` matches (a non-global regex is `limit` 1).
 */
export function scanBlocks(html: string, pattern: BlockPattern, limit = Number.POSITIVE_INFINITY): BlockMatch[] {
  const matches: BlockMatch[] = [];
  const length = html.length;
  if (length === 0 || limit <= 0) {
    return matches;
  }
  const lower = asciiLower(html);
  const closeTail = /\s*>/y;
  const tailEnd = (at: number): number => {
    if (!pattern.closeAllowsSpace) {
      return lower.charCodeAt(at) === 62 ? at + 1 : -1;
    }
    closeTail.lastIndex = at;
    return closeTail.test(lower) ? closeTail.lastIndex : -1;
  };
  const nextGt = rememberedSearch((from) => lower.indexOf('>', from));
  const openerMust = pattern.openerMust ? new RegExp(pattern.openerMust.source, 'gi') : null;
  const nextRequired = rememberedSearch((from) => {
    if (!openerMust) {
      return -1;
    }
    openerMust.lastIndex = from;
    const match = openerMust.exec(html);
    return match ? match.index : -1;
  });
  const closeSearches = new Map<string, (from: number) => number>();
  const nextClose = (name: string, from: number): number => {
    let search = closeSearches.get(name);
    if (!search) {
      const needle = `</${name}`;
      search = rememberedSearch((start) => {
        let at = lower.indexOf(needle, start);
        while (at !== -1 && tailEnd(at + needle.length) === -1) {
          at = lower.indexOf(needle, at + 1);
        }
        return at;
      });
      closeSearches.set(name, search);
    }
    return search(from);
  };
  let i = 0;
  while (i < length) {
    const lt = lower.indexOf('<', i);
    if (lt === -1) {
      break;
    }
    if (!pattern.firstCodes.has(lower.charCodeAt(lt + 1))) {
      i = lt + 1;
      continue;
    }
    let nameEnd = lt + 1;
    while (nameEnd < length && isWordChar(lower.charCodeAt(nameEnd))) {
      nameEnd += 1;
    }
    const name = pattern.lengths.has(nameEnd - lt - 1) ? lower.slice(lt + 1, nameEnd) : '';
    if (!pattern.names.has(name)) {
      i = lt + 1;
      continue;
    }
    let contentStart = nameEnd;
    if (pattern.openerEndsAtGt) {
      const gt = nextGt(nameEnd);
      if (gt === -1) {
        // No `>` after this opener means none after any later one either.
        break;
      }
      if (openerMust) {
        const required = nextRequired(nameEnd);
        if (required === -1) {
          break;
        }
        if (required >= gt) {
          i = lt + 1;
          continue;
        }
      }
      contentStart = gt + 1;
    }
    const closeAt = nextClose(name, contentStart);
    if (closeAt === -1) {
      i = lt + 1;
      continue;
    }
    const end = tailEnd(closeAt + name.length + 2);
    matches.push({ name, start: lt, end, content: html.slice(contentStart, closeAt) });
    if (matches.length >= limit) {
      break;
    }
    i = end;
  }
  return matches;
}

/** `html.replace(<the block regex>, replacement)` in linear time. */
export function replaceBlocks(html: string, pattern: BlockPattern, replacement: string): string {
  const matches = scanBlocks(html, pattern);
  if (matches.length === 0) {
    return html;
  }
  let out = '';
  let last = 0;
  for (const match of matches) {
    out += html.slice(last, match.start) + replacement;
    last = match.end;
  }
  return out + html.slice(last);
}

/** `html.replace(/<!--[\s\S]*?-->/g, replacement)` in linear time: an unclosed comment ends the scan. */
export function replaceComments(html: string, replacement: string): string {
  let out = '';
  let last = 0;
  for (;;) {
    const open = html.indexOf('<!--', last);
    if (open === -1) {
      break;
    }
    const close = html.indexOf('-->', open + 4);
    if (close === -1) {
      // No later comment can close either.
      break;
    }
    out += html.slice(last, open) + replacement;
    last = close + 3;
  }
  return last === 0 ? html : out + html.slice(last);
}

/**
 * `html.replace(/<[^>]+>/g, replacement)` in linear time, or `/<[^>]*>/g` with
 * `allowEmpty`. The regex scans to the end of the document for every `<` that no
 * `>` follows; here the first such `<` ends the scan, since no later one can close.
 */
export function replaceTags(html: string, replacement: string, allowEmpty = false): string {
  let out = '';
  let last = 0;
  let i = 0;
  for (;;) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      break;
    }
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) {
      break;
    }
    if (gt === lt + 1 && !allowEmpty) {
      i = gt;
      continue;
    }
    out += html.slice(last, lt) + replacement;
    last = gt + 1;
    i = last;
  }
  return last === 0 ? html : out + html.slice(last);
}

const MOUNT_NODE_TAGS = ['div', 'main', 'section'];
const MOUNT_ATTR_RE = /(?:id|class)="/g;
const MOUNT_KEYWORD_RE = /root|app|__next|svelte|mount/;
const WHITESPACE_RE = /\s/;

/**
 * `/^<(div|main|section)\b[^>]*(id|class)="[^"]*(root|app|__next|svelte|mount)[^"]*"[^>]*>\s*<\/\1>$/.test(value)`
 * in linear time: one opener, an id or class attribute whose quoted value names a
 * mount point, then only `>`, whitespace and the matching closing tag. The regex
 * backtracked through every keyword of an attribute value that never closed.
 * Shared by `validation/html.ts` and `score/html-lite.ts` so the two stay in step.
 */
export function isLoneMountNode(value: string): boolean {
  const tag = MOUNT_NODE_TAGS.find(
    (name) => value.startsWith(`<${name}`) && !isWordChar(value.charCodeAt(name.length + 1))
  );
  if (!tag) {
    return false;
  }
  const close = `</${tag}>`;
  if (!value.endsWith(close)) {
    return false;
  }
  // `[^>]*>\s*` before the closing tag: the opener ends at the `>` in front of the trailing whitespace.
  let gt = value.length - close.length - 1;
  while (gt >= 0 && WHITESPACE_RE.test(value[gt])) {
    gt -= 1;
  }
  const start = tag.length + 1;
  if (gt < start || value.charCodeAt(gt) !== 62) {
    return false;
  }
  // Inside the opener: `[^>]*` before the attribute, `[^"]*` around the keyword, `[^>]*` after the closing quote.
  const opener = value.slice(start, gt);
  const firstGt = opener.indexOf('>');
  const lastGt = opener.lastIndexOf('>');
  const attr = new RegExp(MOUNT_ATTR_RE.source, MOUNT_ATTR_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = attr.exec(opener)) !== null) {
    if (firstGt !== -1 && match.index > firstGt) {
      return false;
    }
    const valueStart = match.index + match[0].length;
    const quote = opener.indexOf('"', valueStart);
    if (quote === -1) {
      return false;
    }
    if (lastGt < quote && MOUNT_KEYWORD_RE.test(opener.slice(valueStart, quote))) {
      return true;
    }
  }
  return false;
}

