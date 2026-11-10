// @vitest-environment node
// The missing-path probe is scored by the engine's `nav.not-found` check; the
// adapter turns that result into the finding the page renders.
import { describe, expect, it } from 'vitest';

import { analyzeSiteCheck } from '../src/checker/analyze';
import type { AuditItem, RemoteResource } from '../src/checker/types';
import { HOME, PROBE_URL, notFound, page, resource, siteCheck, status, timedOut } from './helpers/score-fixture';

function findings(probe: RemoteResource | null): { item: AuditItem | undefined; unverified: AuditItem | undefined } {
  const analysis = analyzeSiteCheck(siteCheck({ probe }));
  return {
    item: analysis.items.find((candidate) => candidate.id === 'nav.not-found'),
    unverified: analysis.items.find((candidate) => candidate.id === 'unverified-notFoundProbe'),
  };
}

function probe200(body: string): RemoteResource {
  return status(PROBE_URL, 200, { body });
}

describe('checker soft-404 detection', () => {
  it('reports an error when a nonexistent path returns the homepage with 200', () => {
    const { item } = findings(probe200(page()));

    expect(item?.level).toBe('error');
    expect(item?.detail).toContain('soft-404');
    expect(item?.title).toContain('pretends it does');
  });

  it('ignores cosmetic differences like a changed nonce or hashed asset name', () => {
    const shellWithDifferentAssets = page().replace(
      '</body>',
      '<script nonce="abc123" src="/assets/main-9f3a2c.js"></script></body>'
    );
    const { item } = findings(probe200(shellWithDifferentAssets));

    expect(item?.level).toBe('error');
    expect(item?.detail).toContain('soft-404');
  });

  it('still fails, with a different evidence string, when the 200 body differs from the homepage', () => {
    const { item } = findings(probe200('<html><body><main><h1>Not found</h1><p>Sorry.</p></main></body></html>'));

    expect(item?.level).toBe('error');
    expect(item?.detail).toContain('missing paths answer 200');
    expect(item?.detail).not.toContain('<');
  });

  it('passes when the path returns a real 404 or 410', () => {
    for (const code of [404, 410]) {
      const { item } = findings(resource(PROBE_URL, { status: code, ok: false, body: null }));
      expect(item?.level).toBe('pass');
      expect(item?.detail).toContain(`HTTP ${code}`);
    }
  });

  it('warns rather than erroring when the probe never completed', () => {
    const { item, unverified } = findings(timedOut(PROBE_URL));

    expect(item).toBeUndefined();
    expect(unverified?.level).toBe('warning');
    expect(unverified?.title).toBe('Missing-path probe could not be verified on this run');
    expect(unverified?.detail).toContain('Missing paths return a real 404');
  });

  it('fails a redirect, quoting the status and the Location', () => {
    const { item } = findings(status(PROBE_URL, 302, { headers: { location: HOME } }));

    expect(item?.level).toBe('error');
    expect(item?.detail).toContain('redirect');
    expect(item?.detail).toContain('302');
    expect(item?.detail).toContain(HOME);
  });

  it('reports an older payload without a probe as unverified, never as a failure', () => {
    const { item, unverified } = findings(null);
    const analysis = analyzeSiteCheck(siteCheck({ probe: null }));

    expect(item).toBeUndefined();
    expect(unverified?.level).toBe('warning');
    expect(unverified?.detail).toContain('the missing-path probe was not run');
    expect(analysis.report.analysisStatus).toBe('partial');
    expect(analysis.report.unverifiedChecks).toContain('nav.not-found');
  });

  it('always carries an agentmarkup explainer, including on the pass state', () => {
    for (const probe of [notFound(PROBE_URL), probe200(page())]) {
      const { item } = findings(probe);
      expect(item?.agentmarkupHelp).toBeTruthy();
      expect(item?.docUrl).toContain('/score/#nav.not-found');
    }
  });
});
