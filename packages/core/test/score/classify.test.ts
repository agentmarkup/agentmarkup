import { describe, expect, it } from 'vitest';
import {
  WORKER_ERROR_MESSAGES,
  classifyResource,
  findChallengeHeader,
  findChallengeMarker,
  isChallengeStatus,
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

  // Catalog 1.1.0: AWS WAF. The Captcha action answers 405 with x-amzn-waf-action:
  // captcha, the Challenge action 202 with x-amzn-waf-action: challenge; emag.ro serves
  // its AWS WAF captcha page with 511 from its own layer (observed 2026-11-09).
  const AWS_SDK_PAGE = `<html><head><script src="https://x.token.awswaf.com/x/challenge.js" defer></script></head><body><main><h1>Shop</h1><script>AwsWafIntegration.getToken()</script></main></body></html>`;

  it('reads awswaf.com and AwsWafIntegration on a challenge status only, never on a 2xx page', () => {
    const page = resource({ status: 200, body: AWS_SDK_PAGE });
    expect(classifyResource(page)).toBe('ok');
    expect(findChallengeMarker(page)).toBeNull();
    for (const status of [201, 202, 204]) {
      expect(findChallengeMarker(resource({ status, body: AWS_SDK_PAGE })), String(status)).toBeNull();
    }
    for (const status of [405, 511, 401, 403, 429, 503]) {
      const walled = resource({ status, ok: false, body: AWS_SDK_PAGE });
      expect(classifyResource(walled), String(status)).toBe('challenge');
      expect(findChallengeMarker(walled), String(status)).toBe('awswaf.com');
    }
    const integrationOnly = resource({ status: 511, ok: false, body: '<script>AwsWafIntegration.fetch(u)</script>' });
    expect(classifyResource(integrationOnly)).toBe('challenge');
    expect(findChallengeMarker(integrationOnly)).toBe('AwsWafIntegration');
    // Not a challenge status: the gated list is never read.
    for (const [status, outcome] of [[500, 'unverified'], [502, 'unverified'], [400, 'http-error'], [404, 'not-found']] as const) {
      const other = resource({ status, ok: false, body: AWS_SDK_PAGE });
      expect(classifyResource(other), String(status)).toBe(outcome);
      expect(findChallengeMarker(other), String(status)).toBeNull();
    }
    // Past the 20,480-character window the gated list is not read either.
    expect(classifyResource(resource({ status: 511, ok: false, body: 'x'.repeat(30_000) + 'awswaf.com' }))).toBe('unverified');
  });

  it('keeps a 511 without markers unverified and a 405 without markers an http-error', () => {
    expect(classifyResource(resource({ status: 511, ok: false, body: '<html><body>Network authentication required</body></html>' }))).toBe('unverified');
    expect(classifyResource(resource({ status: 511, ok: false, body: null }))).toBe('unverified');
    expect(classifyResource(resource({ status: 405, ok: false, body: 'Method Not Allowed' }))).toBe('http-error');
    expect(classifyResource(resource({ status: 405, ok: false, body: '' }))).toBe('http-error');
    expect(isChallengeStatus(405)).toBe(true);
    expect(isChallengeStatus(511)).toBe(true);
    expect(isChallengeStatus(200)).toBe(false);
    expect(isChallengeStatus(500)).toBe(false);
  });

  it('reads x-amzn-waf-action as a challenge header on any status, case-insensitively', () => {
    const captcha = resource({ status: 405, ok: false, body: '', headers: { 'x-amzn-waf-action': 'captcha' } });
    expect(classifyResource(captcha)).toBe('challenge');
    expect(findChallengeMarker(captcha)).toBe('x-amzn-waf-action: captcha');
    // A 202 with the header (the AWS WAF Challenge action) is a challenge like any
    // other: the header is the bot manager's own statement, so a 2xx is no exception.
    const challenge = resource({ status: 202, body: '', headers: { 'X-Amzn-Waf-Action': 'Challenge' } });
    expect(classifyResource(challenge)).toBe('challenge');
    expect(findChallengeMarker(challenge)).toBe('x-amzn-waf-action: Challenge');
    expect(findChallengeHeader(challenge)).toBe('x-amzn-waf-action: Challenge');
    expect(findChallengeMarker(resource({ headers: { 'x-amzn-waf-action': 'allow' } }))).toBeNull();
    expect(findChallengeMarker(resource({ headers: { 'x-amzn-waf-action': '' } }))).toBeNull();
    // Headers come first, in published order, then the body lists.
    expect(
      findChallengeMarker(resource({ status: 403, ok: false, body: 'Just a moment...', headers: { 'x-amzn-waf-action': 'captcha' } }))
    ).toBe('x-amzn-waf-action: captcha');
    expect(
      findChallengeMarker(resource({ status: 403, ok: false, headers: { 'x-amzn-waf-action': 'captcha', 'cf-mitigated': 'challenge' } }))
    ).toBe('cf-mitigated: challenge');
    // The header makes any status a challenge, a non-challenge status included.
    expect(classifyResource(resource({ status: 500, ok: false, headers: { 'x-amzn-waf-action': 'captcha' } }))).toBe('challenge');
  });

  // The worker's copy of this rule runs over the same kinds of input against core in
  // website/test/worker-check-chain.test.ts (CLASSIFY_PARITY_CASES).
  it('a challenge header makes any status a challenge, a 2xx with an HTML, empty or null body included', () => {
    const header = { 'x-amzn-waf-action': 'challenge' };
    expect(classifyResource(resource({ status: 202, body: '<html><body>Verifying</body></html>', headers: header }))).toBe('challenge');
    expect(classifyResource(resource({ status: 202, body: '', headers: header }))).toBe('challenge');
    expect(classifyResource(resource({ status: 202, body: null, headers: header }))).toBe('challenge');
    expect(classifyResource(resource({ status: 202, body: undefined, headers: header }))).toBe('challenge');
    const cloudflare = resource({ status: 200, headers: { 'cf-mitigated': 'challenge' } });
    expect(classifyResource(cloudflare)).toBe('challenge');
    expect(findChallengeHeader(cloudflare)).toBe('cf-mitigated: challenge');
    // 3xx, 404 and 410 with the header: the header outranks the status.
    for (const status of [302, 404, 410, 400, 500]) {
      expect(classifyResource(resource({ status, ok: false, body: '', headers: header })), String(status)).toBe('challenge');
    }
    // A transport failure stays unverified even with the header.
    expect(classifyResource(resource({ status: 0, ok: false, body: null, headers: header }))).toBe('unverified');
    expect(classifyResource(resource({ status: 202, error: 'Request timed out.', headers: header }))).toBe('unverified');
    expect(classifyResource(resource({ status: 202, skipped: true, headers: header }))).toBe('unverified');
    // A header value without a published word is no marker.
    expect(classifyResource(resource({ status: 202, body: '', headers: { 'x-amzn-waf-action': 'allow' } }))).toBe('ok');
    expect(findChallengeHeader(resource({ headers: { 'cf-mitigated': '' } }))).toBeNull();
  });

  it('body markers on a 2xx leave it ok (no header): the AWS SDK and Cloudflare strings alike', () => {
    const sdk = resource({ status: 200, body: AWS_SDK_PAGE });
    expect(classifyResource(sdk)).toBe('ok');
    expect(findChallengeHeader(sdk)).toBeNull();
    expect(findChallengeMarker(sdk)).toBeNull();
    // A CHALLENGE_MARKERS string on a 2xx: still ok here; only the homepage rule gates it.
    const marked = resource({ status: 200, body: '<title>Just a moment...</title>' });
    expect(classifyResource(marked)).toBe('ok');
    expect(findChallengeHeader(marked)).toBeNull();
    expect(findChallengeMarker(marked)).toBe('Just a moment...');
  });

  it('404/410 with a body marker stay not-found (body markers never outrank 404/410)', () => {
    expect(classifyResource(resource({ status: 404, ok: false, body: '<title>Just a moment...</title>' }))).toBe('not-found');
    expect(classifyResource(resource({ status: 410, ok: false, body: 'challenge-platform' }))).toBe('not-found');
  });

  // reach.bot-detection used to carry `(marker && status === 429) || (marker && status >= 500)`
  // next to `outcome === 'challenge'`. It returns early for `unverified`, so that branch
  // could only fire for an outcome other than challenge and unverified; this sweep shows
  // there is none for any 429 or 5xx with any kind of marker, so the branch was removed.
  it('a 429 or 5xx with any marker is always challenge or unverified (no third outcome)', () => {
    const bodies = [null, '', 'plain', 'Just a moment...', 'awswaf.com', 'AwsWafIntegration', AWS_SDK_PAGE];
    const headerSets = [undefined, { 'cf-mitigated': 'challenge' }, { 'x-amzn-waf-action': 'captcha' }, { 'x-amzn-waf-action': 'allow' }];
    const statuses = [429];
    for (let status = 500; status <= 599; status += 1) statuses.push(status);
    statuses.push(600, 999);
    for (const status of statuses) {
      for (const body of bodies) {
        for (const headers of headerSets) {
          const answer = resource({ status, ok: false, body, headers });
          const outcome = classifyResource(answer);
          expect(['challenge', 'unverified'], `${status} ${String(body).slice(0, 20)} ${JSON.stringify(headers)}`).toContain(outcome);
          if (findChallengeMarker(answer) !== null && isChallengeStatus(status)) {
            expect(outcome, `${status} marked`).toBe('challenge');
          }
        }
      }
    }
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
