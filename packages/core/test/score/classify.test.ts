import { describe, expect, it } from 'vitest';
import {
  WORKER_ERROR_MESSAGES,
  classifyResource,
  findChallengeMarker,
  isHtmlBody,
  isMarkdownResource,
  isTextResource,
  readEvaluatedBody,
  splitFrontmatter,
  MAX_EVALUATED_BODY_CHARS,
} from '../../src/score/evidence.js';
import type { RemoteResource } from '../../src/score/types.js';

function resource(overrides: Partial<RemoteResource>): RemoteResource {
  return {
    requestedUrl: 'https://example.com/x',
    finalUrl: 'https://example.com/x',
    status: 200,
    ok: true,
    contentType: 'text/html',
    body: '<html><body>ok</body></html>',
    ...overrides,
  };
}

describe('classifyResource', () => {
  it('maps every worker error string to unverified', () => {
    expect(WORKER_ERROR_MESSAGES).toEqual([
      'Request timed out.',
      'Request failed.',
      'Response exceeded the checker size limit.',
      'Request was blocked by checker safety rules.',
      'Too many redirects.',
      'Redirect response had no Location header.',
      'Checker time budget exhausted.',
      'Checker request budget exhausted.',
    ]);
    for (const error of WORKER_ERROR_MESSAGES) {
      expect(classifyResource(resource({ status: 0, ok: false, body: null, contentType: null, error }))).toBe('unverified');
      expect(classifyResource(resource({ status: 200, error }))).toBe('unverified');
    }
  });

  it('treats status 0, 2xx with a null body, skipped, 429 and 5xx without markers as unverified', () => {
    expect(classifyResource(resource({ status: 0, ok: false, body: null }))).toBe('unverified');
    expect(classifyResource(resource({ status: 200, body: null }))).toBe('unverified');
    expect(classifyResource(resource({ status: 204, body: null }))).toBe('unverified');
    expect(classifyResource(resource({ status: 200, skipped: true }))).toBe('unverified');
    expect(classifyResource(resource({ status: 429, ok: false, body: 'slow down' }))).toBe('unverified');
    expect(classifyResource(resource({ status: 500, ok: false }))).toBe('unverified');
    expect(classifyResource(resource({ status: 502, ok: false }))).toBe('unverified');
    expect(classifyResource(resource({ status: 503, ok: false }))).toBe('unverified');
  });

  it('classifies challenge pages by header or body marker', () => {
    expect(classifyResource(resource({ status: 403, ok: false, headers: { 'cf-mitigated': 'challenge' } }))).toBe('challenge');
    expect(classifyResource(resource({ status: 503, ok: false, body: '<html><title>Just a moment...</title></html>' }))).toBe('challenge');
    expect(classifyResource(resource({ status: 429, ok: false, body: 'px-captcha' }))).toBe('challenge');
    expect(classifyResource(resource({ status: 401, ok: false, body: '<div id="__cf_chl"></div>' }))).toBe('challenge');
    expect(classifyResource(resource({ status: 403, ok: false, body: 'Forbidden' }))).toBe('http-error');
    expect(findChallengeMarker(resource({ headers: { 'CF-Mitigated': 'challenge' } }))).toBe('cf-mitigated: challenge');
    expect(findChallengeMarker(resource({ body: 'x'.repeat(30_000) + 'Attention Required!' }))).toBeNull();
    expect(findChallengeMarker(resource({ body: 'Attention Required!' }))).toBe('Attention Required!');
  });

  it('classifies 404/410 as not-found, other completed non-2xx as http-error, 2xx with a body as ok', () => {
    expect(classifyResource(resource({ status: 404, ok: false }))).toBe('not-found');
    expect(classifyResource(resource({ status: 410, ok: false }))).toBe('not-found');
    expect(classifyResource(resource({ status: 301, ok: false, body: '' }))).toBe('http-error');
    expect(classifyResource(resource({ status: 400, ok: false }))).toBe('http-error');
    expect(classifyResource(resource({ status: 200 }))).toBe('ok');
    expect(classifyResource(resource({ status: 200, body: '' }))).toBe('ok');
    expect(classifyResource(null)).toBe('absent');
    expect(classifyResource(undefined)).toBe('absent');
  });
});

describe('text and markdown resources', () => {
  it('detects HTML bodies and treats soft-404 HTML as not a text resource', () => {
    expect(isHtmlBody('<!DOCTYPE html><html>')).toBe(true);
    expect(isHtmlBody('<BODY>')).toBe(true);
    expect(isHtmlBody('# llms\n\n> summary')).toBe(false);
    expect(isTextResource(resource({ contentType: 'text/plain', body: '# llms' }))).toBe(true);
    expect(isTextResource(resource({ contentType: 'text/plain', body: '<html><body>404</body></html>' }))).toBe(false);
    expect(isTextResource(resource({ contentType: 'text/html', body: '# llms' }))).toBe(false);
    expect(isTextResource(resource({ status: 404, ok: false, contentType: 'text/plain', body: 'nope' }))).toBe(false);
    expect(isTextResource(resource({ status: 0, ok: false, body: null, error: 'Request timed out.' }))).toBe(false);
  });

  it('detects markdown by content type or a leading heading after optional frontmatter', () => {
    expect(isMarkdownResource(resource({ contentType: 'text/markdown', body: 'plain words' }))).toBe(true);
    expect(isMarkdownResource(resource({ contentType: 'text/plain', body: '---\ntitle: x\n---\n# Heading' }))).toBe(true);
    expect(isMarkdownResource(resource({ contentType: 'text/plain', body: '﻿# Heading' }))).toBe(true);
    expect(isMarkdownResource(resource({ contentType: 'text/plain', body: 'no heading' }))).toBe(false);
    expect(isMarkdownResource(resource({ contentType: 'text/html', body: '# Heading' }))).toBe(false);
    expect(splitFrontmatter('---\ntitle: Hello\n---\n# Body')).toEqual({ frontmatter: 'title: Hello', content: '# Body' });
    expect(splitFrontmatter('# Body')).toEqual({ frontmatter: null, content: '# Body' });
  });

  it('caps evaluated bodies at 1,048,576 characters and flags truncation', () => {
    const big = 'a'.repeat(MAX_EVALUATED_BODY_CHARS + 10);
    expect(readEvaluatedBody(resource({ body: big }))).toEqual({ text: big.slice(0, MAX_EVALUATED_BODY_CHARS), truncated: true });
    expect(readEvaluatedBody(resource({ body: 'small' }))).toEqual({ text: 'small', truncated: false });
    expect(readEvaluatedBody(null)).toEqual({ text: '', truncated: false });
  });
});
