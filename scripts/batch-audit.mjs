#!/usr/bin/env node
// Batch agent-readiness audit over the lead CSV: one agency plus up to three of
// its client sites, scored locally with @agentmarkup/audit's collector and
// @agentmarkup/core/score. Never calls /api/check (no Pages invocations, no D1
// writes), never commits, writes only under --out.
//
//   node scripts/batch-audit.mjs --csv <lead csv> --filter final_score=5 \
//     [--reason "portfolio/case studies"] --limit 20 --out planning-docs/batch/<date> \
//     [--agencies-parallel 3] [--resume] [--manual <csv>] [--sample-pins <previous run dir>] \
//     [--urls a.com,b.com]
//
// Build first: pnpm -C packages/audit build (the script imports the built dist).
// Politeness: 4 in-flight requests per site, a 1 s gap between request starts
// per hostname (shared across agencies), 25 s per site, 30 requests per site,
// and client discovery at most 12 requests and 40 s per agency (portfolio
// pages and client liveness checks included),
// User-Agent agentmarkup-checker/<version> (+https://agentmarkup.dev; batch).
//
// Client claims, first claim wins across the run (no client is audited for two
// agencies): (1) under --resume, the picks of every agency already finished on
// disk, since its files are not rewritten; (2) the --manual list of each other
// agency, in CSV row order, one client at a time until three are kept, so a
// client another agency already holds is dropped with a shared_with note and the
// next listed client takes its place; (3) discovered picks, in the order the
// agencies finish discovery. A dropped pick that leaves fewer than three adds
// the `shared-client` needs_manual reason. Steps 1 and 2 run in row order before
// any agency starts, so they never vary. Step 3 is first-finished-wins: with
// --agencies-parallel above 1, two runs over the same rows can attach a client
// both agencies link to different agencies; --agencies-parallel 1 makes it
// row order and deterministic.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLLECTOR_USER_AGENT,
  COLLECTOR_VERSION,
  DISCOVERY_DEFAULTS,
  canonicalizeAgencyUrl,
  claimClientDomains,
  collectSiteEvidence,
  createHostGate,
  createLimiter,
  discoverAgencyClients,
  refetchUnverified,
  registrableDomain,
  stripEvidenceBodies,
} from '../packages/audit/dist/index.js';
import {
  SCORE_CATALOG_VERSION,
  SCORE_FORMULA_VERSION,
  clientSentenceFor,
  evaluateSiteChecks,
  fixActionFor,
  getCheckDefinition,
  platformFixesApply,
  renderClientSummary,
  scoreChecks,
} from '../packages/core/dist/score/index.js';
import { optionValue } from './lib/args.mjs';
import {
  applyClientClaims,
  discoverySkipNote,
  discoverySummaryLines,
  emptyDiscovery,
  manualDiscoveryWithClaims,
  seedClientClaims,
} from './lib/batch-discovery.mjs';
import { readSavedAgency, siteStat, statsFromSaved, summarizeSites } from './lib/batch-summary.mjs';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';
import { bullets, md, table } from './lib/markdown.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MAX_CLIENTS = DISCOVERY_DEFAULTS.maxClients;
const DISCOVERY_OPTIONS = { maxClients: MAX_CLIENTS, maxFetches: DISCOVERY_DEFAULTS.maxFetches };
/** A finished run directory holds these; an ordinary rerun must not overwrite it. */
const FINISHED_RUN_FILES = ['run-summary.json', 'index.csv'];
const INDEX_HEADER = [
  'agency_domain',
  'agency_score',
  'agency_grade',
  'agency_status',
  'client1_domain',
  'client1_score',
  'client1_grade',
  'client2_domain',
  'client2_score',
  'client2_grade',
  'client3_domain',
  'client3_score',
  'client3_grade',
  'needs_manual',
  'unverified_checks',
  'unverified_resources',
  'duration_ms',
  'collected_at',
  'catalog_version',
];

