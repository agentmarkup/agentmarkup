#!/usr/bin/env node
// Live determinism and completion run over the seven-site fixture panel (spec
// section 9.4): collects every panel site `--runs` times, `--interval` seconds
// apart, through the audit collector and, with --worker, through a deployed
// checker worker; prints status, score, grade, elapsedMs, the unverified list,
// the per-check diff against each site's expected.json and the Ora comparison
// for agentmarkup.dev. Manual, never CI.
//
//   node scripts/score-panel.mjs [--runs 3] [--interval 600] [--worker https://<preview>.pages.dev] \
//     [--sites a.com,b.com] [--fixtures packages/core/test/fixtures/score] [--out <file.json>]
//
// Exit 1 on any false finding (a fail/partial the expected contract does not
// list), any score delta between complete runs of one site through one source,
// or a complete-run share under 95%.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectSiteEvidence } from '../packages/audit/dist/index.js';
import { evaluateSiteChecks, getCheckDefinition, scoreChecks } from '../packages/core/dist/score/index.js';

const DEFAULT_FIXTURES = 'packages/core/test/fixtures/score';
/** Mirrors test/score/ora-comparison.test.ts: known direction differences with a reason. */
const ORA_DOCUMENTED_DIFFERENCES = ['llms.modular', 'jsonld.same-as', 'jsonld.type-breadth'];

function usage(message) {
  // No message: --help, so the usage line goes to stdout and the exit code is 0.
  if (message) process.stderr.write(`score-panel: ${message}\n`);
  (message ? process.stderr : process.stdout).write('usage: node scripts/score-panel.mjs [--runs 3] [--interval 600] [--worker <url>] [--sites a,b] [--fixtures <dir>] [--out <file>]\n');
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const args = { runs: 3, interval: 600, worker: null, sites: null, fixtures: DEFAULT_FIXTURES, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runs') args.runs = Number.parseInt(argv[++i], 10);
    else if (arg === '--interval') args.interval = Number.parseFloat(argv[++i]);
    else if (arg === '--worker') args.worker = argv[++i];
    else if (arg === '--sites') args.sites = argv[++i].split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg === '--fixtures') args.fixtures = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--help') usage();
    else usage(`unknown argument ${arg}`);
  }
  if (!Number.isFinite(args.runs) || args.runs < 1) usage('--runs expects a positive integer');
  if (!Number.isFinite(args.interval) || args.interval < 0) usage('--interval expects seconds');
  return args;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function loadPanel(dir, only) {
  const panel = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.expected.json')) continue;
    const expected = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    if (only && !only.includes(expected.site)) continue;
    panel.push({ site: expected.site, expected });
  }
  if (only) {
    for (const site of only) {
      if (!panel.some((entry) => entry.site === site)) panel.push({ site, expected: null });
    }
  }
  return panel.sort((a, b) => a.site.localeCompare(b.site));
}

/** False findings = non-pass checks the contract does not list; drift = listed checks whose outcome moved. */
function diffAgainstExpected(report, expected) {
  if (!expected) return { falseFindings: [], drift: [], note: 'no expected.json for this site' };
  const falseFindings = [];
  const drift = [];
  for (const check of report.checks) {
    const listed = expected.nonPass?.[check.id];
    if (check.status === 'fail' || check.status === 'partial') {
      if (!listed) {
        falseFindings.push({ id: check.id, status: check.status, fraction: check.fraction, evidence: check.evidence });
      } else if (listed.status !== check.status || Math.abs((listed.fraction ?? 0) - (check.fraction ?? 0)) > 0.0005) {
        drift.push({ id: check.id, expected: `${listed.status} ${listed.fraction}`, actual: `${check.status} ${check.fraction}` });
      }
      continue;
    }
    if (listed) {
      drift.push({ id: check.id, expected: `${listed.status} ${listed.fraction}`, actual: check.status });
    } else if (check.status === 'unverified' && !(expected.unverified ?? []).includes(check.id)) {
      drift.push({ id: check.id, expected: 'pass or na', actual: 'unverified' });
    } else if (check.status === 'na' && !(expected.na ?? []).includes(check.id)) {
      drift.push({ id: check.id, expected: 'pass', actual: 'na' });
    }
  }
  return { falseFindings, drift, note: null };
}

