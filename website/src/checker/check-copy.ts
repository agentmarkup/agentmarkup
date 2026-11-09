// Maps score-engine results onto the checker's `AuditItem` shape using the
// catalog's client copy. Nothing here is duplicated prose: titles are the
// catalog's client sentences, details are the evidence strings (counts, ids,
// URLs and header values only), actions and help lines come from the row.
import {
  catalogIndexOf,
  clientSentenceFor,
  fixActionFor,
  getCheckDefinition,
  unverifiedResourcesWithoutChecks,
  type CheckDefinition,
  type CheckTier,
  type EvidenceResourceKey,
  type ScoreReport,
  type ScoredCheck,
  type SitePlatform,
} from '@agentmarkup/core/score';

import type { AuditItem, AuditLevel } from './types';

export const SCORE_METHODOLOGY_PATH = '/score/';

export const RESOURCE_LABELS: Readonly<Record<EvidenceResourceKey, string>> = {
  homepage: 'Homepage',
  homepageMarkdown: 'Homepage markdown mirror',
  llmsTxt: 'llms.txt',
  robotsTxt: 'robots.txt',
  sitemap: 'Sitemap',
  notFoundProbe: 'Missing-path probe',
  samplePage: 'Sample page',
  samplePageMarkdown: 'Sample page markdown mirror',
};

export const PLATFORM_LABELS: Readonly<Record<SitePlatform, string>> = {
  wordpress: 'WordPress',
  webflow: 'Webflow',
  squarespace: 'Squarespace',
  wix: 'Wix',
};

const TIER_LABELS: Readonly<Record<CheckTier, string>> = {
  required: 'required check',
  recommended: 'recommended check',
  bonus: 'bonus signal',
};

const LEVEL_WEIGHT: Readonly<Record<AuditLevel, number>> = {
  error: 0,
  warning: 1,
  pass: 2,
};

/**
 * Level rules: required fail is an error; a recommended or bonus fail and any
 * partial result is a warning; pass is pass; unverified is a warning (reported
 * per resource); `na` and `not-measured` are listed in the panel, not as items.
 * An upside-only bonus (`jsonld.syntax`, `ax.injection-safe`) never subtracts
 * from the score but a fail there is still shown as an error-level finding.
 */
export function levelForCheck(check: ScoredCheck): AuditLevel | null {
  const definition = getCheckDefinition(check.id);
  switch (check.status) {
    case 'pass':
      return 'pass';
    case 'partial':
      return 'warning';
    case 'fail':
      return check.tier === 'required' || definition?.upsideOnly ? 'error' : 'warning';
    case 'unverified':
      return 'warning';
    default:
      return null;
  }
}

/** The resource a check's decision hinges on (the first it reads). */
export function primaryResource(check: ScoredCheck): EvidenceResourceKey {
  return check.resources?.[0] ?? 'homepage';
}

export function platformFixFor(
  definition: CheckDefinition | undefined,
  platform: SitePlatform | null
): string | null {
  if (!definition || !platform || platform === 'wix') {
    return null;
  }
  const fix = definition.fixes[platform];
  if (!fix || fix === 'same') {
    return null;
  }
  return `${PLATFORM_LABELS[platform]}: ${fix}`;
}

function creditLabel(check: ScoredCheck): string {
  if (check.status === 'pass') {
    return 'full credit';
  }
  if (check.status === 'partial' && check.fraction !== null) {
    return `${Math.round(check.fraction * 100)}% credit`;
  }
  return 'no credit';
}

function gainSentence(check: ScoredCheck): string {
  if (check.estGain === null || check.estGain <= 0) {
    return '';
  }
  return ` Estimated gain: ${check.estGain} point${check.estGain === 1 ? '' : 's'}.`;
}

/**
 * The title a check shows: the catalog's client sentence, except for a partial
 * result that has no challenge line, no matching variant and no partial sentence,
 * where core would quote the evidence into the title. That case reads
 * `{name}: partly in place` and the evidence stays in the check's Found line.
 */