function usage(message) {
  // No message: --help, so the usage line goes to stdout and the exit code is 0.
  if (message) process.stderr.write(`batch-audit: ${message}\n`);
  (message ? process.stderr : process.stdout).write(
    'usage: node scripts/batch-audit.mjs --csv <file> [--filter key=value ...] [--reason <text>] [--limit <n>] --out <dir> [--agencies-parallel <n>] [--resume] [--manual <csv>] [--sample-pins <dir>] [--urls a.com,b.com] [--host-gap-ms <ms>]\n'
  );
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const args = {
    csv: null,
    filters: [],
    reason: null,
    limit: null,
    out: null,
    agenciesParallel: 3,
    resume: false,
    manual: null,
    samplePins: null,
    urls: null,
    minGapMs: 1000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = optionValue(argv, i, usage);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--csv':
        args.csv = next();
        break;
      case '--filter':
        args.filters.push(next());
        break;
      case '--reason':
        args.reason = next();
        break;
      case '--limit':
        args.limit = Number.parseInt(next(), 10);
        break;
      case '--out':
        args.out = next();
        break;
      case '--agencies-parallel':
        args.agenciesParallel = Number.parseInt(next(), 10);
        break;
      case '--resume':
        args.resume = true;
        break;
      case '--manual':
        args.manual = next();
        break;
      case '--sample-pins':
        args.samplePins = next();
        break;
      case '--urls':
        args.urls = next()
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        break;
      case '--host-gap-ms':
        args.minGapMs = Number.parseInt(next(), 10);
        break;
      case '--help':
      case '-h':
        usage();
        break;
      default:
        usage(`unknown argument ${arg}`);
    }
  }
  if (!args.out) usage('--out is required');
  if (!args.csv && !args.urls) usage('--csv or --urls is required');
  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit < 1)) usage('--limit expects a positive integer');
  if (!Number.isFinite(args.agenciesParallel) || args.agenciesParallel < 1) usage('--agencies-parallel expects a positive integer');
  if (!Number.isFinite(args.minGapMs) || args.minGapMs < 0) usage('--host-gap-ms expects a non-negative integer');
  return args;
}

function readLeadRows(args) {
  if (args.urls) {
    return args.urls.map((website) => ({ website, name: website, reason: '', final_score: '' }));
  }
  const text = readFileSync(resolve(args.csv), 'utf8');
  const { rows } = parseCsv(text);
  let selected = rows;
  for (const filter of args.filters) {
    const [key, ...rest] = filter.split('=');
    const value = rest.join('=');
    selected = selected.filter((row) => (row[key] ?? '') === value);
  }
  if (args.reason) {
    const needle = args.reason.toLowerCase();
    selected = selected.filter((row) => (row.reason ?? '').toLowerCase().includes(needle));
  }
  selected = selected.filter((row) => (row.website ?? '').trim() !== '');
  return selected;
}