function oraComparison(report, fixturesDir) {
  let ora;
  try {
    ora = JSON.parse(readFileSync(resolve(fixturesDir, 'ora-agentmarkup.dev.json'), 'utf8'));
  } catch {
    return { available: false };
  }
  const agree = [];
  const disagree = [];
  const documented = [];
  for (const check of report.checks) {
    if (!['pass', 'partial', 'fail'].includes(check.status)) continue;
    const counterpart = getCheckDefinition(check.id)?.oraCounterpart ?? '';
    const oraIds = counterpart.split(/[\s,]+/).filter((token) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token));
    const entries = oraIds.map((id) => ora.essentials.checks[id]).filter(Boolean);
    if (entries.length === 0) continue;
    const oraPass = entries.every((entry) => entry.fraction === 1);
    const ourPass = check.status === 'pass';
    if (oraPass === ourPass) agree.push(check.id);
    else if (ORA_DOCUMENTED_DIFFERENCES.includes(check.id)) documented.push(check.id);
    else disagree.push({ id: check.id, ours: check.status, ora: oraIds.join(',') });
  }
  return {
    available: true,
    essentialsScore: ora.essentials.score,
    ourScore: report.score,
    headlineWithin2: report.score !== null && Math.abs(report.score - ora.essentials.score) <= 2,
    agree: agree.length,
    documented,
    disagree,
  };
}

async function viaCollector(site) {
  const evidence = await collectSiteEvidence(site, {});
  return { evidence, report: scoreChecks(evaluateSiteChecks(evidence)), elapsedMs: evidence.fetchSummary.elapsedMs ?? null };
}

async function viaWorker(site, workerBase) {
  const url = new URL('/api/check', workerBase);
  url.searchParams.set('url', site);
  const started = Date.now();
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'agentmarkup-score-panel' } });
  const payload = await response.json();
  if (!response.ok) {
    return { evidence: null, report: null, elapsedMs: Date.now() - started, error: `${response.status} ${payload?.error?.code ?? ''} ${payload?.error?.message ?? ''}`.trim() };
  }
  return { evidence: payload, report: scoreChecks(evaluateSiteChecks(payload)), elapsedMs: payload.fetchSummary?.elapsedMs ?? Date.now() - started };
}

