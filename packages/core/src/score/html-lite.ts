// DOM-free HTML helpers for the score evaluators: regexes plus a small attribute
// tokenizer. No DOMParser, so browser, Node and the worker read identical input.
//
// Text extraction mirrors `validation/html.ts` (same body and ignored-block regexes)
// and adds entity decoding; the two must stay in step.
import { extractJsonLdScriptContents } from '../html.js';
import { findBlockedCrawlers } from '../generators/robots-txt.js';
import type { AiCrawlersConfig } from '../types.js';

const BODY_RE = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
/** Blocks removed before text extraction (identical to validation/html.ts). */
const TEXT_IGNORED_BLOCKS_RE =
  /<(script|style|noscript|template|svg|canvas|iframe|form)\b[^>]*>[\s\S]*?<\/\1>/gi;
/** Blocks removed before structural reads (headings, landmarks): forms stay. */
const STRUCTURE_IGNORED_BLOCKS_RE =
  /<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;
/** Blocks removed before control reads: svg stays so `svg > title` names count. */
const CONTROL_IGNORED_BLOCKS_RE =
  /<(script|style|noscript|template|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const CLIENT_SHELL_RE =
  /^<(div|main|section)\b[^>]*(id|class)="[^"]*(root|app|__next|svelte|mount)[^"]*"[^>]*>\s*<\/\1>$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  copy: '(c)',
  reg: '(R)',
  trade: '(TM)',
  laquo: '<<',
  raquo: '>>',
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

export function decodeEntities(value: string): string {
  if (!value.includes('&')) {
    return value;
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[lower];
    return named === undefined ? whole : named;
  });
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Text of an HTML fragment: tags stripped, entities decoded, whitespace collapsed. */
export function textOfFragment(fragment: string): string {
  return collapseWhitespace(decodeEntities(fragment.replace(COMMENT_RE, ' ').replace(/<[^>]+>/g, ' ')));
}

export function extractBodyHtml(html: string): string {
  const match = html.match(BODY_RE);
  if (match) {
    return match[1];
  }
  const open = html.search(/<body\b/i);
  if (open !== -1) {
    const start = html.indexOf('>', open);
    return start === -1 ? '' : html.slice(start + 1);
  }
  const headEnd = html.search(/<\/head\s*>/i);
  return headEnd === -1 ? html : html.slice(headEnd);
}

export function extractHead(html: string): string {
  const match = html.match(/^([\s\S]*?)<\/head\s*>/i);
  if (match) {
    return match[1];
  }
  const body = html.search(/<body\b/i);
  return body === -1 ? html.slice(0, 100_000) : html.slice(0, body);
}

/** Page text per the catalog convention: body minus ignored blocks and tags. */
export function extractBodyText(html: string): string {
  const cleaned = extractBodyHtml(html).replace(TEXT_IGNORED_BLOCKS_RE, '');
  return textOfFragment(cleaned);
}

/** Same rule as validation/html.ts: an empty body, or a lone empty mount node. */
export function looksLikeClientShell(html: string): boolean {
  const cleaned = extractBodyHtml(html).replace(TEXT_IGNORED_BLOCKS_RE, '');
  const normalized = cleaned.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return CLIENT_SHELL_RE.test(normalized);
}

export function structuralBodyHtml(html: string): string {
  return extractBodyHtml(html).replace(STRUCTURE_IGNORED_BLOCKS_RE, ' ').replace(COMMENT_RE, ' ');
}

export function controlBodyHtml(html: string): string {
  return extractBodyHtml(html).replace(CONTROL_IGNORED_BLOCKS_RE, ' ').replace(COMMENT_RE, ' ');
}

// ----------------------------------------------------------------- tokenizer

export interface TagToken {
  name: string;
  attrs: Record<string, string>;
  /** Index of the opening `<`. */
  start: number;
  /** Index just past the closing `>`. */
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

function isNameChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    (code >= 48 && code <= 57) ||
    code === 45 ||
    code === 58 ||
    code === 95
  );
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
}

