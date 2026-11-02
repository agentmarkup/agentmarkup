// Resource classification and body helpers shared by every evaluator.
//
// `classifyResource` is the single place that decides what a fetched resource is.
// A transport failure (status 0, an error, a 2xx with no body, a skipped fetch, a
// 429 or a 5xx without challenge markers) is `unverified` and can never become a
// finding; only completed responses are judged.
import { CHALLENGE_MARKERS } from './catalog.js';
import type { RemoteResource, ResourceOutcome } from './types.js';

/** Every check reads at most this many characters of a body; longer bodies are flagged. */
export const MAX_EVALUATED_BODY_CHARS = 1_048_576;

/** How many leading characters are scanned for challenge markers. */
export const CHALLENGE_SCAN_CHARS = 20_480;

/**
 * The error strings the website checker worker can set on a resource. Listed so the
 * classification test covers each one; any error string is `unverified` regardless.
 */
export const WORKER_ERROR_MESSAGES = [
  'Request timed out.',
  'Request failed.',
  'Response exceeded the checker size limit.',
  'Request was blocked by checker safety rules.',
  'Too many redirects.',
  'Redirect response had no Location header.',
  'Checker time budget exhausted.',
  'Checker request budget exhausted.',
] as const;

export interface EvaluatedBody {
  text: string;
  truncated: boolean;
}

function headerValue(resource: RemoteResource, name: string): string | null {
  const headers = resource.headers;
  if (!headers) {
    return null;
  }
  const direct = headers[name];
  if (typeof direct === 'string') {
    return direct;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && typeof value === 'string') {
      return value;
    }
  }
  return null;
}

/**
 * Returns the challenge marker found on a response: the `cf-mitigated` header
 * containing `challenge`, or one of the published body markers in the first 20,480 characters.
 */
export function findChallengeMarker(resource: RemoteResource): string | null {
  const mitigated = headerValue(resource, 'cf-mitigated');
  if (mitigated && /challenge/i.test(mitigated)) {
    return `cf-mitigated: ${mitigated}`;
  }
  const body = resource.body;
  if (!body) {
    return null;
  }
  const head = body.slice(0, CHALLENGE_SCAN_CHARS);
  for (const marker of CHALLENGE_MARKERS) {
    if (head.includes(marker)) {
      return marker;
    }
  }
  return null;
}

export function classifyResource(
  resource: RemoteResource | null | undefined
): ResourceOutcome {
  if (!resource) {
    return 'absent';
  }
  const status = Number.isFinite(resource.status) ? resource.status : 0;
  if (resource.skipped || status <= 0 || resource.error) {
    return 'unverified';
  }
  if (status >= 200 && status < 300) {
    return resource.body === null || resource.body === undefined ? 'unverified' : 'ok';
  }
  if (status === 404 || status === 410) {
    return 'not-found';
  }
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    if (findChallengeMarker(resource)) {
      return 'challenge';
    }
  }
  if (status === 429 || status >= 500) {
    return 'unverified';
  }
  return 'http-error';
}

/** An HTML body: anything that carries an `<html` or `<body` tag (case-insensitive). */
export function isHtmlBody(body: string | null | undefined): boolean {
  if (!body) {
    return false;
  }
  return /<(?:!doctype\s+html|html|body)\b/i.test(body.slice(0, MAX_EVALUATED_BODY_CHARS));
}

function contentTypeOf(resource: RemoteResource): string {
  return (resource.contentType ?? '').toLowerCase();
}

/**
 * A text resource: 2xx, content-type not text/html, body not an HTML body. A host
 * answering 200 HTML for /llms.txt or /robots.txt therefore reads as absent.
 */
export function isTextResource(resource: RemoteResource | null | undefined): boolean {
  if (!resource || classifyResource(resource) !== 'ok') {
    return false;
  }
  if (contentTypeOf(resource).includes('text/html')) {
    return false;
  }
  return !isHtmlBody(resource.body);
}

/** Splits an optional leading `---` frontmatter block off a markdown body. */
export function splitFrontmatter(body: string): { frontmatter: string | null; content: string } {
  const stripped = body.replace(/^\uFEFF/, '');
  const match = stripped.match(/^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: null, content: stripped };
  }
  return { frontmatter: match[1], content: stripped.slice(match[0].length) };
}

/**
 * Served as markdown: a text resource whose content-type is text/markdown, or whose
 * body (after an optional frontmatter block) starts with a `#` heading.
 */
export function isMarkdownResource(resource: RemoteResource | null | undefined): boolean {
  if (!resource || !isTextResource(resource)) {
    return false;
  }
  if (contentTypeOf(resource).includes('text/markdown')) {
    return true;
  }
  const { content } = splitFrontmatter(resource.body ?? '');
  return /^\s*#/.test(content);
}

/** The body a check may read: at most 1,048,576 characters, flagged when cut. */
export function readEvaluatedBody(resource: RemoteResource | null | undefined): EvaluatedBody {
  const body = resource?.body ?? '';
  if (body.length <= MAX_EVALUATED_BODY_CHARS) {
    return { text: body, truncated: false };
  }
  return { text: body.slice(0, MAX_EVALUATED_BODY_CHARS), truncated: true };
}

/** Byte length of a body, from the recorded `bodyBytes` when the body was dropped. */
export function bodyByteLength(resource: RemoteResource): number {
  if (typeof resource.bodyBytes === 'number' && Number.isFinite(resource.bodyBytes)) {
    return resource.bodyBytes;
  }
  const body = resource.body ?? '';
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(body).length;
  }
  return body.length;
}

export function resourceHeader(resource: RemoteResource | null | undefined, name: string): string | null {
  return resource ? headerValue(resource, name) : null;
}
