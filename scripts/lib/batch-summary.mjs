// Per-site statistics and the run-summary aggregates for scripts/batch-audit.mjs.
// Plain node:fs, no package imports, so the root node tests can load it before
// any workspace package is built.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RESOURCE_KEYS = [
  'homepage',
  'homepageMarkdown',
  'llmsTxt',
  'robotsTxt',
  'sitemap',
  'notFoundProbe',
  'samplePage',
  'samplePageMarkdown',
];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

/**
 * One site's line in the run summary. `resourcesPresent` lists the resource
 * records the evidence holds (skipped and unverified ones included); a site
 * without a sample page has no sample records, so it never counts toward the
 * sample-page denominators.
 */
export function siteStat(score, evidence) {
  return {
    status: score.analysisStatus,
    score: score.score,
    grade: score.grade,
    // The report's own catalog version: a resumed site keeps the one it was scored under.
    catalogVersion: score.catalogVersion ?? null,
    elapsedMs: evidence?.fetchSummary?.elapsedMs ?? null,
    unverifiedResources: evidence?.fetchSummary?.unverified ?? [],
    resourcesPresent: RESOURCE_KEYS.filter((key) => Boolean(evidence?.[key])),
  };
}

/**
 * Stats of an agency already on disk (a resumed one), rebuilt from the saved
 * agency.json, discovery.json and the clients/<domain>.json of each pick, so
 * run-summary.json covers every agency in the index. Null when agency.json has
 * no report. `catalogVersion` is the stored report's, never this process's.
 */
export function statsFromSaved({ agencyJson, discovery, clientJsons }) {
  if (!agencyJson?.score) return null;
  const sites = [siteStat(agencyJson.score, agencyJson.evidence)];
  for (const clientJson of clientJsons) {
    if (clientJson?.score) sites.push(siteStat(clientJson.score, clientJson.evidence));
  }
  return {
    sites,
    needsManual: discovery ? discovery.needs_manual !== false : true,
    catalogVersion: agencyJson.score.catalogVersion ?? null,
    durationMs: agencyJson.batch?.agencyDurationMs ?? null,
  };
}

/** Reads a finished agency directory into the inputs of `statsFromSaved`. */
export function readSavedAgency(agencyDir) {
  const agencyJson = readJson(join(agencyDir, 'agency.json'));
  const discovery = readJson(join(agencyDir, 'discovery.json'));
  const clientJsons = [];
  for (const pick of discovery?.picked ?? []) {
    const file = join(agencyDir, 'clients', `${pick.domain}.json`);
    if (existsSync(file)) clientJsons.push(readJson(file));
  }
  return { agencyJson, discovery, clientJsons };
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

/**
 * The site-level aggregates of run-summary.json. Unverified rates divide by
 * the resource records actually present, overall and per resource.
 */
export function summarizeSites(siteStats) {
  const byStatus = { complete: 0, partial: 0, blocked: 0 };
  const unverifiedPerResource = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
  const checkedPerResource = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
  const grades = {};
  const scores = [];
  const reportCatalogVersions = {};
  for (const site of siteStats) {
    byStatus[site.status] = (byStatus[site.status] ?? 0) + 1;
    const version = site.catalogVersion ?? 'unknown';
    reportCatalogVersions[version] = (reportCatalogVersions[version] ?? 0) + 1;
    for (const key of site.resourcesPresent) checkedPerResource[key] = (checkedPerResource[key] ?? 0) + 1;
    for (const key of site.unverifiedResources) unverifiedPerResource[key] = (unverifiedPerResource[key] ?? 0) + 1;
    if (site.grade) grades[site.grade] = (grades[site.grade] ?? 0) + 1;
    if (typeof site.score === 'number') scores.push(site.score);
  }
  const unverifiedTotal = Object.values(unverifiedPerResource).reduce((a, b) => a + b, 0);
  const resourcesChecked = Object.values(checkedPerResource).reduce((a, b) => a + b, 0);
  const elapsed = siteStats.map((site) => site.elapsedMs).filter((value) => typeof value === 'number');
  return {
    sites: { total: siteStats.length, byStatus },
    // Sites per catalog version of their stored report, so a summary that mixes
    // resumed and fresh readings across catalogs shows it.
    reportCatalogVersions,
    unverified: {
      perResource: unverifiedPerResource,
      checkedPerResource,
      ratePerResource: Object.fromEntries(
        RESOURCE_KEYS.map((key) => [key, rate(unverifiedPerResource[key], checkedPerResource[key])])
      ),
      resourcesChecked,
      rate: rate(unverifiedTotal, resourcesChecked),
    },
    durationMsPerSite: { p50: percentile(elapsed, 50), p95: percentile(elapsed, 95), max: elapsed.length ? Math.max(...elapsed) : null },
    scoreDistribution: {
      grades,
      min: scores.length ? Math.min(...scores) : null,
      median: percentile(scores, 50),
      max: scores.length ? Math.max(...scores) : null,
    },
  };
}