/**
 * Walks the markup once and returns every tag with its attributes (names lowercased,
 * values entity-decoded). Comments, doctype and processing instructions are skipped;
 * script and style contents are skipped as raw text.
 */
export function tokenizeTags(html: string): TagToken[] {
  const tokens: TagToken[] = [];
  const length = html.length;
  let i = 0;
  while (i < length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      break;
    }
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? length : end + 3;
      continue;
    }
    const next = html.charCodeAt(lt + 1);
    if (next === 33 || next === 63) {
      const end = html.indexOf('>', lt + 1);
      i = end === -1 ? length : end + 1;
      continue;
    }
    let pos = lt + 1;
    let closing = false;
    if (next === 47) {
      closing = true;
      pos += 1;
    }
    const nameStart = pos;
    while (pos < length && isNameChar(html.charCodeAt(pos))) {
      pos += 1;
    }
    if (pos === nameStart) {
      i = lt + 1;
      continue;
    }
    const name = html.slice(nameStart, pos).toLowerCase();
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    let closed = false;
    while (pos < length) {
      const code = html.charCodeAt(pos);
      if (isSpace(code)) {
        pos += 1;
        continue;
      }
      if (code === 62) {
        pos += 1;
        closed = true;
        break;
      }
      if (code === 47) {
        if (html.charCodeAt(pos + 1) === 62) {
          selfClosing = true;
          pos += 2;
          closed = true;
          break;
        }
        pos += 1;
        continue;
      }
      const attrStart = pos;
      while (pos < length) {
        const c = html.charCodeAt(pos);
        if (isSpace(c) || c === 61 || c === 62 || (c === 47 && html.charCodeAt(pos + 1) === 62)) {
          break;
        }
        pos += 1;
      }
      const attrName = html.slice(attrStart, pos).toLowerCase();
      if (!attrName) {
        pos += 1;
        continue;
      }
      let value = '';
      let probe = pos;
      while (probe < length && isSpace(html.charCodeAt(probe))) {
        probe += 1;
      }
      if (html.charCodeAt(probe) === 61) {
        probe += 1;
        while (probe < length && isSpace(html.charCodeAt(probe))) {
          probe += 1;
        }
        const quote = html.charCodeAt(probe);
        if (quote === 34 || quote === 39) {
          const endQuote = html.indexOf(String.fromCharCode(quote), probe + 1);
          if (endQuote === -1) {
            value = html.slice(probe + 1);
            pos = length;
          } else {
            value = html.slice(probe + 1, endQuote);
            pos = endQuote + 1;
          }
        } else {
          const valueStart = probe;
          while (probe < length) {
            const c = html.charCodeAt(probe);
            if (isSpace(c) || c === 62) {
              break;
            }
            probe += 1;
          }
          value = html.slice(valueStart, probe);
          pos = probe;
        }
      }
      if (!(attrName in attrs)) {
        attrs[attrName] = decodeEntities(value);
      }
    }
    if (!closed) {
      pos = length;
    }
    tokens.push({ name, attrs, start: lt, end: pos, closing, selfClosing });
    i = pos;
    if (!closing && RAW_TEXT_ELEMENTS.has(name)) {
      const closeAt = html.toLowerCase().indexOf(`</${name}`, pos);
      i = closeAt === -1 ? length : closeAt;
    }
  }
  return tokens;
}

/** Inner markup of the element opened at `tokens[index]` (same-name nesting honoured). */
export function elementInnerHtml(html: string, tokens: TagToken[], index: number): string {
  const open = tokens[index];
  if (open.closing || open.selfClosing) {
    return '';
  }
  let depth = 0;
  for (let j = index + 1; j < tokens.length; j += 1) {
    const token = tokens[j];
    if (token.name !== open.name) {
      continue;
    }
    if (token.closing) {
      if (depth === 0) {
        return html.slice(open.end, token.start);
      }
      depth -= 1;
    } else if (!token.selfClosing) {
      depth += 1;
    }
  }
  return '';
}

