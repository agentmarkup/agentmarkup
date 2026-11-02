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
// User-Agent agentmarkup-checker/<version> (+https://agentmarkup.dev; batch).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLLECTOR_USER_AGENT,
  COLLECTOR_VERSION,
  canonicalizeAgencyUrl,
  collectSiteEvidence,
  createHostGate,
  createLimiter,
  exclusionReasonFor,
  extractLinks,
  fetchResource,
  findPortfolioLocs,
  findPortfolioPages,
  rankClientCandidates,
  refetchUnverified,
  registrableDomain,
  safeFetch,
  sitemapLocs,
  stripEvidenceBodies,
} from '../packages/audit/dist/index.js';
import {
  SCORE_CATALOG_VERSION,
  SCORE_FORMULA_VERSION,
  evaluateSiteChecks,
  getCheckDefinition,
  renderClientSummary,
  scoreChecks,
} from '../packages/core/dist/score/index.js';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';
import { bullets, md, table } from './lib/markdown.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LIVENESS_CAP = 5;
const LIVENESS_TIMEOUT_MS = 10_000;
const LIVENESS_MAX_BYTES = 64 * 1024;
const PORTFOLIO_PAGE_MAX_BYTES = 1024 * 1024;
const MAX_PORTFOLIO_PAGES = 2;
const MAX_CLIENTS = 3;
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
  'unverified_count',
  'duration_ms',
  'collected_at',
  'catalog_version',
];

