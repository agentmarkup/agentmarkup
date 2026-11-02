// Unit checks for the batch scripts' shared libraries (scripts/lib/). Plain .mjs
// for the same reason as claude-plugin.test.mjs, and nothing here imports a
// built workspace package, so it runs before `pnpm build`. Never writes files.

import test from 'node:test';
import assert from 'node:assert/strict';

import { optionValue } from '../scripts/lib/args.mjs';
import {
  applyClientClaims,
  discoverySkipNote,
  discoverySummaryLines,
  emptyDiscovery,
  manualDiscovery,
  manualDiscoveryWithClaims,
  seedClientClaims,
} from '../scripts/lib/batch-discovery.mjs';
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

const OPTIONS = { maxClients: 3, maxFetches: 12 };

function discovered(picks, extra = {}) {
  return {
    ...emptyDiscovery('agency.example', { note: null, maxFetches: 12 }),
    picked: picks,
    fetches: 7,
    needs_manual: picks.length < 3,
    needs_manual_reasons: picks.length < 3 ? ['too-few-picks'] : [],
    ...extra,
  };
}

test('discovery: skipped and manual payloads carry the full discovery.json shape', () => {
  const skipped = emptyDiscovery('agency.example', { note: 'agency homepage could not be read; discovery skipped', maxFetches: 12 });
  assert.deepEqual(Object.keys(skipped), [
    'agency', 'pagesFetched', 'candidates', 'excluded', 'picked', 'liveness', 'fetches', 'maxFetches', 'shared_with',
    'needs_manual', 'needs_manual_reasons', 'note',
  ]);
  assert.deepEqual([skipped.fetches, skipped.needs_manual, skipped.needs_manual_reasons], [0, true, ['discovery-skipped']]);

  const manual = manualDiscovery('agency.example', ['a', 'b', 'c', 'd'].map((name) => ({ domain: `${name}.example`, url: `https://${name}.example/`, source: 'manual' })), OPTIONS);
  assert.deepEqual(manual.picked.map((pick) => [pick.domain, pick.signals]), [['a.example', ['manual']], ['b.example', ['manual']], ['c.example', ['manual']]]);
  assert.deepEqual([manual.needs_manual, manual.needs_manual_reasons, manual.note], [false, [], 'clients taken from the --manual list']);
  assert.deepEqual(manualDiscovery('agency.example', [{ domain: 'a.example' }], OPTIONS).needs_manual_reasons, ['too-few-picks']);
});

test('discovery: a claim result drops shared picks, records shared_with and recomputes needs_manual', () => {
  const picks = [{ domain: 'one.example' }, { domain: 'two.example' }, { domain: 'three.example' }];
  const kept = applyClientClaims(discovered(picks), { picks, shared: [] }, OPTIONS);
  assert.deepEqual([kept.picked.length, kept.shared_with, kept.needs_manual, kept.needs_manual_reasons], [3, [], false, []]);

  const dropped = applyClientClaims(
    discovered(picks),
    { picks: picks.slice(1), shared: [{ domain: 'one.example', shared_with: 'first.example' }] },
    OPTIONS
  );
  assert.deepEqual(dropped.picked.map((pick) => pick.domain), ['two.example', 'three.example']);
  assert.deepEqual(dropped.shared_with, [{ domain: 'one.example', shared_with: 'first.example' }]);
  assert.deepEqual([dropped.needs_manual, dropped.needs_manual_reasons], [true, ['too-few-picks', 'shared-client']]);
  assert.equal(dropped.fetches, 7);

  // Reasons the discovery already had stay, in order.
  const stopped = applyClientClaims(
    discovered([picks[0]], { needs_manual_reasons: ['too-few-picks', 'fetch-budget'] }),
    { picks: [], shared: [{ domain: 'one.example', shared_with: 'first.example' }] },
    OPTIONS
  );
  assert.deepEqual(stopped.needs_manual_reasons, ['too-few-picks', 'fetch-budget', 'shared-client']);
});