function roleTokens(attrs: Record<string, string>): string[] {
  const role = attrs.role;
  return role ? role.toLowerCase().split(/\s+/).filter(Boolean) : [];
}

// ----------------------------------------------------------------- structure

export interface HeadingEntry {
  level: number;
  text: string;
}

export function headingSequence(html: string): HeadingEntry[] {
  const out: HeadingEntry[] = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let match: RegExpExecArray | null;
  const source = structuralBodyHtml(html);
  while ((match = pattern.exec(source)) !== null) {
    out.push({ level: Number(match[1]), text: textOfFragment(match[2]) });
  }
  return out;
}

/**
 * Why the heading order is not sane, or null when it is: the first heading must be
 * an h1 and no level may be skipped when descending (h2 then h4 is a skip).
 */
export function headingOrderIssue(headings: HeadingEntry[]): string | null {
  if (headings.length === 0) {
    return 'no headings';
  }
  if (headings[0].level !== 1) {
    return `first heading is h${headings[0].level}, not h1`;
  }
  let previous = 0;
  for (let index = 0; index < headings.length; index += 1) {
    const level = headings[index].level;
    if (previous && level > previous + 1) {
      return `h${previous} then h${level} at heading ${index + 1}`;
    }
    previous = level;
  }
  return null;
}

/** First heading is an h1 and no level is skipped when descending. */
export function headingOrderSane(headings: HeadingEntry[]): boolean {
  return headingOrderIssue(headings) === null;
}

export function findLandmarks(html: string): { main: boolean; nav: boolean } {
  const tokens = tokenizeTags(structuralBodyHtml(html));
  let main = false;
  let nav = false;
  for (const token of tokens) {
    if (token.closing) {
      continue;
    }
    const roles = roleTokens(token.attrs);
    if (token.name === 'main' || roles.includes('main')) {
      main = true;
    }
    if (token.name === 'nav' || roles.includes('navigation')) {
      nav = true;
    }
  }
  return { main, nav };
}

// ------------------------------------------------------------------- anchors

export interface AnchorEntry {
  href: string;
  resolved: URL | null;
  text: string;
  attrs: Record<string, string>;
}

export function collectAnchors(html: string, baseUrl: string): AnchorEntry[] {
  const source = controlBodyHtml(html);
  const tokens = tokenizeTags(source);
  const out: AnchorEntry[] = [];
  let base: URL | null = null;
  try {
    base = new URL(baseUrl);
  } catch {
    base = null;
  }
  tokens.forEach((token, index) => {
    if (token.closing || token.name !== 'a' || token.attrs.href === undefined) {
      return;
    }
    const href = token.attrs.href.trim();
    let resolved: URL | null = null;
    if (base) {
      try {
        resolved = new URL(href, base);
      } catch {
        resolved = null;
      }
    }
    out.push({
      href,
      resolved,
      text: textOfFragment(elementInnerHtml(source, tokens, index)),
      attrs: token.attrs,
    });
  });
  return out;
}

// ------------------------------------------------------------------ controls

export interface ControlEntry {
  tag: string;
  id: string | null;
  href: string | null;
  named: boolean;
}

export interface ControlSummary {
  total: number;
  named: number;
  unnamed: ControlEntry[];
}

const INPUT_CONTROL_TYPES = new Set(['submit', 'button', 'image']);

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function innerHasImageAlt(inner: string): boolean {
  const pattern = /<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(inner)) !== null) {
    const alt = match[1] ?? match[2] ?? match[3] ?? '';
    if (decodeEntities(alt).trim()) {
      return true;
    }
  }
  return false;
}

function innerHasSvgTitle(inner: string): boolean {
  return /<svg\b[^>]*>[\s\S]*?<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title\s*>/i.test(inner);
}