function usage(message) {
  if (message) process.stderr.write(`batch-audit: ${message}\n`);
  process.stderr.write(
    'usage: node scripts/batch-audit.mjs --csv <file> [--filter key=value ...] [--reason <text>] [--limit <n>] --out <dir> [--agencies-parallel <n>] [--resume] [--manual <csv>] [--sample-pins <dir>] [--urls a.com,b.com]\n'
  );
  process.exit(2);
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
      const value = argv[i + 1];
      if (value === undefined) usage(`${arg} expects a value`);
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

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
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

function checkFraction(score, id) {
  return score.checks.find((check) => check.id === id) ?? null;
}

/** Agency -> client discovery (spec 8.2); returns the discovery.json payload. */
async function discoverClients(agencyRun, agencyDomain, collectOptions) {
  const pagesFetched = [];
  const discovery = {
    agency: agencyDomain,
    pagesFetched,
    candidates: [],
    excluded: [],
    picked: [],
    liveness: [],
    needs_manual: true,
    note: null,
  };
  const { evidence, score } = agencyRun;
  const homepage = evidence.homepage;
  if (score.analysisStatus === 'blocked' || homepage.outcome !== 'ok' || !homepage.body) {
    discovery.note = 'agency homepage could not be read; discovery skipped';
    return discovery;
  }
  const noJs = checkFraction(score, 'content.no-js');
  if (noJs && (noJs.status === 'fail' || noJs.fraction === 0)) {
    discovery.note = 'agency homepage is a JavaScript shell (content.no-js 0); discovery skipped';
    return discovery;
  }

  const base = homepage.finalUrl || evidence.targetUrl;
  const origin = new URL(base).origin;
  const links = extractLinks(homepage.body, base).map((link) => ({ ...link, sourceUrl: base, portfolio: false }));
  pagesFetched.push({ url: base, role: 'homepage', status: homepage.status });

  let portfolioUrls = findPortfolioPages(links, origin, MAX_PORTFOLIO_PAGES);
  if (portfolioUrls.length === 0 && evidence.sitemap?.outcome === 'ok' && evidence.sitemap.body) {
    let locs = sitemapLocs(evidence.sitemap.body);
    if (/<sitemapindex/i.test(evidence.sitemap.body) && locs.length > 0) {
      const child = await fetchResource(locs[0], { ...collectOptions, maxRedirects: 2, maxResponseBytes: PORTFOLIO_PAGE_MAX_BYTES });
      pagesFetched.push({ url: locs[0], role: 'sitemap-child', status: child.status });
      locs = child.outcome === 'ok' && child.body ? sitemapLocs(child.body) : [];
    }
    portfolioUrls = findPortfolioLocs(locs, origin, MAX_PORTFOLIO_PAGES);
  }

  for (const url of portfolioUrls) {
    const page = await fetchResource(url, { ...collectOptions, maxRedirects: 3, maxResponseBytes: PORTFOLIO_PAGE_MAX_BYTES });
    pagesFetched.push({ url, role: 'portfolio', status: page.status, outcome: page.outcome });
    if (page.outcome !== 'ok' || !page.body) continue;
    const pageBase = page.finalUrl || url;
    for (const link of extractLinks(page.body, pageBase)) {
      links.push({ ...link, sourceUrl: pageBase, portfolio: true });
    }
  }

  const ranking = rankClientCandidates(links, agencyDomain);
  discovery.candidates = ranking.candidates;
  discovery.excluded = ranking.excluded;

  let gets = 0;
  for (const candidate of ranking.candidates) {
    if (discovery.picked.length >= MAX_CLIENTS || gets >= LIVENESS_CAP) break;
    const url = `https://${candidate.domain}/`;
    await collectOptions.hostGate.wait(candidate.domain);
    gets += 1;
    const live = await safeFetch(url, {
      userAgent: COLLECTOR_USER_AGENT,
      timeoutMs: LIVENESS_TIMEOUT_MS,
      maxBytes: LIVENESS_MAX_BYTES,
      readBody: true,
    });
    const finalHost = hostOf(live.finalUrl);
    const finalDomain = finalHost ? registrableDomain(finalHost) : candidate.domain;
    const excludedReason = finalHost ? exclusionReasonFor(finalHost, agencyDomain) : 'not-a-domain';
    const ok = live.status !== null && live.status >= 200 && live.status < 300 && !excludedReason;
    discovery.liveness.push({
      domain: candidate.domain,
      url,
      status: live.status,
      finalUrl: live.finalUrl,
      error: live.error ?? null,
      accepted: ok,
      reason: ok ? null : excludedReason ?? (live.error ? `fetch ${live.error}` : `status ${live.status}`),
    });
    if (!ok) continue;
    if (discovery.picked.some((pick) => pick.domain === finalDomain)) continue;
    discovery.picked.push({
      domain: finalDomain,
      url: canonicalizeAgencyUrl(live.finalUrl || url),
      score: candidate.score,
      signals: candidate.signals,
      sourcePages: candidate.sourcePages,
      source: 'discovery',
    });
  }
  discovery.needs_manual = discovery.picked.length < MAX_CLIENTS;
  return discovery;
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

function platformFixLine(check, platform) {
  const definition = getCheckDefinition(check.id);
  if (!definition) return '';
  const fix = platform && definition.fixes[platform] ? definition.fixes[platform] : definition.action;
  return `${md(definition.name)} (${md(check.id)}): ${md(definition.clientSentence.fail)} ${platform ? `[${md(platform)}] ` : ''}${md(fix)}`;
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
  }
  if (recheck.length > 0) {
    lines.push('## Re-check');
    lines.push('');
    lines.push(bullets(recheck));
    lines.push('');
  }
  lines.push('## Discovery');
  lines.push('');
  if (discovery.note) lines.push(`Note: ${md(discovery.note)}`);
  lines.push(`Picked ${discovery.picked.length} client site(s)${discovery.needs_manual ? '; needs manual review (fewer than 3 confirmed)' : ''}.`);
  if (discovery.picked.length > 0) {
    lines.push('');
    lines.push(bullets(discovery.picked.map((pick) => `${md(pick.domain)} (score ${pick.score}, ${md(pick.signals.join(', '))}, ${md(pick.source)})`)));
  }
  if (discovery.excluded.length > 0) {
    lines.push('');
    lines.push(`Excluded candidates: ${discovery.excluded.map((entry) => `${md(entry.domain)} (${md(entry.reason)})`).join(', ')}`);
  }
  const rejected = discovery.liveness.filter((entry) => !entry.accepted);
  if (rejected.length > 0) {
    lines.push('');
    lines.push(`Liveness rejected: ${rejected.map((entry) => `${md(entry.domain)} (${md(entry.reason)})`).join(', ')}`);
  }
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`Generated ${md(generatedAt)} by @agentmarkup/audit ${md(COLLECTOR_VERSION)}, catalog ${md(SCORE_CATALOG_VERSION)}, formula ${md(SCORE_FORMULA_VERSION)}. Methodology: https://agentmarkup.dev/score/`);
  lines.push('');
  return lines.join('\n');
}