function readManual(path) {
  if (!path) return new Map();
  const { rows } = parseCsv(readFileSync(resolve(path), 'utf8'));
  const byAgency = new Map();
  for (const row of rows) {
    const agency = registrableDomain((row.agency_domain ?? '').trim());
    const client = (row.client_domain ?? '').trim();
    if (!agency || !client) continue;
    const list = byAgency.get(agency) ?? [];
    list.push({ domain: registrableDomain(client), url: canonicalizeAgencyUrl(client), source: row.source ?? 'manual' });
    byAgency.set(agency, list);
  }
  return byAgency;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function agencyKeyFor(canonicalUrl) {
  return registrableDomain(hostOf(canonicalUrl));
}

/** Previous run's pins and previous reports, keyed by site path relative to the run dir. */
function previousRun(dir) {
  const pins = new Map();
  const reports = new Map();
  if (!dir || !existsSync(dir)) return { pins, reports };
  for (const agency of readdirSync(dir, { withFileTypes: true })) {
    if (!agency.isDirectory()) continue;
    const agencyFile = join(dir, agency.name, 'agency.json');
    const agencyJson = readJson(agencyFile);
    if (agencyJson?.score) {
      pins.set(agency.name, agencyJson.score.samplePageUrl ?? null);
      if (!agencyJson.provisional) reports.set(agency.name, agencyJson.score);
    }
    const clientsDir = join(dir, agency.name, 'clients');
    if (!existsSync(clientsDir)) continue;
    for (const file of readdirSync(clientsDir)) {
      if (!file.endsWith('.json')) continue;
      const clientJson = readJson(join(clientsDir, file));
      if (!clientJson?.score) continue;
      const key = `${agency.name}/${file.slice(0, -'.json'.length)}`;
      pins.set(key, clientJson.score.samplePageUrl ?? null);
      if (!clientJson.provisional) reports.set(key, clientJson.score);
    }
  }
  return { pins, reports };
}

async function collectAndScore(url, options) {
  const startedAt = Date.now();
  let evidence = await collectSiteEvidence(url, options);
  if (evidence.fetchSummary.analysisStatus !== 'complete') {
    evidence = await refetchUnverified(evidence, { ...options, attempts: 2, waitMs: 20_000 });
  }
  const evaluation = evaluateSiteChecks(evidence);
  const score = scoreChecks(evaluation);
  return {
    evidence,
    score,
    provisional: score.analysisStatus !== 'complete',
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Agency -> client discovery (spec 8.2); returns the discovery.json payload.
 * The fetching and ranking live in @agentmarkup/audit's discoverAgencyClients
 * (12 fetches and 40 s per agency); this keeps the gates that skip it.
 */
async function discoverClients(agencyRun, agencyDomain, collectOptions) {
  const { evidence, score } = agencyRun;
  const homepage = evidence.homepage;
  const skipNote = discoverySkipNote(score, homepage);
  if (skipNote) return emptyDiscovery(agencyDomain, { note: skipNote, maxFetches: DISCOVERY_OPTIONS.maxFetches });
  return discoverAgencyClients(
    {
      agencyDomain,
      homepageUrl: homepage.finalUrl || evidence.targetUrl,
      homepageStatus: homepage.status,
      homepageHtml: homepage.body,
      sitemapXml: evidence.sitemap?.outcome === 'ok' ? evidence.sitemap.body : null,
    },
    collectOptions
  );
}

function siteRow(label, domain, run) {
  const { score } = run;
  const buckets = new Map();
  for (const check of score.checks) {
    if (!['pass', 'partial', 'fail'].includes(check.status)) continue;
    const bucket = getCheckDefinition(check.id)?.bucket ?? 'other';
    const entry = buckets.get(bucket) ?? { pass: 0, total: 0 };
    entry.total += 1;
    if (check.status === 'pass') entry.pass += 1;
    buckets.set(bucket, entry);
  }
  const bucketText = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, entry]) => `${bucket} ${entry.pass}/${entry.total}`)
    .join(', ');
  const fixes = score.topFixes
    .slice(0, 3)
    .map((fix) => `${md(fix.id)} (+${fix.estGain ?? 0})`)
    .join(', ');
  return [
    md(label),
    md(domain),
    score.score === null ? 'n/a' : String(score.score),
    md(score.grade ?? 'n/a'),
    score.raw === null ? 'n/a' : String(score.raw),
    md(score.analysisStatus) + (run.provisional ? ' (provisional)' : ''),
    md(bucketText),
    fixes || '-',
  ];
}

/**
 * One care-plan line: the client sentence and fix line from core's check copy, so
 * a partial result or a bot-challenge answer reads as it does in the client
 * summary. The platform recipe applies only when no bot challenge decided the
 * result; a recipe of `same` (or none) falls back to the catalog action.
 */
function platformFixLine(check, platform) {
  const definition = getCheckDefinition(check.id);
  if (!definition) return '';
  const recipe = platform && platformFixesApply(check) ? (definition.fixes[platform] ?? null) : null;
  const fix = recipe && recipe !== 'same' ? recipe : (fixActionFor(check) ?? definition.action);
  const tag = recipe ? `[${md(platform)}] ` : '';
  return `${md(definition.name)} (${md(check.id)}): ${md(clientSentenceFor(check))} ${tag}${md(fix)}`;
}