/** Controls per the catalog: button, a[href], input[type=submit|button|image], [role=button]. */
export function collectControls(html: string): ControlSummary {
  const source = controlBodyHtml(html);
  const tokens = tokenizeTags(source);
  const summary: ControlSummary = { total: 0, named: 0, unnamed: [] };
  tokens.forEach((token, index) => {
    if (token.closing) {
      return;
    }
    const attrs = token.attrs;
    const roles = roleTokens(attrs);
    const isButton = token.name === 'button';
    const isLink = token.name === 'a' && attrs.href !== undefined;
    const inputType = (attrs.type ?? 'text').toLowerCase();
    const isInputControl = token.name === 'input' && INPUT_CONTROL_TYPES.has(inputType);
    const isRoleButton = roles.includes('button') && !isButton && !isLink && !isInputControl;
    if (!isButton && !isLink && !isInputControl && !isRoleButton) {
      return;
    }
    let named =
      hasText(attrs['aria-label']) || hasText(attrs['aria-labelledby']) || hasText(attrs.title);
    if (!named && token.name === 'input') {
      named = hasText(attrs.value) || (inputType === 'image' && hasText(attrs.alt));
    }
    if (!named && token.name !== 'input') {
      const inner = elementInnerHtml(source, tokens, index);
      named =
        textOfFragment(inner).length > 0 || innerHasImageAlt(inner) || innerHasSvgTitle(inner);
    }
    if (!named && token.name !== 'input' && hasText(attrs.value)) {
      named = true;
    }
    summary.total += 1;
    if (named) {
      summary.named += 1;
    } else {
      summary.unnamed.push({
        tag: token.name,
        id: attrs.id ?? null,
        href: attrs.href ?? null,
        named: false,
      });
    }
  });
  return summary;
}

// -------------------------------------------------------------------- fields

export interface FieldEntry {
  tag: string;
  id: string | null;
  type: string | null;
  name: string | null;
}

export interface FieldSummary {
  total: number;
  labelled: number;
  unlabelled: FieldEntry[];
}

const NON_FIELD_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

/** Fields and their labels: label[for], a wrapping label, aria-label, aria-labelledby. */
export function collectFields(html: string): FieldSummary {
  const source = controlBodyHtml(html);
  const tokens = tokenizeTags(source);
  const labelFor = new Set<string>();
  const wrappedRanges: Array<[number, number]> = [];
  tokens.forEach((token, index) => {
    if (token.closing || token.name !== 'label') {
      return;
    }
    if (hasText(token.attrs.for)) {
      labelFor.add(token.attrs.for.trim());
    }
    const inner = elementInnerHtml(source, tokens, index);
    if (inner) {
      wrappedRanges.push([token.end, token.end + inner.length]);
    }
  });
  const summary: FieldSummary = { total: 0, labelled: 0, unlabelled: [] };
  for (const token of tokens) {
    if (token.closing) {
      continue;
    }
    const attrs = token.attrs;
    let isField = false;
    if (token.name === 'input') {
      isField = !NON_FIELD_INPUT_TYPES.has((attrs.type ?? 'text').toLowerCase());
    } else if (token.name === 'select' || token.name === 'textarea') {
      isField = true;
    }
    if (!isField) {
      continue;
    }
    const id = hasText(attrs.id) ? attrs.id.trim() : null;
    const wrapped = wrappedRanges.some(([from, to]) => token.start >= from && token.start < to);
    const labelled =
      (id !== null && labelFor.has(id)) ||
      wrapped ||
      hasText(attrs['aria-label']) ||
      hasText(attrs['aria-labelledby']);
    summary.total += 1;
    if (labelled) {
      summary.labelled += 1;
    } else {
      summary.unlabelled.push({
        tag: token.name,
        id,
        type: token.name === 'input' ? (attrs.type ?? 'text').toLowerCase() : null,
        name: hasText(attrs.name) ? attrs.name.trim() : null,
      });
    }
  }
  return summary;
}

