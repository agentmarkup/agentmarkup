// Unit checks for the batch scripts' shared libraries (scripts/lib/). Plain .mjs
// for the same reason as claude-plugin.test.mjs, and nothing here imports a
// built workspace package, so it runs before `pnpm build`. Never writes files.

import test from 'node:test';
import assert from 'node:assert/strict';

import { optionValue } from '../scripts/lib/args.mjs';
import { RESOURCE_KEYS, siteStat, statsFromSaved, summarizeSites } from '../scripts/lib/batch-summary.mjs';
import { csvLine, parseCsvRows, stringifyCsv } from '../scripts/lib/csv.mjs';

test('csv: string cells a spreadsheet would evaluate get a leading quote and are quoted', () => {
  assert.equal(csvLine(['=HYPERLINK("http://x","y")']), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvLine(['+cmd']), `"'+cmd"`);
  assert.equal(csvLine(['-2+3']), `"'-2+3"`);
  assert.equal(csvLine(['@SUM(A1)']), `"'@SUM(A1)"`);
  assert.equal(csvLine(['\tx']), `"'\tx"`);
  assert.equal(csvLine(['\rx']), `"'\rx"`);
  assert.equal(csvLine(['-']), `"'-"`);
});

test('csv: genuine numbers and numeric strings stay untouched', () => {
  assert.equal(csvLine([-3, 0, 12.5, '-3', '+1', '1e3', '0.25', '.5']), '-3,0,12.5,-3,+1,1e3,0.25,.5');
});

test('csv: ordinary escaping still applies and the formula guard round-trips through the reader', () => {
  assert.equal(csvLine(['a,b', 'say "hi"', 'plain', null, undefined]), '"a,b","say ""hi""",plain,,');
  const text = stringifyCsv(['site', 'score'], [['=1+1', 80], ['example.com', '']]);
  assert.deepEqual(parseCsvRows(text), [['site', 'score'], ["'=1+1", '80'], ['example.com', '']]);
});

test('args: a missing value, an empty value or another flag is a usage error', () => {
  const failures = [];
  const fail = (message) => failures.push(message);
  assert.throws(() => optionValue(['--compare'], 0, fail), /--compare expects a value/);
  assert.throws(() => optionValue(['--out', '--rerecord'], 0, fail), /--out expects a value/);
  assert.throws(() => optionValue(['--limit', '-3'], 0, fail), /--limit expects a value/);
  assert.throws(() => optionValue(['--out', ''], 0, fail), /--out expects a value/);
  assert.deepEqual(failures, ['--compare expects a value', '--out expects a value', '--limit expects a value', '--out expects a value']);
  assert.equal(optionValue(['x.com', '--out', 'dir'], 1, fail), 'dir');
});

function report(status, score, grade, catalogVersion = '1.0.0') {
  return { analysisStatus: status, score, grade, catalogVersion, unverifiedChecks: [] };
}

function resource() {
  return { status: 200, outcome: 'ok', body: null };
}

function evidence({ sample = true, unverified = [] } = {}) {
  const value = { fetchSummary: { elapsedMs: 1200, unverified } };
  for (const key of RESOURCE_KEYS) {
    value[key] = sample || !key.startsWith('samplePage') ? resource() : null;
  }
  return value;
}

test('summary: unverified rates divide by the resource records present, not sites x 8', () => {
  const sites = [
    siteStat(report('complete', 90, 'A'), evidence()),
    siteStat(report('partial', 70, 'C'), evidence({ sample: false, unverified: ['sitemap'] })),
  ];
  assert.deepEqual(sites[1].resourcesPresent, RESOURCE_KEYS.filter((key) => !key.startsWith('samplePage')));
  const summary = summarizeSites(sites);
  assert.equal(summary.unverified.resourcesChecked, 14);
  assert.equal(summary.unverified.rate, Number((1 / 14).toFixed(4)));
  assert.equal(summary.unverified.checkedPerResource.samplePage, 1);
  assert.equal(summary.unverified.ratePerResource.sitemap, 0.5);
  assert.equal(summary.unverified.ratePerResource.samplePage, 0);
  assert.deepEqual(summary.sites, { total: 2, byStatus: { complete: 1, partial: 1, blocked: 0 } });
  assert.equal(summarizeSites([]).unverified.rate, null);
});

test('summary: a resumed agency is rebuilt from its saved reports with their own catalog version', () => {
  const stats = statsFromSaved({
    agencyJson: { score: report('complete', 88, 'B', '0.9.0'), evidence: evidence(), batch: { agencyDurationMs: 31000 } },
    discovery: { picked: [{ domain: 'client.example' }], needs_manual: true },
    clientJsons: [{ site: 'client.example', score: report('partial', 61, 'C', '0.9.0'), evidence: evidence({ unverified: ['llmsTxt'] }) }],
  });
  assert.equal(stats.catalogVersion, '0.9.0');
  assert.equal(stats.needsManual, true);
  assert.equal(stats.durationMs, 31000);
  assert.deepEqual(stats.sites.map((site) => [site.status, site.score]), [['complete', 88], ['partial', 61]]);
  assert.deepEqual(stats.sites[1].unverifiedResources, ['llmsTxt']);
  assert.equal(statsFromSaved({ agencyJson: {}, discovery: null, clientJsons: [] }), null);

  // The aggregate keeps each report's catalog: two resumed 0.9.0 sites plus one fresh 1.0.0 site.
  assert.deepEqual(summarizeSites(stats.sites).reportCatalogVersions, { '0.9.0': 2 });
  const mixed = summarizeSites([...stats.sites, siteStat(report('complete', 90, 'A', '1.0.0'), evidence())]);
  assert.deepEqual(mixed.reportCatalogVersions, { '0.9.0': 2, '1.0.0': 1 });
});
