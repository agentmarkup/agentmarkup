// discovery.json shapes, batch client claims and the summary.md discovery
// section for scripts/batch-audit.mjs. Pure, and nothing here imports a built
// workspace package: the claim result comes from @agentmarkup/audit's
// claimClientDomains, passed in by the caller.

import { bullets, md } from './markdown.mjs';

/**
 * The discovery.json payload when discovery did not run: the homepage could not
 * be read, it is a JavaScript shell, or the picks came from --manual. Same keys
 * as discoverAgencyClients returns.
 */
export function emptyDiscovery(agency, { note, maxFetches }) {
  return {
    agency,
    pagesFetched: [],
    candidates: [],
    excluded: [],
    picked: [],
    liveness: [],
    fetches: 0,
    maxFetches,
    shared_with: [],
    needs_manual: true,
    needs_manual_reasons: ['discovery-skipped'],
    note,
  };
}

/**
 * Why discovery should not run for this agency, or null when it should: the
 * homepage could not be read (blocked run, non-ok outcome, empty body), or the
 * score engine identified a client-rendered shell (content.no-js carries the
 * `client-shell` sentence variant). A thin but server-rendered homepage still
 * runs discovery: its portfolio links are in the HTML.
 */
export function discoverySkipNote(score, homepage) {
  if (score.analysisStatus === 'blocked' || homepage?.outcome !== 'ok' || !homepage.body) {
    return 'agency homepage could not be read; discovery skipped';
  }
  const noJs = (score.checks ?? []).find((check) => check.id === 'content.no-js');
  if (noJs?.sentenceVariant === 'client-shell') {
    return 'agency homepage is a JavaScript shell (content.no-js client-shell); discovery skipped';
  }
  return null;
}

/** The discovery.json payload for picks taken from the --manual list. */
export function manualDiscovery(agency, picks, { maxClients, maxFetches }) {
  const picked = picks
    .slice(0, maxClients)
    .map((pick) => ({ ...pick, score: null, signals: ['manual'], sourcePages: [] }));
  const needsManual = picked.length < maxClients;
  return {
    ...emptyDiscovery(agency, { note: 'clients taken from the --manual list', maxFetches }),
    picked,
    needs_manual: needsManual,
    needs_manual_reasons: needsManual ? ['too-few-picks'] : [],
  };
}

/**
 * Applies a claimClientDomains result to a discovery: the picks another agency
 * claimed first are dropped and named in `shared_with`, and needs_manual is
 * recomputed (`shared-client` joins the reasons when a dropped pick is why).
 */
export function applyClientClaims(discovery, claim, { maxClients }) {
  const picked = claim.picks;
  const needsManual = picked.length < maxClients;
  const reasons = needsManual ? [...(discovery.needs_manual_reasons ?? [])] : [];
  if (needsManual && !reasons.includes('too-few-picks')) reasons.unshift('too-few-picks');
  if (needsManual && claim.shared.length > 0 && !reasons.includes('shared-client')) reasons.push('shared-client');
  return {
    ...discovery,
    picked,
    shared_with: claim.shared,
    needs_manual: needsManual,
    needs_manual_reasons: reasons,
  };
}

/**
 * The client claims made before any agency is processed. Order: first the picks
 * of agencies already finished on disk (`resumedPicks`, every finished agency,
 * possibly with no picks; their files are not rewritten), then the --manual list
 * of each other agency in row order. A manual list claims its clients one at a
 * time until `maxClients` are kept, so a client another agency holds is dropped
 * (named in `shared`) and the next listed client takes the slot. Duplicate
 * domains in one list count once. `claimClientDomains` is @agentmarkup/audit's.
 * Returns the seeded registry and, per manual agency, its claim result.
 */
export function seedClientClaims({ agencies, resumedPicks, manualPicks, maxClients }, claimClientDomains) {
  let registry = new Map();
  const order = [...new Set(agencies)];
  for (const agency of order) {
    const picks = resumedPicks.get(agency);
    if (picks && picks.length > 0) registry = claimClientDomains(picks, registry, agency).registry;
  }
  const manualClaims = new Map();
  for (const agency of order) {
    const listed = manualPicks.get(agency);
    if (!listed || resumedPicks.has(agency)) continue;
    const kept = [];
    const shared = [];
    const seen = new Set();
    for (const pick of listed) {
      if (kept.length >= maxClients) break;
      if (seen.has(pick.domain)) continue;
      seen.add(pick.domain);
      const claim = claimClientDomains([pick], registry, agency);
      registry = claim.registry;
      kept.push(...claim.picks);
      shared.push(...claim.shared);
    }
    manualClaims.set(agency, { picks: kept, shared, registry });
  }
  return { registry, manualClaims };
}

/** The discovery.json payload for an agency's --manual list after seedClientClaims. */
export function manualDiscoveryWithClaims(agency, claim, options) {
  const base = manualDiscovery(agency, claim.picks, options);
  return applyClientClaims(base, { picks: base.picked, shared: claim.shared }, options);
}

/**
 * The domain a liveness check's pick carries: discoverAgencyClients names a pick
 * after the registrable domain of the check's final URL, else the candidate.
 */
function checkPickDomain(check, registrableDomain) {
  try {
    const domain = registrableDomain(new URL(check.finalUrl).hostname);
    if (domain) return domain;
  } catch {
    // no final URL
  }
  return check.domain;
}

/** The liveness status that made a pick `blocked` (403 or 429), when recorded. */
function blockedStatus(discovery, pick, registrableDomain) {
  const entry = (discovery.liveness ?? []).find(
    (check) => check.alive === 'blocked' && checkPickDomain(check, registrableDomain) === pick.domain
  );
  return entry?.status ?? null;
}

/**
 * The lines of the summary.md "## Discovery" section, every site-derived string
 * escaped. `registrableDomain` is @agentmarkup/audit's, passed in by the caller.
 */
export function discoverySummaryLines(discovery, { maxClients, registrableDomain }) {
  const lines = [];
  if (discovery.note) lines.push(`Note: ${md(discovery.note)}`);
  const reasons = discovery.needs_manual_reasons ?? [];
  lines.push(
    `Picked ${discovery.picked.length} client site(s)${
      discovery.needs_manual
        ? `; needs manual review (fewer than ${maxClients} confirmed${reasons.length > 0 ? `: ${md(reasons.join(', '))}` : ''})`
        : ''
    }.`
  );
  if (typeof discovery.fetches === 'number' && typeof discovery.maxFetches === 'number') {
    lines.push(`Discovery fetches: ${discovery.fetches} of ${discovery.maxFetches}.`);
  }
  if (discovery.picked.length > 0) {
    lines.push('');
    lines.push(
      bullets(
        discovery.picked.map((pick) => {
          const status = pick.alive === 'blocked' ? blockedStatus(discovery, pick, registrableDomain) : null;
          const blocked =
            pick.alive === 'blocked' ? `; the site blocks bots${status ? ` (HTTP ${status})` : ''}, so its audit may be blocked too` : '';
          return `${md(pick.domain)} (score ${pick.score}, ${md((pick.signals ?? []).join(', '))}, ${md(pick.source)}${blocked})`;
        })
      )
    );
  }
  const shared = discovery.shared_with ?? [];
  if (shared.length > 0) {
    lines.push('');
    lines.push(
      `Shared with another agency in this run (first claim wins): ${shared
        .map((entry) => `${md(entry.domain)} (claimed by ${md(entry.shared_with)})`)
        .join(', ')}`
    );
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
  return lines;
}