function summarize(entry) {
  const { report } = entry;
  if (!report) return `error ${entry.error}`;
  return `${report.analysisStatus} score ${report.score ?? 'n/a'} ${report.grade ?? ''} elapsed ${entry.elapsedMs} ms` +
    (report.unverifiedChecks.length ? ` unverified [${report.unverifiedChecks.join(', ')}]` : '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturesDir = resolve(args.fixtures);
  const panel = loadPanel(fixturesDir, args.sites);
  if (panel.length === 0) usage('no panel sites found');
  const sources = ['collector', ...(args.worker ? ['worker'] : [])];
  const results = [];
  const log = (line) => process.stdout.write(`${line}\n`);

  log(`score-panel: ${panel.length} sites, ${args.runs} run(s), ${args.interval} s apart, sources ${sources.join(' + ')}`);
  for (let run = 1; run <= args.runs; run += 1) {
    if (run > 1 && args.interval > 0) {
      log(`waiting ${args.interval} s before run ${run}`);
      await sleep(args.interval * 1000);
    }
    log(`run ${run} started ${new Date().toISOString()}`);
    for (const { site, expected } of panel) {
      for (const source of sources) {
        let entry;
        try {
          entry = source === 'worker' ? await viaWorker(`https://${site}/`, args.worker) : await viaCollector(`https://${site}/`);
        } catch (error) {
          entry = { evidence: null, report: null, elapsedMs: null, error: error instanceof Error ? error.message : String(error) };
        }
        const diff = entry.report ? diffAgainstExpected(entry.report, expected) : { falseFindings: [], drift: [], note: 'no report' };
        const ora = entry.report && site === 'agentmarkup.dev' ? oraComparison(entry.report, fixturesDir) : null;
        results.push({
          run,
          site,
          source,
          at: new Date().toISOString(),
          status: entry.report?.analysisStatus ?? 'error',
          score: entry.report?.score ?? null,
          grade: entry.report?.grade ?? null,
          raw: entry.report?.raw ?? null,
          elapsedMs: entry.elapsedMs,
          unverified: entry.report?.unverifiedChecks ?? [],
          unverifiedResources: entry.evidence?.fetchSummary?.unverified ?? [],
          samplePageUrl: entry.report?.samplePageUrl ?? null,
          error: entry.error ?? null,
          falseFindings: diff.falseFindings,
          drift: diff.drift,
          note: diff.note,
          ora,
          checks: entry.report ? entry.report.checks.map(({ id, status, fraction }) => ({ id, status, fraction })) : null,
        });
        log(`  ${site} [${source}] ${summarize(entry)}`);
        for (const finding of diff.falseFindings) log(`    FALSE FINDING ${finding.id} ${finding.status} ${finding.fraction}: ${finding.evidence}`);
        for (const moved of diff.drift) log(`    drift ${moved.id}: expected ${moved.expected}, got ${moved.actual}`);
        if (diff.note) log(`    note: ${diff.note}`);
        if (ora?.available) {
          log(`    ora: essentials ${ora.essentialsScore} vs ours ${ora.ourScore} (${ora.headlineWithin2 ? 'within 2' : 'OUTSIDE 2'}), ${ora.agree} agree, documented [${ora.documented.join(', ')}], disagree ${JSON.stringify(ora.disagree)}`);
        }
      }
    }
  }

  const falseFindingCount = results.reduce((sum, entry) => sum + entry.falseFindings.length, 0);
  const complete = results.filter((entry) => entry.status === 'complete').length;
  const completeShare = results.length ? complete / results.length : 0;
  const deltas = [];
  const groups = new Map();
  for (const entry of results) {
    if (entry.status !== 'complete') continue;
    const key = `${entry.site}|${entry.source}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  for (const [key, entries] of groups) {
    const scores = new Set(entries.map((entry) => entry.score));
    if (scores.size > 1) {
      const changed = new Set();
      const first = entries[0].checks ?? [];
      for (const other of entries.slice(1)) {
        for (const check of other.checks ?? []) {
          const base = first.find((candidate) => candidate.id === check.id);
          if (!base || base.status !== check.status || base.fraction !== check.fraction) changed.add(check.id);
        }
      }
      deltas.push({ key, scores: [...scores], changedChecks: [...changed] });
    }
  }
  const oraHeadlineOk = results.every((entry) => !entry.ora?.available || entry.ora.headlineWithin2);
  const summary = {
    runs: args.runs,
    sites: panel.map((entry) => entry.site),
    sources,
    results: results.length,
    complete,
    completeShare: Number(completeShare.toFixed(4)),
    falseFindings: falseFindingCount,
    scoreDeltasBetweenCompleteRuns: deltas,
    oraHeadlineWithin2: oraHeadlineOk,
    p95ElapsedMs: percentile(results.map((entry) => entry.elapsedMs).filter((value) => typeof value === 'number'), 95),
  };
  log('');
  log(`summary: ${complete}/${results.length} complete (${(completeShare * 100).toFixed(1)}%), ${falseFindingCount} false finding(s), ${deltas.length} site/source pair(s) with a score delta between complete runs, p95 elapsed ${summary.p95ElapsedMs} ms`);
  for (const delta of deltas) log(`  delta ${delta.key}: scores ${delta.scores.join(' / ')} changed checks [${delta.changedChecks.join(', ')}]`);
  if (args.out) {
    writeFileSync(resolve(args.out), `${JSON.stringify({ summary, results }, null, 2)}\n`);
    log(`wrote ${resolve(args.out)}`);
  }
  const failed = falseFindingCount > 0 || deltas.length > 0 || completeShare < 0.95 || !oraHeadlineOk;
  process.exit(failed ? 1 : 0);
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

main().catch((error) => {
  process.stderr.write(`score-panel: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