const NON_NATIVE_TAGS = new Set(['div', 'span', 'li', 'p', 'section', 'img', 'td']);

/** div/span/li/p/section/img/td elements carrying onclick or role=button. */
export function countNonNativeClickables(html: string): number {
  const tokens = tokenizeTags(structuralBodyHtml(html));
  let count = 0;
  for (const token of tokens) {
    if (token.closing || !NON_NATIVE_TAGS.has(token.name)) {
      continue;
    }
    if (token.attrs.onclick !== undefined || roleTokens(token.attrs).includes('button')) {
      count += 1;
    }
  }
  return count;
}

// --------------------------------------------------------------------- head

export function findHtmlLang(html: string): string | null {
  const match = html.match(/<html\b[^>]*>/i);
  if (!match) {
    return null;
  }
  const token = tokenizeTags(match[0])[0];
  const lang = token?.attrs.lang;
  return hasText(lang) ? lang.trim() : null;
}

export interface LinkTagEntry {
  rel: string[];
  type: string | null;
  href: string | null;
}

export function collectLinkTags(head: string): LinkTagEntry[] {
  return tokenizeTags(head)
    .filter((token) => !token.closing && token.name === 'link')
    .map((token) => ({
      rel: (token.attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean),
      type: hasText(token.attrs.type) ? token.attrs.type.trim().toLowerCase() : null,
      href: hasText(token.attrs.href) ? token.attrs.href.trim() : null,
    }));
}

export function findMetaContent(
  head: string,
  key: string,
  attribute: 'name' | 'property'
): string | null {
  const wanted = key.toLowerCase();
  for (const token of tokenizeTags(head)) {
    if (token.closing || token.name !== 'meta') {
      continue;
    }
    const value = token.attrs[attribute];
    if (typeof value === 'string' && value.trim().toLowerCase() === wanted) {
      return token.attrs.content ?? '';
    }
  }
  return null;
}

export function hasMetaRefresh(head: string): boolean {
  return tokenizeTags(head).some(
    (token) =>
      !token.closing &&
      token.name === 'meta' &&
      (token.attrs['http-equiv'] ?? '').trim().toLowerCase() === 'refresh'
  );
}

// ------------------------------------------------------------------- JSON-LD

export type JsonLdNode = Record<string, unknown>;

export interface JsonLdBlockStatus {
  index: number;
  ok: boolean;
  /** Parse error position when the block failed, or null. */
  position: number | null;
}

export interface JsonLdSummary {
  blocks: JsonLdBlockStatus[];
  /** Flattened nodes from parseable blocks, `@id` references resolved one level. */
  nodes: JsonLdNode[];
}

function isPlainObject(value: unknown): value is JsonLdNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenJsonLd(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenJsonLd(item, out);
    }
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  out.push(value);
  const graph = value['@graph'];
  if (Array.isArray(graph)) {
    flattenJsonLd(graph, out);
  }
}

function isIdReference(value: unknown): value is { '@id': string } {
  if (!isPlainObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '@id' && typeof value['@id'] === 'string';
}

function resolveReferences(nodes: JsonLdNode[]): JsonLdNode[] {
  const byId = new Map<string, JsonLdNode>();
  for (const node of nodes) {
    const id = node['@id'];
    if (typeof id === 'string' && !byId.has(id)) {
      byId.set(id, node);
    }
  }
  if (byId.size === 0) {
    return nodes;
  }
  const resolveValue = (value: unknown): unknown => {
    if (isIdReference(value)) {
      return byId.get(value['@id']) ?? value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => (isIdReference(item) ? byId.get(item['@id']) ?? item : item));
    }
    return value;
  };
  return nodes.map((node) => {
    const resolved: JsonLdNode = {};
    for (const [key, value] of Object.entries(node)) {
      resolved[key] = key.startsWith('@') ? value : resolveValue(value);
    }
    return resolved;
  });
}