function renderSummary({ agencyDomain, agencyRun, clientRuns, discovery, generatedAt }) {
  const lines = [];
  const agencyScore = agencyRun.score;
  lines.push(`# ${md(agencyDomain)}: agent-readiness summary`);
  lines.push('');
  lines.push(
    agencyScore.score === null
      ? `Agency site: no score (we could not reach the site in time; re-run).`
      : `Agency site: **${agencyScore.score}/100, grade ${md(agencyScore.grade)}** (${md(agencyScore.label)})${agencyRun.provisional ? ', provisional' : ''}.`
  );
  lines.push('');
  lines.push('## Sites');
  lines.push('');
  const rows = [siteRow('agency', agencyDomain, agencyRun)];
  for (const client of clientRuns) {
    rows.push(siteRow('client', client.domain, client.run));
  }
  lines.push(table(['role', 'site', 'score', 'grade', 'raw', 'status', 'buckets (pass/eligible)', 'top 3 fixes (est. gain)'], rows));
  lines.push('');
  lines.push('## First month on the care plan');
  lines.push('');
  const seen = new Set();
  const planItems = [];
  for (const client of clientRuns) {
    for (const fix of client.run.score.topFixes) {
      if (seen.has(fix.id)) continue;
      seen.add(fix.id);
      planItems.push(platformFixLine(fix, client.run.score.platform));
    }
  }
  lines.push(planItems.length > 0 ? bullets(planItems) : 'No client site was scored, so there is no plan yet.');
  lines.push('');
  const recheck = [];
  const sites = [{ domain: agencyDomain, run: agencyRun }, ...clientRuns.map((client) => ({ domain: client.domain, run: client.run }))];
  for (const site of sites) {
    for (const id of site.run.score.unverifiedChecks) {
      recheck.push(`${md(site.domain)}: ${md(id)} could not be verified in time`);
    }
    // A resource can be unverified with no unverified check (a timed-out
    // sample page), and it still makes the reading provisional.
    for (const key of site.run.score.unverifiedResources ?? []) {
      recheck.push(`${md(site.domain)}: the ${md(key)} fetch did not complete in time`);
    }
  }
  if (recheck.length > 0) {
    lines.push('## Re-check');
    lines.push('');
    lines.push(bullets(recheck));
    lines.push('');
  }
  lines.push('## Discovery');
  lines.push('');
  lines.push(...discoverySummaryLines(discovery, { maxClients: MAX_CLIENTS, registrableDomain }));
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`Generated ${md(generatedAt)} by @agentmarkup/audit ${md(COLLECTOR_VERSION)}, catalog ${md(SCORE_CATALOG_VERSION)}, formula ${md(SCORE_FORMULA_VERSION)}. Methodology: https://agentmarkup.dev/score/`);
  lines.push('');
  return lines.join('\n');
}