async function processAgency(row, context) {
  const { args, outDir, hostGate, manual, previous, log } = context;
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
  if (args.resume && existsSync(join(agencyDir, 'summary.md')) && existsSync(join(agencyDir, 'agency.json'))) {
    log(`skip ${agencyDomain} (resume)`);
    return { agencyDomain, resumed: true, row: rowFromDisk(agencyDir, agencyDomain) };
  }

  const collectOptions = { hostGate, minGapMs: args.minGapMs };
  log(`agency ${agencyDomain}: collecting ${canonicalUrl}`);
  const agencyRun = await collectAndScore(canonicalUrl, {
    ...collectOptions,
    samplePageUrl: previous.pins.get(agencyDomain) ?? null,
  });
  log(`agency ${agencyDomain}: ${agencyRun.score.analysisStatus} score ${agencyRun.score.score ?? 'n/a'} in ${agencyRun.durationMs} ms`);

  let discovery;
  const manualPicks = manual.get(agencyDomain);
  if (manualPicks) {
    discovery = {
      agency: agencyDomain,
      pagesFetched: [],
      candidates: [],
      excluded: [],
      picked: manualPicks.slice(0, MAX_CLIENTS).map((pick) => ({ ...pick, score: null, signals: ['manual'], sourcePages: [] })),
      liveness: [],
      needs_manual: manualPicks.length < MAX_CLIENTS,
      note: 'clients taken from the --manual list',
    };
  } else {
    discovery = await discoverClients(agencyRun, agencyDomain, collectOptions);
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
      sites: [agencyRun, ...clientRuns.map((client) => client.run)].map((run) => ({
        status: run.score.analysisStatus,
        score: run.score.score,
        grade: run.score.grade,
        elapsedMs: run.evidence.fetchSummary.elapsedMs ?? null,
        unverifiedResources: run.evidence.fetchSummary.unverified,
      })),
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
  const unverifiedCount = [agencyRun, ...clientRuns.map((client) => client.run)].reduce(
    (sum, run) => sum + run.score.unverifiedChecks.length,
    0
  );
  row.push(discovery.needs_manual ? 'true' : 'false', unverifiedCount, durationMs, collectedAt, SCORE_CATALOG_VERSION);
  return row;
}

/** Rebuilds the index row of a finished agency directory (for --resume). */
function rowFromDisk(agencyDir, agencyDomain) {
  const agencyJson = readJson(join(agencyDir, 'agency.json'));
  const discovery = readJson(join(agencyDir, 'discovery.json')) ?? { picked: [], needs_manual: true };
  if (!agencyJson?.score) return null;
  const clientRuns = [];
  for (const pick of discovery.picked ?? []) {
    const clientJson = readJson(join(agencyDir, 'clients', `${pick.domain}.json`));
    if (clientJson?.score) clientRuns.push({ domain: pick.domain, run: { score: clientJson.score, provisional: clientJson.provisional } });
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
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

  const context = {
    args,
    outDir,
    hostGate: createHostGate(args.minGapMs),
    manual: readManual(args.manual),
    previous: previousRun(args.samplePins ? resolve(args.samplePins) : null),
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
      indexRows.push([result.agencyDomain, '', '', 'error', '', '', '', '', '', '', '', '', '', 'true', '', '', startedAt, SCORE_CATALOG_VERSION]);
      continue;
    }
    if (result.row) indexRows.push(result.row);
    if (result.resumed) {
      resumed += 1;
      continue;
    }
    processed += 1;
    siteStats.push(...result.stats.sites);
    if (result.stats.needsManual) needsManual += 1;
  }
  indexRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  writeFileSync(join(outDir, 'index.csv'), stringifyCsv(INDEX_HEADER, indexRows));

  const byStatus = { complete: 0, partial: 0, blocked: 0 };
  const unverifiedPerResource = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
  const grades = {};
  const scores = [];
  for (const site of siteStats) {
    byStatus[site.status] = (byStatus[site.status] ?? 0) + 1;
    for (const key of site.unverifiedResources) unverifiedPerResource[key] = (unverifiedPerResource[key] ?? 0) + 1;
    if (site.grade) grades[site.grade] = (grades[site.grade] ?? 0) + 1;
    if (typeof site.score === 'number') scores.push(site.score);
  }
  const elapsed = siteStats.map((site) => site.elapsedMs).filter((value) => typeof value === 'number');
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
    versions: { collector: COLLECTOR_VERSION, catalog: SCORE_CATALOG_VERSION, formula: SCORE_FORMULA_VERSION },
    userAgent: COLLECTOR_USER_AGENT,
    agencies: { selected: rows.length, processed, resumed, errors: errors.length },
    sites: { total: siteStats.length, byStatus },
    unverified: {
      perResource: unverifiedPerResource,
      resourcesChecked: siteStats.length * RESOURCE_KEYS.length,
      rate:
        siteStats.length > 0
          ? Number((Object.values(unverifiedPerResource).reduce((a, b) => a + b, 0) / (siteStats.length * RESOURCE_KEYS.length)).toFixed(4))
          : null,
    },
    durationMsPerSite: { p50: percentile(elapsed, 50), p95: percentile(elapsed, 95), max: elapsed.length ? Math.max(...elapsed) : null },
    needsManual: { count: needsManual, share: processed > 0 ? Number((needsManual / processed).toFixed(4)) : null },
    scoreDistribution: {
      grades,
      min: scores.length ? Math.min(...scores) : null,
      median: percentile(scores, 50),
      max: scores.length ? Math.max(...scores) : null,
    },
    errors,
  };
  writeJson(join(outDir, 'run-summary.json'), runSummary);
  log(`done: ${processed} processed, ${resumed} resumed, ${errors.length} errors; run-summary.json written`);
  process.stdout.write(`${JSON.stringify(runSummary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`batch-audit: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

export { repoRoot };
