#!/usr/bin/env node
// CPU cost of the score engine over the recorded fixtures: p50 / p95 / max of
// evaluateSiteChecks (and scoreChecks) per fixture and overall, on this
// machine. Input to the week-2 gate (spec section 7.5): worker-side scoring
// stays off until the dashboard P99 and this number say it fits the CPU limit.
//
//   node scripts/measure-score-cpu.mjs [--iterations 50] [--fixtures <dir>]

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { evaluateSiteChecks, scoreChecks } from '../packages/core/dist/score/index.js';

function parseArgs(argv) {
  const args = { iterations: 50, fixtures: 'packages/core/test/fixtures/score' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--iterations') args.iterations = Number.parseInt(argv[++i], 10);
    else if (argv[i] === '--fixtures') args.fixtures = argv[++i];
    else if (argv[i] === '--help') {
      process.stdout.write('usage: node scripts/measure-score-cpu.mjs [--iterations 50] [--fixtures <dir>]\n');
      process.exit(0);
    } else {
      process.stderr.write(`measure-score-cpu: unknown argument ${argv[i]}\n`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(args.iterations) || args.iterations < 1) {
    process.stderr.write('measure-score-cpu: --iterations expects a positive integer\n');
    process.exit(2);
  }
  return args;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function round(value) {
  return Number(value.toFixed(2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.fixtures);
  const files = readdirSync(dir).filter(
    (file) => file.endsWith('.json') && !file.endsWith('.expected.json') && !file.startsWith('ora-')
  );
  const all = [];
  const rows = [];
  for (const file of files.sort()) {
    const evidence = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    const homepageBytes = evidence.homepage?.body ? Buffer.byteLength(evidence.homepage.body) : 0;
    // Warm-up, so JIT and regex compilation do not land in the sample.
    for (let i = 0; i < 3; i += 1) scoreChecks(evaluateSiteChecks(evidence));
    const evaluate = [];
    const score = [];
    for (let i = 0; i < args.iterations; i += 1) {
      const t0 = performance.now();
      const evaluation = evaluateSiteChecks(evidence);
      const t1 = performance.now();
      scoreChecks(evaluation);
      const t2 = performance.now();
      evaluate.push(t1 - t0);
      score.push(t2 - t1);
    }
    all.push(...evaluate);
    rows.push({
      fixture: file,
      homepageKB: Math.round(homepageBytes / 1024),
      evaluateP50: round(percentile(evaluate, 50)),
      evaluateP95: round(percentile(evaluate, 95)),
      evaluateMax: round(Math.max(...evaluate)),
      scoreP50: round(percentile(score, 50)),
      scoreP95: round(percentile(score, 95)),
    });
  }
  const summary = {
    node: process.version,
    iterations: args.iterations,
    fixtures: rows.length,
    evaluateMs: { p50: round(percentile(all, 50)), p95: round(percentile(all, 95)), max: round(Math.max(...all)) },
    perFixture: rows,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