async function processAgency(row, context) {
  const { args, outDir, hostGate, previous, claims, log } = context;
  const startedAt = Date.now();
  const collectedAt = new Date().toISOString();
  let canonicalUrl;
  try {
    canonicalUrl = canonicalizeAgencyUrl(row.website);
  } catch {
    return { agencyDomain: row.website, error: 'invalid website URL', row: null };
  }
  const agencyDomain = agencyKeyFor(canonicalUrl);
  const agencyDir = join(outDir, agencyDomain);
  if (args.resume && isFinishedAgency(outDir, agencyDomain)) {
    log(`skip ${agencyDomain} (resume)`);
    const saved = readSavedAgency(agencyDir);
    const stats = statsFromSaved(saved);
    if (!stats) return { agencyDomain, error: 'resumed agency.json holds no score report', row: null };
    return { agencyDomain, resumed: true, row: rowFromSaved(saved, agencyDomain), stats };
  }

  const collectOptions = { hostGate, minGapMs: args.minGapMs };
  log(`agency ${agencyDomain}: collecting ${canonicalUrl}`);
  const agencyRun = await collectAndScore(canonicalUrl, {
    ...collectOptions,
    samplePageUrl: previous.pins.get(agencyDomain) ?? null,
  });
  log(`agency ${agencyDomain}: ${agencyRun.score.analysisStatus} score ${agencyRun.score.score ?? 'n/a'} in ${agencyRun.durationMs} ms`);

  let discovery;
  const manualClaim = claims.manual.get(agencyDomain);
  if (manualClaim) {
    // Claimed in main() before any discovery (see the header for the order).
    discovery = manualDiscoveryWithClaims(agencyDomain, manualClaim, DISCOVERY_OPTIONS);
    for (const entry of manualClaim.shared) {
      log(`agency ${agencyDomain}: manual ${entry.domain} already claimed by ${entry.shared_with}; dropped`);
    }
  } else {
    const discovered = await discoverClients(agencyRun, agencyDomain, collectOptions);
    // First claim wins across the run. Read and written with no await in
    // between, so agencies finishing discovery in parallel cannot both claim
    // one client.
    const claim = claimClientDomains(discovered.picked, claims.registry, agencyDomain);
    claims.registry = claim.registry;
    discovery = applyClientClaims(discovered, claim, DISCOVERY_OPTIONS);
    for (const entry of claim.shared) {
      log(`agency ${agencyDomain}: ${entry.domain} already claimed by ${entry.shared_with}; dropped`);
    }
  }
  log(`agency ${agencyDomain}: ${discovery.picked.length} client(s) picked${discovery.note ? ` (${discovery.note})` : ''}`);

  const clientRuns = [];
  for (const pick of discovery.picked) {
    const key = `${agencyDomain}/${pick.domain}`;
    log(`client ${pick.domain}: collecting ${pick.url}`);
    const run = await collectAndScore(pick.url, {
      ...collectOptions,
      samplePageUrl: previous.pins.get(key) ?? null,
    });
    log(`client ${pick.domain}: ${run.score.analysisStatus} score ${run.score.score ?? 'n/a'} in ${run.durationMs} ms`);
    clientRuns.push({ domain: pick.domain, pick, run });
  }

  const durationMs = Date.now() - startedAt;
  writeJson(join(agencyDir, 'agency.json'), {
    site: agencyDomain,
    inputUrl: row.website,
    canonicalUrl,
    lead: { name: row.name ?? '', final_score: row.final_score ?? '', reason: row.reason ?? '' },
    provisional: agencyRun.provisional,
    score: agencyRun.score,
    evidence: stripEvidenceBodies(agencyRun.evidence),
    batch: { collectedAt, durationMs: agencyRun.durationMs, agencyDurationMs: durationMs, collectorVersion: COLLECTOR_VERSION },
  });
  for (const client of clientRuns) {
    writeJson(join(agencyDir, 'clients', `${client.domain}.json`), {
      site: client.domain,
      agency: agencyDomain,
      pick: client.pick,
      provisional: client.run.provisional,
      score: client.run.score,
      evidence: stripEvidenceBodies(client.run.evidence),
      batch: { collectedAt, durationMs: client.run.durationMs, collectorVersion: COLLECTOR_VERSION },
    });
    const previousReport = previous.reports.get(`${agencyDomain}/${client.domain}`) ?? null;
    writeFileSync(
      join(agencyDir, 'clients', `${client.domain}.client-summary.txt`),
      `${renderClientSummary(client.run.score, { siteName: client.domain, previous: previousReport })}\n`
    );
  }
  writeJson(join(agencyDir, 'discovery.json'), discovery);
  writeFileSync(
    join(agencyDir, 'summary.md'),
    renderSummary({ agencyDomain, agencyRun, clientRuns, discovery, generatedAt: new Date().toISOString() })
  );

  const indexRow = buildIndexRow({ agencyDomain, agencyRun, clientRuns, discovery, durationMs, collectedAt });
  return {
    agencyDomain,
    row: indexRow,
    stats: {
      sites: [agencyRun, ...clientRuns.map((client) => client.run)].map((run) => siteStat(run.score, run.evidence)),
      needsManual: discovery.needs_manual,
      durationMs,
    },
  };
}