export function parseJsonLd(html: string): JsonLdSummary {
  const blocks: JsonLdBlockStatus[] = [];
  const nodes: JsonLdNode[] = [];
  extractJsonLdScriptContents(html).forEach((content, index) => {
    try {
      const parsed: unknown = JSON.parse(content);
      blocks.push({ index, ok: true, position: null });
      flattenJsonLd(parsed, nodes);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const positionMatch = message.match(/position (\d+)/i);
      blocks.push({
        index,
        ok: false,
        position: positionMatch ? Number(positionMatch[1]) : null,
      });
    }
  });
  return { blocks, nodes: resolveReferences(nodes) };
}

export function jsonLdTypes(node: JsonLdNode): string[] {
  const type = node['@type'];
  if (typeof type === 'string') {
    return [type];
  }
  if (Array.isArray(type)) {
    return type.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

// ------------------------------------------------------- attribute text scan

/** alt, aria-label and title values plus the text of aria-hidden or hidden elements. */
export function collectAttributeTexts(html: string): string[] {
  const source = controlBodyHtml(html);
  const tokens = tokenizeTags(source);
  const out: string[] = [];
  tokens.forEach((token, index) => {
    if (token.closing) {
      return;
    }
    for (const name of ['alt', 'aria-label', 'title']) {
      const value = token.attrs[name];
      if (hasText(value)) {
        out.push(value);
      }
    }
    const ariaHidden = (token.attrs['aria-hidden'] ?? '').trim().toLowerCase();
    if (ariaHidden === 'true' || token.attrs.hidden !== undefined) {
      const text = textOfFragment(elementInnerHtml(source, tokens, index));
      if (text) {
        out.push(text);
      }
    }
  });
  return out;
}

// -------------------------------------------------------- moved from website

/**
 * Normalises HTML for a body-similarity comparison: drops head, scripts, styles,
 * tags and whitespace runs, so two renders of the same shell compare equal even
 * when a nonce or a hashed asset name differs.
 */
export function normalizeBodyForComparison(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface ContentSignalParse {
  present: boolean;
  directives: Record<string, string>;
  raw: string[];
}

/**
 * Read-only parse of Content-Signal directives in a robots.txt body. Tolerant by
 * design: unknown keys and values (such as Cloudflare's emerging `use=` content-use
 * field) are preserved so the checker can report them without treating them as
 * invalid.
 */
export function parseContentSignal(body: string): ContentSignalParse {
  const directives: Record<string, string> = {};
  const raw: string[] = [];
  let present = false;
  const re = /^[ \t]*content-signal[ \t]*:[ \t]*(.+?)[ \t]*$/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const value = match[1].trim();
    if (!value) continue;
    present = true;
    raw.push(value);
    for (const pair of value.split(',')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      const key = pair.slice(0, eq).trim().toLowerCase();
      const val = pair.slice(eq + 1).trim().toLowerCase();
      if (key) directives[key] = val;
    }
  }
  return { present, directives, raw };
}

// -------------------------------------------------------------------- robots

const MANAGED_MARKER_LINE_RE = /^\s*# (?:BEGIN|END) agentmarkup [^\n]*$/gm;

/**
 * Agents root-blocked under RFC 9309 group logic (own group, else `*`), wrapping core
 * `findBlockedCrawlers`. The agentmarkup marker lines are removed first so rules inside
 * a managed block count like any other rule.
 */
export function robotsBlockedAgents(robotsTxt: string, agents: ReadonlyArray<string>): string[] {
  const config: AiCrawlersConfig = {};
  for (const agent of agents) {
    config[agent] = 'allow';
  }
  const unmanaged = robotsTxt.replace(MANAGED_MARKER_LINE_RE, '');
  return findBlockedCrawlers(unmanaged, config);
}
