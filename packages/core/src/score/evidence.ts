// Resource classification and body helpers shared by every evaluator.
//
// `classifyResource` is the single place that decides what a fetched resource is.
// A transport failure (status 0, an error, a 2xx with no body, a skipped fetch, a
// 429 or a 5xx without challenge markers) is `unverified` and can never become a
// finding; a published challenge header makes any response a `challenge`; only
// completed responses are judged.
import {
  CHALLENGE_HEADERS,
  CHALLENGE_MARKERS,
  CHALLENGE_MARKERS_NON_2XX,
  CHALLENGE_STATUSES,
} from './catalog.js';
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

function statusOf(resource: RemoteResource): number {
  return Number.isFinite(resource.status) ? resource.status : 0;
}

/** One of the published `CHALLENGE_STATUSES` (401, 403, 405, 429, 503, 511). */
export function isChallengeStatus(status: number): boolean {
  return (CHALLENGE_STATUSES as readonly number[]).includes(status);
}

/**
 * The published challenge header on a response (`cf-mitigated` containing
 * `challenge`, `x-amzn-waf-action` containing `captcha` or `challenge`,
 * case-insensitive), reported as `name: value`, or null. The header is the bot
 * manager's own statement that it answered instead of the site, so it makes a
 * response a challenge on any status and on every resource (`classifyResource`).
 */
export function findChallengeHeader(resource: RemoteResource): string | null {
  for (const header of CHALLENGE_HEADERS) {
    const value = headerValue(resource, header.name);
    if (value && header.values.some((word) => value.toLowerCase().includes(word))) {
      return `${header.name}: ${value}`;
    }
  }
  return null;
}

/**
 * Returns the challenge marker found on a response, in this order: a published
 * challenge header (`findChallengeHeader`) on any status; one of `CHALLENGE_MARKERS`
 * in the first 20,480 characters of the body on any status; one of
 * `CHALLENGE_MARKERS_NON_2XX` there, only when the status is a challenge status.
 * The status gate lives here so no caller can read the AWS SDK strings of a normal
 * 2xx page as a block.
 */
export function findChallengeMarker(resource: RemoteResource): string | null {
  const header = findChallengeHeader(resource);
  if (header) {
    return header;
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
  if (!isChallengeStatus(statusOf(resource))) {
    return null;
  }
  for (const marker of CHALLENGE_MARKERS_NON_2XX) {
    if (head.includes(marker)) {
      return marker;
    }
  }
  return null;
}

/**
 * The single place that decides what a fetched resource is, in this order:
 * - `absent`: no resource recorded
 * - `unverified`: skipped, status 0 (or not a finite number), or an error
 * - `challenge`: any status carrying a published challenge header, a 2xx (with or
 *   without a body) and a 404/410 included
 * - `unverified` / `ok`: a 2xx without / with a body (body markers on a 2xx leave it
 *   `ok`; only the homepage rule gates such a page)
 * - `not-found`: 404 or 410
 * - `challenge`: a `CHALLENGE_STATUSES` status carrying a body marker
 * - `unverified`: 429 or 5xx without a marker (transport noise, never a finding)
 * - `http-error`: any other completed answer
 */
export function classifyResource(
  resource: RemoteResource | null | undefined
): ResourceOutcome {
  if (!resource) {
    return 'absent';
  }
  const status = statusOf(resource);
  if (resource.skipped || status <= 0 || resource.error) {
    return 'unverified';
  }
  if (findChallengeHeader(resource)) {
    return 'challenge';
  }
  if (status >= 200 && status < 300) {
    return resource.body === null || resource.body === undefined ? 'unverified' : 'ok';
  }
  if (status === 404 || status === 410) {
    return 'not-found';
  }
  if (isChallengeStatus(status) && findChallengeMarker(resource)) {
    return 'challenge';
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