function buildIndexRow({ agencyDomain, agencyRun, clientRuns, discovery, durationMs, collectedAt }) {
  const row = [
    agencyDomain,
    agencyRun.score.score ?? '',
    agencyRun.score.grade ?? '',
    agencyRun.score.analysisStatus,
  ];
  for (let i = 0; i < MAX_CLIENTS; i += 1) {
    const client = clientRuns[i];
    row.push(client ? client.domain : '', client ? (client.run.score.score ?? '') : '', client ? (client.run.score.grade ?? '') : '');
  }
  const runs = [agencyRun, ...clientRuns.map((client) => client.run)];
  const unverifiedChecks = runs.reduce((sum, run) => sum + run.score.unverifiedChecks.length, 0);
  // A run can be partial with zero unverified checks (a timed-out sample page),
  // so the unverified resources get their own column.
  const unverifiedResources = runs.reduce((sum, run) => sum + (run.score.unverifiedResources ?? []).length, 0);
  // The report's own catalog version: a resumed row keeps the version it was scored under.
  row.push(discovery.needs_manual ? 'true' : 'false', unverifiedChecks, unverifiedResources, durationMs, collectedAt, agencyRun.score.catalogVersion ?? SCORE_CATALOG_VERSION);
  return row;
}

/** Rebuilds the index row of a finished agency directory (for --resume). */
function rowFromSaved(saved, agencyDomain) {
  const { agencyJson } = saved;
  const discovery = saved.discovery ?? { picked: [], needs_manual: true };
  if (!agencyJson?.score) return null;
  const clientRuns = [];
  for (const clientJson of saved.clientJsons) {
    if (clientJson?.score) clientRuns.push({ domain: clientJson.site, run: { score: clientJson.score, provisional: clientJson.provisional } });
  }
  return buildIndexRow({
    agencyDomain,
    agencyRun: { score: agencyJson.score, provisional: agencyJson.provisional },
    clientRuns,
    discovery,
    durationMs: agencyJson.batch?.agencyDurationMs ?? '',
    collectedAt: agencyJson.batch?.collectedAt ?? '',
  });
}

/** An agency directory a previous run finished (summary.md and agency.json both written). */
function isFinishedAgency(outDir, agencyDomain) {
  const agencyDir = join(outDir, agencyDomain);
  return existsSync(join(agencyDir, 'summary.md')) && existsSync(join(agencyDir, 'agency.json'));
}

/**
 * Client claims made before any discovery runs, in the order the header states:
 * finished agencies' picks under --resume, then --manual lists in row order.
 * Rows with an invalid website are skipped here; processAgency reports them.
 */