export function titleForCheck(check: ScoredCheck): string {
  const definition = getCheckDefinition(check.id);
  if (!definition) {
    return check.id;
  }
  if (
    check.status === 'partial' &&
    !check.challenge &&
    !(check.sentenceVariant && definition.clientSentence.variants?.[check.sentenceVariant]) &&
    !definition.clientSentence.partial
  ) {
    return `${definition.name}: partly in place`;
  }
  return clientSentenceFor(check);
}

/**
 * True when a catalog help line names an agentmarkup capability (`agentmarkup
 * generates ...`), false for self-referential checker lines (`The checker lists
 * ...`) and the `Not measured by agentmarkup ...` rows.
 */
export function isProductHelp(text: string | undefined): boolean {
  return typeof text === 'string' && /^(the )?agentmarkup\b/i.test(text.trim());
}

/** One finding for a scored (pass, partial or fail) check; null for anything else. */
export function auditItemForCheck(check: ScoredCheck): AuditItem | null {
  const level = levelForCheck(check);
  if (!level || check.status === 'unverified') {
    return null;
  }
  const definition = getCheckDefinition(check.id);
  const name = definition?.name ?? check.id;
  return {
    id: check.id,
    checkId: check.id,
    level,
    title: titleForCheck(check),
    detail: `${name} (${TIER_LABELS[check.tier]}, ${creditLabel(check)}): ${check.evidence}.${gainSentence(check)}`,
    action:
      check.status === 'pass'
        ? 'No change needed. Keep it this way when the site changes.'
        : fixActionFor(check) ?? 'See the score methodology for this check.',
    docUrl: definition?.docUrl ?? SCORE_METHODOLOGY_PATH,
    agentmarkupHelp: definition?.agentmarkupHelp,
  };
}

/**
 * One warning per resource whose fetch did not complete. A transport failure is
 * never a finding against the site: the checks that read the resource are left
 * out of the score until a rescan and the item says so. A sitemap declared in robots.txt keeps the
 * declaration in its evidence.
 */
export function auditItemForUnverified(
  resource: EvidenceResourceKey,
  checks: ScoredCheck[]
): AuditItem {
  const label = RESOURCE_LABELS[resource];
  const names = checks.map((check) => getCheckDefinition(check.id)?.name ?? check.id);
  const evidence = checks[0]?.evidence ?? '';
  return {
    id: `unverified-${resource}`,
    level: 'warning',
    title: `${label} could not be verified in time`,
    detail: `${evidence ? `${evidence}. ` : ''}${names.length === 1 ? 'The check waiting on it' : `The ${names.length} checks waiting on it`} (${names.join(', ')}) ${names.length === 1 ? 'is' : 'are'} left out of the score until a rescan.`,
    action: `Re-run the check. If it repeats, confirm by hand that ${label.toLowerCase()} answers within a few seconds.`,
    docUrl: `${SCORE_METHODOLOGY_PATH}#statuses`,
    agentmarkupHelp:
      'agentmarkup never counts a timed-out or failed fetch against a site; only completed responses are judged.',
  };
}

/**
 * One warning per resource that did not answer in time although no check waited on
 * it: the checks that read it were judged without it (a timed-out sample page leaves
 * homepage-only judging), so the reading is provisional all the same.
 */
export function auditItemForUnverifiedResource(
  resource: EvidenceResourceKey,
  readers: ScoredCheck[]
): AuditItem {
  const label = RESOURCE_LABELS[resource];
  const names = readers.map((check) => getCheckDefinition(check.id)?.name ?? check.id);
  const judged =
    names.length === 0
      ? 'No scored check waited on it'
      : `${names.length === 1 ? 'The check that reads it' : `The ${names.length} checks that read it`} (${names.join(', ')}) ${names.length === 1 ? 'was' : 'were'} judged without it`;
  return {
    id: `unverified-${resource}`,
    level: 'warning',
    title: `${label} could not be verified in time`,
    detail: `${judged}, so this reading is provisional.`,
    action: `Re-run the check. If it repeats, confirm by hand that ${label.toLowerCase()} answers within a few seconds.`,
    docUrl: `${SCORE_METHODOLOGY_PATH}#statuses`,
    agentmarkupHelp:
      'agentmarkup never counts a timed-out or failed fetch against a site; only completed responses are judged.',
  };
}