// A stand-in for @agentmarkup/audit's registrableDomain, enough for .example names.
const lastTwoLabels = (host) => host.split('.').slice(-2).join('.');

test('discovery: the summary section names blocked sites, shared clients, fetches and escapes site strings', () => {
  const lines = discoverySummaryLines(
    {
      ...discovered(
        [
          { domain: 'open.example', score: 7, signals: ['portfolio-page', 'credit-back'], source: 'discovery', alive: 'yes' },
          { domain: 'guarded.example', score: 5, signals: ['portfolio-page'], source: 'discovery', alive: 'blocked' },
        ],
        { needs_manual_reasons: ['too-few-picks', 'shared-client'] }
      ),
      shared_with: [{ domain: 'net_work.example', shared_with: 'first.example' }],
      excluded: [{ domain: 'vendor.example', reason: 'site-wide' }],
      liveness: [
        { domain: 'guarded.example', alive: 'blocked', status: 429, accepted: true, finalUrl: 'https://guarded.example/' },
        { domain: 'late.example', alive: 'unchecked', status: null, accepted: false, reason: 'fetch-budget' },
      ],
    },
    { maxClients: 3, registrableDomain: lastTwoLabels }
  );
  const text = lines.join('\n');
  assert.match(text, /Picked 2 client site\(s\); needs manual review \(fewer than 3 confirmed: too-few-picks, shared-client\)\./);
  assert.match(text, /Discovery fetches: 7 of 12\./);
  assert.match(text, /guarded\.example \(score 5, portfolio-page, discovery; the site blocks bots \(HTTP 429\), so its audit may be blocked too\)/);
  assert.doesNotMatch(text, /open\.example[^\n]*blocks bots/);
  assert.match(text, /Shared with another agency in this run \(first claim wins\): net\\_work\.example \(claimed by first\.example\)/);
  assert.match(text, /Excluded candidates: vendor\.example \(site-wide\)/);
  assert.match(text, /Liveness rejected: late\.example \(fetch-budget\)/);
});