function initialClaims(rows, { args, outDir, manual }) {
  const agencies = [];
  for (const row of rows) {
    try {
      agencies.push(agencyKeyFor(canonicalizeAgencyUrl(row.website)));
    } catch {
      // invalid website URL
    }
  }
  const resumedPicks = new Map();
  if (args.resume) {
    for (const agencyDomain of agencies) {
      if (!isFinishedAgency(outDir, agencyDomain)) continue;
      resumedPicks.set(agencyDomain, readSavedAgency(join(outDir, agencyDomain)).discovery?.picked ?? []);
    }
  }
  const { registry, manualClaims } = seedClientClaims(
    { agencies, resumedPicks, manualPicks: manual, maxClients: MAX_CLIENTS },
    claimClientDomains
  );
  return { registry, manual: manualClaims };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  // Before any network request or file write: a finished run is never
  // overwritten by an ordinary rerun.
  const finishedFiles = FINISHED_RUN_FILES.filter((name) => existsSync(join(outDir, name)));
  if (finishedFiles.length > 0 && !args.resume) {
    usage(`${outDir} already holds a finished run (${finishedFiles.join(', ')}); pass --resume to continue it, or choose a new --out`);
  }
  mkdirSync(outDir, { recursive: true });
  const log = (message) => process.stderr.write(`[${new Date().toISOString()}] ${message}\n`);

  let rows = readLeadRows(args);
  const seen = new Set();
  rows = rows.filter((row) => {
    let key;
    try {
      key = agencyKeyFor(canonicalizeAgencyUrl(row.website));
    } catch {
      return false;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (args.limit !== null) rows = rows.slice(0, args.limit);
  if (rows.length === 0) usage('no agencies selected');

  const startedAt = new Date().toISOString();
  log(`batch-audit: ${rows.length} agencies, parallel ${args.agenciesParallel}, host gap ${args.minGapMs} ms, out ${outDir}`);
  log(`user-agent ${COLLECTOR_USER_AGENT}`);

  const manual = readManual(args.manual);
  const context = {
    args,
    outDir,
    hostGate: createHostGate(args.minGapMs),
    manual,
    previous: previousRun(args.samplePins ? resolve(args.samplePins) : null),
    // One client registry for the whole run, shared by every --agencies-parallel slot.
    claims: initialClaims(rows, { args, outDir, manual }),
    log,
  };
  const limit = createLimiter(args.agenciesParallel);
  const results = await Promise.all(
    rows.map((row) =>
      limit(async () => {
        try {
          return await processAgency(row, context);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log(`agency ${row.website}: failed: ${message}`);
          return { agencyDomain: row.website, error: message, row: null };
        }
      })
    )
  );

  const indexRows = [];
  const errors = [];
  const siteStats = [];
  let needsManual = 0;
  let processed = 0;
  let resumed = 0;
  for (const result of results) {
    if (result.error) {
      errors.push({ agency: result.agencyDomain, error: result.error });
      // A stored report (left by an earlier run) names its own catalog version.
      const domain = String(result.agencyDomain);
      const stored = /^[a-z0-9.-]+$/i.test(domain) ? readSavedAgency(join(outDir, domain)).agencyJson : null;
      const catalogVersion = stored?.score?.catalogVersion ?? SCORE_CATALOG_VERSION;
      indexRows.push([result.agencyDomain, '', '', 'error', '', '', '', '', '', '', '', '', '', 'true', '', '', '', startedAt, catalogVersion]);
      continue;
    }
    if (result.row) indexRows.push(result.row);
    if (result.resumed) resumed += 1;
    else processed += 1;
    // Resumed agencies count too, from their saved reports, so the summary
    // covers every agency in index.csv.
    siteStats.push(...result.stats.sites);
    if (result.stats.needsManual) needsManual += 1;
  }
  indexRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  writeFileSync(join(outDir, 'index.csv'), stringifyCsv(INDEX_HEADER, indexRows));

  const siteSummary = summarizeSites(siteStats);
  const scoredAgencies = processed + resumed;
  const runSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    flags: {
      csv: args.csv,
      filters: args.filters,
      reason: args.reason,
      limit: args.limit,
      agenciesParallel: args.agenciesParallel,
      hostGapMs: args.minGapMs,
      resume: args.resume,
      manual: args.manual,
      samplePins: args.samplePins,
      urls: args.urls,
    },
    // The executing tool's versions; the reports' own catalogs are in reportCatalogVersions.
    versions: { collector: COLLECTOR_VERSION, catalog: SCORE_CATALOG_VERSION, formula: SCORE_FORMULA_VERSION },
    reportCatalogVersions: siteSummary.reportCatalogVersions,
    userAgent: COLLECTOR_USER_AGENT,
    agencies: { selected: rows.length, processed, resumed, errors: errors.length },
    sites: siteSummary.sites,
    unverified: siteSummary.unverified,
    durationMsPerSite: siteSummary.durationMsPerSite,
    needsManual: { count: needsManual, share: scoredAgencies > 0 ? Number((needsManual / scoredAgencies).toFixed(4)) : null },
    scoreDistribution: siteSummary.scoreDistribution,
    errors,
  };
  writeJson(join(outDir, 'run-summary.json'), runSummary);
  log(`done: ${processed} processed, ${resumed} resumed, ${errors.length} errors; run-summary.json written`);
  process.stdout.write(`${JSON.stringify(runSummary, null, 2)}\n`);
  // Outputs are kept; a run with failed agencies still exits non-zero so a
  // pilot with errors cannot look green.
  if (errors.length > 0) {
    log(`batch-audit: ${errors.length} agenc${errors.length === 1 ? 'y' : 'ies'} failed; exit 1`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`batch-audit: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

export { repoRoot };
