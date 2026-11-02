#!/usr/bin/env node
// Month-over-month diff of two batch-audit run directories: per-site score and
// grade delta and per-check outcome changes. Refuses to compare across catalog
// or formula major versions and skips provisional (partial) readings on either
// side, because only complete runs are honest readings.
//
//   node scripts/batch-diff.mjs --from <run dir> --to <run dir> [--json]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareReports, reportsComparable } from '../packages/core/dist/score/index.js';
import { optionValue } from './lib/args.mjs';

function usage(message) {
  // No message: --help, so the usage line goes to stdout and the exit code is 0.
  if (message) process.stderr.write(`batch-diff: ${message}\n`);
  (message ? process.stderr : process.stdout).write('usage: node scripts/batch-diff.mjs --from <dir> --to <dir> [--json]\n');
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const args = { from: null, to: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const taken = optionValue(argv, i, usage);
      i += 1;
      return taken;
    };
    if (arg === '--from') args.from = value();
    else if (arg === '--to') args.to = value();
    else if (arg === '--json') args.json = true;
    else if (arg === '--help') usage();
    else usage(`unknown argument ${arg}`);
  }
  if (!args.from || !args.to) usage('--from and --to are required');
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every scored site file of a run directory, keyed by its path relative to the run. */
function loadRun(dir) {
  const sites = new Map();
  if (!existsSync(dir)) usage(`${dir} does not exist`);
  for (const agency of readdirSync(dir, { withFileTypes: true })) {
    if (!agency.isDirectory()) continue;
    const agencyFile = join(dir, agency.name, 'agency.json');
    if (existsSync(agencyFile)) sites.set(agency.name, readJson(agencyFile));
    const clientsDir = join(dir, agency.name, 'clients');
    if (!existsSync(clientsDir)) continue;
    for (const file of readdirSync(clientsDir)) {
      if (file.endsWith('.json')) sites.set(`${agency.name}/${file.slice(0, -5)}`, readJson(join(clientsDir, file)));
    }
  }
  return sites;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = loadRun(resolve(args.from));
  const to = loadRun(resolve(args.to));
  const results = [];
  const skipped = [];
  const missing = [];

  for (const [key, current] of to) {
    const previous = from.get(key);
    if (!previous) {
      missing.push({ site: key, reason: 'not in --from' });
      continue;
    }
    if (!previous.score || !current.score) {
      skipped.push({ site: key, reason: 'no score report' });
      continue;
    }
    if (previous.provisional || current.provisional) {
      skipped.push({ site: key, reason: previous.provisional ? 'provisional in --from' : 'provisional in --to' });
      continue;
    }
    const versions = reportsComparable(previous.score, current.score);
    if (!versions.comparable) {
      process.stderr.write(`batch-diff: refusing to compare ${key}: ${versions.reason}\n`);
      process.exit(3);
    }
    const comparison = compareReports(previous.score, current.score);
    results.push({
      site: key,
      previousScore: previous.score.score,
      currentScore: current.score.score,
      scoreDelta: comparison.scoreDelta,
      previousGrade: comparison.previousGrade,
      currentGrade: comparison.currentGrade,
      samplePageChanged:
        (previous.score.samplePageUrl ?? null) !== (current.score.samplePageUrl ?? null)
          ? { from: previous.score.samplePageUrl ?? null, to: current.score.samplePageUrl ?? null }
          : null,
      changedChecks: comparison.changedChecks,
    });
  }
  for (const key of from.keys()) {
    if (!to.has(key)) missing.push({ site: key, reason: 'not in --to' });
  }

  const output = { from: args.from, to: args.to, compared: results.length, results, skipped, missing };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  const lines = [`batch-diff: ${args.from} -> ${args.to}`, ''];
  for (const result of results) {
    const delta = result.scoreDelta === null ? 'n/a' : result.scoreDelta > 0 ? `+${result.scoreDelta}` : String(result.scoreDelta);
    lines.push(`${result.site}: ${result.previousScore} ${result.previousGrade} -> ${result.currentScore} ${result.currentGrade} (${delta})`);
    if (result.samplePageChanged) {
      lines.push(`  sample page changed: ${result.samplePageChanged.from} -> ${result.samplePageChanged.to}`);
    }
    for (const change of result.changedChecks) {
      lines.push(`  ${change.id}: ${change.previousStatus} ${change.previousFraction ?? ''} -> ${change.currentStatus} ${change.currentFraction ?? ''}`);
    }
  }
  if (skipped.length > 0) {
    lines.push('', 'skipped:');
    for (const entry of skipped) lines.push(`  ${entry.site}: ${entry.reason}`);
  }
  if (missing.length > 0) {
    lines.push('', 'missing:');
    for (const entry of missing) lines.push(`  ${entry.site}: ${entry.reason}`);
  }
  lines.push('', `${results.length} site(s) compared, ${skipped.length} skipped, ${missing.length} missing`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