test('discovery: a blocked pick shows its own liveness status, matched by final-URL domain, not by substring', () => {
  const lines = discoverySummaryLines(
    discovered(
      [
        { domain: 'site.example', score: 5, signals: ['portfolio-page'], source: 'discovery', alive: 'blocked' },
        { domain: 'new.example', score: 4, signals: ['portfolio-page'], source: 'discovery', alive: 'blocked' },
      ],
      {
        liveness: [
          // Listed first, and its final URL contains "site.example" as a substring.
          { domain: 'mysite.example', alive: 'blocked', status: 429, accepted: true, finalUrl: 'https://mysite.example/' },
          { domain: 'site.example', alive: 'blocked', status: 403, accepted: true, finalUrl: 'https://site.example/' },
          // A candidate that redirected: its pick carries the final domain.
          { domain: 'old.example', alive: 'blocked', status: 429, accepted: true, finalUrl: 'https://www.new.example/' },
        ],
      }
    ),
    { maxClients: 3, registrableDomain: lastTwoLabels }
  );
  const text = lines.join('\n');
  assert.match(text, /site\.example \(score 5, portfolio-page, discovery; the site blocks bots \(HTTP 403\)/);
  assert.match(text, /new\.example \(score 4, portfolio-page, discovery; the site blocks bots \(HTTP 429\)/);
});

// The claimClientDomains contract from @agentmarkup/audit (first claim wins, the same
// agency keeps its own claims, the input registry is not modified), restated here
// because this file runs before the workspace packages are built.
function claimStub(picks, registry, agency) {
  const next = new Map(registry);
  const kept = [];
  const shared = [];
  for (const pick of picks) {
    const owner = next.get(pick.domain);
    if (owner !== undefined && owner !== agency) {
      shared.push({ domain: pick.domain, shared_with: owner });
      continue;
    }
    next.set(pick.domain, agency);
    kept.push(pick);
  }
  return { picks: kept, shared, registry: next };
}

const manualPick = (domain) => ({ domain, url: `https://${domain}/`, source: 'manual' });

test('claims: resumed picks claim first, then --manual lists in row order; a manual collision is dropped like a discovered one', () => {
  const agencies = ['resumed.example', 'first.example', 'second.example', 'third.example'];
  const resumedPicks = new Map([['resumed.example', [{ domain: 'held.example' }]]]);
  const manualPicks = new Map([
    // A resumed agency is not processed again, so its manual list is not claimed twice.
    ['resumed.example', [manualPick('ignored.example')]],
    ['first.example', [manualPick('shared.example'), manualPick('own.example')]],
    ['second.example', [manualPick('shared.example'), manualPick('held.example'), manualPick('b1.example'), manualPick('b2.example'), manualPick('b3.example')]],
  ]);
  const { registry, manualClaims } = seedClientClaims({ agencies, resumedPicks, manualPicks, maxClients: 3 }, claimStub);

  assert.deepEqual([...registry], [
    ['held.example', 'resumed.example'],
    ['shared.example', 'first.example'],
    ['own.example', 'first.example'],
    ['b1.example', 'second.example'],
    ['b2.example', 'second.example'],
    ['b3.example', 'second.example'],
  ]);
  assert.equal(manualClaims.has('resumed.example'), false);
  assert.equal(manualClaims.has('third.example'), false);

  const first = manualDiscoveryWithClaims('first.example', manualClaims.get('first.example'), OPTIONS);
  assert.deepEqual(first.picked.map((pick) => [pick.domain, pick.signals]), [['shared.example', ['manual']], ['own.example', ['manual']]]);
  assert.deepEqual([first.shared_with, first.needs_manual_reasons], [[], ['too-few-picks']]);

  // The second list loses the client the first list named and the one the resumed agency holds,
  // then fills its three slots from the rest of its list.
  const second = manualDiscoveryWithClaims('second.example', manualClaims.get('second.example'), OPTIONS);
  assert.deepEqual(second.picked.map((pick) => pick.domain), ['b1.example', 'b2.example', 'b3.example']);
  assert.deepEqual(second.shared_with, [
    { domain: 'shared.example', shared_with: 'first.example' },
    { domain: 'held.example', shared_with: 'resumed.example' },
  ]);
  assert.deepEqual([second.needs_manual, second.needs_manual_reasons], [false, []]);

  // Without spare entries the drop leaves the list short: shared-client joins the reasons.
  const short = seedClientClaims(
    { agencies: ['a.example', 'b.example'], resumedPicks: new Map(), manualPicks: new Map([['a.example', [manualPick('x.example')]], ['b.example', [manualPick('x.example')]]]), maxClients: 3 },
    claimStub
  );
  const loser = manualDiscoveryWithClaims('b.example', short.manualClaims.get('b.example'), OPTIONS);
  assert.deepEqual(loser.picked, []);
  assert.deepEqual(loser.shared_with, [{ domain: 'x.example', shared_with: 'a.example' }]);
  assert.deepEqual(loser.needs_manual_reasons, ['too-few-picks', 'shared-client']);
});

test('discovery gate: skips only an unreadable homepage or a client shell, not a thin server-rendered page', () => {
  const homepage = { outcome: 'ok', body: '<html><body><a href="/portfolio/">Portfolio</a></body></html>' };
  const noJs = (extra) => ({ analysisStatus: 'complete', checks: [{ id: 'content.no-js', status: 'fail', fraction: 0, ...extra }] });
  assert.equal(discoverySkipNote(noJs({}), homepage), null);
  assert.equal(discoverySkipNote(noJs({ status: 'partial', fraction: 0.5 }), homepage), null);
  assert.match(discoverySkipNote(noJs({ sentenceVariant: 'client-shell' }), homepage), /JavaScript shell/);
  assert.match(discoverySkipNote({ analysisStatus: 'blocked', checks: [] }, homepage), /could not be read/);
  assert.match(discoverySkipNote(noJs({}), { outcome: 'challenge', body: 'x' }), /could not be read/);
  assert.match(discoverySkipNote(noJs({}), { outcome: 'ok', body: '' }), /could not be read/);
});