const AGENTMARKUP_REACHABILITY_HELP =
  'agentmarkup can layer on llms.txt, JSON-LD, markdown mirrors, and crawler controls, but the page still needs to be publicly reachable first.';

/**
 * The single finding for a run blocked by a final homepage status (404, 410, ...):
 * the fetch completed, so this is an error against the site, not a re-run case.
 */
export function auditItemForHomepageStatus(report: ScoreReport): AuditItem {
  const reason = report.blockedReason ?? 'homepage answered an error status';
  const status = reason.match(/HTTP (\d{3})/)?.[1];
  return {
    id: 'homepage-http-status',
    level: 'error',
    title: status ? `Homepage answered HTTP ${status}` : 'Homepage answered an error status',
    detail: reason,
    action: 'Make the site root serve a page. Nothing else can be checked until it does.',
    docUrl: `${SCORE_METHODOLOGY_PATH}#statuses`,
    agentmarkupHelp: AGENTMARKUP_REACHABILITY_HELP,
  };
}

function compareItems(left: AuditItem, right: AuditItem, gains: Map<string, number>): number {
  const weightDiff = LEVEL_WEIGHT[left.level] - LEVEL_WEIGHT[right.level];
  if (weightDiff !== 0) {
    return weightDiff;
  }
  const gainDiff = (gains.get(right.id) ?? -1) - (gains.get(left.id) ?? -1);
  if (gainDiff !== 0) {
    return gainDiff;
  }
  const catalogDiff = catalogIndexOf(left.checkId ?? '') - catalogIndexOf(right.checkId ?? '');
  if (catalogDiff !== 0) {
    return catalogDiff;
  }
  return left.id.localeCompare(right.id);
}

/**
 * Every finding for a report: scored checks as items, unverified checks grouped
 * by resource, one item per unverified resource no check waited on, ordered by
 * level, then estimated gain, then catalog order. A run
 * blocked by a final homepage status yields exactly one error finding.
 */
export function auditItemsForReport(report: ScoreReport): AuditItem[] {
  if (report.analysisStatus === 'blocked' && report.blockedKind === 'http-status') {
    return [auditItemForHomepageStatus(report)];
  }
  const items: AuditItem[] = [];
  const gains = new Map<string, number>();
  const unverified = new Map<EvidenceResourceKey, ScoredCheck[]>();

  for (const check of report.checks) {
    if (check.status === 'unverified') {
      const resource = primaryResource(check);
      const list = unverified.get(resource) ?? [];
      list.push(check);
      unverified.set(resource, list);
      continue;
    }
    const item = auditItemForCheck(check);
    if (item) {
      items.push(item);
      gains.set(item.id, check.estGain ?? -1);
    }
  }

  for (const [resource, checks] of unverified) {
    items.push(auditItemForUnverified(resource, checks));
  }
  for (const resource of unverifiedResourcesWithoutChecks(report)) {
    if (unverified.has(resource)) {
      continue;
    }
    const readers = report.checks.filter(
      (check) =>
        (check.resources ?? []).includes(resource) &&
        (check.status === 'pass' || check.status === 'partial' || check.status === 'fail')
    );
    items.push(auditItemForUnverifiedResource(resource, readers));
  }

  return items.sort((left, right) => compareItems(left, right, gains));
}

/** React key for a finding: the check id, never the title plus an index. */
export function findingKey(item: AuditItem): string {
  return item.id;
}
