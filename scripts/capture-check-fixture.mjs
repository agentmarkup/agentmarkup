#!/usr/bin/env node
// Records a SiteEvidence fixture (with bodies) through the audit collector, for
// packages/core/test/fixtures/score/<host>.json, or compares a live capture
// against an existing fixture.
//
//   node scripts/capture-check-fixture.mjs <url> [--out <file>] [--rerecord] [--compare <fixture>]
//
// --out defaults to packages/core/test/fixtures/score/<registrable domain>.json.
// An existing output file is never overwritten unless --rerecord is given.
// --compare diffs the live bodies against the fixture's and, when every body is
// unchanged, asserts a score delta of 0 (exit 1 otherwise). With --compare and
// no --out nothing is written.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSiteEvidence, registrableDomain } from '../packages/audit/dist/index.js';
import { evaluateSiteChecks, scoreChecks } from '../packages/core/dist/score/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCE_KEYS = [
  'homepage',
  'homepageMarkdown',
  'llmsTxt',
  'robotsTxt',
  'sitemap',
  'notFoundProbe',
  'samplePage',
  'samplePageMarkdown',
];

function usage(message) {
  // No message: --help, so the usage line goes to stdout and the exit code is 0.
  if (message) process.stderr.write(`capture-check-fixture: ${message}\n`);
  (message ? process.stderr : process.stdout).write('usage: node scripts/capture-check-fixture.mjs <url> [--out <file>] [--rerecord] [--compare <fixture>] [--sample <url>]\n');
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const args = { url: null, out: null, rerecord: false, compare: null, sample: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i];
    else if (arg === '--rerecord') args.rerecord = true;
    else if (arg === '--compare') args.compare = argv[++i];
    else if (arg === '--sample') args.sample = argv[++i];
    else if (arg === '--help') usage();
    else if (arg.startsWith('-')) usage(`unknown argument ${arg}`);
    else if (!args.url) args.url = arg;
    else usage('one url only');
  }
  if (!args.url) usage('missing <url>');
  return args;
}

function bodyOf(resource) {
  return resource && typeof resource.body === 'string' ? resource.body : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = args.compare ? JSON.parse(readFileSync(resolve(args.compare), 'utf8')) : null;
  const samplePageUrl = args.sample ?? fixture?.fetchSummary?.samplePageUrl ?? fixture?.samplePage?.requestedUrl ?? null;

  process.stderr.write(`capturing ${args.url} through the collector${samplePageUrl ? ` (sample page pinned to ${samplePageUrl})` : ''}\n`);
  const evidence = await collectSiteEvidence(args.url, { samplePageUrl });
  const report = scoreChecks(evaluateSiteChecks(evidence));
  process.stderr.write(
    `status ${evidence.fetchSummary.analysisStatus}, score ${report.score ?? 'n/a'} ${report.grade ?? ''}, ${evidence.fetchSummary.fetches} fetches in ${evidence.fetchSummary.elapsedMs} ms${evidence.fetchSummary.unverified.length ? `, unverified: ${evidence.fetchSummary.unverified.join(', ')}` : ''}\n`
  );

  let exitCode = 0;
  if (fixture) {
    const previousReport = scoreChecks(evaluateSiteChecks(fixture));
    const diff = [];
    let bodiesChanged = false;
    for (const key of RESOURCE_KEYS) {
      const before = bodyOf(fixture[key]);
      const after = bodyOf(evidence[key]);
      const same = before === after;
      if (!same) bodiesChanged = true;
      diff.push({
        resource: key,
        same,
        fixtureStatus: fixture[key]?.status ?? null,
        liveStatus: evidence[key]?.status ?? null,
        fixtureBytes: before === null ? null : before.length,
        liveBytes: after === null ? null : after.length,
        fixtureOutcome: fixture[key]?.outcome ?? null,
        liveOutcome: evidence[key]?.outcome ?? null,
      });
    }
    const delta = (report.score ?? 0) - (previousReport.score ?? 0);
    const summary = {
      compare: args.compare,
      bodiesChanged,
      fixtureScore: previousReport.score,
      liveScore: report.score,
      scoreDelta: delta,
      fixtureStatus: previousReport.analysisStatus,
      liveStatus: report.analysisStatus,
      resources: diff,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!bodiesChanged && delta !== 0) {
      process.stderr.write(`capture-check-fixture: bodies unchanged but the score moved by ${delta}: the engine is not deterministic over this input\n`);
      exitCode = 1;
    }
  }

  if (args.out || !fixture) {
    const host = new URL(evidence.homepage.finalUrl || evidence.targetUrl).hostname;
    const out = resolve(args.out ?? resolve(repoRoot, 'packages/core/test/fixtures/score', `${registrableDomain(host)}.json`));
    if (existsSync(out) && !args.rerecord) {
      process.stderr.write(`capture-check-fixture: ${out} exists; pass --rerecord to replace it (every verified note must then be re-read)\n`);
      process.exit(2);
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(evidence, null, 1)}\n`);
    process.stderr.write(`wrote ${out}\n`);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  process.stderr.write(`capture-check-fixture: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
